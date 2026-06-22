// src/features/security/useStepUp.jsx
// Step-up (email-OTP) verification for sensitive actions.
//
// Flow: a gated action calls `ensureVerified()`. If a still-valid step-up token
// is held in memory it's returned immediately (the "one code → ~10 min window"
// behaviour). Otherwise the modal opens, a code is emailed, and the returned
// promise resolves with a fresh token once the user enters it (or rejects with
// "Verification cancelled" if they back out).
//
// The token lives only in memory (a ref) — never localStorage — so a reload
// safely forces re-verification.
/* eslint-disable react-refresh/only-export-components */
import React from "react";
import { useAuth } from "../../store.jsx";
import { apiAuthed } from "../../http.js";
import StepUpModal from "./StepUpModal.jsx";

const StepUpCtx = React.createContext({
  ensureVerified: async () => null,
  getValidToken: () => null,
});

const SKEW_MS = 5000; // treat tokens within 5s of expiry as already expired

export function StepUpProvider({ children }) {
  const { accessToken, user } = useAuth();

  const sessionRef = React.useRef({ token: null, expiresAt: 0 });
  const pendingRef = React.useRef(null); // { resolve, reject, promise } while prompting

  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");

  const getValidToken = React.useCallback(() => {
    const s = sessionRef.current;
    if (s.token && s.expiresAt > Date.now() + SKEW_MS) return s.token;
    return null;
  }, []);

  const requestCode = React.useCallback(async () => {
    await apiAuthed("/auth/step-up/request", {
      token: accessToken,
      method: "POST",
      body: {},
    });
  }, [accessToken]);

  const verifyCode = React.useCallback(
    async (code) => {
      const res = await apiAuthed("/auth/step-up/verify", {
        token: accessToken,
        method: "POST",
        body: { code },
      });
      const expiresAt = res?.expiresAt
        ? new Date(res.expiresAt).getTime()
        : Date.now() + 10 * 60 * 1000;
      sessionRef.current = { token: res.token, expiresAt };
      return res.token;
    },
    [accessToken]
  );

  const closeAndReset = React.useCallback(() => {
    setOpen(false);
    setBusy(false);
    setError("");
    pendingRef.current = null;
  }, []);

  const ensureVerified = React.useCallback(async () => {
    const existing = getValidToken();
    if (existing) return existing;

    // Already prompting → share the in-flight promise so we never stack modals
    // (matters when a bulk action fires many requests at once).
    if (pendingRef.current) return pendingRef.current.promise;

    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    pendingRef.current = { resolve, reject, promise };

    setError("");
    setOpen(true);
    setBusy(true);
    requestCode()
      .then(() => setBusy(false))
      .catch((e) => {
        setBusy(false);
        // 429 = a code was just sent; the user can still enter it, so don't
        // surface that as an error.
        if (e?.status !== 429) {
          setError(e?.message || "Couldn't send the code. Try Resend.");
        }
      });

    return promise;
  }, [getValidToken, requestCode]);

  const onSubmit = React.useCallback(
    async (code) => {
      setError("");
      setBusy(true);
      try {
        const token = await verifyCode(code);
        const pending = pendingRef.current;
        closeAndReset();
        pending?.resolve(token);
      } catch (e) {
        setBusy(false);
        setError(e?.message || "Invalid code.");
      }
    },
    [verifyCode, closeAndReset]
  );

  const onResend = React.useCallback(async () => {
    setError("");
    setBusy(true);
    try {
      await requestCode();
      setBusy(false);
    } catch (e) {
      setBusy(false);
      setError(
        e?.status === 429
          ? e?.message || "Please wait a moment before resending."
          : e?.message || "Couldn't resend the code."
      );
    }
  }, [requestCode]);

  const onCancel = React.useCallback(() => {
    const pending = pendingRef.current;
    closeAndReset();
    pending?.reject(new Error("Verification cancelled"));
  }, [closeAndReset]);

  const value = React.useMemo(
    () => ({ ensureVerified, getValidToken }),
    [ensureVerified, getValidToken]
  );

  return (
    <StepUpCtx.Provider value={value}>
      {children}
      <StepUpModal
        open={open}
        busy={busy}
        error={error}
        email={user?.email}
        onSubmit={onSubmit}
        onResend={onResend}
        onCancel={onCancel}
      />
    </StepUpCtx.Provider>
  );
}

export const useStepUp = () => React.useContext(StepUpCtx);
