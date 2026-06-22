// src/components/AdminPageHeader.jsx
// Shared premium header for admin pages — navy hero with grid overlay + floating
// blobs, matching the Profile identity hero. Optional icon and right-aligned
// actions slot.
import React from "react";
import { Reveal } from "./effects.jsx";

export default function AdminPageHeader({ title, subtitle, icon: Icon, actions }) {
  return (
    <Reveal
      as="div"
      className="relative overflow-hidden rounded-2xl bg-adlm-navy text-white shadow-depth mb-6"
    >
      <div aria-hidden="true" className="absolute inset-0 grid-overlay opacity-50 mask-radial" />
      <div
        aria-hidden="true"
        className="absolute -top-16 right-8 w-64 h-64 rounded-full bg-adlm-blue-600/20 blur-3xl animate-float"
      />
      <div
        aria-hidden="true"
        className="absolute -bottom-16 left-1/4 w-56 h-56 rounded-full bg-adlm-orange/15 blur-3xl animate-float-slow"
      />

      <div className="relative p-5 md:p-7 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          {Icon ? (
            <span className="shrink-0 grid place-items-center w-11 h-11 rounded-xl bg-white/10 ring-1 ring-white/20">
              <Icon className="w-5 h-5" />
            </span>
          ) : null}
          <div className="min-w-0">
            <h1 className="text-xl md:text-2xl font-bold tracking-tight truncate">{title}</h1>
            {subtitle ? (
              <p className="text-sm text-blue-100/80 mt-0.5">{subtitle}</p>
            ) : null}
          </div>
        </div>
        {actions ? (
          <div className="flex items-center gap-2 flex-wrap">{actions}</div>
        ) : null}
      </div>
    </Reveal>
  );
}
