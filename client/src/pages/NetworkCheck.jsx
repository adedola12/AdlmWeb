// src/pages/NetworkCheck.jsx
//
// A one-click network check a customer can run when the site says
// "Failed to fetch" and nothing else. It sends a few small requests to the
// API that differ in exactly one way each, shows which ones got through, and
// posts the findings back so support can see them without a screen share.
//
// Why each step exists is in server/routes/diag.js. The short version: a
// firm's office network was silently dropping every request that carried a
// sign-in token, and only the browser could prove it.

import React from "react";
import { Link } from "react-router-dom";
import Seo from "../components/Seo.jsx";
import { API_BASE } from "../config";
import { useAuth } from "../store.jsx";

const WHATSAPP_NUMBER = "2348106503524";
const STEP_TIMEOUT_MS = 15000;

function makeRef() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i += 1) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}

async function timedFetch(url, init) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), STEP_TIMEOUT_MS);
  const started = performance.now();
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const ms = Math.round(performance.now() - started);
    let body = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    return { ok: res.ok, status: res.status, ms, body };
  } catch (e) {
    const ms = Math.round(performance.now() - started);
    const name = e?.name === "AbortError" ? "Timed out" : e?.name || "Error";
    return { ok: false, status: 0, ms, error: `${name}: ${e?.message || ""}`.trim() };
  } finally {
    clearTimeout(timer);
  }
}

function setCheckCookie(on) {
  // A parent-domain cookie reaches api.<domain> as well. Harmless value, short life.
  const host = window.location.hostname.split(".").slice(-2).join(".");
  const base = `adlm_check=${on ? "1" : ""}; path=/; domain=${host}; secure; samesite=none`;
  document.cookie = on ? `${base}; max-age=120` : `${base}; max-age=0`;
}

function buildSteps({ accessToken }) {
  const ping = `${API_BASE}/diag/ping`;
  const steps = [
    {
      key: "public",
      label: "Plain request",
      why: "No sign-in, no special headers. If this fails the site cannot reach the API at all.",
      run: () => timedFetch(ping, { credentials: "include" }),
      judge: (r) => r.ok,
    },
    {
      key: "custom-header",
      label: "Request with a custom header",
      why: "Makes the browser ask permission first (a preflight). Fails when a network blocks that step.",
      run: () => timedFetch(ping, { credentials: "include", headers: { "x-adlm-client": "web-check" } }),
      judge: (r) => r.ok && r.body?.saw?.xAdlmClient === true,
    },
    {
      key: "bearer",
      label: "Request with a sign-in token",
      why: "The same request the dashboard makes, with a harmless test token. This is the one that fails when a network drops sign-in tokens.",
      run: () => timedFetch(ping, { credentials: "include", headers: { Authorization: "Bearer network-check" } }),
      judge: (r) => r.ok && r.body?.saw?.authorization === true,
    },
    {
      key: "cookie",
      label: "Request with a cookie instead of a token",
      why: "Tells us whether a cookie-based sign-in would get through where the token does not.",
      run: async () => {
        setCheckCookie(true);
        try {
          return await timedFetch(ping, { credentials: "include" });
        } finally {
          setCheckCookie(false);
        }
      },
      judge: (r) => r.ok && r.body?.saw?.checkCookie === true,
    },
  ];
  if (accessToken) {
    steps.push({
      key: "dashboard",
      label: "Your dashboard data",
      why: "The real request your dashboard makes, with your real sign-in.",
      run: () =>
        timedFetch(`${API_BASE}/me/summary`, {
          credentials: "include",
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      judge: (r) => r.ok,
    });
  }
  return steps;
}

function describe(r, passed) {
  if (!r) return "";
  if (r.error) return r.error;
  if (passed) return `OK (${r.status}, ${r.ms} ms)`;
  if (r.ok) return `Arrived, but the API did not see what was sent (${r.status})`;
  return `HTTP ${r.status} (${r.ms} ms)`;
}

export default function NetworkCheck() {
  const { accessToken = null, user = null } = useAuth() || {};
  const [ref] = React.useState(makeRef);
  const [rows, setRows] = React.useState([]);
  const [phase, setPhase] = React.useState("idle"); // idle | running | done
  const [reported, setReported] = React.useState(null); // null | "sent" | "failed"
  const [copied, setCopied] = React.useState(false);

  const start = React.useCallback(async () => {
    setPhase("running");
    setReported(null);
    const steps = buildSteps({ accessToken });
    const results = [];
    setRows(steps.map((s) => ({ key: s.key, label: s.label, why: s.why, state: "pending" })));
    for (const step of steps) {
      const r = await step.run();
      const passed = step.judge(r);
      results.push({ key: step.key, passed, status: r.status, ms: r.ms, error: r.error || null, saw: r.body?.saw || null });
      setRows((prev) =>
        prev.map((row) =>
          row.key === step.key ? { ...row, state: passed ? "pass" : "fail", detail: describe(r, passed) } : row,
        ),
      );
    }
    const report = {
      ref,
      at: new Date().toISOString(),
      page: window.location.href,
      api: API_BASE,
      signedIn: !!accessToken,
      email: user?.email || null,
      ua: navigator.userAgent,
      online: navigator.onLine,
      results,
    };
    try {
      // text/plain on purpose: a "simple" request that needs no preflight, so
      // the findings get out even on a network that blocks OPTIONS.
      const res = await fetch(`${API_BASE}/diag/report`, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify(report),
      });
      setReported(res.ok ? "sent" : "failed");
    } catch {
      setReported("failed");
    }
    setPhase("done");
  }, [accessToken, user, ref]);

  React.useEffect(() => {
    start();
    // Run once on load. A re-run is a button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const summaryText = React.useMemo(() => {
    const lines = rows.map((r) => `${r.state === "pass" ? "PASS" : r.state === "fail" ? "FAIL" : "..."}  ${r.label}: ${r.detail || ""}`);
    return `ADLM network check ${ref}\n${lines.join("\n")}\n${navigator.userAgent}`;
  }, [rows, ref]);

  const failed = rows.filter((r) => r.state === "fail");
  const verdict =
    phase !== "done"
      ? null
      : failed.length === 0
        ? "Everything reached the API from this computer."
        : failed.some((r) => r.key === "bearer") && !failed.some((r) => r.key === "public")
          ? "This network is dropping requests that carry a sign-in token. Public requests get through, signed-in ones do not. That is a firewall, proxy or security product between this computer and the internet, not the website."
          : failed.some((r) => r.key === "public")
            ? "This computer cannot reach the API at all. Check the internet connection, VPN or proxy."
            : "Some requests did not get through. Send us the results below.";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(summaryText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  const wa = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(summaryText)}`;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Seo title="Network check" description="Check whether this computer can reach ADLM Cloud." path="/network-check" noindex />
      <h1 className="text-2xl font-bold sm:text-3xl">Network check</h1>
      <p className="mt-2 text-sm text-slate-600">
        This page sends a few tiny requests to ADLM Cloud and shows which ones got through. It takes a
        few seconds. Nothing on your account changes.
      </p>
      <p className="mt-1 text-sm text-slate-600">
        Reference code: <span className="font-mono font-semibold text-slate-900">{ref}</span>
      </p>

      <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {rows.map((r) => (
          <div key={r.key} className="flex gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0">
            <div className="mt-0.5 w-6 shrink-0 text-lg" aria-label={r.state}>
              {r.state === "pass" ? "✅" : r.state === "fail" ? "❌" : "⏳"}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-medium text-slate-900">{r.label}</div>
              <div className="text-xs text-slate-500">{r.why}</div>
              {r.detail ? <div className="mt-1 break-words font-mono text-xs text-slate-700">{r.detail}</div> : null}
            </div>
          </div>
        ))}
      </div>

      {verdict ? (
        <div
          className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
            failed.length === 0 ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900"
          }`}
        >
          {verdict}
        </div>
      ) : null}

      {phase === "done" ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button type="button" onClick={copy} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
            {copied ? "Copied" : "Copy results"}
          </button>
          <a href={wa} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800">
            Send to ADLM on WhatsApp
          </a>
          <button type="button" onClick={start} className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 underline">
            Run again
          </button>
          <span className="text-xs text-slate-500">
            {reported === "sent"
              ? "Results were also sent to ADLM automatically. Quote the reference code."
              : reported === "failed"
                ? "Results could not be sent automatically. Please copy them or use WhatsApp."
                : ""}
          </span>
        </div>
      ) : null}

      {!accessToken ? (
        <p className="mt-6 text-xs text-slate-500">
          You are not signed in, so the check skips your own dashboard data. <Link to="/login" className="underline">Sign in</Link> and
          open this page again to include it.
        </p>
      ) : null}
    </div>
  );
}
