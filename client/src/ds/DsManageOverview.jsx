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
  const [catalogue, setCatalogue] = React.useState(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    if (!accessToken) return undefined;
    let alive = true;

    apiAuthed("/me/summary", { token: accessToken })
      .then((d) => alive && setSummary(d))
      .catch(() => alive && setFailed(true));

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
    if (!summary) return null;

    const ents = summary.entitlements || [];
    const licences = ents.filter((e) => !e.isCourse);
    const courses = ents.filter((e) => e.isCourse);
    const active = licences.filter((e) => e.status === "active");

    // Seats: how many machines are actually bound against how many were bought.
    const seatsOwned = licences.reduce((n, e) => n + (Number(e.seats) || 1), 0);
    const seatsUsed = licences.reduce((n, e) => n + (e.devices?.length || 0), 0);

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
          const months = p.billingInterval === "yearly" ? 12 : 1;
          return sum + termTotalNGN(p, months) * (Number(e.seats) || 1);
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
      const used = e.devices?.length || 0;
      if (owned > used) {
        attention.push({
          kind: "idle",
          text: `${owned - used} of your ${owned} ${e.productName || e.productKey} seat${owned === 1 ? "" : "s"} ${owned - used === 1 ? "is" : "are"} not installed anywhere.`,
          to: "/manage/products",
          action: "Assign",
        });
      }
    }
    for (const c of courses) {
      if (c.status !== "active") continue;
      attention.push({
        kind: "course",
        text: `${c.productName || c.productKey} is enrolled and waiting to be started.`,
        to: "/learn",
        action: "Start",
      });
    }

    return {
      licences,
      active,
      courses,
      seatsOwned,
      seatsUsed,
      nextDate,
      nextAmount,
      attention: attention.slice(0, 5),
      installations: summary.installations || [],
      hub: summary.installerHub || {},
    };
  }, [summary, catalogue]);

  const firstName = (user?.name || user?.email || "").split(/[\s@]/)[0] || "there";
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
            {org ? `${org}: ` : ""}
            everything you are licensed for, and anything that needs you.
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
            {view.courses.length ? "Enrolled" : "None enrolled"}
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
                const used = e.devices?.length || 0;
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
                    <span>{a.text}</span>
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
        </div>
      </div>
    </div>
  );
}
