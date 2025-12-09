// src/components/TestComp.jsx
import React from "react";

const companies = [
  { code: "A&S", name: "Anderson & Sons", location: "Boston, MA", logo: "" },
  { code: "B&A", name: "Brown & Associates", location: "Denver, CO", logo: "" },
  { code: "DC", name: "Delta Construction", location: "Atlanta, GA", logo: "" },
  { code: "EB", name: "Eclipse Builders", location: "Phoenix, AZ", logo: "" },
  { code: "FP", name: "Fusion Projects", location: "Portland, OR", logo: "" },

  {
    code: "HD",
    name: "Horizon Developments",
    location: "Nashville, TN",
    logo: "",
  },
  {
    code: "IC",
    name: "Imperial Construction",
    location: "Las Vegas, NV",
    logo: "",
  },
  {
    code: "JBC",
    name: "Jupiter Building Co",
    location: "Minneapolis, MN",
    logo: "",
  },
  {
    code: "KP",
    name: "Keystone Projects",
    location: "Philadelphia, PA",
    logo: "",
  },
  {
    code: "LC",
    name: "Lunar Contractors",
    location: "San Diego, CA",
    logo: "",
  },

  {
    code: "MB",
    name: "Meridian Builders",
    location: "Charlotte, NC",
    logo: "",
  },
  { code: "NC", name: "Nexus Construction", location: "Tampa, FL", logo: "" },
  { code: "OE", name: "Orbit Enterprises", location: "Columbus, OH", logo: "" },
  {
    code: "PP",
    name: "Pinnacle Projects",
    location: "Indianapolis, IN",
    logo: "",
  },
  { code: "QB", name: "Quantum Builders", location: "Baltimore, MD", logo: "" },

  {
    code: "RC",
    name: "Radius Construction",
    location: "Milwaukee, WI",
    logo: "",
  },
  {
    code: "SD",
    name: "Stellar Developments",
    location: "Kansas City, MO",
    logo: "",
  },
  {
    code: "TBG",
    name: "Titan Building Group",
    location: "Oklahoma City, OK",
    logo: "",
  },
  {
    code: "UC",
    name: "Unity Contractors",
    location: "Louisville, KY",
    logo: "",
  },
  { code: "VP", name: "Venex Projects", location: "Memphis, TN", logo: "" },
];

const stats = [
  { value: "500+", label: "Companies Trained" },
  { value: "15,000+", label: "Employees Trained" },
  { value: "1,200+", label: "Training Sessions" },
  { value: "4.9/5", label: "Training Rating" },
];

// Logo component: use image if available, otherwise fall back to code text
function CompanyLogo({ code, name, logo }) {
  const [imgError, setImgError] = React.useState(false);
  const showImage = logo && !imgError;

  return (
    <div className="flex items-center justify-center h-9 w-9 md:h-10 md:w-10 rounded-md bg-[#1E4AAE] text-white text-[10px] md:text-xs font-semibold overflow-hidden">
      {showImage ? (
        <img
          src={logo}
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
  return (
    <section className="w-full bg-white py-12 md:py-16 px-4">
      {/* Heading + subtitle */}
      <div className="max-w-6xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 text-blue-800 text-sm md:text-base">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-blue-400 text-xs">
            👥
          </span>
          <span className="font-medium">Companies We&apos;ve Trained</span>
        </div>

        <p className="mt-2 text-xs md:text-sm text-slate-600">
          Over 500+ companies have completed our comprehensive training programs
        </p>
      </div>

      {/* Companies card */}
      <div className="mt-8 max-w-6xl mx-auto">
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm px-4 py-6 md:px-8 md:py-8">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-5">
            {companies.map((c) => (
              <div
                key={c.code}
                className="
                  group relative bg-white rounded-xl border border-slate-100
                  shadow-[0_1px_3px_rgba(15,23,42,0.06)]
                  px-4 py-3 flex flex-col items-center text-center
                  transition-transform duration-200 ease-out
                  hover:-translate-y-1 hover:shadow-lg
                "
              >
                <CompanyLogo code={c.code} name={c.name} logo={c.logo} />

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
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="mt-8 max-w-6xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {stats.map((s) => (
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
    </section>
  );
};

export default TestComp;
