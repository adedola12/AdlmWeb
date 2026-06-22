// src/features/admin/AdminLauncher.jsx
// Permission-aware grid of admin tool cards. Each card is gated by its admin
// area via can() — a user only sees the tools they're allowed to open. Reused on
// the Profile page and the /admin hub. Replaces the old flat button list.
import React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../store.jsx";
import { can } from "../../utils/roles.js";
import { Reveal } from "../../components/effects.jsx";
import {
  FiShoppingCart, FiShield, FiUsers, FiCalendar, FiMapPin, FiPlayCircle,
  FiBookOpen, FiCheckSquare, FiDollarSign, FiPlusSquare, FiFileText,
  FiClipboard, FiBox, FiTag, FiStar, FiGift, FiImage, FiBell,
} from "react-icons/fi";

// area = the permission key that gates the card (see server/config/permissions.js)
const TOOLS = [
  { area: "purchases", to: "/admin", label: "Admin Hub", desc: "Purchases, subscriptions & installs", icon: FiShoppingCart },
  { area: "roles", to: "/admin/roles", label: "Roles & Access", desc: "Manage roles & permissions (UAC)", icon: FiShield },
  { area: "users", to: "/admin/users-lite", label: "Users", desc: "Directory & subscriptions", icon: FiUsers },
  { area: "trainings", to: "/admin/trainings", label: "Trainings", desc: "Online trainings & events", icon: FiCalendar },
  { area: "ptrainings", to: "/admin/ptrainings", label: "Physical Trainings", desc: "In-person events & enrolment", icon: FiMapPin },
  { area: "learn", to: "/admin/learn", label: "Learn", desc: "Video courses & library", icon: FiPlayCircle },
  { area: "courses", to: "/admin/courses", label: "Courses", desc: "Paid online courses", icon: FiBookOpen },
  { area: "grading", to: "/admin/course-grading", label: "Grading", desc: "Grade course submissions", icon: FiCheckSquare },
  { area: "rategen", to: "/admin/rategen", label: "RateGen Prices", desc: "Material & labour prices", icon: FiDollarSign },
  { area: "rategen", to: "/admin/rategen/add-rate", label: "Build Rates", desc: "Create & edit rate library", icon: FiPlusSquare },
  { area: "invoices", to: "/admin/invoices", label: "Invoices", desc: "Client invoices & payments", icon: FiFileText },
  { area: "proposals", to: "/admin/proposals", label: "Proposals", desc: "Sales proposals", icon: FiClipboard },
  { area: "products", to: "/admin/products", label: "Products", desc: "Software catalogue & pricing", icon: FiBox },
  { area: "coupons", to: "/admin/coupons", label: "Coupons", desc: "Discount codes", icon: FiTag },
  { area: "showcase", to: "/admin/showcase", label: "Testimonials", desc: "Showcase & company logos", icon: FiStar },
  { area: "changelogs", to: "/admin/changelogs", label: "What's New", desc: "Product release notes", icon: FiBell },
  { area: "freebies", to: "/admin/freebies", label: "Freebies", desc: "Free resources", icon: FiGift },
  { area: "flyers", to: "/admin/flyers", label: "Flyer Engine", desc: "Design flyers & thumbnails", icon: FiImage },
];

export default function AdminLauncher({ title = "Admin tools", compact = false }) {
  const { user } = useAuth();
  const tools = TOOLS.filter((t) => can(user, t.area));
  if (!tools.length) return null;

  return (
    <div>
      {title ? <h2 className="font-semibold mb-3">{title}</h2> : null}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {tools.map((t, i) => {
          const Icon = t.icon;
          return (
            <Reveal key={t.to} delay={i * 25}>
              <Link
                to={t.to}
                className="group block h-full rounded-xl border border-slate-200 dark:border-adlm-dark-border bg-white dark:bg-adlm-dark-raised p-3.5 shadow-depth hover:shadow-depth-lg lift transition"
              >
                <span className="grid place-items-center w-10 h-10 rounded-lg bg-adlm-blue-700/10 text-adlm-blue-700 dark:text-adlm-blue-600 ring-1 ring-adlm-blue-700/15 group-hover:bg-adlm-blue-700 group-hover:text-white transition-colors">
                  <Icon className="w-5 h-5" />
                </span>
                <div className="mt-2.5 font-semibold text-sm">{t.label}</div>
                {!compact ? (
                  <div className="text-[11px] text-slate-500 dark:text-adlm-dark-muted leading-snug mt-0.5">
                    {t.desc}
                  </div>
                ) : null}
              </Link>
            </Reveal>
          );
        })}
      </div>
    </div>
  );
}
