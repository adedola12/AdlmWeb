// The promo-code banner across the top of the public pages.
//
// WHY IT MEASURES AND OFFSETS ITSELF
//
// The launch countdown strip (ds/DsLaunchStrip.jsx) is `position: fixed; top: 0`
// with z-index 120. This banner is in normal flow and is first in App.jsx's
// tree, so it sat at y=0 underneath the strip and was completely covered: from
// the day the countdown went up, every promo code the studio ran was invisible
// on every public page, while the admin screen showed the banner as live.
//
// So it starts below the strip (--launch-strip-h, which the strip publishes) and
// publishes its own height as --coupon-banner-h, which the two navs add to their
// own offset. Same contract as the strip's, in the same direction, so the stack
// is strip → banner → nav with nothing overlapping.

import React from "react";
import dayjs from "dayjs";

export default function CouponBanner({ banner, onClose }) {
  const ref = React.useRef(null);

  // Publish the height for the navs, and take it back down when the banner
  // goes, so a dismissed banner does not leave a gap under the nav.
  React.useEffect(() => {
    const root = document.documentElement;
    const el = ref.current;
    if (!el) {
      root.style.removeProperty("--coupon-banner-h");
      return undefined;
    }
    const set = () => root.style.setProperty("--coupon-banner-h", `${el.offsetHeight}px`);
    set();
    // The text wraps at narrow widths, so the height is not a constant.
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(set) : null;
    ro?.observe(el);
    window.addEventListener("resize", set);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", set);
      root.style.removeProperty("--coupon-banner-h");
    };
  }, [banner]);

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
    <div
      ref={ref}
      className="w-full bg-adlm-blue-700 text-white px-3 py-2"
      style={{ marginTop: "var(--launch-strip-h, 0px)" }}
    >
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
