// Title and description for every indexable route, in one place.
//
// WHY ONE FILE
// These strings were held twice: once in src/api/meta.js for the server, once
// in each page's <Seo> for the browser. Two copies of the same sentence drift,
// and when they drift the page tells a crawler one thing and a social scraper
// another. Both sides now read this file, so there is only one sentence to
// change and no way to change half of it.
//
// LENGTH RULES, AND WHY THEY ARE NOT ARBITRARY
//   title       under 60 characters INCLUDING the " | ADLM Studio" suffix.
//               Google truncates past roughly that, and a truncated title
//               usually loses the words at the end, which are the specific ones.
//   description 140 to 155 characters. Under 140 wastes the slot; over 155 gets
//               cut mid-sentence.
// scripts/seo-check.mjs enforces both, so a bad entry fails the build check
// rather than quietly shipping.
//
// VOICE: direct and specific. Short declarative sentences. No em dashes, no
// "revolutionise", "empower" or "seamless". Say what the thing does.

export const SITE = "https://www.adlmstudio.net";
export const SITE_NAME = "ADLM Studio";

/** "Learn BIM" -> "Learn BIM | ADLM Studio", without doubling the brand. */
export function fullTitle(title) {
  if (!title) return SITE_NAME;
  return title.includes(SITE_NAME) ? title : `${title} | ${SITE_NAME}`;
}

export const PAGE_META = {
  "/": {
    title: "BIM and quantity surveying software",
    description:
      "ADLM Studio builds takeoff, rate build-up and cost management tools for quantity surveyors, and trains the Nigerian firms that use them daily.",
  },
  "/products": {
    title: "Software, plugins and QS training",
    description:
      "Quantity takeoff plugins for Revit, ArchiCAD and PlanSwift, plus automated rate build-ups and cost management. Subscription pricing in naira.",
  },
  "/about": {
    title: "About ADLM Studio",
    description:
      "A Nigerian construction technology company digitising quantity surveying end to end. Founded 2018 in Lagos. Over 800 AEC professionals trained.",
  },
  "/learn": {
    title: "BIM and QS training courses",
    description:
      "Self-paced and cohort training for quantity surveyors. Revit, Navisworks, MS Project, Power BI, 4D and 5D BIM, and AI for construction cost work.",
  },
  "/trainings": {
    title: "Training and events",
    description:
      "Upcoming ADLM Studio BIM and quantity surveying training, in person and online. Corporate programmes for QS firms and contractors across Nigeria.",
  },
  "/testimonials": {
    title: "Customer testimonials",
    description:
      "What quantity surveyors, contractors and consultancies say about using ADLM Studio software and training on live construction projects in Nigeria.",
  },
  "/whats-new": {
    title: "Release notes for every product",
    description:
      "What shipped and when across QUIV, HERON, RateGen, the MEP suite, CiviQ and ADLM Cloud. One page for each product, updated with every release.",
  },
  "/support": {
    title: "Support and technical help",
    description:
      "Get help with ADLM plugins, licensing and installation. Start with the assistant for instant answers, or raise a ticket for a remote session.",
  },
  "/quote": {
    title: "Build a quotation",
    description:
      "Pick the software you need, set the number of users, and add training. You get an instant estimate in naira or dollars that you can print or email.",
  },
  "/freebies": {
    title: "Free QS and BIM resources",
    description:
      "Free templates and tools for quantity surveyors. Rate templates, bill of quantities formats and BIM starter files you can use on real projects.",
  },

  // THE PAGES HIS NAV LINKS TO.
  //
  // These eleven were mounted on public paths in the same change that added
  // them to lib/dsPublicPaths.js. Without an entry here each one falls back to
  // the house title and the house sentence, so eleven different pages would
  // share one search result and one WhatsApp card. src/api/meta.js reads this
  // file for the server tags and <Seo> reads it in the browser, so one entry
  // covers both.
  "/pricing": {
    title: "Software and training pricing",
    description:
      "What every ADLM plugin and course costs per month and per year, in naira. Install fees are listed, and multi-seat pricing is quoted on request.",
  },
  "/solutions/firms": {
    title: "QS software for firms",
    description:
      "One rate library for every surveyor in the firm, so six people stop pricing the same item six ways. Multi-seat licensing for QS consultancies.",
  },
  "/solutions/professionals": {
    title: "Software for individual surveyors",
    description:
      "Everything a practice has, without the practice. Buy a licence, install it, and be measuring the same afternoon. From ₦5,000 a month per tool.",
  },
  "/solutions/students": {
    title: "BIM training for students",
    description:
      "A six-week certificated BIM and QS course, a free lesson library, and a capstone project you can show an employer. Self-paced, priced for students.",
  },
  "/solutions/institutions": {
    title: "BIM training for institutions",
    description:
      "Chapter workshops, university programmes and departmental training, delivered on site and on your own projects. Thirty events run across Nigeria.",
  },
  "/how-it-works": {
    title: "How ADLM works",
    description:
      "What you get when you buy an ADLM licence, and how it reaches the machines you work on. One account, the Installer Hub, and sync across products.",
  },
  "/ada": {
    title: "Ada, the ADLM assistant",
    description:
      "Ada is the chat on this site and the assistant inside your account. She reads your own rates, gangs and projects, and nothing else on the internet.",
  },
  "/mobile": {
    title: "ADLM on your phone",
    description:
      "The same ADLM account on your phone. Approvals, documents and your rate library, away from the desk. No second licence and nothing else to buy.",
  },
  "/contact": {
    title: "Contact and support",
    description:
      "Reach ADLM Studio by WhatsApp or email for sales, support, training or press. Licence quotes, multi-seat pricing and demos on your own project.",
  },
  "/careers": {
    title: "Careers at ADLM Studio",
    description:
      "Work on construction software that Nigerian quantity surveyors use every day. A small team in Lagos, building for a market we work in ourselves.",
  },
  "/press": {
    title: "Press and brand assets",
    description:
      "Company facts, logos and brand assets for journalists and conference organisers, plus a direct press contact at ADLM Studio in Lagos, Nigeria.",
  },

  // Search landing pages. Each targets one phrase and links to the product
  // that answers it.
  "/quantity-surveying-software-nigeria": {
    title: "Quantity surveying software in Nigeria",
    description:
      // Not "used on live projects since 2018". The company was founded in
      // 2018; the first plugin shipped in 2022, per the About page timeline.
      "Takeoff, rate build-up and cost management software built for Nigerian quantity surveyors. Priced in naira, by a Lagos firm founded in 2018.",
  },
  "/bim-software-nigeria": {
    title: "BIM software in Nigeria",
    description:
      "BIM tools and training for Nigerian construction firms. Revit and ArchiCAD quantity takeoff, model checking, and 4D and 5D workflows for local practice.",
  },
  "/construction-technology-company-nigeria": {
    title: "Construction technology company in Nigeria",
    description:
      "ADLM Studio is a Lagos construction technology company. RC 7440343, founded 2018, Official Technical Partner to NIQS, over 800 professionals trained.",
  },
  "/revit-quantity-takeoff-plugin": {
    title: "Revit quantity takeoff plugin",
    description:
      "QUIV reads quantities straight from your Revit model and writes a priced bill of quantities. No manual measurement, no exporting to spreadsheets first.",
  },
  "/planswift-takeoff-software-nigeria": {
    title: "PlanSwift takeoff software in Nigeria",
    description:
      "HERON does 2D drawing takeoff for quantity surveyors working from PDFs and CAD. Measure on the drawing, get a priced bill, and keep the audit trail.",
  },
  "/construction-rate-database-nigeria": {
    title: "Construction rate database for Nigeria",
    description:
      "RateGen builds rates from first principles using Nigerian material, labour and plant costs. Change one input and every rate that uses it updates.",
  },
};

/** Metadata for a path, or undefined when the route carries none. */
export function metaFor(pathname) {
  const clean = String(pathname || "/").replace(/\/+$/, "") || "/";
  return PAGE_META[clean];
}
