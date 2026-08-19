// His Billing & invoices screen, on real invoices.
//
// Two things in his version are design ahead of software, and both are handled
// the same way as on Team: the real parts are real, the rest says what is true.
//
//   * The seat stepper. His next-charge panel has −/+ buttons that change a
//     seat count in place. There is no endpoint that changes a seat count, and
//     a stepper that moves a number without moving the subscription would be a
//     lie the moment somebody pressed it. The lines are read-only; buying a
//     seat goes through checkout, which is where the money actually moves.
//   * The stored card. Paystack holds the authorisation for renewals; we never
//     see a card number, and "Visa ending 4417" is not ours to display. The
//     panel names the method that is actually on file instead.
//
// What is real: the invoice table, straight off GET /me/invoices with his
// .tbl markup, and a PDF for each; the next charge, computed from the active
// licences the same way the overview computes it, so the two screens cannot
// disagree; and the billing details, from the profile that actually gets
// printed on an invoice.

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

  const view = React.useMemo(() => {
    if (!summary || !catalogue) return null;

    const licences = (summary.entitlements || []).filter(
      (e) => !e.isCourse && !!catalogue[e.productKey],
    );
    const active = licences.filter((e) => e.status === "active" && !e.isExpired);

    // The soonest renewal, and every licence that falls on that same day —
    // identical to the overview's calculation on purpose.
    const dated = active
      .filter((e) => e.expiresAt)
      .sort((a, b) => new Date(a.expiresAt) - new Date(b.expiresAt));
    const nextDate = dated[0]?.expiresAt || null;
    const sameDay = nextDate
      ? dated.filter(
          (e) =>
            new Date(e.expiresAt).toDateString() === new Date(nextDate).toDateString(),
        )
      : [];

    const lines = sameDay.map((e) => {
      const p = catalogue[e.productKey];
      const months = p?.billingInterval === "yearly" ? 12 : 1;
      const seats = Number(e.seats) || 1;
      return {
        key: e.productKey,
        name: p?.name || e.productKey,
        seats,
        months,
        amount: termTotalNGN(p, months) * seats,
      };
    });

    const subtotal = lines.reduce((n, l) => n + l.amount, 0);

    return { licences, active, nextDate, lines, subtotal };
  }, [summary, catalogue]);

  const downloadPdf = async (inv, kind) => {
    const id = inv._id;
    setBusy(`${id}:${kind}`);
    try {
      const path =
        kind === "receipt"
          ? `/me/invoices/${id}/receipt/pdf`
          : `/me/invoices/${id}/pdf`;
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
      alert("That download failed. Please try again.");
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

  const vatAmount = Math.round((view.subtotal * vat.pct) / 100);
  const total = view.subtotal + vatAmount;
  const seats = view.lines.reduce((n, l) => n + l.seats, 0);

  return (
    <div className="dsh-in">
      <div className="dsh-head">
        <div>
          <h1>Billing &amp; invoices</h1>
          <p>
            {view.nextDate
              ? `${money(total)} due on ${longDate(view.nextDate)}, covering ${seats} seat${seats === 1 ? "" : "s"}.`
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

      <div className="dsh-two">
        <div>
          <section className="dsh-panel">
            <div className="dsh-ph">
              <h2>Next charge</h2>
            </div>
            <div className="dsh-body">
              {view.nextDate ? (
                <>
                  <p style={{ margin: "14px 0 4px", fontSize: "12.5px", color: "var(--ink-3)" }}>
                    Next on {longDate(view.nextDate)}
                  </p>
                  <div className="dsh-kv">
                    {view.lines.map((l) => (
                      <div key={l.key}>
                        <span>
                          {l.name} · {l.seats} seat{l.seats === 1 ? "" : "s"}
                          {l.months === 12 ? " · yearly" : ""}
                        </span>
                        <b>{money(l.amount)}</b>
                      </div>
                    ))}
                    <div>
                      <span>
                        Subtotal · {seats} seat{seats === 1 ? "" : "s"}
                      </span>
                      <b>{money(view.subtotal)}</b>
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
                    This is what the current licences come to at list price. Adding or removing a
                    seat goes through checkout, and takes effect from the date it is paid.
                  </p>
                </>
              ) : (
                <p style={{ margin: 0, fontSize: "13px", color: "var(--ink-3)" }}>
                  Nothing is scheduled. When a licence has a renewal date it appears here with
                  what it will come to.
                </p>
              )}
              <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
                <Link className="btn btn-o btn-sm" to="/manage/team">
                  Who holds them
                </Link>
                <Link className="btn btn-o btn-sm" to="/purchase">
                  Add a product
                </Link>
              </div>
            </div>
          </section>

          <section className="dsh-panel" id="invoices">
            <div className="dsh-ph">
              <h2>Invoices</h2>
              <span className="when">
                {invoices.length} issued
              </span>
            </div>
            {invoices.length ? (
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Reference</th>
                      <th>Issued</th>
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
                          <td className="num">{money(inv.total, inv.currency || "NGN")}</td>
                          <td>
                            <span className={`pill ${pill.cls}`}>{pill.text}</span>
                          </td>
                          <td>
                            <button
                              type="button"
                              onClick={() => downloadPdf(inv, "invoice")}
                              disabled={busy === `${inv._id}:invoice`}
                              style={{
                                background: "none",
                                border: 0,
                                padding: 0,
                                cursor: "pointer",
                                color: "var(--action)",
                                fontSize: "12.5px",
                              }}
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
                                  style={{
                                    background: "none",
                                    border: 0,
                                    padding: 0,
                                    cursor: "pointer",
                                    color: "var(--action)",
                                    fontSize: "12.5px",
                                  }}
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
                  No invoices yet. One is issued for every purchase, and appears here the moment
                  it is raised.
                </p>
              </div>
            )}
          </section>
        </div>

        <div>
          <section className="dsh-panel">
            <div className="dsh-ph">
              <h2>Payment method</h2>
            </div>
            <div className="dsh-body">
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
              <p
                style={{
                  margin: "14px 0 0",
                  fontSize: "12.5px",
                  fontWeight: 300,
                  color: "var(--ink-3)",
                  lineHeight: 1.6,
                }}
              >
                Card details are held by Paystack and never reach us, so there is no card number
                to show or edit here. A renewal charges the card used for the last payment; to
                change it, pay the next invoice with the new one.
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
                  <span>Location</span>
                  <b>{profile.location || profile.state || "—"}</b>
                </div>
              </div>
              <Link className="btn btn-o btn-sm btn-full" to="/manage/settings" style={{ marginTop: 16 }}>
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
              <Link className="btn btn-o btn-sm btn-full" to="/support/request" style={{ marginTop: 16 }}>
                Talk to us first
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
