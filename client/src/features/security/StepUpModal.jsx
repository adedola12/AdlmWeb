// src/features/security/StepUpModal.jsx
// The email-OTP prompt shown before a sensitive action when the user has
// step-up verification enabled. Presentational only — all state and the
// request/verify calls live in StepUpProvider (useStepUp.jsx).
import React from "react";

export default function StepUpModal({
  open,
  busy,
  error,
  email,
  onSubmit,
  onResend,
  onCancel,
}) {
  const [code, setCode] = React.useState("");

  // Reset the field each time the modal opens.
  React.useEffect(() => {
    if (open) setCode("");
  }, [open]);

  if (!open) return null;

  const clean = code.trim();
  const canSubmit = clean.length === 6 && !busy;

  const submit = (e) => {
    e.preventDefault();
    if (canSubmit) onSubmit(clean);
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Confirm your identity"
    >
      <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-adlm-dark-card text-slate-900 dark:text-adlm-dark-text p-5 shadow-xl ring-1 ring-black/5">
        <h2 className="text-lg font-semibold">Confirm it's you</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          We emailed a 6-digit code{email ? <> to <span className="font-medium">{email}</span></> : ""}.
          Enter it to continue with this sensitive action.
        </p>

        <form onSubmit={submit} className="mt-4 space-y-3">
          <input
            autoFocus
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="one-time-code"
            maxLength={6}
            className="input w-full text-center text-xl tracking-[0.5em]"
            placeholder="••••••"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            disabled={busy}
          />

          {error ? <div className="text-sm text-red-600">{error}</div> : null}

          <button type="submit" className="btn w-full" disabled={!canSubmit}>
            {busy ? "Verifying…" : "Verify & continue"}
          </button>
        </form>

        <div className="mt-3 flex items-center justify-between text-sm">
          <button
            type="button"
            className="underline text-slate-600 dark:text-slate-300 disabled:opacity-50"
            onClick={onResend}
            disabled={busy}
          >
            Resend code
          </button>
          <button
            type="button"
            className="underline text-slate-600 dark:text-slate-300 disabled:opacity-50"
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
