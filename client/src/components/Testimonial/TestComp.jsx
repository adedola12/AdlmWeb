// src/components/TestComp.jsx
import React from "react";

const API_BASE = import.meta.env.VITE_API_BASE || "";

// Logo component: use image if available, otherwise fall back to code text
function CompanyLogo({ code, name, logoUrl }) {
  const [imgError, setImgError] = React.useState(false);
  const showImage = logoUrl && !imgError;

  return (
    <div className="flex items-center justify-center h-9 w-9 md:h-10 md:w-10 rounded-md bg-[#1E4AAE] text-white text-[10px] md:text-xs font-semibold overflow-hidden">
      {showImage ? (
        <img
          src={logoUrl}
          alt={name}
          className="w-full h-full object-contain"
          onError={() => setImgError(true)}
        />
      ) : (
        <span>{code}</span>
      )}
    </div>
  );
}

const TestComp = () => {
  const [companies, setCompanies] = React.useState([]);
  const [stats, setStats] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        setLoading(true);
        setError("");

        const [cRes, sRes] = await Promise.all([
          fetch(`${API_BASE}/showcase/companies`),
          fetch(`${API_BASE}/showcase/stats`),
        ]);

        if (!cRes.ok) throw new Error("Failed to load companies");
        if (!sRes.ok) throw new Error("Failed to load stats");

        const cData = await cRes.json();
        const sData = await sRes.json();

        if (!mounted) return;
        setCompanies(cData.items || []);
        setStats(sData || null);
      } catch (err) {
        console.error(err);
        if (mounted) setError(err.message || "Error loading data");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, []);

  const statCards = stats
    ? [
        {
          label: "Companies Trained",
          value: `${stats.companiesTrained?.toLocaleString?.() || 0}+`,
        },
        {
          label: "Employees Trained",
          value: `${stats.employeesTrained?.toLocaleString?.() || 0}+`,
        },
        {
          label: "Training Sessions",
          value: `${stats.trainingSessions?.toLocaleString?.() || 0}+`,
        },
        {
          label: "Training Rating",
          value: `${stats.trainingRating || "0"}/5`,
        },
      ]
    : [];

  return (
    <section className="w-full bg-white py-12 md:py-16 px-4">
      {/* Heading + subtitle */}
      <div className="max-w-6xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 text-blue-800 text-sm md:text-base">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-blue-400 text-xs">
            👥
          </span>
          <span className="font-medium text-1xl md:text-2xl lg:text-3xl ">
            Companies We&apos;ve Trained
          </span>
        </div>

        <p className="mt-2 text-xs md:text-sm text-slate-600">
          Over {stats?.companiesTrained || 500}+ companies have completed our
          comprehensive training programs
        </p>
      </div>

      {/* Companies card */}
      <div className="mt-8 max-w-6xl mx-auto">
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm px-4 py-6 md:px-8 md:py-8">
          {loading && (
            <div className="text-center text-sm text-slate-500 py-4">
              Loading companies…
            </div>
          )}
          {error && !loading && (
            <div className="text-center text-sm text-red-600 py-4">{error}</div>
          )}
          {!loading && !error && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-5">
              {companies.map((c) => (
                <div
                  key={c._id || c.code}
                  className="
                    group relative bg-white rounded-xl border border-slate-100
                    shadow-[0_1px_3px_rgba(15,23,42,0.06)]
                    px-4 py-3 flex flex-col items-center text-center
                    transition-transform duration-200 ease-out
                    hover:-translate-y-1 hover:shadow-lg
                  "
                >
                  <CompanyLogo
                    code={c.code}
                    name={c.name}
                    logoUrl={c.logoUrl}
                  />

                  <div className="mt-2 text-[11px] md:text-xs font-medium text-slate-800">
                    {c.name}
                  </div>
                  <div className="text-[10px] md:text-[11px] text-slate-500 mt-0.5">
                    {c.location}
                  </div>

                  {/* hover pop-up / tooltip */}
                  <div
                    className="
                      pointer-events-none absolute left-1/2 -bottom-10
                      -translate-x-1/2 translate-y-1
                      rounded-md bg-slate-900 text-white text-[10px] md:text-[11px]
                      px-2 py-1 shadow-lg opacity-0
                      group-hover:opacity-100 group-hover:translate-y-0
                      transition-all duration-200 ease-out
                      whitespace-nowrap
                    "
                  >
                    {c.name} · {c.location}
                  </div>
                </div>
              ))}
              {companies.length === 0 && (
                <div className="col-span-full text-center text-sm text-slate-500 py-4">
                  No companies added yet.
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Stats row */}
      {!loading && !error && (
        <div className="mt-8 max-w-6xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          {statCards.map((s) => (
            <div
              key={s.label}
              className="
                bg-white border border-slate-200 rounded-xl shadow-sm
                px-4 py-4 text-center
                transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-md
              "
            >
              <div className="text-lg md:text-xl font-semibold text-slate-900">
                {s.value}
              </div>
              <div className="mt-1 text-[11px] md:text-xs text-slate-500">
                {s.label}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

export default TestComp;
