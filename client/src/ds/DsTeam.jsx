// His Team & seats screen, on what the account can actually answer.
//
// This is the one screen of his where the design is ahead of the software, and
// it is worth being explicit about the gap rather than papering it.
//
// His version has five named colleagues, a role each, and a grid of chips you
// click to move a seat from one person to another. None of that exists here:
// there is no member model, no invitation, and no way to assign a seat to a
// person. A seat in this system binds to a MACHINE, through the device
// fingerprint the desktop clients register — which is a different idea wearing
// the same word.
//
// So the two panels that are real are real, and the one that is not says so:
//
//   * Seats per product — his .dsh-meter, fed by seats vs seatsUsed.
//   * Machines — his .dsh-kv, fed by GET /me/devices.
//   * Members — the account holder, and a plain statement that adding
//     colleagues is not built yet. Not a disabled invite form: a form that
//     looks ready and silently does nothing is worse than an honest sentence.
//
// When a member model does land, the Members panel and the invite form are the
// only parts of this file that change.

import React from "react";
import { Link } from "react-router-dom";
import { apiAuthed } from "../api.js";
import { API_BASE } from "../config.js";
import { useAuth } from "../store.jsx";

const NAMES = {
  revit: "QUIV",
  planswift: "HERON",
  rategen: "RateGen",
  mep: "Revit MEP",
  "qs-takeoff": "Time Pro",
  civil3d: "CIVIQ",
};

const ICONS = {
  revit: "/ds/ic-quiv.png",
  planswift: "/ds/ic-heron.png",
  rategen: "/ds/ic-rategen.png",
  mep: "/ds/ic-mep.png",
  "qs-takeoff": "/ds/ic-timepro.png",
  civil3d: "/ds/ic-civiq.png",
};

function ago(d) {
  if (!d) return "never";
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 864e5);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return new Date(d).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function initialsOf(text, fallback) {
  const parts = String(text || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return fallback;
  return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
}

export default function DsTeam() {
  const { user, accessToken } = useAuth();
  const [summary, setSummary] = React.useState(null);
  const [devices, setDevices] = React.useState(null);
  const [catalogue, setCatalogue] = React.useState(null);
  const [failed, setFailed] = React.useState(false);
  const [busy, setBusy] = React.useState("");
  const [problem, setProblem] = React.useState("");

  React.useEffect(() => {
    if (!accessToken) return undefined;
    let alive = true;

    apiAuthed("/me/summary", { token: accessToken })
      .then((d) => alive && setSummary(d))
      .catch(() => alive && setFailed(true));

    apiAuthed("/me/devices", { token: accessToken })
      .then((d) => alive && setDevices(d.devices || []))
      // The machine list is one panel, not the screen. If it cannot be read the
      // seat meters are still worth showing.
      .catch(() => alive && setDevices([]));

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
    if (!summary || !catalogue || !devices) return null;

    const licences = (summary.entitlements || []).filter(
      (e) => !e.isCourse && !!catalogue[e.productKey],
    );

    const meters = licences.map((e) => {
      const owned = Number(e.seats) || 1;
      const used = Number(e.seatsUsed) || 0;
      return {
        key: e.productKey,
        // His chips are 11.5px with a 16px icon, so they want the short name.
        // Feeding them the catalogue's marketing name ("HERON: PlanSwift / 2D
        // Drawings QS Software") turned each chip into a wrapped paragraph in
        // an oval.
        name: NAMES[e.productKey] || catalogue[e.productKey]?.name || e.productKey,
        icon: ICONS[e.productKey] || "",
        owned,
        used,
        expired: !!e.isExpired || e.status !== "active",
        pct: owned ? Math.min(100, Math.round((used / owned) * 100)) : 0,
      };
    });

    const owned = meters.reduce((n, m) => n + m.owned, 0);
    const used = meters.reduce((n, m) => n + m.used, 0);

    return { meters, owned, used, idle: owned - used };
  }, [summary, catalogue, devices]);

  const fullName =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim() ||
    user?.email ||
    "You";

  // Free a machine's activation. The seat comes back immediately and the
  // desktop clients notice on their next check-in.
  const release = React.useCallback(
    async (d) => {
      const label = d.name || String(d.fingerprint || "unknown").slice(0, 12);
      const ok = window.confirm(
        `Free the seat held by ${label}?\n\n` +
          "It stops being licensed at its next check-in, and the seat can be " +
          "installed on another machine straight away. Nothing is deleted.",
      );
      if (!ok) return;

      setBusy(d.fingerprint);
      setProblem("");
      try {
        await apiAuthed("/me/devices/revoke", {
          token: accessToken,
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fingerprint: d.fingerprint }),
        });
        // Re-read rather than patch state: seatsUsed lives on the summary and
        // the meters are computed from it, so guessing here would leave the
        // meters and the machine list disagreeing.
        const [s, dev] = await Promise.all([
          apiAuthed("/me/summary", { token: accessToken }),
          apiAuthed("/me/devices", { token: accessToken }),
        ]);
        setSummary(s);
        setDevices(dev.devices || []);
      } catch (e) {
        setProblem(e.message || "That seat could not be freed.");
      } finally {
        setBusy("");
      }
    },
    [accessToken],
  );

  if (failed) {
    return (
      <div className="dsh-in">
        <p className="sub">Your seats could not be loaded just now. Please refresh.</p>
      </div>
    );
  }
  if (!view) {
    return (
      <div className="dsh-in">
        <p className="sub">Loading your seats…</p>
      </div>
    );
  }

  const held = view.meters.filter((m) => m.used > 0);

  return (
    <div className="dsh-in">
      <div className="dsh-head">
        <div>
          <h1>Team &amp; seats</h1>
          <p>
            {view.owned
              ? `${view.used} of ${view.owned} seat${view.owned === 1 ? "" : "s"} in use. A seat activates against a machine, so moving one means freeing it here and installing on the other.`
              : "No seats on this account yet. A seat activates against a machine rather than a person."}
          </p>
        </div>
        <div className="dsh-acts">
          <Link className="ds-btn btn-o ds-btn-sm" to="/purchase">
            Buy more seats
          </Link>
        </div>
      </div>

      {problem && (
        <p className="sub" style={{ color: "var(--bad, #b42318)" }}>
          {problem}
        </p>
      )}

      <div className="dsh-two">
        <div>
          <section className="dsh-panel">
            <div className="dsh-ph">
              <h2>Members</h2>
              <span className="when">
                {view.used} of {view.owned} seats held
              </span>
            </div>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Member</th>
                    <th>Role</th>
                    <th>Seats held</th>
                    <th>Last active</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <div className="dsh-who">
                        <span className="dsh-avi">{initialsOf(fullName, "ME")}</span>
                        <span>
                          <b>{fullName}</b>
                          <span>{user?.email || ""}</span>
                        </span>
                      </div>
                    </td>
                    <td>{user?.role === "admin" ? "Administrator" : "Account owner"}</td>
                    <td>
                      <div className="dsh-chips">
                        {held.length ? (
                          held.map((m) => (
                            <span className="dsh-chip" key={m.key}>
                              {m.icon && <img src={m.icon} alt="" />}
                              {m.name}
                            </span>
                          ))
                        ) : (
                          <span className="dsh-chip none">None activated yet</span>
                        )}
                      </div>
                    </td>
                    <td className="num">Today</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="dsh-body">
              <p
                style={{
                  margin: 0,
                  fontSize: "12.5px",
                  fontWeight: 300,
                  color: "var(--ink-3)",
                  lineHeight: 1.6,
                }}
              >
                Adding colleagues to one account is not built yet, so there is nobody else to
                list. Each person signs in with their own ADLM account today, and a licence is
                bought against that account. If you need several people under one bill, tell us
                what you need and we will set it up by hand in the meantime.
              </p>
              <Link className="ds-btn btn-o ds-btn-sm" to="/manage/support" style={{ marginTop: 16 }}>
                Talk to us about a practice account
              </Link>
            </div>
          </section>

          <section className="dsh-panel">
            <div className="dsh-ph">
              <h2>Machines</h2>
              <span className="when">
                {devices.length} activated
              </span>
            </div>
            <div className="dsh-body">
              {devices.length ? (
                devices.map((d) => (
                  <div className="dsh-dl" key={d.fingerprint}>
                    <span className="ic">
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <use href="#hi-computer" />
                      </svg>
                    </span>
                    <div className="nm">
                      <b>{d.name || String(d.fingerprint || "unknown").slice(0, 12)}</b>
                      <span>
                        {(d.products || [])
                          .map((k) => NAMES[k] || catalogue[k]?.name || k)
                          .join(", ") || "no product"}{" "}
                        · {ago(d.lastSeenAt)}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="ds-btn btn-o ds-btn-sm"
                      onClick={() => release(d)}
                      disabled={busy === d.fingerprint}
                    >
                      {busy === d.fingerprint ? "Freeing…" : "Free the seat"}
                    </button>
                  </div>
                ))
              ) : (
                <p style={{ margin: 0, fontSize: "13px", color: "var(--ink-3)" }}>
                  No machine has activated a licence yet. The first install registers one.
                </p>
              )}
              <p
                style={{
                  margin: "16px 0 0",
                  fontSize: "12.5px",
                  fontWeight: 300,
                  color: "var(--ink-3)",
                  lineHeight: 1.6,
                }}
              >
                Freeing a seat here releases it immediately, which is what you want when a
                laptop is replaced. Activation is tied to the device, not the network:
                switching between Wi-Fi, ethernet or a VPN does not use one up.
              </p>
            </div>
          </section>
        </div>

        <div>
          <section className="dsh-panel">
            <div className="dsh-ph">
              <h2>Seats per product</h2>
              <Link className="more" to="/purchase">
                Buy more
              </Link>
            </div>
            <div className="dsh-body">
              {view.meters.length ? (
                <div className="dsh-meter">
                  {view.meters.map((m) => (
                    <div className="row" key={m.key}>
                      <div className="lab">
                        <span>
                          {m.name}
                          {m.expired ? " · expired" : ""}
                        </span>
                        <b>
                          {m.used} of {m.owned}
                        </b>
                      </div>
                      <div className="track">
                        <i
                          className={m.used >= m.owned ? "full" : ""}
                          style={{ width: `${m.pct}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ margin: 0, fontSize: "13px", color: "var(--ink-3)" }}>
                  No licensed products yet.
                </p>
              )}
              <p
                style={{
                  margin: "18px 0 0",
                  fontSize: "12.5px",
                  fontWeight: 300,
                  color: "var(--ink-3)",
                  lineHeight: 1.6,
                }}
              >
                {view.idle > 0
                  ? `${view.idle} seat${view.idle === 1 ? " is" : "s are"} paid for and not installed anywhere. Installing on a machine costs nothing extra.`
                  : "Every seat is installed. Buying another is the only way to add a machine without freeing one first."}
              </p>
            </div>
          </section>

          <section className="dsh-panel">
            <div className="dsh-ph">
              <h2>Free activations</h2>
            </div>
            <div className="dsh-body">
              <div className="dsh-kv">
                <div>
                  <span>Seats owned</span>
                  <b>{view.owned}</b>
                </div>
                <div>
                  <span>In use</span>
                  <b>{view.used}</b>
                </div>
                <div>
                  <span>Free right now</span>
                  <b>{Math.max(0, view.idle)}</b>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
