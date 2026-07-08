// Google Identity Services sign-in button.
//
// Renders Google's own button (loaded from accounts.google.com/gsi/client)
// and, on success, posts the returned ID token to POST /auth/google, which
// verifies it server-side and issues the normal ADLM JWT pair. Renders
// nothing when VITE_GOOGLE_CLIENT_ID isn't configured, so Login/Signup keep
// working in environments without Google credentials.
import React from "react";
import { api } from "../api.js";
import { useAuth } from "../store.jsx";

const GOOGLE_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "").trim();
const GSI_SRC = "https://accounts.google.com/gsi/client";

let gsiScriptPromise = null;
function loadGsiScript() {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (gsiScriptPromise) return gsiScriptPromise;

  gsiScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${GSI_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () =>
        reject(new Error("Failed to load Google sign-in")),
      );
      return;
    }
    const script = document.createElement("script");
    script.src = GSI_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      gsiScriptPromise = null;
      reject(new Error("Failed to load Google sign-in"));
    };
    document.head.appendChild(script);
  });
  return gsiScriptPromise;
}

export default function GoogleSignInButton({
  onSuccess,
  onError,
  text = "signin_with", // "signin_with" | "signup_with" | "continue_with"
}) {
  const { setAuth } = useAuth();
  const buttonRef = React.useRef(null);
  const [busy, setBusy] = React.useState(false);

  // Keep the latest callbacks without re-initialising the Google button.
  const handlersRef = React.useRef({ onSuccess, onError });
  React.useEffect(() => {
    handlersRef.current = { onSuccess, onError };
  });

  React.useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;
    let cancelled = false;

    async function handleCredential(response) {
      setBusy(true);
      try {
        const res = await api("/auth/google", {
          method: "POST",
          body: JSON.stringify({ credential: response.credential }),
        });
        setAuth({
          user: res.user,
          accessToken: res.accessToken,
          licenseToken: res.licenseToken,
        });
        handlersRef.current.onSuccess?.(res);
      } catch (e) {
        handlersRef.current.onError?.(
          e?.message || "Google sign-in failed. Please try again.",
        );
      } finally {
        setBusy(false);
      }
    }

    loadGsiScript()
      .then(() => {
        if (cancelled || !buttonRef.current) return;
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: handleCredential,
        });
        window.google.accounts.id.renderButton(buttonRef.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          text,
          shape: "pill",
          logo_alignment: "left",
          width: 320,
        });
      })
      .catch((e) => {
        if (!cancelled) handlersRef.current.onError?.(e.message);
      });

    return () => {
      cancelled = true;
    };
  }, [setAuth, text]);

  if (!GOOGLE_CLIENT_ID) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
        <span className="text-xs uppercase tracking-wide text-slate-400">or</span>
        <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
      </div>
      <div
        ref={buttonRef}
        className={`flex justify-center ${busy ? "opacity-60 pointer-events-none" : ""}`}
      />
      {busy && (
        <div className="text-center text-sm text-slate-500">Signing in…</div>
      )}
    </div>
  );
}
