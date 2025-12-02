// src/pages/Trainings.jsx
import React, { useEffect, useState } from "react";

function formatDate(dateStr) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function modeBadgeClasses(mode) {
  switch (mode) {
    case "online":
      return "bg-green-500";
    case "office":
      return "bg-blue-500";
    case "conference":
      return "bg-purple-500";
    default:
      return "bg-gray-500";
  }
}

function TrainingCard({ training }) {
  const {
    title,
    description,
    mode,
    date,
    city,
    country,
    venue,
    attendees,
    tags = [],
    imageUrl,
  } = training;

  const locationText = [city, country].filter(Boolean).join(", ");

  return (
    <div className="bg-white rounded-[10px] shadow-md flex flex-col overflow-hidden">
      {/* Image */}
      <div className="relative h-48 w-full overflow-hidden">
        <img
          src={imageUrl}
          alt={title}
          className="h-full w-full object-cover"
          loading="lazy"
        />
        <span
          className={`absolute top-3 right-3 px-3 py-1 rounded-full text-xs text-white capitalize ${modeBadgeClasses(
            mode
          )}`}
        >
          {mode}
        </span>
      </div>

      {/* Content */}
      <div className="flex flex-col gap-3 p-5 flex-1">
        <h3 className="text-gray-900 text-base font-semibold line-clamp-2">
          {title}
        </h3>

        {description && (
          <p className="text-sm text-gray-600 line-clamp-3">{description}</p>
        )}

        <div className="space-y-1 text-sm text-gray-600">
          <p>
            <span className="font-medium">Date:</span> {formatDate(date)}
          </p>
          {(locationText || venue) && (
            <p>
              <span className="font-medium">Location:</span>{" "}
              {[locationText, venue].filter(Boolean).join(" • ")}
            </p>
          )}
          {attendees ? (
            <p>
              <span className="font-medium">Attendees:</span> {attendees}
            </p>
          ) : null}
        </div>

        {/* Tags */}
        {tags?.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex px-2 py-1 rounded bg-gray-100 text-xs text-gray-700"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Trainings() {
  const [stats, setStats] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function loadTrainings() {
      try {
        setLoading(true);
        setError("");

        const res = await fetch("/trainings", {
          credentials: "include",
        });
        if (!res.ok) throw new Error("Failed to load trainings");

        const data = await res.json();
        if (!isMounted) return;

        setStats(data.stats);
        setItems(data.items || []);
      } catch (err) {
        console.error(err);
        if (isMounted) setError(err.message || "Error loading trainings");
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadTrainings();
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="min-h-screen bg-white">
      {/* Header Banner */}
      <section className="w-full bg-blue-900 text-white pt-20 pb-12 px-4 md:px-12 lg:px-24">
        <div className="max-w-6xl mx-auto space-y-6">
          <div>
            <p className="text-sm md:text-base opacity-80">
              Training &amp; Events Gallery
            </p>
            <h1 className="mt-2 text-2xl md:text-3xl font-semibold">
              Explore our trainings, workshops & conferences
            </h1>
            <p className="mt-2 text-sm md:text-base text-blue-100 max-w-2xl">
              Stay up to date with ADLM training programs – from online sessions
              to in-office trainings and major conferences.
            </p>
          </div>

          {/* Stats cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
            <StatCard label="Total Events" value={stats?.totalEvents ?? 0} />
            <StatCard
              label="Online Sessions"
              value={stats?.onlineSessions ?? 0}
            />
            <StatCard
              label="Office Trainings"
              value={stats?.officeTrainings ?? 0}
            />
            <StatCard label="Conferences" value={stats?.conferences ?? 0} />
            <StatCard
              label="Total Attendees"
              value={stats?.totalAttendees ?? 0}
            />
          </div>
        </div>
      </section>

      {/* Gallery */}
      <section className="px-4 md:px-8 lg:px-24 py-10 md:py-14 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          {loading && (
            <p className="text-gray-600 text-sm">Loading trainings…</p>
          )}
          {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
          {!loading && !error && items.length === 0 && (
            <p className="text-gray-600 text-sm">
              No trainings have been added yet.
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-4">
            {items.map((item) => (
              <TrainingCard key={item._id} training={item} />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="bg-white/10 border border-white/10 rounded-[10px] px-4 py-3 md:px-4 md:py-4 backdrop-blur-sm">
      <p className="text-xl md:text-2xl font-semibold text-white">{value}</p>
      <p className="mt-1 text-[11px] md:text-xs text-blue-100">{label}</p>
    </div>
  );
}
