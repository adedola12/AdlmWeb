// src/components/FeaturedTrainingBanner.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../http.js";

function safeDate(d) {
  const x = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(x.getTime())) return null;
  return x;
}

function fmtDateRange(startAt, endAt) {
  const s = safeDate(startAt);
  const e = safeDate(endAt);
  if (!s) return "—";

  const datePart = s.toLocaleDateString(undefined, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  const timeS = s.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  const timeE = e
    ? e.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : null;

  return timeE ? `${datePart} • ${timeS} - ${timeE}` : `${datePart} • ${timeS}`;
}

function getCountdownParts(targetDate) {
  if (!targetDate) return null;

  const ms = targetDate.getTime() - Date.now();
  if (ms <= 0) return { ended: true, text: "Earlybird ended" };

  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / (3600 * 24));
  const hours = Math.floor((totalSec % (3600 * 24)) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;

  const pad2 = (n) => String(n).padStart(2, "0");

  const text =
    days > 0
      ? `${days}d ${pad2(hours)}h ${pad2(mins)}m ${pad2(secs)}s`
      : `${pad2(hours)}h ${pad2(mins)}m ${pad2(secs)}s`;

  return { ended: false, text };
}

function pickFeaturedFromList(list) {
  const arr = Array.isArray(list) ? list : [];
  if (!arr.length) return null;

  const featured = arr.filter((x) => x && x.isFeatured);
  const sortKey = (x) =>
    Number.isFinite(Number(x?.sort)) ? Number(x.sort) : 999999;

  // If you marked any as featured, pick the best one
  if (featured.length) {
    return featured.slice().sort((a, b) => {
      const sA = sortKey(a) - sortKey(b);
      if (sA !== 0) return sA;
      const tA = safeDate(a?.startAt)?.getTime() ?? 9e15;
      const tB = safeDate(b?.startAt)?.getTime() ?? 9e15;
      return tA - tB;
    })[0];
  }

  // Otherwise pick the next upcoming event; fallback to earliest start
  const now = Date.now();
  const upcoming = arr
    .filter((x) => (safeDate(x?.startAt)?.getTime() ?? 0) >= now)
    .sort(
      (a, b) =>
        (safeDate(a?.startAt)?.getTime() ?? 9e15) -
        (safeDate(b?.startAt)?.getTime() ?? 9e15),
    );

  if (upcoming.length) return upcoming[0];

  return arr
    .slice()
    .sort(
      (a, b) =>
        (safeDate(a?.startAt)?.getTime() ?? 9e15) -
        (safeDate(b?.startAt)?.getTime() ?? 9e15),
    )[0];
}

export default function FeaturedTrainingBanner() {
  const nav = useNavigate();
  const [t, setT] = useState(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let ok = true;

    (async () => {
      try {
        // ✅ this route exists in your backend: GET /ptrainings/events
        const { data } = await api.get("/ptrainings/events");
        const picked = pickFeaturedFromList(data);
        if (ok) setT(picked);
      } catch {
        // If this fails, just don't show the banner (no crashing)
        if (ok) setT(null);
      }
    })();

    return () => {
      ok = false;
    };
  }, []);

  const ebEndsAt = useMemo(() => {
    const ends = t?.pricing?.earlyBird?.endsAt;
    return ends ? safeDate(ends) : null;
  }, [t]);

  useEffect(() => {
    if (!ebEndsAt) return;
    const id = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, [ebEndsAt]);

  const countdown = useMemo(() => {
    if (!ebEndsAt) return null;
    return getCountdownParts(ebEndsAt);
  }, [ebEndsAt, tick]);

  if (!t) return null;

  const trainingKey = t?.slug || t?._id;
  const to = `/ptrainings/${encodeURIComponent(String(trainingKey || ""))}`;

  const loc = t?.location || {};
  const locationLine = [loc.name, loc.address, loc.city, loc.state]
    .filter(Boolean)
    .join(" • ");

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-6">
      <div
        role="button"
        tabIndex={0}
        onClick={() => nav(to)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") nav(to);
        }}
        className="
          rounded-2xl border bg-gradient-to-r from-blue-50 to-white
          p-5 sm:p-6
          flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4
          cursor-pointer hover:shadow-md transition
        "
        title="Click to view full training details"
      >
        <div className="min-w-0">
          <div className="text-sm font-semibold text-blue-700">
            ADLM Physical Training
          </div>

          <div className="text-xl sm:text-2xl font-bold mt-1 break-words">
            {t.title}
          </div>

          <div className="mt-2 text-sm text-slate-700 flex flex-col gap-1">
            <div>
              <span className="font-semibold">Date:</span>{" "}
              {fmtDateRange(t.startAt, t.endAt)}
            </div>

            <div className="break-words">
              <span className="font-semibold">Location:</span>{" "}
              {locationLine || "—"}
            </div>

            {countdown ? (
              <div className="mt-2 inline-flex w-fit items-center gap-2 px-3 py-1 rounded-full border bg-white">
                <span className="text-xs font-semibold text-slate-700">
                  Earlybird ends in:
                </span>
                <span
                  className={`text-xs font-bold ${
                    countdown.ended ? "text-red-600" : "text-green-700"
                  }`}
                >
                  {countdown.text}
                </span>
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              nav(to);
            }}
            className="px-4 py-2 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700"
          >
            View Details
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              nav(to);
            }}
            className="px-4 py-2 rounded-xl border font-semibold hover:bg-white"
          >
            Register →
          </button>
        </div>
      </div>
    </div>
  );
}
