// client/src/pages/CheckoutThanks.jsx
import React from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useAuth } from "../store.jsx";
import { API_BASE } from "../config";
import { trackEvent } from "../ga";

export default function CheckoutThanks() {
  const [qs] = useSearchParams();
  const navigate = useNavigate();
  const { accessToken } = useAuth();
  const [status, setStatus] = React.useState("Verifying payment...");
  const reference = qs.get("reference");

  React.useEffect(() => {
    (async () => {
      try {
        if (!reference) {
          setStatus("Missing payment reference.");
          return;
        }
        const res = await fetch(
          `${API_BASE}/purchase/verify?reference=${encodeURIComponent(
            reference
          )}`,
          { credentials: "include" }
        );
        const out = await res.json();
        if (out?.ok) {
          setStatus("Payment successful! Your access has been activated.");

          // Fired only after the server has verified the reference with
          // Paystack — never on redirect back from the gateway. A user can
          // land on this URL without having paid, and revenue that counts
          // abandoned checkouts is worse than no revenue reporting.
          //
          // `transaction_id` is the payment reference, so GA deduplicates if
          // the page is reloaded rather than counting the sale twice.
          trackEvent("purchase", {
            transaction_id: reference,
            currency: out?.currency || "NGN",
            value: Number(out?.amountNGN ?? out?.amount ?? 0) || 0,
            items: Array.isArray(out?.items)
              ? out.items.map((it) => ({
                  item_id: it.productKey || it.key || "",
                  item_name: it.name || it.productKey || "",
                  quantity: Number(it.qty || 1),
                  price: Number(it.unitPriceNGN ?? it.price ?? 0) || 0,
                }))
              : undefined,
          });

          // e.g. take users to their courses/dashboard after 2–3s
          setTimeout(() => navigate("/dashboard"), 1500);
        } else {
          setStatus(
            `Payment status: ${out?.status || out?.message || "unknown"}`
          );
        }
      } catch (e) {
        setStatus(e.message || "Could not verify payment.");
      }
    })();
  }, [reference, accessToken, navigate]);

  return (
    <div className="max-w-xl mx-auto text-center py-16">
      <h1 className="text-2xl font-semibold mb-2">Thank you</h1>
      <p className="text-slate-700">{status}</p>
      {reference && (
        <p className="text-xs text-slate-500 mt-2">Ref: {reference}</p>
      )}
    </div>
  );
}
