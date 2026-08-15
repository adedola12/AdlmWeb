// schema.org payloads for the pages that carry structured data.
//
// Split out of Seo.jsx because a module that exports both a component and
// plain functions breaks Fast Refresh — the whole module reloads instead of
// the component, and edits stop appearing until a manual refresh.
//
// Google is unforgiving about these shapes: a Product without an offer, or an
// offer without a currency, is ignored outright rather than partially honoured.

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
