// src/components/TestHero.jsx
import React from "react";

const API_BASE = import.meta.env.VITE_API_BASE || "";

/** Simple count-up animation that runs when `end` changes */
function CountUp({ end, duration = 1200, decimals = 0, suffix = "" }) {
  const [value, setValue] = React.useState(0);

  React.useEffect(() => {
    let frameId;
    const startTime = performance.now();

    const step = (now) => {
      const progress = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
      const current = end * eased;

      setValue(current);
      if (progress < 1) {
        frameId = requestAnimationFrame(step);
      }
    };

    frameId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frameId);
  }, [end, duration]);

  const formatted =
    decimals > 0 ? value.toFixed(decimals) : Math.round(value).toLocaleString();

  return (
    <span>
      {formatted}
      {suffix}
    </span>
  );
}

function StatCard({ value, label }) {
  return (
    <div className="bg-[#1E4AAE] rounded-md py-4 px-3 md:py-5 md:px-4 flex flex-col items-center justify-center">
      <div className="text-lg md:text-xl font-semibold mb-1">{value}</div>
      <div className="text-[11px] md:text-xs opacity-80">{label}</div>
    </div>
  );
}

const TestHero = () => {
  const [stats, setStats] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        setLoading(true);
        setError("");
        const res = await fetch(`${API_BASE}/showcase/stats`);
        if (!res.ok) throw new Error("Failed to load testimonial stats");
        const data = await res.json();
        if (!mounted) return;
        setStats(data || null);
      } catch (err) {
        console.error(err);
        if (mounted) setError(err.message || "Error loading stats");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, []);

  // Prefer hero-specific fields if your API returns them, otherwise fall back
  const happyCustomers =
    stats?.heroHappyCustomers ?? stats?.companiesTrained ?? 0;
  const averageRating = stats?.heroAverageRating ?? stats?.trainingRating ?? 0;
  const satisfactionRate = stats?.heroSatisfactionRate ?? 0;
  const countriesServed = stats?.heroCountriesServed ?? 0;

  const title = stats?.heroTitle || "Customer Testimonials";
  const subtitle =
    stats?.heroSubtitle ||
    "Hear from over 10,000+ satisfied customers who have transformed their construction projects with ConstructTech";

  return (
    <section className="w-full bg-[#163E96] text-white py-12 md:py-16 px-4">
      <div className="max-w-5xl mx-auto text-center">
        {/* Heading */}
        <p className="text-2xl md:text-3xl lg:text-4xl font-semibold mb-2 tracking-wide">
          {title}
        </p>
        <p className="text-xs md:text-sm lg:text-base max-w-3xl mx-auto leading-relaxed text-white/80">
          {subtitle}
        </p>

        {/* Stats row */}
        {loading && (
          <div className="mt-8 text-sm text-blue-100">Loading stats…</div>
        )}
        {error && !loading && (
          <div className="mt-8 text-sm text-red-200">{error}</div>
        )}
        {!loading && !error && (
          <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
            <StatCard
              label="Happy Customers"
              value={<CountUp end={happyCustomers} suffix="+" />}
            />
            <StatCard
              label="Average Rating"
              value={<CountUp end={averageRating} decimals={1} />}
            />
            <StatCard
              label="Satisfaction Rate"
              value={<CountUp end={satisfactionRate} suffix="%" />}
            />
            <StatCard
              label="Countries Served"
              value={<CountUp end={countriesServed} suffix="+" />}
            />
          </div>
        )}
      </div>
    </section>
  );
};

export default TestHero;
