import requests
import time
import threading
import yfinance as yf
from concurrent.futures import ThreadPoolExecutor, as_completed
from flask import request, jsonify
from api import api_bp
from datetime import datetime, timedelta


# ---------------------------------------------------------------------------
# Yahoo Finance data via yfinance: /api/stock/chart/<ticker>
# Returns data in the same shape as Yahoo v8 chart endpoint so the frontend
# can parse it without changes.
# ---------------------------------------------------------------------------
@api_bp.route('/stock/chart/<ticker>')
def stock_chart(ticker):
    try:
        stock = yf.Ticker(ticker)
        interval = request.args.get('interval', '1d')

        if 'period1' in request.args and 'period2' in request.args:
            start = datetime.utcfromtimestamp(int(request.args['period1']))
            end = datetime.utcfromtimestamp(int(request.args['period2']))
            hist = stock.history(start=start, end=end, interval=interval)
        else:
            range_str = request.args.get('range', '1d')
            hist = stock.history(period=range_str, interval=interval)

        try:
            currency = stock.fast_info['currency']
        except (KeyError, AttributeError, Exception):
            currency = 'USD'
        try:
            market_price = stock.fast_info['lastPrice']
        except (KeyError, AttributeError, Exception):
            market_price = None

        timestamps = []
        closes = []
        adjcloses = []

        if not hist.empty:
            for idx, row in hist.iterrows():
                ts = int(idx.timestamp())
                timestamps.append(ts)
                closes.append(row.get('Close'))
                adjcloses.append(row.get('Close'))

            if market_price is None:
                market_price = closes[-1] if closes else None

        result = {
            'chart': {
                'result': [{
                    'meta': {
                        'currency': currency,
                        'symbol': ticker,
                        'regularMarketPrice': market_price,
                    },
                    'timestamp': timestamps,
                    'indicators': {
                        'quote': [{'close': closes}],
                        'adjclose': [{'adjclose': adjcloses}],
                    },
                }],
            }
        }
        return jsonify(result)

    except Exception as e:
        return jsonify({'error': str(e)}), 502


# ---------------------------------------------------------------------------
# In-memory cache (survives across requests within the same worker process)
# ---------------------------------------------------------------------------
_cache = {}
_cache_lock = threading.Lock()
CACHE_TTL = 300  # seconds


def _cache_get(key):
    with _cache_lock:
        entry = _cache.get(key)
        if entry and (time.time() - entry['ts']) < CACHE_TTL:
            return entry['data']
    return None


def _cache_set(key, data):
    with _cache_lock:
        _cache[key] = {'data': data, 'ts': time.time()}


def _fetch_ticker_data(ticker, start, end):
    """Fetch history + currency for one ticker. Designed to run in a thread."""
    stock = yf.Ticker(ticker)
    hist = stock.history(start=start, end=end, interval='1d')

    timestamps = []
    closes = []
    if not hist.empty:
        for idx, row in hist.iterrows():
            timestamps.append(int(idx.timestamp()))
            closes.append(row.get('Close'))

    market_price = closes[-1] if closes else None

    currency = 'USD'
    if '=' not in ticker:
        try:
            md = getattr(stock, 'history_metadata', None)
            if md and md.get('currency'):
                currency = md['currency']
            else:
                currency = stock.fast_info['currency']
        except Exception:
            pass

    return ticker, {
        'currency': currency,
        'marketPrice': market_price,
        'timestamps': timestamps,
        'closes': closes,
    }


# ---------------------------------------------------------------------------
# Bulk fetch: POST /api/stock/bulk
# Accepts {"tickers": [...], "period1": <unix>, "period2": <unix>}
# Returns {"results": {ticker: {...}}, "fx": {currency: {...}}}
# ---------------------------------------------------------------------------
@api_bp.route('/stock/bulk', methods=['POST'])
def stock_bulk():
    body = request.get_json() or {}
    tickers = list(set(body.get('tickers', [])))
    period1 = int(body.get('period1', 0))
    period2 = int(body.get('period2', 0))

    if not tickers:
        return jsonify({'results': {}, 'fx': {}})

    cache_key = f"bulk:{'|'.join(sorted(tickers))}:{period1}:{period2}"
    cached = _cache_get(cache_key)
    if cached:
        return jsonify(cached)

    start = datetime.utcfromtimestamp(period1)
    end = datetime.utcfromtimestamp(period2)

    # Phase 1: fetch all stock tickers in parallel
    results = {}
    workers = min(len(tickers), 10)
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(_fetch_ticker_data, t, start, end): t
                   for t in tickers}
        for future in as_completed(futures):
            try:
                ticker, data = future.result()
                results[ticker] = data
            except Exception:
                ticker = futures[future]
                results[ticker] = {
                    'currency': 'USD', 'marketPrice': 0,
                    'timestamps': [], 'closes': [],
                }

    # Phase 2: determine non-USD currencies and fetch FX pairs
    non_usd = set(
        v['currency'] for v in results.values()
        if v.get('currency') and v['currency'] != 'USD'
    )
    fx = {}
    if non_usd:
        fx_tickers = [f"{cur}USD=X" for cur in non_usd]
        with ThreadPoolExecutor(max_workers=len(fx_tickers)) as pool:
            futures = {pool.submit(_fetch_ticker_data, t, start, end): t
                       for t in fx_tickers}
            for future in as_completed(futures):
                try:
                    pair, data = future.result()
                    cur = pair.replace('USD=X', '')
                    fx[cur] = {
                        'timestamps': data['timestamps'],
                        'closes': data['closes'],
                    }
                except Exception:
                    pass

    response = {'results': results, 'fx': fx}
    _cache_set(cache_key, response)
    return jsonify(response)


# ---------------------------------------------------------------------------
# Ticker bar: GET /api/ticker?symbols=VOO,SCHG,PLTR
# Returns [{"sym":"VOO","val":"523.45","ch":"+0.82%","dir":"up"}, ...]
# Cached for 5 minutes so the Lambda warm-ping keeps it fresh.
# ---------------------------------------------------------------------------
def _fetch_ticker_quote(sym):
    stock = yf.Ticker(sym)
    fi = stock.fast_info
    try:
        price = fi['lastPrice']
        prev  = fi['previousClose']
    except Exception:
        return None
    if price is None or prev is None:
        return None
    ch_pct = (price - prev) / prev * 100
    val = f'{price:,.0f}' if price >= 1000 else f'{price:.2f}'
    return {
        'sym': sym,
        'val': val,
        'ch':  ('+' if ch_pct >= 0 else '') + f'{ch_pct:.2f}%',
        'dir': 'up' if ch_pct >= 0 else 'dn',
    }


@api_bp.route('/ticker')
def ticker_bar():
    raw = request.args.get('symbols', '')
    symbols = [s.strip() for s in raw.split(',') if s.strip()]
    if not symbols:
        return jsonify([])

    cache_key = f"ticker:{'|'.join(sorted(symbols))}"
    cached = _cache_get(cache_key)
    if cached:
        return jsonify(cached)

    raw_results = {}
    with ThreadPoolExecutor(max_workers=min(len(symbols), 10)) as pool:
        futures = {pool.submit(_fetch_ticker_quote, sym): sym for sym in symbols}
        for future in as_completed(futures):
            sym = futures[future]
            try:
                data = future.result()
                if data:
                    raw_results[sym] = data
            except Exception:
                pass

    results = [raw_results[sym] for sym in symbols if sym in raw_results]
    _cache_set(cache_key, results)
    return jsonify(results)


# ---------------------------------------------------------------------------
# FX rate: /api/fx/rate?from=INR          (current)
#          /api/fx/rate?from=INR&date=YYYY-MM-DD  (historical)
# Returns { "rate": <float> } where rate converts 1 unit of `from` → USD
# ---------------------------------------------------------------------------
@api_bp.route('/fx/rate')
def fx_rate():
    base = request.args.get('from', '').upper()
    date_str = request.args.get('date')

    if not base or base == 'USD':
        return jsonify({'rate': 1})

    try:
        if date_str:
            rate = _get_historical_fx(base, date_str)
        else:
            rate = _get_latest_fx(base)
        return jsonify({'rate': rate})
    except Exception as e:
        return jsonify({'error': str(e), 'rate': None}), 502


def _get_latest_fx(base):
    """Try multiple free FX sources and return the first that works."""
    errors = []

    # 1) open.er-api.com
    try:
        r = requests.get(
            f'https://open.er-api.com/v6/latest/{base}', timeout=10
        )
        r.raise_for_status()
        rate = r.json().get('rates', {}).get('USD')
        if rate and float(rate) > 0:
            return float(rate)
    except Exception as e:
        errors.append(f'open.er-api: {e}')

    # 2) fawazahmed0 CDN
    try:
        lc = base.lower()
        r = requests.get(
            f'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/{lc}.json',
            timeout=10,
        )
        r.raise_for_status()
        rate = r.json().get(lc, {}).get('usd')
        if rate and float(rate) > 0:
            return float(rate)
    except Exception as e:
        errors.append(f'fawazahmed0: {e}')

    # 3) exchangerate.host
    try:
        r = requests.get(
            'https://api.exchangerate.host/latest',
            params={'base': base, 'symbols': 'USD'},
            timeout=10,
        )
        r.raise_for_status()
        rate = r.json().get('rates', {}).get('USD')
        if rate and float(rate) > 0:
            return float(rate)
    except Exception as e:
        errors.append(f'exchangerate.host: {e}')

    raise RuntimeError(f'FX rate unavailable for {base}: {"; ".join(errors)}')


def _get_historical_fx(base, date_str):
    """Get FX rate on a specific date, walking back up to 7 days for weekends."""
    errors = []
    try:
        dt = datetime.strptime(date_str, '%Y-%m-%d')
    except ValueError:
        raise ValueError(f'Invalid date format: {date_str}')

    dates_to_try = [(dt - timedelta(days=i)).strftime('%Y-%m-%d') for i in range(8)]

    lc = base.lower()
    for d in dates_to_try:
        try:
            r = requests.get(
                f'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@{d}/v1/currencies/{lc}.json',
                timeout=10,
            )
            r.raise_for_status()
            rate = r.json().get(lc, {}).get('usd')
            if rate and float(rate) > 0:
                return float(rate)
        except Exception as e:
            errors.append(f'fawazahmed0@{d}: {e}')

    for d in dates_to_try:
        try:
            r = requests.get(
                f'https://api.exchangerate.host/{d}',
                params={'base': base, 'symbols': 'USD'},
                timeout=10,
            )
            r.raise_for_status()
            rate = r.json().get('rates', {}).get('USD')
            if rate and float(rate) > 0:
                return float(rate)
        except Exception as e:
            errors.append(f'exchangerate.host@{d}: {e}')

    raise RuntimeError(
        f'Historical FX on {date_str} unavailable for {base}: {"; ".join(errors)}'
    )


# ---------------------------------------------------------------------------
# FX timeseries: /api/fx/timeseries?base=INR&start=YYYY-MM-DD&end=YYYY-MM-DD
# Returns { "rates": { "YYYY-MM-DD": <rate_to_USD>, ... } }
# ---------------------------------------------------------------------------
@api_bp.route('/fx/timeseries')
def fx_timeseries():
    base = request.args.get('base', '').upper()
    start = request.args.get('start', '')
    end = request.args.get('end', '')

    if not base or base == 'USD':
        return jsonify({'rates': {}})

    errors = []

    # 1) exchangerate.host timeseries
    try:
        r = requests.get(
            'https://api.exchangerate.host/timeseries',
            params={
                'base': base,
                'symbols': 'USD',
                'start_date': start,
                'end_date': end,
            },
            timeout=20,
        )
        r.raise_for_status()
        raw = r.json().get('rates', {})
        rates = {}
        for d, obj in raw.items():
            v = obj.get('USD') if isinstance(obj, dict) else None
            if v is not None:
                rates[d] = float(v)
        if rates:
            return jsonify({'rates': rates})
    except Exception as e:
        errors.append(f'exchangerate.host: {e}')

    # 2) Fallback: sample weekly from fawazahmed0
    try:
        rates = _fx_timeseries_fallback(base, start, end)
        if rates:
            return jsonify({'rates': rates})
    except Exception as e:
        errors.append(f'fawazahmed0 fallback: {e}')

    return jsonify({'error': '; '.join(errors), 'rates': {}}), 502


def _fx_timeseries_fallback(base, start_str, end_str):
    """Build a sparse timeseries by sampling every 7 days from fawazahmed0."""
    lc = base.lower()
    start = datetime.strptime(start_str, '%Y-%m-%d')
    end = datetime.strptime(end_str, '%Y-%m-%d')
    rates = {}
    current = start
    while current <= end:
        d = current.strftime('%Y-%m-%d')
        try:
            r = requests.get(
                f'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@{d}/v1/currencies/{lc}.json',
                timeout=10,
            )
            r.raise_for_status()
            rate = r.json().get(lc, {}).get('usd')
            if rate:
                rates[d] = float(rate)
        except Exception:
            pass
        current += timedelta(days=7)
    d = end.strftime('%Y-%m-%d')
    if d not in rates:
        try:
            r = requests.get(
                f'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@{d}/v1/currencies/{lc}.json',
                timeout=10,
            )
            r.raise_for_status()
            rate = r.json().get(lc, {}).get('usd')
            if rate:
                rates[d] = float(rate)
        except Exception:
            pass
    return rates
