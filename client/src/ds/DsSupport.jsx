// His support screen, on the real ticket system.
//
// The promise in his own subheading is the thing to keep: "a ticket opened
// here already carries your licences, versions and machines, so nobody has to
// ask you for them first." That is only true if the form is fed from the
// account rather than typed, so the product list is this account's licences,
// the machine list is GET /me/devices, and the version travels with the
// ticket. His sample had "QUIV v3.1.7" and "TUNDE-WS02" hard-coded.
//
// His markup: .dsh-head / .dsh-acts / .dsh-two / .dsh-panel / .dsh-ph /
// .dsh-body / .dsh-form / .dsh-tkt, and his accordion for the ticket history —
// which needs [data-acc] and [data-acc-h] as attributes, not classes, because
// that is what his CSS is scoped to.
//
// One field is ours rather than his: AnyDesk. Our support runs remote sessions
// and the ticket model carries an address for one, so leaving it out would
// mean support asking for it in the first reply every time.

import React from "react";
import { Link } from "react-router-dom";
import { apiAuthed } from "../api.js";
import { API_BASE } from "../config.js";
import { useAuth } from "../store.jsx";

const SUPPORT_WHATSAPP = "2348106503524";

const PRODUCT = {
  revit: "QUIV",
  planswift: "HERON",
  rategen: "RateGen",
  mep: "Revit MEP",
  "qs-takeoff": "Time Pro",
  civil3d: "CIVIQ",
  archicad: "ArchiCAD",
};

// His five options, mapped onto the categories the model actually stores.
const NON_PRODUCT = { key: "__account", label: "Account, seats or billing", category: "billing" };

const STATUS = {
  open: { cls: "pill-b", text: "Open" },
  scheduled: { cls: "pill-b", text: "Scheduled" },
  "in-progress": { cls: "pill-b", text: "In progress" },
  resolved: { cls: "pill-a", text: "Resolved" },
  closed: { cls: "pill-a", text: "Closed" },
};

const when = (d) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long" }) : "";

function Ticket({ t }) {
  const [open, setOpen] = React.useState(false);
  const pill = STATUS[t.status] || { cls: "pill-b", text: t.status || "Open" };
  const toggle = () => setOpen((v) => !v);

  return (
    <div data-acc="" className={open ? "open" : ""}>
      <div
        className="dsh-tkt"
        data-acc-h=""
        role="button"
        tabIndex={0}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggle();
          }
        }}
        aria-expanded={open}
      >
        <span className="ref">{t.reference || `#${String(t._id).slice(-6).toUpperCase()}`}</span>
        <div className="nm">
          {t.title}
          <span>
            {[
              // "QUIV v3.1.6 · TUNDE-WS02 · opened 28 July" — his order.
              [PRODUCT[t.productKey] || t.productKey, t.appVersion]
                .filter(Boolean)
                .join(" "),
              t.machine,
              `opened ${when(t.createdAt)}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </div>
        <span className={`pill ${pill.cls}`}>{pill.text}</span>
        <svg className="acc-car" viewBox="0 0 24 24">
          <use href="#hi-chevron" />
        </svg>
      </div>
      <div className="acc-body">
        <div>
          <p>{t.description}</p>
          {t.adminNotes ? <p><b>From support:</b> {t.adminNotes}</p> : null}
          {t.resolvedAt ? <p>Closed {when(t.resolvedAt)}.</p> : null}
        </div>
      </div>
    </div>
  );
}

export default function DsSupport() {
  const { accessToken } = useAuth();

  const [summary, setSummary] = React.useState(null);
  const [devices, setDevices] = React.useState(null);
  const [tickets, setTickets] = React.useState(null);
  const [catalogue, setCatalogue] = React.useState(null);
  const [deployments, setDeployments] = React.useState([]);
  const [failed, setFailed] = React.useState(false);

  const [form, setForm] = React.useState({
    productKey: "",
    machine: "",
    title: "",
    description: "",
    anyDeskAddress: "",
  });
  const [sending, setSending] = React.useState(false);
  const [said, setSaid] = React.useState("");
  const [problem, setProblem] = React.useState("");

  const loadTickets = React.useCallback(() => {
    if (!accessToken) return Promise.resolve();
    return apiAuthed("/api/support/tickets/mine", { token: accessToken })
      .then((d) => setTickets(d.tickets || []))
      .catch(() => setTickets([]));
  }, [accessToken]);

  React.useEffect(() => {
    if (!accessToken) return undefined;
    let alive = true;

    apiAuthed("/me/summary", { token: accessToken })
      .then((d) => alive && setSummary(d))
      .catch(() => alive && setFailed(true));

    apiAuthed("/me/devices", { token: accessToken })
      .then((d) => alive && setDevices(d.devices || []))
      .catch(() => alive && setDevices([]));

    // Only so a ticket can carry the version of the build this account would
    // install. A failure costs the version, not the form.
    apiAuthed("/me/deployments", { token: accessToken })
      .then((d) => alive && setDeployments(d.items || []))
      .catch(() => {});

    fetch(`${API_BASE}/products`)
      .then((r) => (r.ok ? r.json() : null))
      .then((raw) => {
        if (!alive || !raw) return;
        const all = Array.isArray(raw) ? raw : raw.items || raw.products || [];
        setCatalogue(Object.fromEntries(all.map((p) => [p.key, p])));
      })
      .catch(() => {});

    loadTickets();
    return () => {
      alive = false;
    };
  }, [accessToken, loadTickets]);

  // His product dropdown, from the account rather than typed.
  const products = React.useMemo(() => {
    if (!summary || !catalogue) return null;
    const rows = (summary.entitlements || [])
      .filter((e) => !e.isCourse && catalogue[e.productKey])
      .map((e) => ({
        key: e.productKey,
        label: catalogue[e.productKey]?.name || PRODUCT[e.productKey] || e.productKey,
      }));
    return [...rows, NON_PRODUCT];
  }, [summary, catalogue]);

  const versionFor = React.useCallback(
    (key) => {
      if (!key || key === NON_PRODUCT.key) return "";
      const k = String(key).toLowerCase();
      const pkg = deployments.find((d) => String(d.productKey || "").toLowerCase() === k);
      return pkg?.version || "";
    },
    [deployments],
  );

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setSaid("");
    setProblem("");

    if (!form.title.trim() || !form.description.trim()) {
      setProblem("A summary and a description are both needed.");
      return;
    }

    setSending(true);
    try {
      const isAccount = form.productKey === NON_PRODUCT.key;

      await apiAuthed("/api/support/tickets", {
        token: accessToken,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim(),
          productKey: isAccount ? "" : form.productKey,
          category: isAccount ? NON_PRODUCT.category : "technical",
          source: isAccount ? "account" : form.productKey || "web",
          anyDeskAddress: form.anyDeskAddress.trim(),
          // Its own field now rather than appended to the prose. Support's
          // first question on an install ticket is which machine, and the
          // account already knows — so it belongs on the ticket where the
          // queue and the row can both read it without parsing English.
          machine: form.machine,
          // The published build for that product. Not necessarily what is
          // installed on that machine, which we do not track, so it is what we
          // would install rather than a claim about what they have.
          appVersion: versionFor(form.productKey),
        }),
      });

      setSaid("Sent. Support has your licences, versions and machines with it.");
      setForm({ productKey: "", machine: "", title: "", description: "", anyDeskAddress: "" });
      await loadTickets();
    } catch (err) {
      setProblem(err.message || "That ticket could not be sent.");
    } finally {
      setSending(false);
    }
  };

  if (failed) {
    return (
      <div className="dsh-in">
        <p className="sub">Support could not be loaded just now. Please refresh.</p>
      </div>
    );
  }
  if (!products || !tickets || !devices) {
    return (
      <div className="dsh-in">
        <p className="sub">Loading support…</p>
      </div>
    );
  }

  return (
    <div className="dsh-in">
      <div className="dsh-head">
        <div>
          <h1>Support</h1>
          <p>
            A ticket opened here already carries your licences, versions and machines, so nobody
            has to ask you for them first. Replies come from a real address, usually the same
            working day.
          </p>
        </div>
        <div className="dsh-acts">
          <a
            className="ds-btn btn-o ds-btn-sm"
            href={`https://wa.me/${SUPPORT_WHATSAPP}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            WhatsApp
          </a>
          <a className="ds-btn btn-p ds-btn-sm" href="#ticket">
            Open a ticket
          </a>
        </div>
      </div>

      <div className="dsh-two">
        <div>
          <section className="dsh-panel" id="ticket">
            <div className="dsh-ph">
              <h2>Open a ticket</h2>
            </div>
            <div className="dsh-body">
              <form className="dsh-form" onSubmit={submit} style={{ maxWidth: "none" }}>
                <div className="two">
                  <div className="ds-field">
                    <label htmlFor="tk-prod">Which product</label>
                    <select
                      id="tk-prod"
                      value={form.productKey}
                      onChange={set("productKey")}
                      required
                    >
                      <option value="">Choose one</option>
                      {products.map((p) => (
                        <option key={p.key} value={p.key}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="ds-field">
                    <label htmlFor="tk-mac">Which machine</label>
                    <select id="tk-mac" value={form.machine} onChange={set("machine")}>
                      <option value="">Not machine-specific</option>
                      {devices.map((d) => (
                        <option
                          key={d.fingerprint}
                          value={d.name || d.fingerprint.slice(0, 12)}
                        >
                          {d.name || d.fingerprint.slice(0, 12)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="ds-field">
                  <label htmlFor="tk-sub">Summary</label>
                  <input
                    id="tk-sub"
                    type="text"
                    value={form.title}
                    onChange={set("title")}
                    placeholder="The Revit panel does not appear after installing"
                    required
                  />
                </div>

                <div className="ds-field">
                  <label htmlFor="tk-msg">What happens, and what you expected</label>
                  <textarea
                    id="tk-msg"
                    rows={5}
                    value={form.description}
                    onChange={set("description")}
                    placeholder="Steps, the exact message if there is one, and when it started."
                    required
                  />
                </div>

                <div className="ds-field">
                  <label htmlFor="tk-any">
                    AnyDesk address <span className="opt">optional</span>
                  </label>
                  <input
                    id="tk-any"
                    type="text"
                    value={form.anyDeskAddress}
                    onChange={set("anyDeskAddress")}
                    placeholder="Only if you want somebody to take a look on your machine"
                  />
                </div>

                <div>
                  <button className="ds-btn btn-p ds-btn-sm" type="submit" disabled={sending}>
                    {sending ? "Sending…" : "Send to support"}
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

                <p className="small" style={{ color: "var(--ink-3)", fontSize: "12.5px" }}>
                  Your account, licence and version details are attached automatically.
                </p>
              </form>
            </div>
          </section>

          <section className="dsh-panel">
            <div className="dsh-ph">
              <h2>Your tickets</h2>
              <span className="when">
                {tickets.length} raised
              </span>
            </div>
            <div className="dsh-body">
              {tickets.length ? (
                tickets.map((t) => <Ticket key={t._id} t={t} />)
              ) : (
                <p style={{ margin: 0, fontSize: "13px", color: "var(--ink-3)" }}>
                  Nothing raised yet. Anything you open appears here with its replies.
                </p>
              )}
            </div>
          </section>
        </div>

        <div>
          {/* His "Answers first". The point of it is that the commonest
              tickets are ones somebody could have answered themselves, so the
              answers come before the form's reply does.

              Every line is true of OUR licensing rather than his sample: the
              first is now a real action on Team & seats, since freeing a seat
              stopped being an admin-only job. */}
          <section className="dsh-panel">
            <div className="dsh-ph">
              <h2>Answers first</h2>
              <Link className="more" to="/manage/team">
                Seats
              </Link>
            </div>
            <div className="dsh-body">
              <ul className="dsh-feed">
                <li>
                  <span className="tick" />
                  <div>
                    <b>Moving a licence to a new laptop</b> — free the seat under Team &amp;
                    seats, then install on the other machine. No ticket needed.
                  </div>
                </li>
                <li>
                  <span className="tick" />
                  <div>
                    <b>Activation says the machine changed</b> — a rebuilt or reimaged PC counts
                    as a new device, so free the old one first.
                  </div>
                </li>
                <li>
                  <span className="tick" />
                  <div>
                    <b>The panel is missing after installing</b> — Revit or PlanSwift was open
                    during the install. Close it and launch again.
                  </div>
                </li>
                <li>
                  <span className="tick" />
                  <div>
                    <b>A rate looks wrong in a project</b> — open the line and follow it to its
                    build-up. Projects keep the rate they were priced with.
                  </div>
                </li>
              </ul>
            </div>
          </section>

          <section className="dsh-panel">
            <div className="dsh-ph">
              <h2>Reach a human</h2>
            </div>
            <div className="dsh-body">
              <div className="dsh-kv">
                <div>
                  <span>Email</span>
                  <b>admin@adlmstudio.net</b>
                </div>
                <div>
                  <span>WhatsApp</span>
                  <b>+234 810 650 3524</b>
                </div>
                <div>
                  <span>Hours</span>
                  <b>Mon to Fri, 9 to 6 WAT</b>
                </div>
                <div>
                  <span>Where</span>
                  <b>Lagos, Nigeria</b>
                </div>
              </div>
              <p
                style={{
                  margin: "16px 0 0",
                  fontSize: "12.5px",
                  fontWeight: 300,
                  color: "var(--ink-3)",
                  lineHeight: 1.6,
                }}
              >
                For anything that stops you working, WhatsApp is quickest. A ticket is better for
                anything that needs a record, or that somebody has to reproduce.
              </p>
            </div>
          </section>

          <section className="dsh-panel">
            <div className="dsh-ph">
              <h2>Training</h2>
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
                If the same question keeps coming up across the practice, it is usually a
                training problem rather than a support one. On-site sessions run on your own
                projects.
              </p>
              {/* His is a modal; ours goes to the training pages, which exist. */}
              <Link className="ds-btn btn-o ds-btn-sm btn-full" to="/trainings" style={{ marginTop: 16 }}>
                Training for firms
              </Link>
            </div>
          </section>

          <section className="dsh-panel">
            <div className="dsh-ph">
              <h2>Before you write</h2>
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
                The two things that shorten a ticket most are the exact wording of any message
                you saw, and what you had just done when it appeared. If a remote session would
                be faster, leave your AnyDesk address and somebody will ask before connecting.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
