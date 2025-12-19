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
  targetIso,
  title = "Full launch in",
  storageKey = "adlm_launch_banner_auto_v1",
  onExpire,
}) {
  const target = React.useMemo(
    () => new Date(targetIso).getTime(),
    [targetIso]
  );
  const [now, setNow] = React.useState(Date.now());

  // ✅ self-disappear: once it reaches 0, persist hidden state
  const [hidden, setHidden] = React.useState(() => {
    try {
      return localStorage.getItem(storageKey) === "1";
    } catch {
      return false;
    }
  });

  React.useEffect(() => {
    if (hidden) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [hidden]);

  if (hidden) return null;

  const diff = target - now;
  const { d, h, m, s, total } = getParts(diff);

  // ✅ auto hide when complete
  React.useEffect(() => {
    if (total !== 0) return;

    setHidden(true);
    try {
      localStorage.setItem(storageKey, "1");
    } catch {}

    onExpire?.();
  }, [total, onExpire, storageKey]);

  const showDays = d > 0;

  return (
    <div className="sticky top-0 z-50">
      <div className="w-full bg-slate-900 text-white">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4">
          <div className="min-w-0">
            <div className="text-xs sm:text-sm text-white/80 font-medium">
              {title}
            </div>

            {/* ✅ bigger timer */}
            <div className="mt-1 flex items-center gap-2 font-mono">
              {showDays && <TimeBlock label="DAYS" value={String(d)} big />}

              <TimeBlock label="HRS" value={pad(h)} big />
              <Colon />
              <TimeBlock label="MIN" value={pad(m)} big />
              <Colon />
              <TimeBlock label="SEC" value={pad(s)} big />
            </div>
          </div>

          <div className="ml-auto hidden sm:flex items-center gap-2">
            <span className="text-xs text-white/70">🎉 We’re almost live!</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Colon() {
  return <span className="text-2xl sm:text-3xl font-bold -mt-1">:</span>;
}

function TimeBlock({ label, value, big = false }) {
  return (
    <div className="flex flex-col items-center">
      <div
        className={`rounded-lg bg-white/10 ring-1 ring-white/10 px-3 py-2 ${
          big ? "text-2xl sm:text-3xl font-extrabold" : "text-lg font-bold"
        }`}
        style={{ minWidth: big ? 70 : 52, textAlign: "center" }}
      >
        {value}
      </div>
      <div className="mt-1 text-[10px] sm:text-xs tracking-wider text-white/70">
        {label}
      </div>
    </div>
  );
}
