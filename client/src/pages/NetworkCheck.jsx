// src/pages/NetworkCheck.jsx
//
// A one-click network check a customer can run when the site says
// "Failed to fetch" and nothing else.
//
// The first version answered one question and raised a better one. At
// Y.S. Associates a request carrying a short bearer token reached the API in
// 182 ms, while the real dashboard call never arrived at all. So the network
// is not dropping signed-in traffic as a class; something about that one
// request is being singled out.
//
// Each step below changes exactly one thing from the step before it, so the
// first failure names the cause rather than the symptom:
//
//   plain            -> can this computer reach the API at all
//   custom header    -> are preflights allowed
//   short token      -> is an Authorization header allowed
//   long token       -> is it the LENGTH of the header
//   real token       -> is it the CONTENT of the token (a JWT looks like a
//                       base64 blob, and data-loss products block those)
//   account address  -> is it the /me/ address itself, with no token at all
//   dashboard data   -> the real request, all of it together
//
// Nothing here validates a token, so sending the real one to /diag/ping is
// safe: that endpoint only reports whether it saw a header and how long it
// was. The token itself is never put in the report.

import React from "react";
import { Link } from "react-router-dom";
import Seo from "../components/Seo.jsx";
import { API_BASE } from "../config";
import { useAuth } from "../store.jsx";

const WHATSAPP_NUMBER = "2348106503524";
const STEP_TIMEOUT_MS = 20000;

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

// Reached the server at all, whatever it thought of the request. A 401 is a
// perfectly good answer here: it proves the request arrived.
const arrived = (r) => r.status > 0;

function buildSteps({ accessToken }) {
  const ping = `${API_BASE}/diag/ping`;
  const tokenLen = accessToken ? `Bearer ${accessToken}`.length : 0;

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
      label: "Request with a short sign-in token",
      why: "Checks that an Authorization header is allowed through at all.",
      run: () => timedFetch(ping, { credentials: "include", headers: { Authorization: "Bearer network-check" } }),
      judge: (r) => r.ok && r.body?.saw?.authorization === true,
    },
    {
      key: "cookie",
      label: "Request with a cookie instead of a token",
      why: "Tells us whether a cookie-based sign-in would get through where a token does not.",
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
      key: "long-token",
      label: "Request with a long token",
      why: `Same as above but ${tokenLen} characters long, matching your real one. Shows whether the length is the problem.`,
      run: () =>
        timedFetch(ping, {
          credentials: "include",
          headers: { Authorization: `Bearer ${"x".repeat(Math.max(1, tokenLen - 7))}` },
        }),
      // A header that arrives truncated is a different fault from one stripped.
      judge: (r) => r.ok && r.body?.saw?.authorizationLength === tokenLen,
    });
    steps.push({
      key: "real-token",
      label: "Request with your real sign-in token",
      why: "Your actual token, sent to the harmless test address. Shows whether the token itself is being singled out.",
      run: () => timedFetch(ping, { credentials: "include", headers: { Authorization: `Bearer ${accessToken}` } }),
      judge: (r) => r.ok && r.body?.saw?.authorizationLength === tokenLen,
    });
  }

  steps.push({
    key: "me-noauth",
    label: "Your account address, without signing in",
    why: "The dashboard address with no token attached. It should be refused politely. If nothing comes back, the address itself is blocked.",
    run: () => timedFetch(`${API_BASE}/me/summary`, { credentials: "include" }),
    judge: (r) => arrived(r),
  });

  steps.push({
    key: "me-preflight",
    label: "Your account address, with the permission step",
    why: "The same address again, but asking the browser to check permission first. Separates a blocked address from a blocked permission step.",
    run: () =>
      timedFetch(`${API_BASE}/me/summary`, {
        credentials: "include",
        headers: { "x-adlm-client": "web-check" },
      }),
    judge: (r) => arrived(r),
  });

  if (accessToken) {
    steps.push({
      key: "dashboard",
      label: "Your dashboard data",
      why: "The real request your dashboard makes, with your real sign-in. Everything above, together.",
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
  if (passed && r.status === 401) return `Refused, as expected (401, ${r.ms} ms)`;
  if (passed) return `OK (${r.status}, ${r.ms} ms)`;
  if (r.ok) return `Arrived, but the API did not see what was sent (${r.status})`;
  return `HTTP ${r.status} (${r.ms} ms)`;
}

function verdictFor(rows) {
  const failed = new Set(rows.filter((r) => r.state === "fail").map((r) => r.key));
  if (failed.size === 0) return "Everything reached ADLM Cloud from this computer.";
  if (failed.has("public"))
    return "This computer cannot reach the API at all. Check the internet connection, VPN or proxy.";
  if (failed.has("custom-header"))
    return "Something on this network blocks the permission step a browser makes before a signed-in request. That is a firewall or proxy setting, not the website.";
  if (failed.has("bearer"))
    return "This network strips sign-in tokens from requests. That is a firewall, proxy or security product between this computer and the internet.";
  if (failed.has("me-noauth"))
    return "This network blocks the dashboard address itself, even with no sign-in attached. A web filter is matching on the address.";
  if (failed.has("me-preflight"))
    return "The dashboard address is reachable, but not when the browser asks permission first. Something on this network is blocking that permission step for this address, which is what makes the dashboard fail while the rest of the site works.";
  if (failed.has("long-token") && !failed.has("real-token"))
    return "Long request headers are being cut short on this network. Your sign-in token is too long to survive the trip.";
  if (failed.has("real-token"))
    return "Short tokens pass and your real one does not, so something on this network is inspecting the sign-in token itself. That is usually a data-loss or antivirus product.";
  if (failed.has("dashboard"))
    return "Every part passes on its own, but the real dashboard request does not complete. The cause is more likely the size or duration of the reply than the request. Send us this reference code.";
  return "Some requests did not get through. Send us the results below.";
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
      results.push({
        key: step.key,
        passed,
        status: r.status,
        ms: r.ms,
        error: r.error || null,
        saw: r.body?.saw || null,
      });
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
      // The token is never sent. Its shape is all we need.
      tokenLength: accessToken ? accessToken.length : 0,
      tokenLooksLikeJwt: accessToken ? accessToken.split(".").length === 3 : false,
      ua: navigator.userAgent,
      online: navigator.onLine,
      results,
    };
    const payload = JSON.stringify(report);
    let sent = false;
    try {
      // text/plain on purpose: a "simple" request that needs no preflight, so
      // the findings get out even on a network that blocks OPTIONS.
      const res = await fetch(`${API_BASE}/diag/report`, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: payload,
      });
      const echoed = await res.json().catch(() => null);
      // The first version reported success while the server received an empty
      // body, so success now means the server says it actually read something.
      sent = !!res.ok && !!echoed && echoed.len > 0;
    } catch {
      sent = false;
    }
    if (!sent) {
      try {
        const url = `${API_BASE}/diag/report?ref=${encodeURIComponent(ref)}&data=${encodeURIComponent(payload)}`;
        const res = await fetch(url, { method: "GET" });
        sent = res.ok;
      } catch {
        sent = false;
      }
    }
    setReported(sent ? "sent" : "failed");
    setPhase("done");
  }, [accessToken, user, ref]);

  React.useEffect(() => {
    start();
    // Run once on load. A re-run is a button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const summaryText = React.useMemo(() => {
    const lines = rows.map(
      (r) => `${r.state === "pass" ? "PASS" : r.state === "fail" ? "FAIL" : "..."}  ${r.label}: ${r.detail || ""}`,
    );
    return `ADLM network check ${ref}\n${lines.join("\n")}\n${navigator.userAgent}`;
  }, [rows, ref]);

  const verdict = phase === "done" ? verdictFor(rows) : null;
  const allPassed = phase === "done" && rows.every((r) => r.state === "pass");

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
      <Seo
        title="Network check"
        description="Check whether this computer can reach ADLM Cloud."
        path="/network-check"
        noindex
      />
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
            allPassed
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-amber-200 bg-amber-50 text-amber-900"
          }`}
        >
          {verdict}
        </div>
      ) : null}

      {phase === "done" ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={copy}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
          >
            {copied ? "Copied" : "Copy results"}
          </button>
          <a
            href={wa}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800"
          >
            Send to ADLM on WhatsApp
          </a>
          <button
            type="button"
            onClick={start}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 underline"
          >
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
          You are not signed in, so the checks that use your own sign-in are skipped.{" "}
          <Link to="/login" className="underline">
            Sign in
          </Link>{" "}
          and open this page again to include them.
        </p>
      ) : null}
    </div>
  );
}
