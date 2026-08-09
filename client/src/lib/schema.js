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

export function organizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: SITE,
    logo: `${SITE}/Logo.png`,
    description:
      "ADLM Studio builds BIM and quantity surveying software for construction professionals, and trains the firms that use it.",
    address: { "@type": "PostalAddress", addressCountry: "NG" },
    sameAs: ["https://www.linkedin.com/company/adlm-studio"],
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
