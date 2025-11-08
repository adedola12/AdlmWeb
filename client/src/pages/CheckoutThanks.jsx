// client/src/pages/CheckoutThanks.jsx
import React from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useAuth } from "../store.jsx";
import { apiAuthed } from "../http.js";

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
        const out = await apiAuthed(
          `/purchase/verify?reference=${encodeURIComponent(reference)}`,
          {
            token: accessToken,
            method: "GET",
          }
        );
        if (out?.ok) {
          setStatus("Payment successful! Your access has been activated.");
          // e.g. take users to their courses/dashboard after 2–3s
          setTimeout(() => navigate("/me/courses"), 2000);
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
