import React from "react";
import dayjs from "dayjs";
import { API_BASE } from "../config";

export default function CouponBanner() {
  const [coupon, setCoupon] = React.useState(null);
  const [hidden, setHidden] = React.useState(false);

  React.useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/coupons/banner`);
        const json = await res.json();
        const c = json?.coupon || null;

        if (!c) return;

        // allow dismiss per coupon code
        const dismissed = localStorage.getItem(`bannerDismissed:${c.code}`);
        if (dismissed === "1") {
          setHidden(true);
          return;
        }

        setCoupon(c);
      } catch {
        // ignore banner errors
      }
    })();
  }, []);

  if (!coupon || hidden) return null;

  const ends = coupon.endsAt
    ? dayjs(coupon.endsAt).format("MMM D, YYYY")
    : null;

  return (
    <div className="w-full bg-slate-900 text-white">
      <div className="max-w-6xl mx-auto px-3 py-2 flex items-center justify-between gap-3">
        <div className="text-sm">
          <span className="font-semibold">Promo:</span>{" "}
          {coupon.bannerText?.trim()
            ? coupon.bannerText
            : `Use code ${coupon.code} for discount`}
          {" · "}
          <span className="font-semibold">{coupon.code}</span>
          {ends ? (
            <>
              {" · "}
              <span className="text-slate-200">Valid till {ends}</span>
            </>
          ) : null}
        </div>

        <button
          className="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20"
          onClick={() => {
            localStorage.setItem(`bannerDismissed:${coupon.code}`, "1");
            setHidden(true);
          }}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
