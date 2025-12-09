// src/components/TestInd.jsx
import React from "react";

const companies = [
  { code: "SC", name: "Skyline Construction", logo: "/logos/sc.png" },
  { code: "BRS", name: "BuildRight Solutions", logo: "/logos/brs.png" },
  { code: "MI", name: "Metro Infrastructure", logo: "/logos/mi.png" },
  { code: "GBE", name: "GreenBuild Enterprises", logo: "/logos/gbe.png" },
  { code: "PC", name: "Premier Contractors", logo: "/logos/pc.png" },
  { code: "UDC", name: "Urban Development Co.", logo: "/logos/udc.png" },
  { code: "TBI", name: "TechBuild Industries", logo: "/logos/tbi.png" },
  { code: "CBG", name: "Coastal Builders Group", logo: "/logos/cbg.png" },
  { code: "PB", name: "Precision Builders", logo: "/logos/pb.png" },
  { code: "VC", name: "Valley Construction", logo: "/logos/vc.png" },
  { code: "SP", name: "Summit Projects", logo: "/logos/sp.png" },
  { code: "EC", name: "Elite Construction", logo: "/logos/ec.png" },
];

// logo with fallback to code text
function CompanyLogo({ code, name, logo }) {
  const [imgError, setImgError] = React.useState(false);
  const showImage = logo && !imgError;

  return (
    <div className="flex items-center justify-center w-12 h-12 md:w-14 md:h-14 rounded-md bg-[#1E4AAE] text-white text-sm md:text-base font-semibold overflow-hidden">
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

const TestInd = () => {
  return (
    <section className="w-full bg-white py-12 md:py-16 px-4">
      <div className="max-w-6xl mx-auto text-center">
        {/* Heading */}
        <div className="flex items-center justify-center gap-2 text-blue-800 text-sm md:text-base">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-blue-400 text-xs">
            ★
          </span>
          <span className="font-medium">Trusted By Industry Leaders</span>
        </div>

        {/* Subtitle */}
        <p className="mt-2 text-xs md:text-sm text-slate-600 max-w-2xl mx-auto">
          Leading construction companies worldwide rely on ConstructTech for
          their technology needs
        </p>

        {/* Company grid */}
        <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 justify-items-center">
          {companies.map((c) => (
            <div
              key={c.code}
              className="relative group w-full max-w-[170px] mx-auto"
            >
              {/* card */}
              <div
                className="
                  bg-white rounded-lg border border-slate-200 shadow-sm
                  px-4 py-5 flex flex-col items-center
                  transition-transform transition-shadow duration-200
                  hover:-translate-y-1 hover:shadow-lg hover:shadow-blue-100
                  cursor-default
                "
              >
                <CompanyLogo code={c.code} name={c.name} logo={c.logo} />
                <div className="mt-2 text-[11px] md:text-xs text-slate-700 text-center">
                  {c.name}
                </div>
              </div>

              {/* hover popup / tooltip */}
              <div
                className="
                  pointer-events-none
                  absolute -top-10 left-1/2 -translate-x-1/2
                  whitespace-nowrap rounded-md bg-slate-900 text-white
                  text-[10px] md:text-xs px-2 py-1 shadow-md
                  opacity-0 scale-95 translate-y-1
                  group-hover:opacity-100 group-hover:scale-100 group-hover:translate-y-0
                  transition-all duration-150
                  z-10
                "
              >
                {c.name}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default TestInd;
