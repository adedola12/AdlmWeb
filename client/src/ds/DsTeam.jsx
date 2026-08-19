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
        name: catalogue[e.productKey]?.name || NAMES[e.productKey] || e.productKey,
        owned,
        used,
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
          <Link className="btn btn-o btn-sm" to="/purchase">
            Buy more seats
          </Link>
        </div>
      </div>

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
                    <td>
                      {user?.role === "admin" ? "Administrator" : "Account owner"}
                    </td>
                    <td>
                      <div className="dsh-chips">
                        {view.meters.filter((m) => m.used > 0).length ? (
                          view.meters
                            .filter((m) => m.used > 0)
                            .map((m) => (
                              <span key={m.key} className="dsh-chip on">
                                {m.name}
                              </span>
                            ))
                        ) : (
                          <span style={{ fontSize: "12.5px", color: "var(--ink-3)" }}>
                            None activated yet
                          </span>
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
              <Link className="btn btn-o btn-sm" to="/contact" style={{ marginTop: 16 }}>
                Talk to us about a practice account
              </Link>
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
                        <span>{m.name}</span>
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
              {view.idle > 0 && (
                <p
                  style={{
                    margin: "18px 0 0",
                    fontSize: "12.5px",
                    fontWeight: 300,
                    color: "var(--ink-3)",
                    lineHeight: 1.6,
                  }}
                >
                  {view.idle} seat{view.idle === 1 ? " is" : "s are"} paid for and not installed
                  anywhere. Installing on a machine costs nothing extra.
                </p>
              )}
            </div>
          </section>

          <section className="dsh-panel">
            <div className="dsh-ph">
              <h2>Machines</h2>
            </div>
            <div className="dsh-body">
              {devices.length ? (
                <div className="dsh-kv">
                  {devices.map((d) => (
                    <div key={d.fingerprint}>
                      <span>{d.name || d.fingerprint.slice(0, 12)}</span>
                      <b>
                        {d.products.map((k) => catalogue[k]?.name || NAMES[k] || k).join(", ")} ·{" "}
                        {ago(d.lastSeenAt)}
                      </b>
                    </div>
                  ))}
                  <div>
                    <span>Free activations</span>
                    <b>{Math.max(0, view.idle)}</b>
                  </div>
                </div>
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
                Activation is tied to the device, not the network: switching between Wi-Fi,
                ethernet or a VPN does not use up an activation.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
