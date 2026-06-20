// WIBEC shared nav + ticker + footer injected into static pages.
// Usage: <script src="header.js"></script> inside <body>, before page content.
//
// Optional embed (e.g. index.html + React shell): set before this script runs:
//   window.__WIBEC_HEADER_EMBED = { skipFooter: true, skipGa: true, skipCssLink: true };

(function () {
  document.documentElement.setAttribute('data-aesthetic', 'terminal');
  const EMBED = window.__WIBEC_HEADER_EMBED || {};
  const current = window.location.pathname.split("/").pop() || "index.html";
  const routeHash = () => (window.location.hash || "").replace(/^#\/?/, "");

  const TICKER_ITEMS = [
    { sym: "VOO",    val: "490.00", ch: "-0.82%", dir: "dn" },
    { sym: "SCHG",   val: "90.00",  ch: "-1.12%", dir: "dn" },
    { sym: "PLTR",   val: "105.00", ch: "+2.45%", dir: "up" },
    { sym: "INFY",   val: "18.00",  ch: "-0.33%", dir: "dn" },
    { sym: "TCEHY",  val: "52.00",  ch: "+0.77%", dir: "up" },
    { sym: "FMX",    val: "78.00",  ch: "-0.44%", dir: "dn" },
    { sym: "SBLK",   val: "14.00",  ch: "+0.11%", dir: "up" },
    { sym: "XFIV",   val: "25.00",  ch: "+0.02%", dir: "up" },
    { sym: "IBE.MC", val: "15.00",  ch: "-0.55%", dir: "dn" },
    { sym: "YPF",    val: "28.00",  ch: "+1.22%", dir: "up" },
  ];


  let liveItems = TICKER_ITEMS.slice();

  function fmtNum(n) {
    return n >= 1000 ? n.toLocaleString("en-US", { maximumFractionDigits: 0 }) : n.toFixed(2);
  }

  function chipHtml(t) {
    return `<span class="ticker-chip"><strong>${t.sym}</strong><span style="opacity:.9">${t.val}</span><span class="${t.dir === 'up' ? 'up' : 'dn'}">${t.dir === 'up' ? '▲' : '▼'}${t.ch}</span></span>`;
  }

  function renderTicker() {
    const row = liveItems.map(chipHtml).join('');
    document.querySelectorAll('.ticker-inject').forEach(el => {
      el.innerHTML = `<div class="ticker-wrap"><div class="ticker">${row}${row}</div></div>`;
    });
  }

  async function fetchLive() {
    try {
      const API_BASE = 'https://ctboavoqytq4bci6y45uyvk6me0qbgyd.lambda-url.us-east-1.on.aws';
      const symbols = liveItems.map(t => t.sym).join(',');
      const r = await fetch(`${API_BASE}/api/ticker?symbols=${encodeURIComponent(symbols)}`);
      if (!r.ok) return;
      const live = await r.json();
      if (live.length > 0) {
        const map = Object.fromEntries(live.map(l => [l.sym, l]));
        liveItems = liveItems.map(p => map[p.sym] || p);
        renderTicker();
      }
    } catch (_) {}
  }

  const pages = [
    { label: "Home",           href: "index.html"             },
    { label: "Committees",     href: "committees.html"        },
    { label: "Events",         href: "events.html"            },
    { label: "Live Portfolio", href: "portfolio.html"         },
    {
      label: "Learn",
      children: [
        { label: "Investment Committee",            href: "index.html#/investment" },
        { label: "Investment Foundations Program",  href: "learn.html"             },
        { label: "Board",                           href: "board.html"             },
      ],
    },
    { label: "Podcast",        href: "podcast.html"           },
    { label: "Contact",        href: "contact.html"           },
  ];

  function navLinkIsActive(href) {
    if (!href) return false;
    const hash = routeHash();
    const homeRoute = hash === "" || hash === "home";
    if (href === "index.html") return current === "index.html" && homeRoute;
    if (href === "index.html#/investment") return current === "index.html" && hash === "investment";
    const file = href.split("#")[0];
    return current === file;
  }

  function navParentIsActive(item) {
    if (!item.children) return false;
    return item.children.some(c => navLinkIsActive(c.href));
  }

  const homeMarkHref = current === "index.html" ? "#/home" : "index.html";

  const navLinks = pages.map(p => {
    if (p.children) {
      const isActive = navParentIsActive(p);
      const children = p.children.map(c => {
        const cActive = navLinkIsActive(c.href);
        return `<a href="${c.href}" class="wpill-dropdown-item${cActive ? ' is-active' : ''}">${c.label}</a>`;
      }).join('');
      return `
        <div class="wpill-dropdown">
          <button type="button" class="wpill-link wpill-dropdown-trigger${isActive ? ' is-active' : ''}" aria-haspopup="true" aria-expanded="false">${p.label} <span class="wpill-caret">▾</span></button>
          <div class="wpill-dropdown-menu" role="menu">${children}</div>
        </div>`;
    }
    const isActive = navLinkIsActive(p.href);
    return `<a href="${p.href}" class="wpill-link${isActive ? ' is-active' : ''}">${p.label}</a>`;
  }).join('');

  const mobileNavLinksHtml = pages.flatMap(p => {
    if (p.children) {
      const childLinks = p.children.map(c => {
        const cActive = navLinkIsActive(c.href);
        return `<a href="${c.href}" class="wpill-mobile-link wpill-mobile-sub-link${cActive ? ' is-active' : ''}">${c.label}</a>`;
      }).join('');
      return [`<div class="wpill-mobile-section-label">${p.label}</div>`, childLinks];
    }
    const isActive = navLinkIsActive(p.href);
    return [`<a href="${p.href}" class="wpill-mobile-link${isActive ? ' is-active' : ''}">${p.label}</a>`];
  }).join('');

  const cssLink = EMBED.skipCssLink ? "" : `<link rel="stylesheet" href="assets/css/wibec.css">\n`;
  const gaBlock = EMBED.skipGa ? "" : `
<!-- Google Analytics -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-TKBH48M3XP"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-TKBH48M3XP');
<\/script>
`;

  document.write(`${cssLink}<style>
  .wpill-nav {
    position: fixed; top: 18px; left: 50%; transform: translateX(-50%);
    z-index: 200000; width: calc(100% - 120px); max-width: 1120px;
    background: transparent;
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
    border: 1px solid transparent;
    border-radius: 9999px;
    box-shadow: none;
    transition: background 0.45s ease, backdrop-filter 0.45s ease, -webkit-backdrop-filter 0.45s ease, border-color 0.45s ease, box-shadow 0.45s ease;
  }
  .wpill-nav.docked {
    background: rgba(6,14,38,0.32);
    -webkit-backdrop-filter: blur(22px) saturate(1.6);
    backdrop-filter: blur(22px) saturate(1.6);
    border-color: rgba(0,212,255,0.14);
    box-shadow: 0 8px 40px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06);
  }
  .wpill-bar {
    display: grid; grid-template-columns: auto 1fr auto;
    align-items: center; padding: 8px 18px 8px 22px; gap: 24px;
  }
  .wpill-mark {
    font-family: var(--sans); font-weight: 700; font-size: 16px;
    color: #eaf1ff; letter-spacing: -0.01em;
    display: inline-flex; align-items: center; gap: 2px;
    text-decoration: none; white-space: nowrap;
  }
  .wpill-mark .dot {
    width: 7px; height: 7px; background: var(--coral);
    border-radius: 50%; display: inline-block;
    box-shadow: 0 0 10px var(--coral);
  }
  .wpill-logo {
    height: 56px; width: auto; object-fit: contain;
    margin-right: 0;
  }
  .wpill-links { display: flex; justify-content: center; gap: 4px; }
  .wpill-link {
    display: inline-block; padding: 8px 16px; font-size: 13px; line-height: 18px;
    border-radius: 9999px; transition: all .2s;
    font-weight: 500; text-decoration: none; color: rgba(234,241,255,0.62);
    background: transparent; border: 1px solid transparent; white-space: nowrap;
  }
  .wpill-link:hover { color: #fff; background: rgba(255,255,255,0.08); }
  .wpill-link.is-active { color: #fff; font-weight: 600; }
  .wpill-nav.docked .wpill-link.is-active {
    color: #fff; font-weight: 600;
    background: rgba(0,212,255,0.2);
    border-color: rgba(0,212,255,0.35);
  }
  .wpill-dropdown { position: relative; display: inline-block; }
  .wpill-dropdown-trigger {
    background: transparent; cursor: pointer; font-family: inherit;
  }
  .wpill-dropdown-trigger .wpill-caret {
    display: inline-block; margin-left: 4px; font-size: 10px; transition: transform .2s;
  }
  .wpill-dropdown.open .wpill-dropdown-trigger .wpill-caret { transform: rotate(180deg); }
  .wpill-dropdown-menu {
    position: absolute; top: calc(100% + 8px); left: 50%; transform: translateX(-50%) translateY(-4px);
    min-width: 240px; padding: 8px;
    background: rgba(8,18,42,0.96);
    -webkit-backdrop-filter: blur(22px) saturate(1.6);
    backdrop-filter: blur(22px) saturate(1.6);
    border: 1px solid rgba(0,212,255,0.18);
    border-radius: 14px;
    box-shadow: 0 12px 40px rgba(0,0,0,0.45);
    opacity: 0; pointer-events: none; transition: opacity .18s, transform .18s;
    z-index: 200001;
  }
  .wpill-dropdown.open .wpill-dropdown-menu {
    opacity: 1; pointer-events: auto;
    transform: translateX(-50%) translateY(0);
  }
  .wpill-dropdown-item {
    display: block; padding: 10px 14px; font-size: 13px;
    color: rgba(234,241,255,0.78); text-decoration: none;
    border-radius: 10px;
  }
  .wpill-dropdown-item:hover {
    color: #fff; background: rgba(0,212,255,0.14);
  }
  .wpill-dropdown-item.is-active { color: #fff; background: rgba(0,212,255,0.2); }
  .ticker-inject { padding-top: 88px; }
  .ticker-inject .ticker-wrap {
    background: #071428; border-color: rgba(0,212,255,0.12);
  }
  /* ── Hamburger button ─────────────────────────────────── */
  .wpill-hamburger {
    display: none; flex-direction: column; justify-content: center;
    gap: 5px; background: none; border: none;
    cursor: pointer; padding: 6px 4px; flex-shrink: 0;
  }
  .wpill-hamburger span {
    display: block; width: 22px; height: 2px;
    background: rgba(234,241,255,0.85); border-radius: 2px;
    transition: transform 0.25s, opacity 0.25s;
  }
  .wpill-nav.menu-open .wpill-hamburger span:nth-child(1) { transform: translateY(7px) rotate(45deg); }
  .wpill-nav.menu-open .wpill-hamburger span:nth-child(2) { opacity: 0; transform: scaleX(0); }
  .wpill-nav.menu-open .wpill-hamburger span:nth-child(3) { transform: translateY(-7px) rotate(-45deg); }
  /* ── Mobile nav menu ──────────────────────────────────── */
  .wpill-mobile-menu {
    display: none; flex-direction: column;
    padding: 4px 8px 12px; margin-top: 4px;
    border-top: 1px solid rgba(0,212,255,0.12);
  }
  .wpill-nav.menu-open .wpill-mobile-menu { display: flex; }
  .wpill-mobile-link {
    display: block; padding: 11px 14px; font-size: 15px; font-weight: 500;
    color: rgba(234,241,255,0.78); text-decoration: none;
    border-radius: 10px; transition: background 0.15s, color 0.15s;
    font-family: var(--sans);
  }
  .wpill-mobile-link:hover { color: #fff; background: rgba(255,255,255,0.07); }
  .wpill-mobile-link.is-active { color: #fff; background: rgba(0,212,255,0.13); }
  .wpill-mobile-section-label {
    padding: 12px 14px 3px; font-size: 10px; letter-spacing: 0.12em;
    text-transform: uppercase; color: rgba(0,212,255,0.45);
    font-family: var(--mono);
  }
  .wpill-mobile-sub-link {
    padding-left: 22px; font-size: 14px; font-weight: 400;
    color: rgba(234,241,255,0.55);
  }
  /* ── Mobile breakpoint ────────────────────────────────── */
  @media (max-width: 640px) {
    .wpill-nav { width: calc(100% - 32px); top: 10px; border-radius: 18px; }
    .wpill-nav.menu-open {
      background: rgba(6,14,38,0.95) !important;
      -webkit-backdrop-filter: blur(22px) saturate(1.6) !important;
      backdrop-filter: blur(22px) saturate(1.6) !important;
      border-color: rgba(0,212,255,0.18) !important;
      box-shadow: 0 8px 40px rgba(0,0,0,0.45) !important;
      border-radius: 18px !important;
    }
    .wpill-bar { padding: 8px 16px; gap: 0; }
    .wpill-logo { height: 40px; }
    .wpill-mark { font-size: 14px; }
    .wpill-links { display: none !important; }
    .wpill-hamburger { display: flex; }
    .wpill-bar > span { display: none; }
    .ticker-inject { padding-top: 72px; }
  }
</style>

<!-- Nav -->
<nav class="wpill-nav" id="wpill-nav">
  <div class="wpill-bar">
    <a href="${homeMarkHref}" class="wpill-mark"><img src="images/wibec-logo.png" class="wpill-logo" alt="WIBEC" />WIBEC</a>
    <div class="wpill-links">${navLinks}</div>
    <button class="wpill-hamburger" id="wpill-hamburger" aria-label="Toggle menu" aria-expanded="false">
      <span></span><span></span><span></span>
    </button>
  </div>
  <div class="wpill-mobile-menu" id="wpill-mobile-menu" role="navigation" aria-label="Mobile navigation">
    ${mobileNavLinksHtml}
  </div>
</nav>
${gaBlock}
`);

  window.addEventListener("DOMContentLoaded", function () {
    const nav = document.getElementById('wpill-nav');
    if (nav) {
      // Keep the bar under <body> so position:fixed is always viewport-relative.
      // (Legacy pages inject this script inside #page-wrapper, which can get transform
      // from main.css — that traps "fixed" children and they scroll away with the page.)
      if (nav.parentElement !== document.body) {
        document.body.appendChild(nav);
      }
    }

    if (nav) {
      function scrollY() {
        return window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
      }
      // index.html: tall hero — dock only after ~1.55 viewports (matches former React Nav).
      // All other pages: dock after a small scroll so the pill actually "turns on".
      function dockThreshold() {
        if (current === 'index.html') return window.innerHeight * 1.55;
        return 56;
      }
      const onScroll = () => {
        if (scrollY() > dockThreshold()) nav.classList.add('docked');
        else nav.classList.remove('docked');
      };
      onScroll();
      window.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('resize', onScroll, { passive: true });
    }

    function syncNavActive() {
      document.querySelectorAll('#wpill-nav .wpill-link').forEach(function (a) {
        var href = a.getAttribute('href');
        a.classList.toggle('is-active', navLinkIsActive(href));
      });
    }
    window.addEventListener('hashchange', syncNavActive);
    syncNavActive();

    // Dropdown open/close
    document.querySelectorAll('#wpill-nav .wpill-dropdown').forEach(function (dd) {
      const trigger = dd.querySelector('.wpill-dropdown-trigger');
      const open = (val) => {
        dd.classList.toggle('open', val);
        trigger.setAttribute('aria-expanded', val ? 'true' : 'false');
      };
      let leaveTimer;
      dd.addEventListener('mouseenter', () => { clearTimeout(leaveTimer); open(true); });
      dd.addEventListener('mouseleave', () => { leaveTimer = setTimeout(() => open(false), 120); });
      trigger.addEventListener('click', (e) => {
        e.preventDefault();
        open(!dd.classList.contains('open'));
      });
      trigger.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open(!dd.classList.contains('open'));
        } else if (e.key === 'Escape') {
          open(false);
          trigger.focus();
        }
      });
    });
    document.addEventListener('click', (e) => {
      document.querySelectorAll('#wpill-nav .wpill-dropdown.open').forEach(dd => {
        if (!dd.contains(e.target)) {
          dd.classList.remove('open');
          const t = dd.querySelector('.wpill-dropdown-trigger');
          if (t) t.setAttribute('aria-expanded', 'false');
        }
      });
    });

    // Hamburger toggle
    const hamburger = document.getElementById('wpill-hamburger');
    const mobileMenuEl = document.getElementById('wpill-mobile-menu');
    if (hamburger && mobileMenuEl && nav) {
      hamburger.addEventListener('click', function () {
        const isOpen = nav.classList.toggle('menu-open');
        hamburger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      });
      mobileMenuEl.querySelectorAll('a').forEach(function (a) {
        a.addEventListener('click', function () {
          nav.classList.remove('menu-open');
          hamburger.setAttribute('aria-expanded', 'false');
        });
      });
    }

    // Ticker — only when page includes a mount point
    if (document.querySelector('.ticker-inject')) {
      renderTicker();
      fetchLive();
      setInterval(fetchLive, 60000);
    }

    if (EMBED.skipFooter) return;

    // Footer
    const footer = document.createElement('footer');
    footer.className = 'site';
    footer.innerHTML = `
      <div class="container-wide">
        <div class="wordmark">WIBEC<span style="color:var(--coral)">.</span></div>
        <div class="grid">
          <div>
            <h5>The Club</h5>
            <p style="max-width:360px;opacity:.8;margin:0;font-size:14px;line-height:1.6">
              Wharton International Business &amp; Economics Club. A student-run investment committee, macro roundtable, and apprenticeship for global markets.
            </p>
          </div>
          <div>
            <h5>Explore</h5>
            <ul>
              <li><a href="index.html">Home</a></li>
              <li><a href="portfolio.html">Live Portfolio</a></li>
              <li><a href="index.html#/investment">Investment Committee</a></li>
              <li><a href="committees.html">Regional Committees</a></li>
              <li><a href="podcast.html">Podcast</a></li>
            </ul>
          </div>
          <div>
            <h5>Members</h5>
            <ul>
              <li><a href="membership.html">Apply (Fall '26)</a></li>
              <li><a href="learn.html">Foundations Program</a></li>
              <li><a href="https://forms.gle/VkaBWcErvtSdt5hQ9" target="_blank" rel="noopener">Join the Newsroom</a></li>
            </ul>
          </div>
          <div>
            <h5>Contact</h5>
            <ul>
              <li>whartonibec@gmail.com</li>
              <li>Huntsman Hall, 3730 Walnut</li>
              <li>Philadelphia, PA 19104</li>
              <li style="margin-top:16px"><a class="u-link" href="https://www.linkedin.com/company/105025108" target="_blank" rel="noopener">LinkedIn &rarr;</a></li>
              <li><a class="u-link" href="https://www.instagram.com/penn_wibec/" target="_blank" rel="noopener">Instagram &rarr;</a></li>
            </ul>
          </div>
        </div>
        <div class="bottom">
          <span>&copy; 2026 Wharton International Business &amp; Economics Club</span>
          <span>A student organization of the University of Pennsylvania</span>
        </div>
      </div>`;
    document.body.appendChild(footer);

    // Scroll reveals
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('in'); });
    }, { threshold: 0.1 });
    document.querySelectorAll('.reveal').forEach(el => io.observe(el));
  });
})();
