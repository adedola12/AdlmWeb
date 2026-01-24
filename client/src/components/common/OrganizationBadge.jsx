// src/components/common/OrganizationBadge.jsx
import React from "react";

function UserIcon({ className = "" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M20 21a8 8 0 10-16 0"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M12 12a4 4 0 100-8 4 4 0 000 8z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function BuildingIcon({ className = "" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M3 21h18"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M6 21V7a2 2 0 012-2h2v16"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M14 21V5a2 2 0 012-2h2v18"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M8.5 9.5h1M8.5 12.5h1M8.5 15.5h1"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Tiny badge used everywhere.
 * Fix: infer "organization" if seats > 1 even when licenseType is missing/wrong.
 */
export default function OrganizationBadge({
  licenseType = "personal",
  organization,
  organizationName,
  seats,
  className = "",
  showPersonal = true,
}) {
  const seatsNum =
    typeof seats === "number" ? seats : seats != null ? Number(seats) : null;

  const seatCount =
    Number.isFinite(seatsNum) && seatsNum > 0 ? Math.floor(seatsNum) : null;

  const lt = String(licenseType || "").toLowerCase();
  const name = String(organization?.name || organizationName || "").trim();

  // ✅ IMPORTANT: infer org if seatCount > 1 (multi-seat)
  const isOrg = lt === "organization" || (seatCount != null && seatCount > 1);

  if (!isOrg && !showPersonal) return null;

  const base =
    "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium ring-1 whitespace-nowrap";
  const tone = isOrg
    ? "bg-blue-50 text-blue-700 ring-blue-100"
    : "bg-slate-50 text-slate-600 ring-slate-200";

  return (
    <span className={`${base} ${tone} ${className}`}>
      {isOrg ? (
        <BuildingIcon className="w-3.5 h-3.5" />
      ) : (
        <UserIcon className="w-3.5 h-3.5" />
      )}

      <span>{isOrg ? "Organization" : "Personal"}</span>

      {isOrg && name ? <span className="opacity-60">·</span> : null}
      {isOrg && name ? (
        <span className="max-w-[180px] truncate">{name}</span>
      ) : null}

      {isOrg && seatCount ? <span className="opacity-60">·</span> : null}
      {isOrg && seatCount ? (
        <span>
          {seatCount} seat{seatCount === 1 ? "" : "s"}
        </span>
      ) : null}
    </span>
  );
}
