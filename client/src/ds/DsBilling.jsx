// His Billing & invoices screen, on real billing.
//
// Everything on it is now live, including the two things an earlier pass left
// out for want of somewhere real to point them:
//
//   * The Monthly/Yearly switch re-prices every line from the catalogue rather
//     than relabelling them, and "Switch to yearly" is a WRITE:
//     POST /me/billing/autorenew takes a months value up to 12, which is what
//     makes the next renewal a yearly one. The saving in the hero is this
//     account's own arithmetic — twelve monthly payments against the published
//     yearly price — not a claim.
//   * The card is real. User.paymentMethod stores what Paystack returns for a
//     reusable authorisation: card type, last four, expiry, bank. The PAN and
//     the authorisation code are select:false and never leave the server, so
//     this shows the display copy and says so.
//
// The seat steppers move a number and price it, then hand the change to
// checkout, because that is where a seat is actually bought. They do not
// pretend to change a subscription in place.
//
// His markup: .dsh-head / .dsh-two / .dsh-panel / .dsh-ph / .dsh-body /
// .dsh-seg / .dsh-kv / .dsh-step / .dsh-hub / .tbl.

import React from "react";
import { Link } from "react-router-dom";
import { apiAuthed } from "../api.js";
import { API_BASE } from "../config.js";
import { useAuth } from "../store.jsx";
import { termTotalNGN } from "../lib/termPricing.js";

const money = (n, ccy = "NGN") =>
  new Intl.NumberFormat(ccy === "NGN" ? "en-NG" : "en-US", {
    style: "currency",
    currency: ccy,
    maximumFractionDigits: 0,
  }).format(Number(n) || 0);

const longDate = (d) =>
  d
    ? new Date(d).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "";

const shortDate = (d) =>
  d
    ? new Date(d).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "";

const STATUS_PILL = {
  paid: { cls: "pill-a", text: "Paid" },
  sent: { cls: "pill-b", text: "Due" },
  overdue: { cls: "pill-c", text: "Overdue" },
  cancelled: { cls: "pill-c", text: "Cancelled" },
};

// Short names for the line rows; the catalogue's marketing names are too long
// for a kv row.
const SHORT = {
  revit: "QUIV",
  planswift: "HERON",
  rategen: "RateGen",
  mep: "Revit MEP",
  "qs-takeoff": "Time Pro",
  civil3d: "CIVIQ",
};

const linkBtn = {
  background: "none",
  border: 0,
  padding: 0,
  cursor: "pointer",
  color: "var(--action)",
  fontSize: "12.5px",
};

// His "Period" column. An invoice carries the dates it was raised and fell due,
// which is the period it covers.
function periodOf(inv) {
  const a = inv.invoiceDate || inv.createdAt;
  const b = inv.dueDate;
  if (!a) return "—";
  const m = (d) => new Date(d).toLocaleDateString("en-GB", { month: "short" });
  return b ? `${m(a)} to ${m(b)}` : m(a);
}

export default function DsBilling() {
  const { user, accessToken } = useAuth();
  const [summary, setSummary] = React.useState(null);
  const [invoices, setInvoices] = React.useState(null);
  const [profile, setProfile] = React.useState(null);
  const [catalogue, setCatalogue] = React.useState(null);
  const [failed, setFailed] = React.useState(false);
  const [busy, setBusy] = React.useState("");
  // VAT is a setting, not a constant. The quotation builder already reads it
  // from here; hard-coding 7.5% would let a rate change make this screen
  // disagree with the quote and the invoice for the same purchase.
  const [vat, setVat] = React.useState({ pct: 0, label: "VAT" });
  const [card, setCard] = React.useState(null);
  const [subs, setSubs] = React.useState([]);
  // His Monthly/Yearly switch. A view preference until "Switch to yearly" is
  // pressed, which is when it becomes the account's actual renewal cycle.
  const [cycle, setCycle] = React.useState("monthly");
  // Seat counts the person has nudged but not yet bought.
  const [seatOverride, setSeatOverride] = React.useState({});
  const [said, setSaid] = React.useState("");
  const [problem, setProblem] = React.useState("");

  React.useEffect(() => {
    if (!accessToken) return undefined;
    let alive = true;

    apiAuthed("/me/summary", { token: accessToken })
      .then((d) => alive && setSummary(d))
      .catch(() => alive && setFailed(true));

    apiAuthed("/me/invoices", { token: accessToken })
      .then((d) => alive && setInvoices(d.invoices || []))
      .catch(() => alive && setInvoices([]));

    apiAuthed("/me/profile", { token: accessToken })
      .then((d) => alive && setProfile(d))
      .catch(() => alive && setProfile({}));

    // The saved card and the per-product renewal settings.
    apiAuthed("/me/billing", { token: accessToken })
      .then((d) => {
        if (!alive) return;
        setCard(d.card || null);
        const list = d.subscriptions || [];
        setSubs(list);
        // Open on the cycle the account is actually on.
        if (list.some((x) => x.autoRenew && Number(x.autoRenewMonths) >= 12)) {
          setCycle("yearly");
        }
      })
      .catch(() => {});

    fetch(`${API_BASE}/products`)
      .then((r) => (r.ok ? r.json() : null))
      .then((raw) => {
        if (!alive || !raw) return;
        const all = Array.isArray(raw) ? raw : raw.items || raw.products || [];
        setCatalogue(Object.fromEntries(all.map((p) => [p.key, p])));
      })
      .catch(() => {});

    fetch(`${API_BASE}/settings/vat`)
      .then((r) => (r.ok ? r.json() : null))
      .then((v) => {
        if (!alive || !v) return;
        // applyToPurchases can be off on its own, in which case a renewal
        // carries no VAT line even though a quotation does.
        setVat({
          pct: v.enabled && v.applyToPurchases ? Number(v.percent || 0) : 0,
          label: v.label || "VAT",
        });
      })
      .catch(() => {});

    return () => {
      alive = false;
    };
  }, [accessToken]);

  // Carry a nudged seat count into checkout, which is where seats are bought.
  const buyQuery = React.useCallback(() => {
    const q = Object.entries(seatOverride)
      .filter(([, n]) => n > 0)
      .map(([k, n]) => `${k}:${n}`)
      .join(",");
    return q ? `/purchase?seats=${encodeURIComponent(q)}` : "/purchase";
  }, [seatOverride]);

  const view = React.useMemo(() => {
    if (!summary || !catalogue) return null;

    const licences = (summary.entitlements || []).filter(
      (e) => !e.isCourse && !!catalogue[e.productKey],
    );
    const active = licences.filter((e) => e.status === "active" && !e.isExpired);

    // The soonest renewal, and every licence falling on that same day.
    const dated = active
      .filter((e) => e.expiresAt)
      .sort((a, b) => new Date(a.expiresAt) - new Date(b.expiresAt));
    const nextDate = dated[0]?.expiresAt || null;
    const sameDay = nextDate
      ? dated.filter(
          (e) => new Date(e.expiresAt).toDateString() === new Date(nextDate).toDateString(),
        )
      : [];

    // Every line, priced BOTH ways, so his Monthly/Yearly switch is a real
    // recalculation rather than a label. termTotal counts periods: one month,
    // or twelve months, which the tiering resolves to the published yearly
    // figure rather than monthly x 12.
    const lines = (sameDay.length ? sameDay : active).map((e) => {
      const p = catalogue[e.productKey];
      const seats = seatOverride[e.productKey] ?? (Number(e.seats) || 1);
      return {
        key: e.productKey,
        name: p?.name || e.productKey,
        short: SHORT[e.productKey] || p?.name || e.productKey,
        ownedSeats: Number(e.seats) || 1,
        seats,
        monthly: termTotalNGN(p, 1) * seats,
        yearly: termTotalNGN(p, 12) * seats,
        autoRenew: subs.find((s) => s.productKey === e.productKey)?.autoRenew ?? false,
      };
    });

    const subMonthly = lines.reduce((n, l) => n + l.monthly, 0);
    const subYearly = lines.reduce((n, l) => n + l.yearly, 0);

    // His hero: what a year costs monthly, against what it costs billed once.
    const yearIfMonthly = subMonthly * 12;
    const saving = Math.max(0, yearIfMonthly - subYearly);

    return {
      licences,
      active,
      nextDate,
      lines,
      subMonthly,
      subYearly,
      yearIfMonthly,
      saving,
      seats: lines.reduce((n, l) => n + l.seats, 0),
    };
  }, [summary, catalogue, seatOverride, subs]);

  const downloadPdf = async (inv, kind) => {
    const id = inv._id;
    setBusy(`${id}:${kind}`);
    try {
      const path =
        kind === "receipt" ? `/me/invoices/${id}/receipt/pdf` : `/me/invoices/${id}/pdf`;
      const resp = await fetch(`${API_BASE}${path}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        credentials: "include",
      });
      if (!resp.ok) throw new Error("That download failed.");
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${inv.invoiceNumber || id}${kind === "receipt" ? "-receipt" : ""}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setProblem("That download failed. Please try again.");
    } finally {
      setBusy("");
    }
  };

  // His "Switch to yearly". A real write: POST /me/billing/autorenew accepts a
  // months value up to 12, which is what makes the next renewal a yearly one
  // rather than a monthly one. Applied to every active licence, because the
  // panel speaks about the account rather than one product.
  const switchCycle = async (months) => {
    if (!view?.lines.length) return;
    setBusy("cycle");
    setProblem("");
    setSaid("");
    try {
      for (const l of view.lines) {
        await apiAuthed("/me/billing/autorenew", {
          token: accessToken,
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productKey: l.key, autoRenew: true, months }),
        });
      }
      const d = await apiAuthed("/me/billing", { token: accessToken });
      setSubs(d.subscriptions || []);
      setCard(d.card || null);
      setCycle(months === 12 ? "yearly" : "monthly");
      setSaid(
        months === 12
          ? "Set to yearly. It takes effect at the next renewal."
          : "Set to monthly. It takes effect at the next renewal.",
      );
    } catch (e) {
      setProblem(e.message || "That could not be changed.");
    } finally {
      setBusy("");
    }
  };

  if (failed) {
    return (
      <div className="dsh-in">
        <p className="sub">Your billing could not be loaded just now. Please refresh.</p>
      </div>
    );
  }
  if (!view || !invoices || !profile) {
    return (
      <div className="dsh-in">
        <p className="sub">Loading your billing…</p>
      </div>
    );
  }

  const yearly = cycle === "yearly";
  const subtotal = yearly ? view.subYearly : view.subMonthly;
  const vatAmount = Math.round((subtotal * vat.pct) / 100);
  const total = subtotal + vatAmount;
  const changed = Object.keys(seatOverride).length > 0;

  return (
    <div className="dsh-in">
      <div className="dsh-head">
        <div>
          <h1>Billing &amp; invoices</h1>
          <p>
            {view.nextDate
              ? `${yearly ? "Yearly" : "Monthly"}, ${view.seats} seat${view.seats === 1 ? "" : "s"}, ${money(total)} on ${longDate(view.nextDate)}.${view.saving > 0 ? " Yearly billing costs less than twelve monthly payments." : ""}`
              : view.active.length
                ? "Nothing is scheduled to renew: your active licences have no expiry date set."
                : "Nothing is due. There is no active subscription on this account."}
          </p>
        </div>
        <div className="dsh-acts">
          <a className="btn btn-o btn-sm" href="#invoices">
            Invoices
          </a>
        </div>
      </div>

      {(said || problem) && (
        <p className="sub" style={problem ? { color: "var(--bad, #b42318)" } : undefined}>
          {problem || said}
        </p>
      )}

      <div className="dsh-two">
        <div>
          <section className="dsh-panel">
            <div className="dsh-ph">
              <h2>Next charge</h2>
              <div className="dsh-seg">
                <button
                  type="button"
                  className={!yearly ? "on" : ""}
                  onClick={() => setCycle("monthly")}
                >
                  Monthly
                </button>
                <button
                  type="button"
                  className={yearly ? "on" : ""}
                  onClick={() => setCycle("yearly")}
                >
                  Yearly
                </button>
              </div>
            </div>
            <div className="dsh-body">
              {view.lines.length ? (
                <>
                  <p style={{ margin: "14px 0 4px", fontSize: "12.5px", color: "var(--ink-3)" }}>
                    {yearly ? "Every year" : "Every month"}
                    {view.nextDate ? ` · next on ${longDate(view.nextDate)}` : ""}
                  </p>

                  <div className="dsh-kv">
                    {view.lines.map((l) => (
                      <div key={l.key}>
                        <span>
                          {l.short} · {l.seats} seat{l.seats === 1 ? "" : "s"}
                        </span>
                        <span className="dsh-step">
                          <button
                            type="button"
                            aria-label={`One fewer ${l.short} seat`}
                            disabled={l.seats <= 1}
                            onClick={() =>
                              setSeatOverride((s) => ({ ...s, [l.key]: Math.max(1, l.seats - 1) }))
                            }
                          >
                            −
                          </button>
                          <span className="n">{l.seats}</span>
                          <button
                            type="button"
                            aria-label={`One more ${l.short} seat`}
                            onClick={() =>
                              setSeatOverride((s) => ({ ...s, [l.key]: l.seats + 1 }))
                            }
                          >
                            +
                          </button>
                        </span>
                        <b>{money(yearly ? l.yearly : l.monthly)}</b>
                      </div>
                    ))}

                    <div>
                      <span>
                        Subtotal · {view.seats} seat{view.seats === 1 ? "" : "s"}
                      </span>
                      <b>{money(subtotal)}</b>
                    </div>
                    {vat.pct > 0 && (
                      <div>
                        <span>
                          {vat.label} · {vat.pct}%
                        </span>
                        <b>{money(vatAmount)}</b>
                      </div>
                    )}
                    <div style={{ borderTop: "1px solid var(--line-2)", paddingTop: 15 }}>
                      <span style={{ color: "var(--ink)", fontWeight: 400 }}>Total due</span>
                      <b style={{ fontSize: 17 }}>{money(total)}</b>
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
                    {changed
                      ? "That is what the new seat count would come to. Seats are bought through checkout, so the change is not live until it is paid for."
                      : "Changing a seat count here shows what it would come to. Removing a seat does not sign anyone out until the period ends."}
                  </p>

                  <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
                    {changed ? (
                      <>
                        <Link className="btn btn-p btn-sm" to={buyQuery()}>
                          Buy the change
                        </Link>
                        <button
                          type="button"
                          className="btn btn-o btn-sm"
                          onClick={() => setSeatOverride({})}
                        >
                          Reset
                        </button>
                      </>
                    ) : (
                      <>
                        <Link className="btn btn-o btn-sm" to="/manage/team">
                          Who holds them
                        </Link>
                        <Link className="btn btn-o btn-sm" to="/purchase">
                          Add a product
                        </Link>
                      </>
                    )}
                  </div>
                </>
              ) : (
                <p style={{ margin: 0, fontSize: "13px", color: "var(--ink-3)" }}>
                  Nothing is scheduled. When a licence has a renewal date it appears here with
                  what it will come to.
                </p>
              )}
            </div>
          </section>

          <section className="dsh-panel" id="invoices">
            <div className="dsh-ph">
              <h2>Invoices</h2>
              <span className="when">{invoices.length} issued</span>
            </div>
            {invoices.length ? (
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Reference</th>
                      <th>Issued</th>
                      <th>Period</th>
                      <th>Amount</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((inv) => {
                      const pill = STATUS_PILL[inv.status] || {
                        cls: "pill-b",
                        text: inv.status || "Issued",
                      };
                      return (
                        <tr key={inv._id}>
                          <td className="num">{inv.invoiceNumber || "—"}</td>
                          <td className="num">{shortDate(inv.invoiceDate || inv.createdAt)}</td>
                          <td>{periodOf(inv)}</td>
                          <td className="num">{money(inv.total, inv.currency || "NGN")}</td>
                          <td>
                            <span className={`pill ${pill.cls}`}>{pill.text}</span>
                          </td>
                          <td>
                            <button
                              type="button"
                              onClick={() => downloadPdf(inv, "invoice")}
                              disabled={busy === `${inv._id}:invoice`}
                              style={linkBtn}
                            >
                              {busy === `${inv._id}:invoice` ? "…" : "PDF"}
                            </button>
                            {inv.status === "paid" && (
                              <>
                                {" · "}
                                <button
                                  type="button"
                                  onClick={() => downloadPdf(inv, "receipt")}
                                  disabled={busy === `${inv._id}:receipt`}
                                  style={linkBtn}
                                >
                                  {busy === `${inv._id}:receipt` ? "…" : "Receipt"}
                                </button>
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="dsh-body">
                <p style={{ margin: 0, fontSize: "13px", color: "var(--ink-3)" }}>
                  No invoices yet. One is issued for every purchase and appears here the moment
                  it is raised.
                </p>
              </div>
            )}
          </section>
        </div>

        <div>
          {/* His hero. The figures are the account's own: what twelve monthly
              payments come to, against the published yearly price. */}
          {view.saving > 0 && (
            <div className="dsh-hub" id="yearly">
              <h3>Yearly costs less</h3>
              <p>
                Same seats, same products, billed once.{" "}
                <b style={{ fontWeight: 500, color: "#fff" }}>{money(view.yearIfMonthly)}</b> of
                monthly payments becomes{" "}
                <b style={{ fontWeight: 500, color: "#fff" }}>{money(view.subYearly)}</b> before{" "}
                {vat.label}, a <b style={{ fontWeight: 500, color: "#fff" }}>{money(view.saving)}</b>{" "}
                saving.
              </p>
              <button
                type="button"
                className="btn btn-p btn-sm"
                onClick={() => switchCycle(yearly ? 1 : 12)}
                disabled={busy === "cycle"}
              >
                {busy === "cycle"
                  ? "Saving…"
                  : yearly
                    ? "Switch back to monthly"
                    : "Switch to yearly"}
              </button>
              <p className="meta">
                {view.lines.some((l) => l.autoRenew) ? "Renews automatically" : "Renewal is manual"}{" "}
                · takes effect at the next renewal · no early-termination charge
              </p>
            </div>
          )}

          <section className="dsh-panel" style={{ marginTop: view.saving > 0 ? 20 : 0 }}>
            <div className="dsh-ph">
              <h2>Payment method</h2>
            </div>
            <div className="dsh-body">
              {card ? (
                <div className="dsh-kv">
                  <div>
                    <span>Card</span>
                    <b>
                      {[card.cardType, `ending ${card.last4}`].filter(Boolean).join(" ")}
                    </b>
                  </div>
                  {card.expMonth && card.expYear && (
                    <div>
                      <span>Expires</span>
                      <b>
                        {card.expMonth} / {card.expYear}
                      </b>
                    </div>
                  )}
                  {card.bank && (
                    <div>
                      <span>Bank</span>
                      <b>{card.bank}</b>
                    </div>
                  )}
                  {view.nextDate && (
                    <div>
                      <span>Charged on</span>
                      <b>{longDate(view.nextDate)}</b>
                    </div>
                  )}
                </div>
              ) : (
                <div className="dsh-kv">
                  <div>
                    <span>Cards</span>
                    <b>Paystack</b>
                  </div>
                  <div>
                    <span>Transfers</span>
                    <b>Bank transfer, with a receipt upload</b>
                  </div>
                </div>
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
                {card
                  ? "Paystack holds the card itself; this is the display copy it returns. To change it, pay the next invoice with the new one."
                  : "No card is saved for renewals yet. Paying by card and choosing to save it puts one here."}
              </p>
            </div>
          </section>

          <section className="dsh-panel">
            <div className="dsh-ph">
              <h2>Billing details</h2>
            </div>
            <div className="dsh-body">
              <div className="dsh-kv">
                <div>
                  <span>Billed to</span>
                  <b>
                    {profile.firmName ||
                      [profile.firstName, profile.lastName].filter(Boolean).join(" ") ||
                      user?.email ||
                      "—"}
                  </b>
                </div>
                <div>
                  <span>Contact</span>
                  <b>{profile.email || user?.email || "—"}</b>
                </div>
                <div>
                  <span>Phone</span>
                  <b>{profile.whatsapp || "—"}</b>
                </div>
                <div>
                  <span>Address</span>
                  <b>{profile.location || profile.state || "—"}</b>
                </div>
              </div>
              <Link
                className="btn btn-o btn-sm btn-full"
                to="/manage/settings"
                style={{ marginTop: 16 }}
              >
                Edit details
              </Link>
              <p
                style={{
                  margin: "14px 0 0",
                  fontSize: "12.5px",
                  fontWeight: 300,
                  color: "var(--ink-3)",
                  lineHeight: 1.6,
                }}
              >
                These appear on every future invoice. Past invoices are not reissued.
              </p>
            </div>
          </section>

          <section className="dsh-panel">
            <div className="dsh-ph">
              <h2>Cancelling</h2>
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
                Licences run to the end of the period you have paid for. Your rate library and
                project data stay in the account whether or not a licence is active.
              </p>
              <Link className="btn btn-o btn-sm btn-full" to="/manage/support" style={{ marginTop: 16 }}>
                Talk to us first
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
