import React from "react";

function pad(n) {
  return String(n).padStart(2, "0");
}

function getParts(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(total / (3600 * 24));
  const h = Math.floor((total % (3600 * 24)) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return { d, h, m, s, total };
}

export default function LaunchCountdownBanner({
  targetIso, // e.g. "2025-12-20T15:00:00+01:00"
  onExpire, // optional callback
  storageKey = "adlm_launch_banner_dismissed_v1",
  title = "Full launch in",
}) {
  const target = React.useMemo(
    () => new Date(targetIso).getTime(),
    [targetIso]
  );
  const [now, setNow] = React.useState(Date.now());
  const [dismissed, setDismissed] = React.useState(() => {
    try {
      return localStorage.getItem(storageKey) === "1";
    } catch {
      return false;
    }
  });

  React.useEffect(() => {
    if (dismissed) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [dismissed]);

  if (dismissed) return null;

  const diff = target - now;
  const { d, h, m, s, total } = getParts(diff);

  if (total <= 0) {
    // optional: auto-hide when expired
    // setDismissed(true); localStorage.setItem(storageKey, "1");
    onExpire?.();
  }

  // show hours/mins/secs if less than 1 day, else include days
  const leftLabel =
    d > 0
      ? `${d}d : ${pad(h)}h : ${pad(m)}m : ${pad(s)}s`
      : `${pad(h)}h : ${pad(m)}m : ${pad(s)}s`;

  return (
    <div className="sticky top-0 z-50">
      <div className="w-full bg-slate-900 text-white">
        <div className="max-w-7xl mx-auto px-4 py-2 flex items-center gap-3">
          <div className="text-sm font-semibold">
            {title}{" "}
            <span className="font-mono bg-white/10 px-2 py-1 rounded-md">
              {leftLabel}
            </span>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <span className="hidden sm:inline text-xs text-white/80">
              🎉 We’re almost live!
            </span>
            <button
              onClick={() => {
                setDismissed(true);
                try {
                  localStorage.setItem(storageKey, "1");
                } catch {}
              }}
              className="text-white/80 hover:text-white text-sm px-2 py-1 rounded-md hover:bg-white/10 transition"
              aria-label="Dismiss banner"
              title="Dismiss"
            >
              ✕
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
