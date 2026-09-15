// The interactive behaviour behind the ported design system.
//
// A complete port of his assets/js/site.js — same logic, same tuning
// constants, same comments where they explain a decision. Two structural
// differences, both forced by this being a SPA rather than a static page:
//
//   1. His file is one IIFE that runs at script load and never tears anything
//      down. Here it mounts and unmounts on every navigation, so every
//      listener, timer, observer and animation frame is registered through a
//      helper that records its own cleanup.
//   2. Page content is queried from the `.ds` root rather than `document`,
//      so nothing can reach into the rest of the app. Genuinely global things
//      (window scroll/resize, document keydown, documentElement classes) stay
//      global, as they must.
//
// Deliberately NOT ported:
//   • The favicon painter. It rewrites <link rel="icon"> on document.head,
//     which would replace the whole site's favicon — including on pages that
//     have nothing to do with the redesign — and persist after unmount.
//   • The cart/checkout basket. Those pages are owned by this app with a real
//     Paystack flow behind them; his is a localStorage mock with hardcoded
//     prices, and importing it would be actively harmful.
//
// SAFETY NOTE. `:root.js .ds .rise` and `:root.js .ds .w` set opacity:0, and
// only this hook adds the `in` class that reveals them. If it throws partway
// through, the rest of the page stays invisible — exactly the failure his
// STATE.md records ("hero headlines were invisible site-wide"). Every block is
// therefore run independently, and a throw force-reveals the content.

import React from "react";
import { useNavigate } from "react-router-dom";
import { resolveHref } from "../lib/dsRoutes.js";

const isWide = () => window.innerWidth > 1000;

// ── lifecycle helpers ──────────────────────────────────────────────────────
// Everything that can outlive the component goes through one of these.
function makeScope() {
  const cleanups = [];
  return {
    on(target, type, fn, opts) {
      target.addEventListener(type, fn, opts);
      cleanups.push(() => target.removeEventListener(type, fn, opts));
    },
    raf(fn) {
      const id = requestAnimationFrame(fn);
      cleanups.push(() => cancelAnimationFrame(id));
      return id;
    },
    interval(fn, ms) {
      const id = setInterval(fn, ms);
      cleanups.push(() => clearInterval(id));
      return id;
    },
    timeout(fn, ms) {
      const id = setTimeout(fn, ms);
      cleanups.push(() => clearTimeout(id));
      return id;
    },
    observe(observer) {
      cleanups.push(() => observer.disconnect());
      return observer;
    },
    add(fn) {
      cleanups.push(fn);
    },
    run() {
      for (const fn of cleanups.reverse()) {
        try { fn(); } catch { /* teardown must never throw */ }
      }
    },
  };
}

// ── theme toggle ───────────────────────────────────────────────────────────
// His #tt button writes its own data-theme attribute and localStorage key.
// This app already has ThemeProvider doing that against a `.dark` class, so
// the button is wired to that instead of running a second, conflicting system.
function initTheme(root, s, toggleTheme) {
  const tt = root.querySelector("#tt");
  if (!tt || !toggleTheme) return;
  s.on(tt, "click", toggleTheme);
}

// ── reveal on first sight ──────────────────────────────────────────────────
// Once only: it used to toggle, so scrolling back up made everything fade out
// and in again. threshold 0 rather than 0.08, because a section taller than
// about sixteen viewports can never reach a ratio of 0.08 and so would never
// appear at all.
function initReveal(root, reduce, s) {
  const risers = root.querySelectorAll(".rise");
  if (!risers.length) return;
  if (reduce || !("IntersectionObserver" in window)) {
    risers.forEach((el) => el.classList.add("in"));
    return;
  }
  const io = s.observe(
    new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const sibs = Array.from(e.target.parentNode?.children || []);
          e.target.style.transitionDelay = `${Math.min(sibs.indexOf(e.target), 5) * 65}ms`;
          e.target.classList.add("in");
          io.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0 },
    ),
  );
  risers.forEach((el) => io.observe(el));
}

// ── count-up statistics ────────────────────────────────────────────────────
function initCounters(root, reduce, s) {
  const counters = root.querySelectorAll("[data-count]");
  if (!counters.length) return;
  const settle = (c) => {
    c.textContent =
      parseFloat(c.dataset.count).toLocaleString("en-US") + (c.dataset.suffix || "");
  };
  if (reduce || !("IntersectionObserver" in window)) {
    counters.forEach(settle);
    return;
  }
  const io = s.observe(
    new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting || e.target.dataset.done) continue;
          e.target.dataset.done = "1";
          const end = parseFloat(e.target.dataset.count);
          const suffix = e.target.dataset.suffix || "";
          let t0 = null;
          const dur = 1500;
          const step = (t) => {
            if (!t0) t0 = t;
            const p = Math.min(1, (t - t0) / dur);
            const eased = 1 - (1 - p) ** 3;
            e.target.textContent = Math.round(end * eased).toLocaleString("en-US") + suffix;
            if (p < 1) s.raf(step);
          };
          s.raf(step);
        }
      },
      { threshold: 0.4 },
    ),
  );
  counters.forEach((c) => io.observe(c));
}

// ── tilt + magnetic pull (eased follow) ────────────────────────────────────
// The loop stops once it arrives rather than running for the life of the page:
// twelve permanently-running rAF loops on the home page is what made scrolling
// feel heavy in his first version.
function initTilt(root, reduce, s) {
  if (reduce) return;
  for (const el of root.querySelectorAll(".tilt")) {
    let tx = 0, ty = 0, rx = 0, ry = 0;
    let TX = 0, TY = 0, RX = 0, RY = 0;
    let raf = null;
    let live = false;

    const frame = (a, b, c, d) =>
      `perspective(1200px) rotateX(${c.toFixed(3)}deg) rotateY(${d.toFixed(3)}deg) ` +
      `translate3d(${a.toFixed(2)}px,${b.toFixed(2)}px,0)`;

    const loop = () => {
      const k = 0.16;
      tx += (TX - tx) * k; ty += (TY - ty) * k;
      rx += (RX - rx) * k; ry += (RY - ry) * k;
      const near =
        Math.abs(TX - tx) + Math.abs(TY - ty) + Math.abs(RX - rx) + Math.abs(RY - ry);
      if (near < 0.02) {
        raf = null;
        if (live) el.style.transform = frame(TX, TY, RX, RY);
        else {
          el.style.transform = "";
          el.classList.remove("is-live");
        }
        return;
      }
      el.style.transform = frame(tx, ty, rx, ry);
      raf = requestAnimationFrame(loop);
    };

    s.on(el, "mousemove", (e) => {
      // A card still waiting to be revealed owns its own transform.
      if (!isWide() || (el.classList.contains("rise") && !el.classList.contains("in"))) return;
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      RY = px * 6; RX = -py * 6; TX = px * 10; TY = py * 10;
      live = true;
      el.classList.add("is-live");
      if (!raf) raf = requestAnimationFrame(loop);
    });
    s.on(el, "mouseleave", () => {
      RX = RY = TX = TY = 0;
      live = false;
      if (!raf) raf = requestAnimationFrame(loop);
    });
    s.add(() => {
      if (raf) cancelAnimationFrame(raf);
      el.style.transform = "";
      el.classList.remove("is-live");
    });
  }
}

// ── tilt the active product slide ──────────────────────────────────────────
function initSlideTilt(root, reduce, s) {
  if (reduce) return;
  for (const el of root.querySelectorAll(".pslide")) {
    s.on(el, "mousemove", (e) => {
      if (!isWide() || !el.classList.contains("on")) return;
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      el.style.transform =
        `perspective(1300px) rotateX(${(-py * 4).toFixed(2)}deg) ` +
        `rotateY(${(px * 5).toFixed(2)}deg) ` +
        `translate3d(${(px * 10).toFixed(1)}px,${(py * 10).toFixed(1)}px,0) scale(1.005)`;
      el.style.transition = "transform 120ms linear";
    });
    s.on(el, "mouseleave", () => {
      el.style.transition = "";
      el.style.transform = "";
    });
  }
}

// ── FAQ: wrap answers for height animation, one open at a time ─────────────
function initFaq(root, s) {
  for (const d of root.querySelectorAll(".faq details")) {
    const a = d.querySelector(".faq-a");
    if (!a || a.closest(".faq-wrap")) continue;
    const wrap = document.createElement("div");
    wrap.className = "faq-wrap";
    const inner = document.createElement("div");
    inner.className = "faq-inner";
    d.insertBefore(wrap, a);
    inner.appendChild(a);
    wrap.appendChild(inner);
  }
  for (const group of root.querySelectorAll(".faq")) {
    const items = Array.from(group.querySelectorAll("details"));
    for (const d of items) {
      s.on(d, "toggle", () => {
        if (!d.open) return;
        for (const o of items) if (o !== d) o.open = false;
      });
    }
  }
}

// ── rotating promo band ────────────────────────────────────────────────────
function initPromo(root, reduce, s) {
  const promo = root.querySelector("#promo");
  if (!promo) return;
  const items = Array.from(promo.querySelectorAll(".promo-item"));
  const dots = Array.from(promo.querySelectorAll(".promo-dots i"));
  if (items.length < 2) return;

  let at = 0;
  let timer = null;
  const show = (i) => {
    at = (i + items.length) % items.length;
    items.forEach((el, k) => el.classList.toggle("on", k === at));
    dots.forEach((d, k) => d.classList.toggle("on", k === at));
  };
  const start = () => { if (!reduce) timer = setInterval(() => show(at + 1), 6000); };
  const stop = () => clearInterval(timer);

  dots.forEach((d, k) => s.on(d, "click", () => { stop(); show(k); start(); }));
  s.on(promo, "mouseenter", stop);
  s.on(promo, "mouseleave", start);
  start();
  s.add(stop);
}

// ── parallax bands ─────────────────────────────────────────────────────────
function initParallax(root, reduce, s) {
  const bands = Array.from(root.querySelectorAll(".plx"));
  if (!bands.length || reduce) return;
  const move = () => {
    for (const b of bands) {
      const bg = b.querySelector(".plx-bg");
      if (!bg) continue;
      const r = b.getBoundingClientRect();
      const p = (r.top + r.height / 2 - window.innerHeight / 2) / window.innerHeight;
      bg.style.transform = `translate3d(0,${(p * 46).toFixed(1)}px,0)`;
    }
  };
  s.on(window, "scroll", move, { passive: true });
  s.on(window, "resize", move);
  move();
}

// ── lesson filters + show more (Learn) ─────────────────────────────────────
// Three lessons are on screen; every "Show more" adds one row, and that row
// drops out from behind the row above it. Rows are rebuilt from a flat list of
// tiles so filtering and resizing reflow cleanly.
function initLessons(root, reduce, s) {
  const grid = root.querySelector("#lesson-grid");
  if (!grid) return;
  const tiles = Array.from(grid.querySelectorAll(".ltile"));
  const btns = Array.from(root.querySelectorAll("#lesson-filters button"));
  const more = root.querySelector("#more-lessons");
  const count = root.querySelector("#lesson-count");
  let filter = "all";
  let step = 0;
  let cols = 0;

  const perRow = () => (window.innerWidth <= 600 ? 1 : window.innerWidth <= 900 ? 2 : 3);
  const matching = () => tiles.filter((t) => filter === "all" || t.dataset.cat === filter);

  // Grow the row from zero height with its overflow clipped, so its tiles —
  // which start a full tile higher — are hidden by the row above until they
  // clear its bottom edge.
  const drop = (row) => {
    if (reduce) return;
    const h = row.getBoundingClientRect().height;
    row.classList.add("lrow-new");
    row.style.height = "0px";
    row.style.marginTop = "0px";
    void row.offsetHeight;
    row.style.height = `${h}px`;
    row.style.marginTop = "22px";
    const done = () => {
      row.style.height = "";
      row.style.marginTop = "";
      row.classList.remove("lrow-new");
      row.removeEventListener("transitionend", done);
    };
    row.addEventListener("transitionend", done);
    s.timeout(done, 900);
  };

  // `animateFrom` is the row index that should play the drop; everything
  // before it is already on screen and must not move.
  const render = (animateFrom) => {
    const n = perRow();
    const list = matching();
    const shown = Math.min(list.length, n * (step + 1));
    grid.classList.add("lrows");
    grid.textContent = "";
    for (let i = 0; i < shown; i += n) {
      const row = document.createElement("div");
      row.className = "lrow";
      list.slice(i, i + n).forEach((t, c) => {
        t.style.setProperty("--c", c);
        row.appendChild(t);
      });
      grid.appendChild(row);
      if (animateFrom != null && i / n === animateFrom) drop(row);
    }
    if (more) {
      const left = list.length - shown;
      more.style.display = left > 0 ? "" : "none";
      if (count) {
        count.textContent = left > 0
          ? `Showing ${shown} of ${list.length} lessons`
          : (list.length ? `All ${list.length} lessons` : "");
      }
    }
  };

  for (const b of btns) {
    s.on(b, "click", () => {
      btns.forEach((x) => x.classList.toggle("on", x === b));
      filter = b.dataset.f;
      step = 0;
      render(null);
    });
  }
  if (more) s.on(more, "click", () => { step += 1; render(step); });

  let rt;
  s.on(window, "resize", () => {
    clearTimeout(rt);
    rt = setTimeout(() => {
      const n = perRow();
      if (n === cols) return;
      cols = n;
      render(null);
    }, 160);
  });
  s.add(() => clearTimeout(rt));

  cols = perRow();
  render(null);
}

// ── event index filter (Learn) ─────────────────────────────────────────────
function initEventFilter(root, s) {
  const list = root.querySelector("#ev-list");
  const bar = root.querySelector("#ev-filters");
  if (!list || !bar) return;
  const rows = Array.from(list.querySelectorAll(".evrow"));
  s.on(bar, "click", (e) => {
    const b = e.target.closest("button[data-f]");
    if (!b) return;
    const f = b.dataset.f;
    Array.from(bar.children).forEach((x) => x.classList.toggle("on", x === b));
    rows.forEach((r) => r.classList.toggle("hide", f !== "all" && r.dataset.cat !== f));
  });
}

// ── mobile navigation ──────────────────────────────────────────────────────
// The drawer is built at runtime from the desktop mega-panel, so there is
// exactly one source of truth for the navigation. Each panel becomes an
// accordion section; links without a panel stay flat.
function initMobileNav(root, s, navigate, mapHref) {
  const burger = root.querySelector("#burger");
  const drawer = root.querySelector("#mnav");
  if (!burger || !drawer) return;
  const inner = drawer.querySelector(".mnav-in");
  if (!inner) return;
  let built = false;

  const build = () => {
    if (built) return;
    built = true;
    // His build() only ever ran once, on a page that never remounted. Here the
    // effect can run again — React StrictMode double-invokes it in dev, and any
    // remount does too — while React keeps the same .mnav-in node. Appending
    // into whatever is already there produced a drawer with every section
    // twice, the duplicates carrying listeners that had already been cleaned
    // up, so half the accordion was dead. Start from empty every time.
    inner.textContent = "";
  // Carry his page identity onto every drawer link.
  //
  // The drawer is BUILT here, not cloned, so any attribute not copied
  // explicitly is lost. data-ds-page is what lets the preview route to the
  // staged page instead of the live one — without it, tapping a product in the
  // mobile menu drops the reader out of the redesign, which is exactly the bug
  // the desktop nav had.
  const carryPage = (from, to) => {
    const page = from.getAttribute("data-ds-page");
    if (page) to.setAttribute("data-ds-page", page);
  };

    for (const li of root.querySelectorAll(".nav-links > li")) {
      const a = li.querySelector("a");
      if (!a) continue;
      const key = li.dataset.panel;
      const panel = key && root.querySelector(`.npg[data-panel="${key}"]`);
      if (!panel) {
        const flat = document.createElement("a");
        flat.className = "mnav-flat";
        flat.href = a.getAttribute("href");
        carryPage(a, flat);
        flat.textContent = a.textContent.trim();
        inner.appendChild(flat);
        continue;
      }
      const sec = document.createElement("div");
      sec.className = "mnav-sec";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "mnav-t";
      btn.setAttribute("aria-expanded", "false");
      btn.innerHTML = `<span>${a.textContent.replace(/\s+$/, "").trim()}</span><i class="caret"></i>`;
      const body = document.createElement("div");
      body.className = "mnav-b";
      // lift the real link lists out of the mega-panel
      for (const col of panel.querySelectorAll(".np-cols > div")) {
        const h = col.querySelector("h6");
        const t = h ? h.textContent.trim() : "";
        if (t && t !== " ") {
          const lab = document.createElement("span");
          lab.className = "mnav-h";
          lab.textContent = t;
          body.appendChild(lab);
        }
        for (const link of col.querySelectorAll("li > a")) {
          const row = document.createElement("a");
          row.href = link.getAttribute("href");
          carryPage(link, row);
          row.className = "mnav-l";
          const b = link.querySelector("b");
          const sub = link.querySelector("b + span");
          row.innerHTML =
            `<b>${b ? b.textContent : link.textContent.trim()}</b>` +
            (sub ? `<span>${sub.textContent}</span>` : "");
          body.appendChild(row);
        }
      }
      s.on(btn, "click", () => {
        const open = sec.classList.toggle("on");
        btn.setAttribute("aria-expanded", open ? "true" : "false");
        body.style.maxHeight = open ? `${body.scrollHeight}px` : "";
      });
      sec.appendChild(btn);
      sec.appendChild(body);
      inner.appendChild(sec);
    }
    const act = document.createElement("div");
    act.className = "mnav-act";
    // His markup writes relative hrefs here ("login", "contact"), which would
    // resolve against the current path in this app. Run them through the same
    // route map every other link uses.
    act.innerHTML =
      `<a href="${resolveHref("login")}" class="ds-btn btn-o">Sign in</a>` +
      `<a href="${resolveHref("contact")}" class="ds-btn btn-p">Book a demo</a>`;
    inner.appendChild(act);
  };

  const setOpen = (open) => {
    if (open) build();
    drawer.classList.toggle("on", open);
    burger.classList.toggle("on", open);
    burger.setAttribute("aria-expanded", open ? "true" : "false");
    burger.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    // lets the bar go solid and rise above the drawer, so the logo and the
    // close button stay visible while the menu is open
    document.documentElement.classList.toggle("mnav-open", open);
    document.documentElement.style.overflow = open ? "hidden" : "";
  };

  s.on(burger, "click", () => setOpen(!drawer.classList.contains("on")));
  s.on(drawer, "click", (e) => {
    const link = e.target.closest("a");
    if (!link) return;
    setOpen(false);
    // These are plain anchors built by hand, so without this every mobile nav
    // tap would be a full page reload of the whole SPA.
    const raw = link.getAttribute("href");
    // This native listener runs BEFORE React's synthetic handlers, so
    // preventing default here means the preview's own redirect never gets a
    // look in — every mobile tap left the redesign for the live route. Ask the
    // caller where the link should actually go.
    const href = mapHref ? mapHref(raw, link.getAttribute("data-ds-page")) : raw;
    if (navigate && href && href.startsWith("/")) {
      e.preventDefault();
      navigate(href);
    }
  });
  s.on(document, "keydown", (e) => {
    if (e.key === "Escape" && drawer.classList.contains("on")) setOpen(false);
  });
  s.on(window, "resize", () => {
    if (window.innerWidth > 1000 && drawer.classList.contains("on")) setOpen(false);
  });
  // Unmounting mid-drawer must not leave the document unscrollable, and the
  // hand-built markup has to go with it — React does not know it exists, so it
  // would survive into the next mount and be duplicated.
  s.add(() => {
    document.documentElement.classList.remove("mnav-open");
    document.documentElement.style.overflow = "";
    drawer.classList.remove("on");
    burger.classList.remove("on");
    burger.setAttribute("aria-expanded", "false");
    inner.textContent = "";
  });
}

// ── brand kit: scroll-spy index (Press) ────────────────────────────────────
// The left index follows the scroll from one section to the next, and a click
// on it jumps to that section. No scroll hijacking — the page keeps its own
// scrolling, the index just keeps up.
function initBrandKit(root, reduce, s) {
  const kit = root.querySelector("#bkit");
  if (!kit) return;
  const links = Array.from(kit.querySelectorAll(".bkit-nav a"));
  const panels = links
    .map((a) => root.querySelector(`#${CSS.escape(a.getAttribute("href").slice(1))}`))
    .filter(Boolean);
  if (panels.length !== links.length) return;

  let current = -1;
  const setActive = (i) => {
    if (i === current || i < 0) return;
    current = i;
    links.forEach((a, n) => a.classList.toggle("on", n === i));
  };

  // Whichever panel's top edge last passed the reading line wins. This is
  // steadier than an IntersectionObserver ratio when panels differ wildly in
  // height, which these do.
  const scan = () => {
    const line = window.innerHeight * 0.32;
    let best = 0;
    for (let i = 0; i < panels.length; i += 1) {
      if (panels[i].getBoundingClientRect().top - line <= 0) best = i;
    }
    setActive(best);
  };

  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { scan(); ticking = false; });
  };
  s.on(window, "scroll", onScroll, { passive: true });
  s.on(window, "resize", onScroll);

  links.forEach((a, i) => {
    s.on(a, "click", (e) => {
      e.preventDefault();
      setActive(i);
      panels[i].scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
      history.replaceState(null, "", a.getAttribute("href"));
    });
  });
  scan();
}

// ── document preview ───────────────────────────────────────────────────────
function initDocViewer(root, s) {
  const dv = root.querySelector("#docviewer");
  if (!dv) return;
  const frame = root.querySelector("#dv-frame");
  const title = root.querySelector("#dv-title");
  const closeBtn = root.querySelector("#dv-close");
  if (!frame || !title) return;

  const open = (src, name) => {
    frame.src = src;
    title.textContent = name;
    dv.hidden = false;
    document.body.style.overflow = "hidden";
  };
  const close = () => {
    dv.hidden = true;
    frame.src = "";
    document.body.style.overflow = "";
  };

  for (const b of root.querySelectorAll("[data-doc]")) {
    s.on(b, "click", () => open(b.dataset.doc, b.dataset.title));
  }
  if (closeBtn) s.on(closeBtn, "click", close);
  s.on(dv, "click", (e) => { if (e.target === dv) close(); });
  s.on(document, "keydown", (e) => { if (e.key === "Escape" && !dv.hidden) close(); });
  s.add(() => { document.body.style.overflow = ""; });
}

// ── nav state + pinned products carousel ───────────────────────────────────
// One rAF-throttled frame drives all three: the nav's "stuck" state, its
// "over-dark" state while it still sits on the hero art, and the scroll
// position of the pinned carousel. Splitting them apart, as an earlier version
// of this port did, dropped the two nav states entirely.
function initNavAndPin(root, s) {
  const nav = root.querySelector(".nav");
  const darkHero = root.querySelector(".phero");
  const pin = root.querySelector(".pin");
  const track = root.querySelector(".ptrack");
  const slides = Array.from(root.querySelectorAll(".pslide"));
  const dots = Array.from(root.querySelectorAll(".pdots i"));

  const layoutPin = () => {
    if (!pin || !track || !isWide()) {
      if (pin) pin.style.height = "";
      return;
    }
    // enough scroll length for one viewport per slide
    pin.style.height = `${slides.length * 92 + 40}vh`;
  };

  const runPin = () => {
    if (!pin || !track || !slides.length) return;
    if (!isWide()) {
      slides.forEach((sl) => { sl.classList.add("on"); sl.classList.remove("prev", "next"); });
      return;
    }
    const r = pin.getBoundingClientRect();
    const total = pin.offsetHeight - window.innerHeight;
    const p = total > 0 ? Math.max(0, Math.min(1, -r.top / total)) : 0;
    // ease the ends so the first and last card get a full dwell
    const raw = p * slides.length - 0.5;
    const idx = Math.max(0, Math.min(slides.length - 1, Math.round(raw)));
    slides.forEach((el, i) => {
      el.classList.toggle("on", i === idx);
      el.classList.toggle("prev", i === idx - 1);
      el.classList.toggle("next", i === idx + 1);
      el.style.zIndex = i === idx ? 3 : Math.abs(i - idx) === 1 ? 2 : 1;
    });
    dots.forEach((d, i) => d.classList.toggle("on", i === idx));
  };

  let ticking = false;
  const frame = () => {
    if (nav) {
      nav.classList.toggle("stuck", window.scrollY > 40);
      if (darkHero) {
        // still sitting on the hero art?
        const over = window.scrollY < darkHero.offsetHeight - 90;
        nav.classList.toggle("over-dark", over && !darkHero.classList.contains("light-art"));
      }
    }
    runPin();
    ticking = false;
  };
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(frame);
  };

  s.on(window, "scroll", onScroll, { passive: true });
  s.on(window, "resize", () => { layoutPin(); onScroll(); });
  layoutPin();
  frame();
  s.add(() => { if (pin) pin.style.height = ""; });
}

// ── one nav panel for every item ───────────────────────────────────────────
function initNavPanel(root, s) {
  const navEl = root.querySelector(".nav");
  const panel = root.querySelector("#npanel");
  if (!navEl || !panel) return;
  const npFrame = panel.querySelector(".npanel-fr");
  if (!npFrame) return;

  const groups = {};
  for (const g of panel.querySelectorAll(".npg")) {
    groups[g.getAttribute("data-panel")] = g;
  }
  let closeT = 0;

  const close = () => {
    navEl.classList.remove("np-open");
    npFrame.style.height = "0px";
    Object.values(groups).forEach((g) => g.classList.remove("on"));
  };
  const show = (key) => {
    const g = groups[key];
    if (!g) { close(); return; }
    clearTimeout(closeT);
    Object.entries(groups).forEach(([k, el]) => el.classList.toggle("on", k === key));
    navEl.classList.add("np-open");
    npFrame.style.height = `${g.offsetHeight}px`;
  };

  for (const li of navEl.querySelectorAll(".nav-links > li")) {
    const key = li.getAttribute("data-panel");
    const enter = () => (key ? show(key) : close());
    s.on(li, "mouseenter", enter);
    s.on(li, "focusin", enter);
  }
  s.on(navEl, "mouseenter", () => clearTimeout(closeT));
  s.on(navEl, "mouseleave", () => { closeT = setTimeout(close, 140); });
  s.on(document, "keydown", (e) => { if (e.key === "Escape") close(); });
  s.on(window, "resize", () => {
    if (!navEl.classList.contains("np-open")) return;
    const on = panel.querySelector(".npg.on");
    if (on) npFrame.style.height = `${on.offsetHeight}px`;
  });
  s.add(() => clearTimeout(closeT));
}

// ── expanding picker (products) ────────────────────────────────────────────
function initPicker(root, s) {
  const wrap = root.querySelector("#pick");
  if (!wrap) return;
  const cards = Array.from(wrap.querySelectorAll(".pick-c"));
  const on = (c) => cards.forEach((x) => x.classList.toggle("on", x === c));
  for (const c of cards) {
    s.on(c, "mouseenter", () => on(c));
    s.on(c, "focus", () => on(c));
  }
}

/**
 * Wire up the design system's behaviour inside `ref`.
 * Everything is torn down on unmount, so navigating away leaves nothing behind.
 */
// `mapHref(href, hisPage)` lets the caller redirect a link before it is
// followed — the staged preview uses it to keep mobile taps inside the
// redesign. Defaults to identity, so promoted pages navigate normally.
export function useDsBehaviours(ref, { toggleTheme, mapHref } = {}) {
  const navigate = useNavigate();

  React.useEffect(() => {
    const root = ref.current;
    if (!root) return undefined;

    // His CSS gates the reveal animations on a `js` marker class that his
    // inline bootstrap sets. Nothing in this app sets it, so do it here — and
    // remove it on unmount so a non-ported page is never left with it.
    const hadJs = document.documentElement.classList.contains("js");
    if (!hadJs) document.documentElement.classList.add("js");

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const s = makeScope();

    const blocks = [
      ["theme", () => initTheme(root, s, toggleTheme)],
      ["reveal", () => initReveal(root, reduce, s)],
      ["counters", () => initCounters(root, reduce, s)],
      ["tilt", () => initTilt(root, reduce, s)],
      ["slide-tilt", () => initSlideTilt(root, reduce, s)],
      ["faq", () => initFaq(root, s)],
      ["promo", () => initPromo(root, reduce, s)],
      ["parallax", () => initParallax(root, reduce, s)],
      ["lessons", () => initLessons(root, reduce, s)],
      ["event-filter", () => initEventFilter(root, s)],
      ["mobile-nav", () => initMobileNav(root, s, navigate, mapHref)],
      ["brand-kit", () => initBrandKit(root, reduce, s)],
      ["doc-viewer", () => initDocViewer(root, s)],
      ["nav+pin", () => initNavAndPin(root, s)],
      ["nav-panel", () => initNavPanel(root, s)],
      ["picker", () => initPicker(root, s)],
    ];

    for (const [name, block] of blocks) {
      try {
        block();
      } catch (err) {
        // Never let a broken behaviour hide content: reveal everything and
        // carry on with the remaining blocks.
        root.querySelectorAll(".rise").forEach((el) => el.classList.add("in"));
        console.error(`[ds] behaviour "${name}" failed; content force-revealed`, err);
      }
    }

    return () => {
      s.run();
      if (!hadJs) document.documentElement.classList.remove("js");
    };
  }, [ref, toggleTheme, navigate, mapHref]);
}

export default useDsBehaviours;
