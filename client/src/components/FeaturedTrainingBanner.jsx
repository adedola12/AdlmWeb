// src/components/FeaturedTrainingBanner.jsx
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../http.js";

export default function FeaturedTrainingBanner() {
  const [t, setT] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/ptrainings/featured");
        if (data) setT(data);
      } catch {
        // silent
      }
    })();
  }, []);

  if (!t) return null;

  return (
    <div className="rounded-2xl border bg-gradient-to-r from-blue-50 to-white p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
      <div>
        <div className="text-sm font-semibold text-blue-700">
          ADLM Physical Training
        </div>
        <div className="text-xl font-bold mt-1">{t.title}</div>
        <div className="text-gray-600 mt-1">{t.description}</div>
      </div>

      <Link
        to={`/ptrainings/${t._id}`}
        className="px-4 py-2 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700"
      >
        Register for the Physical Class Now
      </Link>
    </div>
  );
}
