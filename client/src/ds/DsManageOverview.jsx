// His Manage overview, on real data.
//
// This is the screen that replaces /dashboard once the makeover lands, so it
// has to answer the same questions the old one does — what am I licensed for,
// what needs me, what is about to be charged — in his layout rather than ours.
//
// His markup and classes throughout: .dsh-in / .dsh-head / .dsh-stats /
// .dsh-stat / .dsh-cols / .dsh-panel / .dsh-prod / .pill. What changes is that
// every figure comes from the account rather than from the sample tenant he
// dressed it with (Adeyemi & Partners, 3 of 5 seats, ₦137,600 on the 7th).
//
// A tile with nothing behind it says so rather than showing a zero. "0 of 0
// seats" reads like a broken account; "No seats yet" reads like the truth.

import React from "react";
import { Link } from "react-router-dom";
import { apiAuthed } from "../api.js";
import { API_BASE } from "../config.js";
import { useAuth } from "../store.jsx";
import { termTotalNGN } from "../lib/termPricing.js";

const money = (n) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(Number(n) || 0);

const longDate = (d) =>
  d
    ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : "";

// His feed shows "2d", "5d", then falls back to a date once that stops being
// a useful way to say when.
function ago(d) {
  if (!d) return "";
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 864e5);
  if (days <= 0) return "today";
  if (days < 14) return `${days}d`;
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

// How long a feature grant runs for.
//
// A grant is an entitlement, so it carries the same expiry fields a licence
// does — and admins do issue them with an end date. Showing only "Active" hid
// that, which is the difference between a feature somebody can rely on next
// month and one that stops on a date nobody was told.
//
// An open-ended grant says so rather than showing a blank: no expiry is the
// common case and reads as permanent, which it is.
function grantTerm(g) {
  const status = String(g.status || "").toLowerCase();

  if (g.isExpired || status === "expired") {
    return g.expiresAt ? `Ended ${longDate(g.expiresAt)}` : "Ended";
  }
  if (status !== "active") return g.status || "Inactive";
  if (!g.expiresAt) return "Active · no end date";

  const days = Number(g.daysLeft);
  // Inside a fortnight the date alone stops being useful — the number of days
  // is what tells somebody whether to do something about it this week.
  if (Number.isFinite(days) && days <= 14) {
    return `Active · ${days} day${days === 1 ? "" : "s"} left`;
  }
  return `Active · until ${longDate(g.expiresAt)}`;
}

// His greeting changes with the clock, so ours does too.
function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

const ICONS = {
  revit: "/ds/ic-quiv.png",
  planswift: "/ds/ic-heron.png",
  rategen: "/ds/ic-rategen.png",
  mep: "/ds/ic-mep.png",
  "qs-takeoff": "/ds/ic-timepro.png",
  civil3d: "/ds/ic-civiq.png",
};

export default function DsManageOverview() {
  const { user, accessToken } = useAuth();
  const [summary, setSummary] = React.useState(null);
  const [courses, setCourses] = React.useState(null);
  const [activity, setActivity] = React.useState(null);
  const [catalogue, setCatalogue] = React.useState(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    if (!accessToken) return undefined;
    let alive = true;

    apiAuthed("/me/summary", { token: accessToken })
      .then((d) => alive && setSummary(d))
      .catch(() => alive && setFailed(true));

    // Courses are enrolments, not entitlements.
    //
    // This tile read `entitlements.filter(e => e.isCourse)` and showed 0 for an
    // account holding two courses. A course is a CourseEnrollment keyed on a
    // courseSku, which is a different collection with its own expiry, its own
    // progress and its own classroom link — GET /me/courses is what the
    // dashboard has always read, and it returns a bare array.
    apiAuthed("/me/courses", { token: accessToken })
      .then((d) => alive && setCourses(Array.isArray(d) ? d : []))
      // One tile, not the screen.
      .catch(() => alive && setCourses([]));

    // The activity trail recordActivity() has been writing at every project
    // and PM mutation. Six is what his panel shows.
    apiAuthed("/me/activity", { token: accessToken, params: { limit: 6 } })
      .then((d) => alive && setActivity(d.items || []))
      // A feed is the last panel on the screen; it does not get to blank it.
      .catch(() => alive && setActivity([]));

    fetch(`${API_BASE}/products`)
      .then((r) => (r.ok ? r.json() : null))
      .then((raw) => {
        if (!alive || !raw) return;
        const all = Array.isArray(raw) ? raw : raw.items || raw.products || [];
        setCatalogue(Object.fromEntries(all.map((p) => [p.key, p])));
      })
      .catch(() => {});

    return () => {
      alive = false;
    };
  }, [accessToken]);

  const view = React.useMemo(() => {
    if (!summary || !catalogue || !courses) return null;

    const ents = summary.entitlements || [];

    // A feature grant is not a licensed product.
    //
    // "boq-import" and "ai" are switches on an existing product, granted by an
    // admin. They have no catalogue row, no seats to install and nothing to
    // renew — so counting them inflated Products active, added a phantom seat
    // to Seats in use, and produced "1 of your 1 boq-import seat is not
    // installed anywhere", which is not a thing anybody can act on.
    //
    // Having no catalogue row is exactly what distinguishes them, and the
    // catalogue is already loaded for pricing. Until it arrives nothing is
    // classified, which is why this waits for it.
    const isProduct = (e) => !!catalogue?.[e.productKey];
    const licences = ents.filter((e) => !e.isCourse && isProduct(e));
    const grants = ents.filter((e) => !e.isCourse && !isProduct(e));
    const active = licences.filter((e) => e.status === "active");

    // Seats: how many machines are actually bound against how many were bought.
    const seatsOwned = licences.reduce((n, e) => n + (Number(e.seats) || 1), 0);
    // `seatsUsed` from the API, not `devices.length`. The devices array is
    // only sent once every seat is taken — the desktop clients read it as the
    // "no seats left" signal — so counting it made a half-used licence look
    // like an unused one. `seatsUsed` is the count itself and is always sent.
    const seatsUsed = licences.reduce((n, e) => n + (Number(e.seatsUsed) || 0), 0);

    // Next charge: the soonest expiry among active licences, and what those
    // renewing on that date cost. Computed from the catalogue rather than
    // stored, so it cannot quote a price the cart disagrees with.
    const dated = active.filter((e) => e.expiresAt).sort((a, b) => new Date(a.expiresAt) - new Date(b.expiresAt));
    const nextDate = dated[0]?.expiresAt || null;
    const sameDay = nextDate
      ? dated.filter((e) => new Date(e.expiresAt).toDateString() === new Date(nextDate).toDateString())
      : [];
    const nextAmount = catalogue
      ? sameDay.reduce((sum, e) => {
          const p = catalogue[e.productKey];
          if (!p) return sum;
          // One billing period, not twelve. termTotal counts PERIODS, and for
          // a yearly-billed product a period is a year — passing 12 returned
          // twelve years of it. See the note in DsBilling.
          return sum + termTotalNGN(p, 1) * (Number(e.seats) || 1);
        }, 0)
      : 0;

    // Anything the person should act on. Only real conditions — an empty list
    // is a good answer, and inventing filler for it would be worse than an
    // honest "Nothing needs you".
    const attention = [];
    const soon = Date.now() + 14 * 864e5;
    for (const e of active) {
      if (e.expiresAt && new Date(e.expiresAt).getTime() < soon) {
        attention.push({
          kind: "warn",
          text: `${e.productName || e.productKey} expires ${longDate(e.expiresAt)}.`,
          to: "/purchase",
          action: "Renew",
        });
      }
    }
    for (const e of licences) {
      const owned = Number(e.seats) || 1;
      const used = Number(e.seatsUsed) || 0;
      if (owned > used) {
        attention.push({
          kind: "idle",
          text: `${owned - used} of your ${owned} ${e.productName || e.productKey} seat${owned === 1 ? "" : "s"} ${owned - used === 1 ? "is" : "are"} not installed anywhere.`,
          to: "/manage/products",
          action: "Assign",
        });
      }
    }
    // A grant running out is as actionable as a licence running out, and less
    // visible — nobody thinks to check a feature they were simply given.
    for (const g of grants) {
      if (String(g.status || "").toLowerCase() !== "active") continue;
      if (!g.expiresAt || new Date(g.expiresAt).getTime() >= soon) continue;
      attention.push({
        kind: "warn",
        text: `${g.productName || g.productKey} stops working ${longDate(g.expiresAt)}.`,
        to: "/manage/support",
        action: "Ask us",
      });
    }
    for (const c of courses) {
      // The response nests: { course, enrollment, summary, progress, access }.
      // `progress` is a percentage, and the module counts live on `summary` —
      // reading progress.completedModules would have been undefined on every
      // course and flagged all of them as unstarted.
      if (Number(c.summary?.completedModules ?? 0) > 0) continue;
      attention.push({
        kind: "course",
        text: `${c.course?.title || c.course?.sku || "A course"} is enrolled and not started yet.`,
        to: "/learn",
        action: "Start",
      });
    }

    return {
      licences,
      grants,
      active,
      // Whether any grant has an end date at all, so the panel's copy can stop
      // claiming there is nothing to renew when there is.
      grantsExpire: grants.some((g) => !!g.expiresAt),
      courses,
      coursesInProgress: courses.filter(
        (c) => Number(c.summary?.completedModules ?? 0) > 0,
      ).length,
      seatsOwned,
      seatsUsed,
      nextDate,
      nextAmount,
      attention: attention.slice(0, 5),
      installations: summary.installations || [],
      hub: summary.installerHub || {},
    };
  }, [summary, catalogue, courses]);

  // buildAuthPayload sends firstName; there is no `name` field, so reading one
  // fell through to the email and greeted somebody as "dolapo836".
  const firstName =
    user?.firstName?.trim() || (user?.email || "").split("@")[0] || "there";
  const org = user?.organizationName || "";

  if (failed) {
    return (
      <div className="dsh-in">
        <p className="sub">Your account could not be loaded just now. Please refresh.</p>
      </div>
    );
  }
  if (!view) {
    return (
      <div className="dsh-in">
        <p className="sub">Loading your account…</p>
      </div>
    );
  }

  return (
    <div className="dsh-in">
      <div className="dsh-head">
        <div>
          <h1>
            {greeting()}, {firstName}
          </h1>
          <p>
            {org
              ? `${org} — everything the practice is licensed for, and anything that needs you.`
              : "Everything you are licensed for, and anything that needs you."}
          </p>
        </div>
        <div className="dsh-acts">
          <span className="when">
            {new Date().toLocaleDateString("en-GB", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </span>
        </div>
      </div>

      <div className="dsh-stats">
        <div className="dsh-stat pal-on">
          <span className="k">
            <svg viewBox="0 0 24 24"><use href="#hi-product" /></svg>
            Products active
          </span>
          <b>{view.active.length}</b>
          <p className="sub">
            {view.active.length
              ? view.active.map((e) => e.productName || e.productKey).join(", ")
              : "Nothing active yet"}
          </p>
        </div>

        <div className="dsh-stat">
          <span className="k">
            <svg viewBox="0 0 24 24"><use href="#hi-team" /></svg>
            Seats in use
          </span>
          <b>
            {view.seatsUsed}
            {view.seatsOwned > 0 && <span className="u">of {view.seatsOwned}</span>}
          </b>
          <p className="sub">
            {view.seatsOwned === 0
              ? "No seats yet"
              : view.seatsOwned - view.seatsUsed > 0
                ? `${view.seatsOwned - view.seatsUsed} sitting idle`
                : "Every seat installed"}
          </p>
        </div>

        <div className="dsh-stat">
          <span className="k">
            <svg viewBox="0 0 24 24"><use href="#hi-doc" /></svg>
            Next charge
          </span>
          <b>{view.nextDate && view.nextAmount ? money(view.nextAmount) : "—"}</b>
          <p className="sub">
            {view.nextDate ? `Renews ${longDate(view.nextDate)}` : "Nothing scheduled"}
          </p>
        </div>

        <div className={`dsh-stat${view.courses.length ? " warn" : ""}`}>
          <span className="k">
            <svg viewBox="0 0 24 24"><use href="#hi-learning" /></svg>
            Courses
          </span>
          <b>{view.courses.length}</b>
          <p className="sub">
            {view.courses.length === 0
              ? "None enrolled"
              : view.coursesInProgress > 0
                ? `${view.coursesInProgress} in progress`
                : "Enrolled, not started"}
          </p>
        </div>
      </div>

      <div className="dsh-cols">
        <div>
          <section className="dsh-panel">
            <div className="dsh-ph">
              <h2>Your products</h2>
              <Link className="more" to="/manage/products">
                All products
              </Link>
            </div>
            <div className="dsh-body">
              {view.licences.length === 0 && (
                <p className="sub">
                  Nothing licensed yet.{" "}
                  <Link to="/products">See what ADLM makes</Link>.
                </p>
              )}
              {view.licences.map((e) => {
                const owned = Number(e.seats) || 1;
                const used = Number(e.seatsUsed) || 0;
                const install = view.installations.find(
                  (i) => i.installationProductKey === e.productKey,
                );
                return (
                  <div className="dsh-prod" key={e.productKey}>
                    <img src={ICONS[e.productKey] || "/ds/ic-quiv.png"} alt="" />
                    <div className="nm">
                      <b>{e.productName || e.productKey}</b>
                      <span>
                        {used
                          ? `installed on ${used} machine${used === 1 ? "" : "s"}`
                          : "not installed yet"}
                        {install?.version ? ` · v${install.version}` : ""}
                      </span>
                    </div>
                    <span className={`pill ${e.status === "active" ? "pill-a" : ""}`}>
                      {e.status === "active" ? "Current" : e.status}
                    </span>
                    <span className="seats">
                      {used} of {owned} seat{owned === 1 ? "" : "s"}
                    </span>
                    <span className="go">
                      <Link className="ds-btn btn-o ds-btn-sm" to={`/product/${e.productKey}`}>
                        Manage
                      </Link>
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          {view.grants.length > 0 && (
            <section className="dsh-panel">
              <div className="dsh-ph">
                <h2>Feature access</h2>
              </div>
              <div className="dsh-body">
                <p className="sub">
                  Switched on for this account by ADLM. Nothing to install: they work inside
                  the products you already have.{" "}
                  {view.grantsExpire
                    ? "The ones with an end date stop working on it unless they are extended."
                    : "None of them expire."}
                </p>
                {/* .dsh-kv, not .dsh-note — the latter is not a class in his
                    stylesheet (only .dsh-notes, the notifications panel), so
                    these rows had no layout at all and the name ran straight
                    into the status: "boq-importActive". */}
                <div className="dsh-kv">
                  {view.grants.map((g) => (
                    <div key={g.productKey}>
                      <span>{g.productName || g.productKey}</span>
                      <b>{grantTerm(g)}</b>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}
        </div>

        <div>
          <section className="dsh-panel">
            <div className="dsh-ph">
              <h2>Needs your attention</h2>
            </div>
            <div className="dsh-body">
              {view.attention.length === 0 ? (
                <p className="sub">Nothing needs you. Everything is active and installed.</p>
              ) : (
                view.attention.map((a, i) => (
                  <div className="dsh-note" key={`${a.kind}-${i}`}>
                    <span className={`dot ${a.kind === "warn" ? "warn" : ""}`} />
                    <span>{a.text} </span>
                    <span className="act">
                      <Link to={a.to}>{a.action}</Link>
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>

          {view.hub.downloadUrl && (
            <section className="dsh-panel">
              <div className="dsh-body">
                <h3>Installer Hub</h3>
                <p className="meta">
                  Installs only what this account is licensed for.
                </p>
                <a className="ds-btn btn-p ds-btn-sm" href={view.hub.downloadUrl}>
                  Download
                </a>
              </div>
            </section>
          )}

          {/* Recent activity — his .dsh-feed, on the real trail.
              recordActivity() already writes one of these at every project and
              PM mutation, so this is a read of something the account has been
              keeping all along rather than anything new. */}
          {activity && activity.length > 0 && (
            <section className="dsh-panel">
              <div className="dsh-ph">
                <h2>Recent activity</h2>
                <Link className="more" to="/profile">
                  All activity
                </Link>
              </div>
              <div className="dsh-body">
                <ul className="dsh-feed">
                  {activity.slice(0, 6).map((a) => (
                    <li key={a._id}>
                      <span className={`tick${a.category === "billing" ? " g" : ""}`} />
                      <div>
                        <b>{a.action || a.category || "Activity"}</b>
                        {a.summary ? ` ${a.summary}` : ""}
                        {a.projectName ? ` — ${a.projectName}` : ""}
                      </div>
                      <span className="ago">{ago(a.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}

          {/* Your learning — his .dsh-course, from the enrolments already
              loaded for the Courses tile. His progress bar is a percentage and
              so is ours; his "week 4 of 6" is modules, which is the unit we
              actually track. */}
          {view.courses.length > 0 && (
            <section className="dsh-panel">
              <div className="dsh-ph">
                <h2>Your learning</h2>
                <Link className="more" to="/learn">
                  All courses
                </Link>
              </div>
              <div className="dsh-body">
                {view.courses.map((c) => {
                  const done = Number(c.summary?.completedModules ?? 0);
                  const all = Number(c.summary?.totalModules ?? 0);
                  const pct = Number(c.progress) || 0;
                  return (
                    <div className="dsh-course" key={c.course?.sku || c.enrollment?._id}>
                      <div className="top">
                        <b>{c.course?.title || c.course?.sku}</b>
                        <span className="pc">
                          {all ? (done ? `module ${done} of ${all}` : "not started") : "enrolled"}
                        </span>
                      </div>
                      <div className="dsh-bar">
                        <i style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
                      </div>
                      <p>
                        {[
                          c.summary?.requiredAssignments
                            ? `${c.summary.approvedAssignments || 0} of ${c.summary.requiredAssignments} assignments approved`
                            : null,
                          c.enrollment?.accessExpiresAt
                            ? `access until ${longDate(c.enrollment.accessExpiresAt)}`
                            : "open access",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
