// src/features/account/Billing.jsx
// Profile → "Billing & auto-renewal" card: saved card (brand + last4 +
// expiry), per-product auto-renew toggles, and card removal. Backed by
// /me/billing — the server never exposes the Paystack authorization token.
import React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../store.jsx";
import { apiAuthed } from "../../http.js";

function fmtDate(d) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString();
  } catch {
    return "—";
  }
}

export default function Billing() {
  const { accessToken } = useAuth();

  const [loading, setLoading] = React.useState(true);
  const [card, setCard] = React.useState(null);
  const [subs, setSubs] = React.useState([]);
  const [busyKey, setBusyKey] = React.useState("");
  const [removing, setRemoving] = React.useState(false);
  const [confirmRemove, setConfirmRemove] = React.useState(false);
  const [msg, setMsg] = React.useState("");

  const load = React.useCallback(async () => {
    if (!accessToken) return;
    try {
      const res = await apiAuthed("/me/billing", { token: accessToken });
      setCard(res?.card || null);
      setSubs(Array.isArray(res?.subscriptions) ? res.subscriptions : []);
    } catch (e) {
      setMsg(e?.message || "Failed to load billing info.");
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  React.useEffect(() => {
    load();
  }, [load]);

  async function toggleAutoRenew(sub, next) {
    setBusyKey(sub.productKey);
    setMsg("");
    try {
      await apiAuthed("/me/billing/autorenew", {
        token: accessToken,
        method: "POST",
        body: JSON.stringify({ productKey: sub.productKey, autoRenew: next }),
        headers: { "Content-Type": "application/json" },
      });
      setSubs((list) =>
        list.map((s) =>
          s.productKey === sub.productKey ? { ...s, autoRenew: next } : s,
        ),
      );
      setMsg(
        next
          ? `Auto-renew turned on for ${sub.productName}.`
          : `Auto-renew turned off for ${sub.productName}.`,
      );
    } catch (e) {
      setMsg(e?.message || "Couldn't update auto-renew.");
    } finally {
      setBusyKey("");
    }
  }

  async function removeCard() {
    setRemoving(true);
    setMsg("");
    try {
      await apiAuthed("/me/billing/card", {
        token: accessToken,
        method: "DELETE",
      });
      setCard(null);
      setSubs((list) => list.map((s) => ({ ...s, autoRenew: false })));
      setConfirmRemove(false);
      setMsg("Saved card removed. Auto-renew is off for all products.");
    } catch (e) {
      setMsg(e?.message || "Couldn't remove the card.");
    } finally {
      setRemoving(false);
    }
  }

  // Nothing to manage yet — don't render an empty card for brand-new accounts.
  if (!loading && !card && !subs.length) return null;

  return (
    <div className="card">
      <h2 className="font-semibold mb-3">Billing &amp; auto-renewal</h2>

      {loading ? (
        <div className="text-sm text-slate-500">Loading…</div>
      ) : (
        <>
          {/* Saved card */}
          <div className="mb-4 rounded-xl border bg-white dark:bg-adlm-dark-card p-3">
            {card ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium capitalize">
                    {(card.cardType || "Card").trim()} •••• {card.last4}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    Expires {card.expMonth}/{card.expYear}
                    {card.bank ? ` · ${card.bank}` : ""}
                  </div>
                </div>

                {confirmRemove ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-600">
                      Remove card &amp; stop all renewals?
                    </span>
                    <button
                      className="btn btn-sm"
                      onClick={removeCard}
                      disabled={removing}
                    >
                      {removing ? "Removing…" : "Yes, remove"}
                    </button>
                    <button
                      className="btn btn-sm btn-ghost"
                      onClick={() => setConfirmRemove(false)}
                      disabled={removing}
                    >
                      Keep
                    </button>
                  </div>
                ) : (
                  <button
                    className="btn btn-sm btn-ghost text-red-600"
                    onClick={() => setConfirmRemove(true)}
                  >
                    Remove card
                  </button>
                )}
              </div>
            ) : (
              <div className="text-sm text-slate-600">
                No saved card. Pay for an order by card and it's saved
                automatically for renewals.{" "}
                <Link to="/purchase" className="underline">
                  Go to purchase
                </Link>
              </div>
            )}
          </div>

          {/* Per-product auto-renew */}
          {subs.length > 0 && (
            <div className="space-y-2">
              {subs.map((s) => (
                <div
                  key={s.productKey}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"
                >
                  <div className="min-w-0">
                    <div className="font-medium">{s.productName}</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      <span className="capitalize">{s.status}</span>
                      {" · expires "}
                      {fmtDate(s.expiresAt)}
                      {s.autoRenew
                        ? ` · renews ${s.autoRenewMonths} month${
                            s.autoRenewMonths === 1 ? "" : "s"
                          } at a time`
                        : ""}
                    </div>
                    {s.autoRenew && s.lastRenewalError ? (
                      <div className="text-xs text-red-600 mt-0.5">
                        Last renewal attempt failed: {s.lastRenewalError}
                      </div>
                    ) : null}
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer text-sm">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-adlm-blue-700"
                      checked={!!s.autoRenew}
                      disabled={busyKey === s.productKey || (!card && !s.autoRenew)}
                      onChange={(e) => toggleAutoRenew(s, e.target.checked)}
                    />
                    Auto-renew
                  </label>
                </div>
              ))}
            </div>
          )}

          <p className="text-xs text-slate-500 mt-3">
            Renewals are charged in Naira to your saved card at the
            then-current price a few days before expiry. If a charge fails
            we'll email you and retry for up to 3 days.
          </p>

          {msg && <div className="text-sm mt-2">{msg}</div>}
        </>
      )}
    </div>
  );
}
