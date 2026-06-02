// src/pages/AdminFlyers.jsx
// Admin Flyer Engine — fill a form, see a live 1080×1350 preview, export
// PNG/PDF (or a 4-layout .zip pack), and save flyers to the server library.
import React from "react";
import { useAuth } from "../store.jsx";
import FlyerStudio from "../features/flyers/FlyerStudio.jsx";

export default function AdminFlyers() {
  const { accessToken } = useAuth();

  return (
    <div className="max-w-[1400px] mx-auto">
      <div className="mb-3">
        <h1 className="text-xl font-bold text-slate-900 dark:text-adlm-dark-text">
          Flyer Engine
        </h1>
        <p className="text-sm text-slate-500 dark:text-adlm-dark-muted">
          Create on-brand ADLM flyers — announcements, countdowns, launches, and event promos.
        </p>
      </div>

      <FlyerStudio accessToken={accessToken} />
    </div>
  );
}
