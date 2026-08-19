// The signed-in app frame: his rail, his top bar, real data.
//
// His static build gives every dash-* and work-* page the same three pieces —
// an icon sprite, the rail, and a top bar that assets/js/dash.js constructs at
// runtime. Only the first two are markup; the top bar exists nowhere in his
// HTML, so it is rebuilt here from that script rather than pretended into a
// ported page.
//
// Two things are deliberately NOT copied from his build:
//
//   * The marketing nav and footer. His build.js adds them to the app screens
//     unconditionally, so a signed-in dashboard carries "Book a demo" above the
//     rail. That reads as an oversight rather than a decision — it is on the
//     snag list for him — and it is not reproduced here.
//   * The sample tenant. "Adeyemi & Partners", 2 projects, 13 rates, 3 of 7
//     products: every one of those is a number we hold, so the rail is fed from
//     GET /me/rail instead. See RAIL_EDITS in scripts/port-ds-html.mjs.

import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../store.jsx";
import { apiAuthed } from "../api.js";
import DsAppSprite from "./chrome/DsAppSprite.jsx";
import DsRail from "./chrome/DsRail.jsx";

// His app screens load dash.css and work.css on top of site.css. Importing
// them here rather than in main.jsx is what keeps ~91 KB of dashboard styling
// off the marketing pages: this module is only ever reached lazily.
import "../styles/ds-dash.css";
import "../styles/ds-work.css";

const icon = (name) => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <use href={`#hi-${name}`} />
  </svg>
);

// Initials for the avatar, from whatever name we actually have.
function initialsOf(text, fallback) {
  const parts = String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return fallback;
  return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
}

/**
 * @param {object} props
 * @param {React.ReactNode} props.children  the screen
 * @param {string} [props.title]            top-bar title; his dash.js reads it
 *                                          off document.title, which a SPA does
 *                                          not have per screen
 * @param {string} [props.page]              his page name for the current
 *                                          screen, when the route it lives at
 *                                          is not the one the rail links to
 */
export default function DsAppShell({ children, title = "", page = "" }) {
  const { user, accessToken, clear } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [counts, setCounts] = React.useState(null);
  const [drawer, setDrawer] = React.useState(false);
  const [menu, setMenu] = React.useState(false);

  // His dash.js puts these on <body>/<html>; several of his rules key off them.
  React.useEffect(() => {
    document.body.classList.add("dash");
    document.documentElement.classList.add("dash-root");
    return () => {
      document.body.classList.remove("dash");
      document.documentElement.classList.remove("dash-root");
    };
  }, []);

  React.useEffect(() => {
    if (!accessToken) return undefined;
    let live = true;
    apiAuthed("/me/rail", { token: accessToken })
      .then((d) => live && setCounts(d))
      // A rail badge is decoration. If the count endpoint is unreachable the
      // rail still has to render, just without the numbers.
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [accessToken]);

  // Close the drawer on navigation, the way his rail click handler does.
  React.useEffect(() => {
    setDrawer(false);
    setMenu(false);
  }, [location.pathname]);

  React.useEffect(() => {
    if (!drawer && !menu) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") {
        setDrawer(false);
        setMenu(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawer, menu]);

  const name = user?.name || user?.email || "";
  const org = user?.organizationName || "";

  // A count of 0 is a real answer and his design has no empty state for the
  // badge, so an item with nothing behind it shows no badge at all rather than
  // a "0" the eye reads as a problem.
  const badge = (n) => (n ? String(n) : "");

  const d = {
    initials: initialsOf(org || name, "ADLM"),
    orgName: org || name || "Your account",
    orgSub: user?.email || "",
    projects: badge(counts?.projects),
    rates: badge(counts?.rates),
    certificates: badge(counts?.certificates),
    seats:
      counts && counts.productsTotal
        ? `${counts.productsOwned} of ${counts.productsTotal}`
        : "",
    // Teams are not a feature yet, so this badge stays empty rather than
    // inventing "3/5" — the item still navigates, and the screen says so.
    team: "",
  };

  // His dash.js marks the current item with `.on` by comparing his page names.
  // Two things have to match here, because the rail is used from two places:
  // on a real route the current path is what identifies the screen, but under
  // /preview/* the path is /preview/<slug> while the rail links at /manage/*,
  // and comparing those marks nothing at all. His page name — which the porter
  // records on every link as data-ds-page — identifies the screen in both.
  const railRef = React.useRef(null);
  React.useEffect(() => {
    const root = railRef.current;
    if (!root) return;
    const here = location.pathname;
    root.querySelectorAll("a[href]").forEach((a) => {
      const to = a.getAttribute("href");
      const on = page
        ? a.getAttribute("data-ds-page") === page
        : to === here || (to !== "/" && here.startsWith(`${to}/`));
      a.classList.toggle("on", on);
      if (on) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
  }, [location.pathname, page, counts]);

  // Below 1000px his rail is a fixed drawer that slides in on `.open`. The
  // class has to land on .dsh-rail itself — the host above renders as
  // display:contents and so has no box for a transform to apply to.
  React.useEffect(() => {
    const rail = railRef.current?.querySelector(".dsh-rail");
    if (rail) rail.classList.toggle("open", drawer);
  }, [drawer]);

  const signOut = (e) => {
    e.preventDefault();
    clear();
    navigate("/");
  };

  return (
    <div className="ds">
      <div className="dsh">
        <DsAppSprite />

        {/* The rail is his markup; the click handler is his too — following a
            link inside the drawer should not leave it open behind the screen
            that replaces it.

            display:contents on the host, because .dsh is a two-column grid and
            .dsh-rail has to stay a direct child of it. A plain wrapper div
            becomes the grid item instead, which collapses the rail to auto
            width and pushes the main column off the layout. */}
        <div
          ref={railRef}
          style={{ display: "contents" }}
          onClick={(e) => {
            if (e.target.closest("a")) setDrawer(false);
          }}
        >
          <DsRail d={d} />
        </div>

        <div className="dsh-main">
          <header className="dsh-top">
            <button
              type="button"
              className="dsh-burger"
              aria-label="Open the menu"
              aria-expanded={drawer}
              onClick={() => setDrawer((v) => !v)}
            >
              {icon("menu")}
            </button>
            <span className="ttl">{title}</span>
            <span className="sp" />
            <span className="dsh-search">
              {icon("search")}
              <input
                type="search"
                placeholder="Search products, invoices, people"
                aria-label="Search this account"
              />
            </span>
            <span className="dsh-acc">
              <button
                type="button"
                className="dsh-me"
                aria-haspopup="true"
                aria-expanded={menu}
                onClick={() => setMenu((v) => !v)}
              >
                <span className="dsh-avi">{d.initials}</span>
                <span>{name.split(" ")[0] || "Account"}</span>
              </button>
              <div className={menu ? "dsh-menu on" : "dsh-menu"}>
                <div className="who">
                  <b>{name || "Signed in"}</b>
                  <span>{user?.email || ""}</span>
                </div>
                <Link to="/manage">Dashboard</Link>
                <Link to="/manage/settings">Account settings</Link>
                <Link to="/manage/billing">Billing &amp; invoices</Link>
                <a href="/" onClick={signOut}>
                  Sign out
                </a>
              </div>
            </span>
          </header>

          {children}
        </div>

        <div
          className={drawer ? "dsh-scrim on" : "dsh-scrim"}
          onClick={() => setDrawer(false)}
        />
      </div>
    </div>
  );
}
