// The admin shell — his chrome around our admin screens.
//
// His admin-shell.js does four things, and all four are here: a rail that
// collapses to icons and remembers it, a drawer on a narrow screen, Escape to
// close it, and Cmd-K into the find. His classes throughout: .adm-shell,
// .adm-rail, .adm-veil, .adm-body, .adm-top, .adm-page, and the .adm-root /
// .adm-tight / .adm-open flags he sets on <html> rather than in the sheet, so
// a page WITHOUT the shell — the sign-in — still scrolls normally.
//
// The rail itself — his groups, mapped onto our routes and filtered by what
// the session may reach — is data, and lives in adminNav.js beside the list of
// screens he drew that we have not built.

import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../store.jsx";
import { apiAuthed } from "../api.js";
import { useTheme } from "../theme.jsx";
import { can, isDesignAccess } from "../utils/roles.js";
import DsSprite from "./chrome/DsSprite.jsx";
import DsAdminSprite from "./chrome/DsAdminSprite.jsx";
import { NAV, titleFor } from "./adminNav.js";
import "../styles/ds-admin.css";

const RAIL_KEY = "adlm-adm-rail";

export default function DsAdminShell({ children, title }) {
  const { user, accessToken, clear } = useAuth();
  const { toggle } = useTheme();
  const loc = useLocation();
  const nav = useNavigate();
  const findRef = React.useRef(null);

  const [tight, setTight] = React.useState(() => {
    try {
      return window.localStorage.getItem(RAIL_KEY) === "tight";
    } catch {
      return false;
    }
  });
  const [open, setOpen] = React.useState(false);
  const [acc, setAcc] = React.useState(false);
  const accRef = React.useRef(null);
  const [badges, setBadges] = React.useState(null);

  // `adm-root` is the one flag that genuinely belongs on <html>: it is what
  // lets the shell own the viewport, and the ported sheet targets it as
  // `:root.adm-root`, unscoped. It comes back off on unmount, or every page
  // after admin inherits an admin viewport.
  React.useEffect(() => {
    const root = document.documentElement;
    root.classList.add("adm-root");
    return () => root.classList.remove("adm-root");
  }, []);

  // `adm-tight` and `adm-open` do NOT go on <html>, though his admin-shell.js
  // puts them there.
  //
  // The porter scopes his stylesheet by prefixing every selector with `.ds`,
  // which is what keeps the ported design off un-ported pages. For a rule he
  // wrote against `html.adm-tight` that prefix turns it into
  // `.ds .adm-tight .adm-rail` — a DESCENDANT selector — and a class on <html>
  // is an ancestor of `.ds`, so it can never match. Setting it there looked
  // right, persisted correctly, and moved nothing: the rail stayed 264px in
  // both states.
  //
  // Putting them on .adm-shell instead satisfies the ported selectors exactly.
  // `--adm-rail` is read by .adm-shell's own grid, and a custom property set
  // by `.ds .adm-tight` on that same element applies to it, so the column
  // collapses to 76px as he intended.
  React.useEffect(() => {
    try {
      window.localStorage.setItem(RAIL_KEY, tight ? "tight" : "wide");
    } catch {
      /* a rail preference is not worth an error state */
    }
  }, [tight]);

  // Following a link closes the drawer behind you — his rule, expressed as a
  // route change rather than a click listener, which also covers the ways a
  // React app navigates without one.
  React.useEffect(() => {
    setOpen(false);
    setAcc(false);
  }, [loc.pathname]);

  // A menu that only closes on its own button is a menu that follows you
  // around the page.
  React.useEffect(() => {
    if (!acc) return undefined;
    const onDoc = (e) => {
      if (!accRef.current?.contains(e.target)) setAcc(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [acc]);

  // His .tail counts on the rail.
  //
  // Read from /admin/today — the same endpoint the Today screen draws — so a
  // badge can never disagree with the number on the page it leads to. Fetched
  // once per navigation rather than on a timer: a rail that changes under you
  // while you are reading it is worse than one a few minutes stale, and the
  // screens themselves are always current.
  React.useEffect(() => {
    if (!accessToken) return undefined;
    let alive = true;
    apiAuthed("/admin/today", { token: accessToken })
      .then((r) => {
        if (!alive) return;
        const by = {};
        for (const q of [...(r.work || []), ...(r.watch || [])]) by[q.id] = q.n;
        // Follow-ups is our queue, not one of his, and lives inside the
        // support count on Today. Read from its own row so the rail does not
        // claim the same calls twice.
        setBadges(by);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [accessToken, loc.pathname]);

  React.useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        setOpen(false);
        setAcc(false);
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        findRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Design Access is meant to see the whole rail — a designer cannot rebuild a
  // screen they cannot reach. Everything behind it is placeholder data.
  const design = isDesignAccess(user);
  const allowed = (it) => {
    if (design) return true;
    if (it.admin) return !!(user?.isSuperAdmin || user?.role === "admin");
    return can(user, it.area);
  };

  const groups = NAV.map((g) => ({ ...g, items: g.items.filter(allowed) })).filter(
    (g) => g.items.length,
  );

  // Which nav entry is the page you are on.
  //
  // Prefix matching alone lights up every ancestor: standing on
  // /admin/rategen/build ("Build a rate") also matched /admin/rategen ("Rate
  // library"), so two entries glowed at once and neither looked like the answer
  // to "where am I". Only the most specific match is the page, so the longest
  // matching path wins and the rest go quiet.
  //
  // Deciding it here rather than hanging `end: true` on the entry means the next
  // nested route someone adds cannot bring the bug back — there is nothing to
  // remember.
  const hit = (it) =>
    it.end ? loc.pathname === it.to : loc.pathname === it.to || loc.pathname.startsWith(`${it.to}/`);

  let best = null;
  for (const g of groups) {
    for (const it of g.items) {
      if (hit(it) && (best === null || it.to.length > best.length)) best = it.to;
    }
  }

  const current = (it) => it.to === best;

  const signOut = () => {
    clear();
    nav("/admin/login", { replace: true });
  };

  const who = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.email || "Admin";
  const first = user?.firstName || who.split(" ")[0] || "Admin";
  const initials =
    (user?.firstName?.[0] || user?.email?.[0] || "A").toUpperCase() +
    (user?.lastName?.[0] || "").toUpperCase();

  // His header carries a role under the name. His says "Owner"; ours says what
  // the account actually holds, because on this system that is a real
  // distinction — a mini-admin holds some areas and not others.
  const rank = design
    ? "Design access"
    : user?.isSuperAdmin || user?.role === "admin"
      ? "Administrator"
      : user?.role === "mini_admin"
        ? "Team admin"
        : "Staff";

  return (
    <div className="ds">
      {/* Both, because his build injects the marketing sprite into every page
          it generates — admin included — and the header's theme button uses
          #i-moon and #i-sun from it. The admin sprite alone leaves those two
          as empty squares. */}
      <DsSprite />
      <DsAdminSprite />
      <div className={`adm-shell${tight ? " adm-tight" : ""}${open ? " adm-open" : ""}`}>
        <aside className="adm-rail adm-scroll" aria-label="ADLM admin">
          <Link className="adm-brand" to="/admin" aria-label="ADLM Studio admin">
            <img className="logo-l" src="/ds/logo-light.svg" alt="ADLM Studio" />
            <img className="logo-d" src="/ds/logo-dark.svg" alt="ADLM Studio" />
            <span className="tag">Admin</span>
          </Link>

          <button
            type="button"
            className="adm-tog"
            onClick={() => setTight((v) => !v)}
            aria-pressed={tight}
            aria-label={tight ? "Expand the navigation" : "Collapse the navigation"}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 5h16M4 12h10M4 19h16" />
            </svg>
          </button>

          {groups.map((g) => (
            <React.Fragment key={g.group || "tail"}>
              {/* His last block has no heading — it opens with a rule instead,
                  because AI usage, System and Sign out are not a category of
                  thing, they are how the place is run. */}
              {g.rule ? <div className="adm-rule" /> : null}
              {g.group ? <p className="adm-grp">{g.group}</p> : null}
              <ul className="adm-nav">
                {g.items.map((it) => (
                  <li key={it.to}>
                    <Link
                      to={it.to}
                      data-tip={it.label}
                      className={current(it) ? "on" : undefined}
                      aria-current={current(it) ? "page" : undefined}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <use href={`#${it.icon}`} />
                      </svg>
                      <span className="lb">{it.label}</span>
                      {/* A count only when there is something in it. A zero
                          badge is visual noise on a queue that is clear, and
                          an absent count is not the same as a zero — see the
                          note in adminNav.js. */}
                      {it.badge && badges?.[it.badge] ? (
                        <span className="tail">{badges[it.badge]}</span>
                      ) : null}
                    </Link>
                  </li>
                ))}
                {/* In the same list as the rest of the block, as he has it. It
                    is a button and not a link because it does something rather
                    than going somewhere, but it must read as one of the rail's
                    own rows. */}
                {g.rule ? (
                  <li>
                    <button type="button" className="adm-out" onClick={signOut} data-tip="Sign out">
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <use href="#hi-signout" />
                      </svg>
                      <span className="lb">Sign out</span>
                    </button>
                  </li>
                ) : null}
              </ul>
            </React.Fragment>
          ))}

          <p className="adm-who">
            Signed in as {who}. Everything done here is written against your name.
          </p>
        </aside>

        <div className="adm-veil" onClick={() => setOpen(false)} />

        <div className="adm-body">
          <header className="adm-top">
            <button
              type="button"
              className="adm-ico adm-burger"
              onClick={() => setOpen(true)}
              aria-label="Open the navigation"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <use href="#hi-menu" />
              </svg>
            </button>

            {/* His title block. The crumb never changes; the name comes from
                the rail entry for this path, so the heading and the nav cannot
                disagree about what a screen is called. */}
            <span className="ttl">
              <span className="crumb">ADLM admin</span>
              {title || titleFor(loc.pathname)}
            </span>

            <span className="sp" />

            <label className="adm-find">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <use href="#hi-search" />
              </svg>
              <input
                ref={findRef}
                type="search"
                placeholder="Search accounts, orders, documents"
                aria-label="Search"
              />
              <kbd>&#8984;K</kbd>
            </label>

            {/* His #tt, on our ThemeProvider rather than its own localStorage
                key. One theme system for the whole site: admin obeys the same
                switch the marketing pages do, and stops following the
                operating system the moment it is touched. */}
            <button
              className="tt adm-ico"
              id="tt"
              type="button"
              onClick={toggle}
              aria-label="Switch colour theme"
            >
              <svg className="i-moon" viewBox="0 0 24 24">
                <use href="#i-moon" />
              </svg>
              <svg className="i-sun" viewBox="0 0 24 24">
                <use href="#i-sun" />
              </svg>
            </button>

            {/* His chip is inert — his admin has nowhere else to go. Ours
                does: the same person holds a customer account, and the way
                between the two sides should be where every product puts it.
                The pair reads as a switch, marked on the side you are on,
                exactly as the app shell's menu does. */}
            <span className="adm-acc" ref={accRef}>
              <button
                type="button"
                className="adm-me"
                aria-haspopup="true"
                aria-expanded={acc}
                onClick={() => setAcc((v) => !v)}
              >
                <span className="avi">{initials}</span>
                <span>
                  <b>{first}</b>
                  <em>{rank}</em>
                </span>
              </button>
              <div className={acc ? "adm-menu on" : "adm-menu"}>
                <div className="who">
                  <b>{who}</b>
                  <span>{user?.email || ""}</span>
                </div>
                <Link to="/admin" className="side on">
                  Admin
                </Link>
                <Link to="/manage" className="side">
                  User
                </Link>
                <span className="rule" />
                <Link to="/manage/settings">Account settings</Link>
                <Link to="/manage/billing">Billing &amp; invoices</Link>
                <button type="button" className="out" onClick={signOut}>
                  Sign out
                </button>
              </div>
            </span>
          </header>

          <main className="adm-page adm-scroll">
            <div className="adm-page-in">
              {title ? <h1 className="adm-h1">{title}</h1> : null}
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
