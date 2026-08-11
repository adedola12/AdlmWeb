// src/components/common/OrganizationBadge.jsx
import React from "react";
import { IconBuilding, IconUser } from "../icons.jsx";

function UserIcon({ className = "" }) {
  return (
    <IconUser className={className} />
  );
}

function BuildingIcon({ className = "" }) {
  return (
    <IconBuilding className={className} />
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
    ? "bg-blue-50 text-adlm-blue-700 ring-blue-100"
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
