// src/features/archicad/ArchiCADConnectorStatus.jsx
// Badge showing whether the local QUIV connector is running. Probes
// http://localhost:4823/api/status every 5s with a 1.5s timeout — plain
// fetch, no auth (it's a local process, not the ADLM Cloud API).
import React from "react";

const CONNECTOR_URL = "http://localhost:4823/api/status";
const POLL_MS = 5000;
const TIMEOUT_MS = 1500;

export default function ArchiCADConnectorStatus() {
  const [running, setRunning] = React.useState(null); // null = probing

  React.useEffect(() => {
    let alive = true;

    async function probe() {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      try {
        const res = await fetch(CONNECTOR_URL, { signal: ctrl.signal });
        if (alive) setRunning(res.ok);
      } catch {
        if (alive) setRunning(false);
      } finally {
        clearTimeout(timer);
      }
    }

    probe();
    const id = setInterval(probe, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const on = running === true;
  return (
    <span
      title={
        on
          ? "The QUIV connector is running on this machine (localhost:4823)."
          : "Start the connector next to ArchiCAD with `node index.js`, then open the panel at http://localhost:4823."
      }
      className={[
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold",
        on
          ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
          : "border-slate-200 bg-slate-100 text-slate-500 dark:border-adlm-dark-border dark:bg-white/5 dark:text-adlm-dark-muted",
      ].join(" ")}
    >
      <span
        className={[
          "h-2 w-2 rounded-full",
          on ? "bg-emerald-500" : "bg-slate-400 dark:bg-adlm-dark-dim",
        ].join(" ")}
      />
      {on ? "Connector running" : "Connector not running"}
    </span>
  );
}
