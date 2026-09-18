// "Verify on WhatsApp" under the phone field in Account settings (2026-09-18).
//
// Sends a six-digit code to the saved number over WhatsApp and confirms it
// (server/util/whatsappVerify.js). Renders nothing while the service is off
// (no Meta keys yet), and asks the person to save a changed number first,
// because the proof is tied to the number on the account.

import React from "react";
import { apiAuthed } from "../api.js";
import { useFeedback } from "./feedback/feedbackContext.js";

export default function WhatsAppVerify({ accessToken, savedNumber, typedNumber }) {
  const fb = useFeedback();
  const [state, setState] = React.useState(null); // { enabled, verified, number }
  const [sent, setSent] = React.useState(null); // { to, minutes }
  const [code, setCode] = React.useState("");
  const [busy, setBusy] = React.useState("");

  const load = React.useCallback(() => {
    apiAuthed("/me/whatsapp/verify", { token: accessToken })
      .then(setState)
      .catch(() => setState(null));
  }, [accessToken]);

  React.useEffect(() => {
    load();
  }, [load, savedNumber]);

  if (!state?.enabled) return null;

  const unsaved = String(typedNumber || "") !== String(savedNumber || "");
  if (state.verified && !unsaved) {
    return <p className="hint">Verified on WhatsApp.</p>;
  }
  if (unsaved) {
    return <p className="hint">Save the new number, then verify it on WhatsApp.</p>;
  }
  if (!savedNumber) return null;

  const start = async () => {
    setBusy("start");
    try {
      const r = await apiAuthed("/me/whatsapp/verify/start", { token: accessToken, method: "POST" });
      setSent(r);
      fb.toast({ tone: "success", title: "Code sent on WhatsApp", msg: `To ${r.to}. It works for ${r.minutes} minutes.` });
    } catch (e) {
      fb.toast({ tone: "error", title: e.message || "The code could not be sent." });
    } finally {
      setBusy("");
    }
  };

  const confirm = async () => {
    const c = code.replace(/\D/g, "");
    if (c.length !== 6) {
      fb.toast({ tone: "error", title: "The WhatsApp code is six digits." });
      return;
    }
    setBusy("confirm");
    try {
      await apiAuthed("/me/whatsapp/verify/confirm", {
        token: accessToken,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: c }),
      });
      fb.toast({ tone: "success", title: "WhatsApp number verified" });
      setSent(null);
      setCode("");
      load();
    } catch (e) {
      fb.toast({ tone: "error", title: e.message || "That code could not be checked." });
    } finally {
      setBusy("");
    }
  };

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 8 }}>
      {sent ? (
        <>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={7}
            placeholder="6-digit code"
            aria-label="WhatsApp code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            style={{ maxWidth: 140 }}
          />
          <button type="button" className="ds-btn btn-p ds-btn-sm" onClick={confirm} disabled={!!busy}>
            {busy === "confirm" ? "Checking…" : "Confirm"}
          </button>
          <button type="button" className="ds-btn btn-o ds-btn-sm" onClick={start} disabled={!!busy}>
            Send again
          </button>
        </>
      ) : (
        <button type="button" className="ds-btn btn-o ds-btn-sm" onClick={start} disabled={!!busy}>
          {busy === "start" ? "Sending…" : "Verify on WhatsApp"}
        </button>
      )}
    </div>
  );
}
