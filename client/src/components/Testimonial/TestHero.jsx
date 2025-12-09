// src/components/TestHero.jsx
import React from "react";

/** Simple count-up animation that runs on mount */
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

const TestHero = () => {
  return (
    <section className="w-full bg-[#163E96] text-white py-12 md:py-16 px-4">
      <div className="max-w-5xl mx-auto text-center">
        {/* Heading */}
        <p className="text-xs md:text-sm mb-2 tracking-wide">
          Customer Testimonials
        </p>
        <p className="text-sm md:text-base max-w-3xl mx-auto leading-relaxed">
          Hear from over 10,000+ satisfied customers who have transformed their
          construction projects with ConstructTech
        </p>

        {/* Stats row */}
        <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          <StatCard
            label="Happy Customers"
            value={<CountUp end={10000} suffix="+" />}
          />
          <StatCard
            label="Average Rating"
            value={<CountUp end={4.8} decimals={1} />}
          />
          <StatCard
            label="Satisfaction Rate"
            value={<CountUp end={98} suffix="%" />}
          />
          <StatCard
            label="Countries Served"
            value={<CountUp end={50} suffix="+" />}
          />
        </div>
      </div>
    </section>
  );
};

function StatCard({ value, label }) {
  return (
    <div className="bg-[#1E4AAE] rounded-md py-4 px-3 md:py-5 md:px-4 flex flex-col items-center justify-center">
      <div className="text-lg md:text-xl font-semibold mb-1">{value}</div>
      <div className="text-[11px] md:text-xs opacity-80">{label}</div>
    </div>
  );
}

export default TestHero;
