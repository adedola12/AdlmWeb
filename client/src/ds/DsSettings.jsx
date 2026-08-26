// His Account settings screen, wired to the profile that actually matters.
//
// "One ADLM account signs into every product" is not marketing copy here — the
// same record is what the Windows plugins authenticate against, which is why
// the password panel warns about it and why the machine list lives on this
// screen rather than only under Team.
//
// Everything on the left saves for real: POST /me/profile and POST /me/password.
// On the right, the machine list is GET /me/devices and connected accounts is
// the component the Profile page already uses, rather than a second copy of
// the OAuth logic that could drift from it.
//
// His Notifications panel is not reproduced. There are no per-user notification
// preferences in the data model, so four toggles that save nowhere would be
// four promises the account cannot keep. When preferences exist, that panel is
// the place for them.

import React from "react";
import { Link } from "react-router-dom";
import { apiAuthed } from "../api.js";
import { useAuth } from "../store.jsx";
import ConnectedAccounts from "../components/ConnectedAccounts.jsx";

const icon = (name) => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <use href={`#hi-${name}`} />
  </svg>
);

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
  if (days <= 0) return "active today";
  if (days === 1) return "active yesterday";
  if (days < 30) return `active ${days} days ago`;
  return `last seen ${new Date(d).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })}`;
}

export default function DsSettings() {
  const { user, accessToken, setAuth } = useAuth();

  const [profile, setProfile] = React.useState(null);
  const [devices, setDevices] = React.useState(null);
  const [failed, setFailed] = React.useState(false);

  const [form, setForm] = React.useState(null);
  const [saving, setSaving] = React.useState("");
  const [said, setSaid] = React.useState("");
  const [problem, setProblem] = React.useState("");

  const [pw, setPw] = React.useState({ currentPassword: "", newPassword: "" });
  const [pwSaid, setPwSaid] = React.useState("");
  const [pwProblem, setPwProblem] = React.useState("");

  React.useEffect(() => {
    if (!accessToken) return undefined;
    let alive = true;

    apiAuthed("/me/profile", { token: accessToken })
      .then((d) => {
        if (!alive) return;
        setProfile(d);
        setForm({
          firstName: d.firstName || "",
          lastName: d.lastName || "",
          username: d.username || "",
          whatsapp: d.whatsapp || "",
          firmName: d.firmName || "",
          location: d.location || "",
          state: d.state || "",
        });
      })
      .catch(() => alive && setFailed(true));

    apiAuthed("/me/devices", { token: accessToken })
      .then((d) => alive && setDevices(d.devices || []))
      .catch(() => alive && setDevices([]));

    return () => {
      alive = false;
    };
  }, [accessToken]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const saveProfile = async (e) => {
    e.preventDefault();
    setSaving("profile");
    setSaid("");
    setProblem("");
    try {
      await apiAuthed("/me/profile", {
        token: accessToken,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setSaid("Saved.");
      // The top bar and the rail read the name off the auth payload, so a
      // saved name that is not written back there stays stale until a reload.
      if (user) {
        setAuth({
          user: { ...user, firstName: form.firstName, lastName: form.lastName },
          accessToken,
          licenseToken: null,
        });
      }
    } catch (err) {
      setProblem(err.message || "That could not be saved.");
    } finally {
      setSaving("");
    }
  };

  const savePassword = async (e) => {
    e.preventDefault();
    setSaving("password");
    setPwSaid("");
    setPwProblem("");
    try {
      await apiAuthed("/me/password", {
        token: accessToken,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pw),
      });
      setPwSaid("Password changed. The desktop products will ask for the new one.");
      setPw({ currentPassword: "", newPassword: "" });
    } catch (err) {
      setPwProblem(err.message || "That password could not be changed.");
    } finally {
      setSaving("");
    }
  };

  // Sign a machine out. The same endpoint Team & seats uses -- this panel used
  // to tell people to raise a ticket for it, which stopped being true the day
  // /me/devices/revoke landed.
  const release = React.useCallback(
    async (d) => {
      const label = d.name || d.fingerprint.slice(0, 12);
      if (
        !window.confirm(
          `Sign ${label} out?

` +
            "Its activation is freed immediately and the seat can be installed " +
            "on another machine. Nothing on the machine is deleted.",
        )
      ) {
        return;
      }
      setSaving(`dev:${d.fingerprint}`);
      setProblem("");
      try {
        await apiAuthed("/me/devices/revoke", {
          token: accessToken,
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fingerprint: d.fingerprint }),
        });
        const fresh = await apiAuthed("/me/devices", { token: accessToken });
        setDevices(fresh.devices || []);
      } catch (e) {
        setProblem(e.message || "That machine could not be signed out.");
      } finally {
        setSaving("");
      }
    },
    [accessToken],
  );

  if (failed) {
    return (
      <div className="dsh-in">
        <p className="sub">Your settings could not be loaded just now. Please refresh.</p>
      </div>
    );
  }
  if (!form || !profile) {
    return (
      <div className="dsh-in">
        <p className="sub">Loading your settings…</p>
      </div>
    );
  }

  return (
    <div className="dsh-in">
      <div className="dsh-head">
        <div>
          <h1>Account settings</h1>
          <p>
            One ADLM account signs into every product, on every machine. What you change here
            changes it everywhere, including inside Revit and PlanSwift.
          </p>
        </div>
      </div>

      <div className="dsh-two">
        <div>
          <section className="dsh-panel">
            <div className="dsh-ph">
              <h2>Your profile</h2>
            </div>
            <div className="dsh-body">
              <form className="dsh-form" onSubmit={saveProfile} style={{ maxWidth: "none" }}>
                <div className="two">
                  <div className="field">
                    <label htmlFor="st-first">First name</label>
                    <input id="st-first" type="text" value={form.firstName} onChange={set("firstName")} />
                  </div>
                  <div className="field">
                    <label htmlFor="st-last">Last name</label>
                    <input id="st-last" type="text" value={form.lastName} onChange={set("lastName")} />
                  </div>
                </div>
                <div className="two">
                  <div className="field">
                    <label htmlFor="st-mail">Work email</label>
                    <input id="st-mail" type="email" value={profile.email || ""} disabled />
                    <p className="hint">
                      The email is the account itself. To change it, talk to support.
                    </p>
                  </div>
                  <div className="field">
                    <label htmlFor="st-tel">Phone</label>
                    <input id="st-tel" type="tel" value={form.whatsapp} onChange={set("whatsapp")} />
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="st-user">
                    Display name <span className="opt">optional</span>
                  </label>
                  <input id="st-user" type="text" value={form.username} onChange={set("username")} />
                </div>
                <div>
                  <button className="btn btn-p btn-sm" type="submit" disabled={saving === "profile"}>
                    {saving === "profile" ? "Saving…" : "Save profile"}
                  </button>
                  {said && (
                    <span style={{ marginLeft: 12, fontSize: "12.5px", color: "var(--ink-3)" }}>
                      {said}
                    </span>
                  )}
                  {problem && (
                    <span style={{ marginLeft: 12, fontSize: "12.5px", color: "var(--bad, #b42318)" }}>
                      {problem}
                    </span>
                  )}
                </div>
              </form>
            </div>
          </section>

          {/* His "Rates and currency".
              His asks for a CITY and derives the zone from it, on the grounds
              that nobody thinks of themselves as working in "South West" --
              they work in Ibadan. Ours asks for the state, which is the same
              idea and is what the profile already stores: GET /me/profile
              returns the state the person picked and the zone derived from it,
              and the desktop products read the same field.

              So this is one real control and an explanation of what it does,
              rather than a preference that goes nowhere. */}
          <section className="dsh-panel">
            <div className="dsh-ph">
              <h2>Rates and currency</h2>
              <span className="when">Decides every price you see</span>
            </div>
            <div className="dsh-body">
              <form className="dsh-form" onSubmit={saveProfile} style={{ maxWidth: "none" }}>
                <div className="two">
                  <div className="field">
                    <label htmlFor="st-state">Where you work</label>
                    <select id="st-state" value={form.state} onChange={set("state")}>
                      <option value="">Not set</option>
                      {(profile.states || []).map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>
                    <p className="hint">Only used to work out your geopolitical zone.</p>
                  </div>
                  <div className="field">
                    <label htmlFor="st-zone">Geopolitical zone</label>
                    <input
                      id="st-zone"
                      type="text"
                      value={profile.zone || "Not set"}
                      readOnly
                      disabled
                    />
                    <p className="hint">Derived from the state. Saved when you save below.</p>
                  </div>
                </div>
                <div>
                  <button className="btn btn-p btn-sm" type="submit" disabled={saving === "profile"}>
                    {saving === "profile" ? "Saving…" : "Save location"}
                  </button>
                </div>
                <p className="hint">
                  Materials and labour are priced by zone, so this is what decides the figures in
                  your rate library and in every project priced against it afterwards. Projects
                  already priced keep the rates they were priced with.
                </p>
              </form>
            </div>
          </section>

          <section className="dsh-panel">
            <div className="dsh-ph">
              <h2>The firm</h2>
              <span className="when">Shown on every invoice</span>
            </div>
            <div className="dsh-body">
              <form className="dsh-form" onSubmit={saveProfile} style={{ maxWidth: "none" }}>
                <div className="two">
                  <div className="field">
                    <label htmlFor="st-firm">Practice name</label>
                    <input id="st-firm" type="text" value={form.firmName} onChange={set("firmName")} />
                  </div>
                  <div className="field">
                    <label htmlFor="st-addr">Address</label>
                    <input id="st-addr" type="text" value={form.location} onChange={set("location")} />
                  </div>
                </div>
                <div>
                  <button className="btn btn-p btn-sm" type="submit" disabled={saving === "profile"}>
                    {saving === "profile" ? "Saving…" : "Save firm details"}
                  </button>
                </div>
                <p className="hint">
                  These are printed on invoices raised from now on. Past invoices are not reissued.
                </p>
              </form>
            </div>
          </section>

          <section className="dsh-panel">
            <div className="dsh-ph">
              <h2>Password</h2>
            </div>
            <div className="dsh-body">
              <form className="dsh-form" onSubmit={savePassword}>
                <div className="field">
                  <label htmlFor="st-old">Current password</label>
                  <input
                    id="st-old"
                    type="password"
                    autoComplete="current-password"
                    value={pw.currentPassword}
                    onChange={(e) => setPw((p) => ({ ...p, currentPassword: e.target.value }))}
                  />
                </div>
                <div className="field">
                  <label htmlFor="st-new">New password</label>
                  <input
                    id="st-new"
                    type="password"
                    autoComplete="new-password"
                    value={pw.newPassword}
                    onChange={(e) => setPw((p) => ({ ...p, newPassword: e.target.value }))}
                  />
                  <p className="hint">
                    This is the password the Windows products sign in with. Changing it signs the
                    other machines out at their next check-in.
                  </p>
                </div>
                <div>
                  <button className="btn btn-p btn-sm" type="submit" disabled={saving === "password"}>
                    {saving === "password" ? "Changing…" : "Change password"}
                  </button>
                  {pwSaid && (
                    <span style={{ marginLeft: 12, fontSize: "12.5px", color: "var(--ink-3)" }}>
                      {pwSaid}
                    </span>
                  )}
                  {pwProblem && (
                    <span style={{ marginLeft: 12, fontSize: "12.5px", color: "var(--bad, #b42318)" }}>
                      {pwProblem}
                    </span>
                  )}
                </div>
              </form>
            </div>
          </section>
        </div>

        <div>
          <section className="dsh-panel">
            <div className="dsh-ph">
              <h2>Machines signed in</h2>
              <Link className="more" to="/manage/team">
                Seats
              </Link>
            </div>
            <div className="dsh-body">
              {devices === null ? (
                <p style={{ margin: 0, fontSize: "13px", color: "var(--ink-3)" }}>Loading…</p>
              ) : devices.length ? (
                devices.map((d) => (
                  <div className="dsh-dl" key={d.fingerprint}>
                    <span className="ic">{icon("computer")}</span>
                    <div className="nm">
                      <b>{d.name || d.fingerprint.slice(0, 12)}</b>
                      <span>
                        {d.products.map((k) => NAMES[k] || k).join(", ")} · {ago(d.lastSeenAt)}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="btn btn-o btn-sm"
                      onClick={() => release(d)}
                      disabled={saving === `dev:${d.fingerprint}`}
                    >
                      {saving === `dev:${d.fingerprint}` ? "Signing out…" : "Sign out"}
                    </button>
                  </div>
                ))
              ) : (
                <p style={{ margin: 0, fontSize: "13px", color: "var(--ink-3)" }}>
                  No machine has activated a licence yet.
                </p>
              )}
              <p
                style={{
                  margin: "14px 0 0",
                  fontSize: "12.5px",
                  fontWeight: 300,
                  color: "var(--ink-3)",
                  lineHeight: 1.6,
                }}
              >
                Signing a machine out here frees its activation immediately, which is what you
                want when a laptop is replaced or leaves the practice. The seat can be installed
                on another machine straight away, and nothing on this one is deleted.
              </p>
            </div>
          </section>

          <section className="dsh-panel">
            <div className="dsh-ph">
              <h2>Connected accounts</h2>
            </div>
            <div className="dsh-body">
              <ConnectedAccounts />
            </div>
          </section>

          <section className="dsh-panel">
            <div className="dsh-ph">
              <h2>Your data</h2>
            </div>
            <div className="dsh-body">
              <p
                style={{
                  margin: 0,
                  fontSize: "13px",
                  fontWeight: 300,
                  color: "var(--ink-3)",
                  lineHeight: 1.65,
                }}
              >
                Rate libraries, projects and takeoffs belong to the account, not to a licence.
                They stay here if a subscription lapses, and can be exported at any time.
              </p>
              <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
                <Link className="btn btn-o btn-sm" to="/profile">
                  Activity log
                </Link>
                <Link className="btn btn-o btn-sm" to="/support/request">
                  Ask for an export
                </Link>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
