// schema.org payloads for the pages that carry structured data.
//
// Split out of Seo.jsx because a module that exports both a component and
// plain functions breaks Fast Refresh — the whole module reloads instead of
// the component, and edits stop appearing until a manual refresh.
//
// Google is unforgiving about these shapes: a Product without an offer, or an
// offer without a currency, is ignored outright rather than partially honoured.

import { BEYOND_BIM } from "./beyondBim.js";

const SITE = "https://www.adlmstudio.net";
const SITE_NAME = "ADLM Studio";

/**
 * Verifiable facts about the company, in one place.
 *
 * Every figure here is one the business can evidence. Nothing is rounded up and
 * nothing is invented: the registration number is the CAC one, the training
 * figure is the one already published on the About page, and the partnership is
 * a real designation. Structured data is a claim made to a search engine in a
 * machine-readable form, which makes an exaggeration here worse than the same
 * exaggeration in body copy.
 */
export const ORG = {
  name: SITE_NAME,
  legalName: "ADLM Studios",
  registrationNumber: "RC 7440343",
  foundingDate: "2018",
  city: "Lagos",
  country: "NG",
  linkedIn: "https://www.linkedin.com/company/adlm-studio",
  youTube: "https://www.youtube.com/@ADLMStudio",
};

export function organizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: ORG.name,
    legalName: ORG.legalName,
    url: SITE,
    logo: `${SITE}/Logo.png`,
    foundingDate: ORG.foundingDate,
    // schema.org has no field for a CAC number, so it goes in as a typed
    // identifier rather than being smuggled into the name.
    identifier: {
      "@type": "PropertyValue",
      name: "CAC registration number",
      value: ORG.registrationNumber,
    },
    description:
      "ADLM Studio builds BIM and quantity surveying software for construction professionals, and trains the firms that use it.",
    address: {
      "@type": "PostalAddress",
      addressLocality: ORG.city,
      addressCountry: ORG.country,
    },
    sameAs: [ORG.linkedIn, ORG.youTube],
  };
}

export function websiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: SITE,
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${SITE}/products?q={search_term_string}` },
      "query-input": "required name=search_term_string",
    },
  };
}

export function productSchema({ name, description, image, url, priceNGN, interval }) {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name,
    ...(description ? { description } : {}),
    ...(image ? { image } : {}),
    brand: { "@type": "Brand", name: SITE_NAME },
    ...(priceNGN
      ? {
          offers: {
            "@type": "Offer",
            price: String(priceNGN),
            priceCurrency: "NGN",
            url,
            availability: "https://schema.org/InStock",
            ...(interval ? { category: `Subscription (${interval})` } : {}),
          },
        }
      : {}),
  };
}

export function courseSchema({ name, description, url }) {
  return {
    "@context": "https://schema.org",
    "@type": "Course",
    name,
    ...(description ? { description } : {}),
    url,
    provider: { "@type": "Organization", name: SITE_NAME, sameAs: SITE },
  };
}

/**
 * The product pages describe desktop plugins and a web platform, which is what
 * SoftwareApplication is for. Product is kept alongside it: between them they
 * cover the price-and-availability rendering and the software-specific fields,
 * and Google reads whichever it has a treatment for.
 *
 * `operatingSystem` is a real constraint here, not boilerplate — the Revit,
 * ArchiCAD and PlanSwift plugins are Windows-only, and saying so keeps the
 * listing out of results for people who cannot run it.
 */
export function softwareApplicationSchema({
  name,
  description,
  image,
  url,
  priceNGN,
  interval,
  applicationCategory = "BusinessApplication",
  operatingSystem = "Windows",
}) {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name,
    ...(description ? { description } : {}),
    ...(image ? { image } : {}),
    url,
    applicationCategory,
    applicationSubCategory: "Quantity surveying and BIM",
    operatingSystem,
    publisher: { "@type": "Organization", name: SITE_NAME, url: SITE },
    ...(priceNGN
      ? {
          offers: {
            "@type": "Offer",
            price: String(priceNGN),
            priceCurrency: "NGN",
            url,
            availability: "https://schema.org/InStock",
            ...(interval
              ? { category: `Subscription (${interval})` }
              : {}),
          },
        }
      : {}),
  };
}

/**
 * @param {Array<{question: string, answer: string}>} items
 *
 * Only ever built from Q&A that is actually visible on the page. Marking up
 * questions a visitor cannot see is what Google calls out as spam, and it puts
 * the whole site's rich results at risk rather than just this page's.
 */
export function faqSchema(items) {
  const valid = (items || []).filter((i) => i?.question && i?.answer);
  if (!valid.length) return null;

  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: valid.map((i) => ({
      "@type": "Question",
      name: i.question,
      acceptedAnswer: { "@type": "Answer", text: i.answer },
    })),
  };
}

export function breadcrumbSchema(trail) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: `${SITE}${c.path}`,
    })),
  };
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

/** "2026-10-06", a Date, or a Mongo ISO string -> ISO 8601, or "" if unusable. */
function isoDate(value) {
  if (!value) return "";
  // A plain calendar date stays a plain calendar date. Beyond BIM publishes
  // "6 October" and says the exact times are set once the cohort is confirmed,
  // so widening that to a midnight timestamp would invent a start time.
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

/**
 * An Event Google will accept, or null.
 *
 * Null rather than a partial block is deliberate. `startDate` and `location`
 * are both required, and an Event missing either is dropped whole — so the
 * only thing a half-filled block can do is tempt someone into filling the gap
 * with a guess. A training whose venue nobody recorded is a training with no
 * Event markup, not a training in "Lagos, Nigeria" because that is usually
 * true.
 *
 * @param {object}  args
 * @param {boolean} args.online  online cohort (VirtualLocation) vs a venue
 * @param {number}  args.priceNGN  only when registration is actually open at
 *                                 that price. No price means no offer, which
 *                                 is honest; a stale price is a lie a crawler
 *                                 repeats.
 */
export function eventSchema({
  name,
  description,
  url,
  startDate,
  endDate,
  online = false,
  venueName,
  street,
  city,
  region,
  country,
  image,
  priceNGN,
  offerUrl,
  // schema.org/ItemAvailability. Defaults to InStock because most events that
  // carry a price are open; a caller that knows better says so.
  availability = "InStock",
}) {
  const start = isoDate(startDate);
  if (!name || !url || !start) return null;

  let location = null;
  if (online) {
    // Where a participant actually goes to join. The joining link itself is
    // sent to registered participants, so the page that leads to it is the
    // most specific public URL there is.
    location = { "@type": "VirtualLocation", url };
  } else {
    const address = {
      "@type": "PostalAddress",
      ...(street ? { streetAddress: street } : {}),
      ...(city ? { addressLocality: city } : {}),
      ...(region ? { addressRegion: region } : {}),
      ...(country ? { addressCountry: country } : {}),
    };
    // Four optional fields and a @type: if none of them came through, this is
    // an object that says nothing.
    if (Object.keys(address).length > 1) {
      location = {
        "@type": "Place",
        ...(venueName ? { name: venueName } : {}),
        address,
      };
    }
  }
  if (!location) return null;

  const end = isoDate(endDate);

  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name,
    ...(description ? { description } : {}),
    url,
    startDate: start,
    ...(end ? { endDate: end } : {}),
    // A cancelled programme is unpublished here rather than marked cancelled,
    // so anything with a live page is scheduled.
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: online
      ? "https://schema.org/OnlineEventAttendanceMode"
      : "https://schema.org/OfflineEventAttendanceMode",
    location,
    ...(image ? { image } : {}),
    organizer: { "@type": "Organization", name: SITE_NAME, url: SITE },
    ...(Number(priceNGN) > 0
      ? {
          offers: {
            "@type": "Offer",
            price: String(Number(priceNGN)),
            priceCurrency: "NGN",
            url: offerUrl || url,
            availability: `https://schema.org/${availability}`,
          },
        }
      : {}),
  };
}

/**
 * Event for one physical-training record (server/models/PTrainingEvent.js).
 *
 * Shared by the page and by the Vercel head function so the block a crawler
 * reads in the HTML and the block the browser writes after hydration are
 * byte-identical. Two builders would drift, and a page carrying two different
 * descriptions of the same event is worse than one carrying none.
 */
export function ptrainingEventSchema(record, { path } = {}) {
  const ev = record || {};
  const slug = ev.slug || ev._id || "";
  const url = `${SITE}${path || `/ptrainings/${slug}`}`;

  const pricing = ev.pricing || {};
  const normal = Number(pricing.normalNGN ?? ev.priceNGN ?? 0) || 0;
  const earlyBird = Number(pricing.earlyBird?.priceNGN ?? 0) || 0;
  const endsAt = pricing.earlyBird?.endsAt ? new Date(pricing.earlyBird.endsAt) : null;
  // The same rule server/routes/ptrainings.js uses to decide what to charge.
  // Advertising the early-bird price after it lapses would put a number in
  // front of a buyer that checkout will not honour.
  const earlyBirdLive =
    earlyBird > 0 && endsAt && !Number.isNaN(endsAt.getTime()) && Date.now() < endsAt.getTime();
  const payable = earlyBirdLive ? earlyBird : normal;

  const loc = ev.location || {};
  const description = String(ev.subtitle || ev.description || "")
    .replace(/\s+/g, " ")
    .trim();

  // The two ways an event stops taking registrations, which the page shows
  // differently and so the markup must too. `status` is the admin's switch
  // (open|closed|draft); capacity is the one the enrolment route enforces —
  // the same default of 14 seats PTrainingDetail and routes/ptrainings.js
  // both use when the record carries no figure.
  const open = String(ev.status || "open").toLowerCase() === "open";
  const cap = Number(ev.capacityApproved) || 14;
  const soldOut = Number(ev.approvedCount) >= cap;

  return eventSchema({
    name: ev.title,
    description,
    url,
    startDate: ev.startAt,
    endDate: ev.endAt,
    venueName: loc.name,
    street: loc.address,
    city: loc.city,
    region: loc.state,
    image: /^https?:\/\//i.test(String(ev.flyerUrl || "")) ? ev.flyerUrl : undefined,
    // Only while registration is open. "closed" means checkout will refuse,
    // and an InStock offer on a closed event is a promise the site breaks.
    priceNGN: open ? payable : 0,
    // The page and the markup have to agree, and the page's own "Enrollment
    // Closed" is the capacity rule, not the status field: PTrainingDetail
    // reads approvedCount against capacityApproved, and POST
    // /ptrainings/:key/enroll refuses with 409 at the same line. A full event
    // whose status is still "open" was therefore advertising InStock beside
    // a screen saying enrollment was closed — a contradiction Google counts
    // against the page, and untrue besides.
    availability: soldOut ? "SoldOut" : "InStock",
  });
}

/**
 * Event for the Beyond BIM programme.
 *
 * Gated by the caller, never by this function: /beyondbim is behind
 * VITE_FLAG_BEYOND_BIM_LIVE (src/config/flags.js) and shows the public a
 * "Coming soon" page until it is turned on. Telling Google there is an event
 * to attend at a URL that says "coming soon" is a mismatch between the markup
 * and the page, which is the one thing structured data must never be.
 */
export function beyondBimEventSchema() {
  return eventSchema({
    name: `${BEYOND_BIM.name} (${BEYOND_BIM.cohort} cohort)`,
    description: BEYOND_BIM.description,
    url: `${SITE}${BEYOND_BIM.path}`,
    startDate: BEYOND_BIM.startDate,
    endDate: BEYOND_BIM.endDate,
    online: BEYOND_BIM.online,
    priceNGN: BEYOND_BIM.feeNGN,
    offerUrl: `${SITE}${BEYOND_BIM.registerPath}`,
  });
}
