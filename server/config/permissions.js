// server/config/permissions.js
// Single source of truth for admin "areas" used by the RBAC layer. Each area
// maps to one admin section / route group. A role's `permissions` array holds
// the area keys it may access. The "admin" role is a superuser (all areas,
// implicitly via isSuperAdmin). Only `staffGrantable` areas may be assigned to
// mini-admin / custom roles; the rest stay admin-exclusive.

export const ADMIN_AREAS = [
  // ── Staff-grantable (assignable to mini-admin / custom roles) ──
  { key: "trainings", label: "Online Trainings", group: "Content", staffGrantable: true },
  { key: "learn", label: "Learn / Videos", group: "Content", staffGrantable: true },
  { key: "showcase", label: "Testimonials", group: "Content", staffGrantable: true },
  { key: "freebies", label: "Freebies", group: "Content", staffGrantable: true },
  { key: "flyers", label: "Flyer Engine", group: "Content", staffGrantable: true },
  { key: "rategen", label: "RateGen Prices", group: "Pricing", staffGrantable: true },
  { key: "invoices", label: "Invoices", group: "Finance", staffGrantable: true },
  { key: "proposals", label: "Proposals", group: "Finance", staffGrantable: true },
  { key: "users", label: "Users", group: "People", staffGrantable: true },

  // ── Admin-exclusive (never grantable — always require the admin superuser) ──
  { key: "products", label: "Products", group: "Store", staffGrantable: false },
  { key: "courses", label: "Courses", group: "Store", staffGrantable: false },
  { key: "grading", label: "Course Grading", group: "Store", staffGrantable: false },
  { key: "coupons", label: "Coupons", group: "Store", staffGrantable: false },
  { key: "ptrainings", label: "Physical Trainings", group: "Store", staffGrantable: false },
  { key: "purchases", label: "Purchases & Entitlements", group: "Core", staffGrantable: false },
  { key: "settings", label: "Settings", group: "Core", staffGrantable: false },
  { key: "roles", label: "Roles & Access (UAC)", group: "Core", staffGrantable: false },
];

export const ALL_AREA_KEYS = ADMIN_AREAS.map((a) => a.key);
export const STAFF_GRANTABLE_KEYS = ADMIN_AREAS.filter((a) => a.staffGrantable).map(
  (a) => a.key,
);

export const isStaffGrantable = (key) => STAFF_GRANTABLE_KEYS.includes(key);

// Filter an arbitrary list down to valid, staff-grantable area keys (used when
// validating role-permission payloads from the UAC editor).
export function sanitizePermissions(list) {
  const wanted = new Set(Array.isArray(list) ? list.map(String) : []);
  return STAFF_GRANTABLE_KEYS.filter((k) => wanted.has(k));
}
