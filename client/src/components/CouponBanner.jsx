import React from "react";
import dayjs from "dayjs";

export default function CouponBanner({ banner, onClose }) {
  if (!banner) return null;

  const text =
    banner.bannerText?.trim() ||
    `Use code ${banner.code} to get ${
      banner.type === "percent"
        ? `${banner.value}% off`
        : `${banner.currency} ${banner.value} off`
    }`;

  const duration =
    banner.startsAt || banner.endsAt
      ? ` (${
          banner.startsAt ? dayjs(banner.startsAt).format("MMM D") : "Now"
        } → ${
          banner.endsAt ? dayjs(banner.endsAt).format("MMM D") : "No expiry"
        })`
      : "";

  return (
    <div className="w-full bg-blue-600 text-white px-3 py-2">
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
        <div className="text-sm">
          <b className="mr-2">{banner.code}</b>
          {text}
          <span className="opacity-90">{duration}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="text-xs bg-white/15 px-2 py-1 rounded"
            onClick={() => navigator.clipboard?.writeText(banner.code)}
          >
            Copy code
          </button>
          <button
            className="text-xs bg-white/15 px-2 py-1 rounded"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
