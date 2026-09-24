// Structured data is a machine-readable claim about the business, and the
// penalty for getting it wrong is not a layout bug — Google drops the page's
// rich results, and for invented reviews or prices it is a manual action. So
// these tests do not check that a builder "returns something". They parse what
// the site would actually emit and assert it carries nothing hollow.
//
// The validator below is the point of the file. Every block goes through it,
// including ones added later, so a new schema cannot ship with an empty field,
// a placeholder dash, a stringified "undefined" or a zero price.
import { describe, it, expect } from "vitest";

import {
  organizationSchema,
  websiteSchema,
  productSchema,
  courseSchema,
  softwareApplicationSchema,
  faqSchema,
  breadcrumbSchema,
  eventSchema,
  ptrainingEventSchema,
  beyondBimEventSchema,
} from "./schema.js";
import { BEYOND_BIM } from "./beyondBim.js";
import { injectJsonLd } from "./jsonLdTag.js";
import { collectHead, pushHead, resetHead } from "./serverHead.js";

/**
 * Strings that look like data to a crawler and mean nothing to a reader.
 *
 * "–" and "—" are in here because the site renders an en dash for an empty
 * value on screen. On screen that is correct and deliberate; inside JSON-LD it
 * is a dash presented to Google as the answer to a question.
 */
const PLACEHOLDERS = [
  "",
  "-",
  "–",
  "—",
  "n/a",
  "na",
  "tbd",
  "tba",
  "null",
  "undefined",
  "nan",
  "none",
  "coming soon",
];

/** Every leaf in the block, with the path it sits at, for a readable failure. */
function leaves(node, path = "$") {
  if (node === null || typeof node !== "object") return [[path, node]];
  if (Array.isArray(node)) return node.flatMap((v, i) => leaves(v, `${path}[${i}]`));
  return Object.entries(node).flatMap(([k, v]) => leaves(v, `${path}.${k}`));
}

/**
 * The bar every block has to clear.
 *
 * Round-tripping through JSON is not ceremony: this is exactly what
 * injectJsonLd does to get the block into a <script> tag, and a value that
 * cannot survive it (a Date, an undefined, a function) is a value that reaches
 * the crawler as something other than what the code thought it wrote.
 */
function expectSoundSchema(block, type) {
  expect(block, "schema block is missing").toBeTruthy();

  const parsed = JSON.parse(JSON.stringify(block));
  expect(parsed["@context"]).toBe("https://schema.org");
  expect(parsed["@type"]).toBe(type);

  for (const [path, value] of leaves(parsed)) {
    expect(value, `${path} is null or undefined`).not.toBe(null);
    expect(value, `${path} is null or undefined`).not.toBe(undefined);
    expect(Number.isNaN(value), `${path} is NaN`).toBe(false);

    if (typeof value === "string") {
      expect(
        PLACEHOLDERS.includes(value.trim().toLowerCase()),
        `${path} is the placeholder ${JSON.stringify(value)}`,
      ).toBe(false);
    }
  }

  return parsed;
}

/** Pull the blocks back out of the HTML the way a crawler's parser would. */
function extractJsonLd(html) {
  const out = [];
  for (const m of html.matchAll(
    /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    // JSON.parse decodes the < escaping injectJsonLd applies, so this is
    // exactly the value a crawler's parser would end up with.
    out.push(JSON.parse(m[1]));
  }
  return out;
}

describe("the blocks the site already emitted", () => {
  it("Organization carries the real company facts", () => {
    const org = expectSoundSchema(organizationSchema(), "Organization");
    expect(org.identifier.value).toMatch(/^RC \d+$/);
    expect(org.address.addressCountry).toBe("NG");
  });

  it("WebSite is sound", () => {
    expectSoundSchema(websiteSchema(), "WebSite");
  });

  it("Course is sound", () => {
    expectSoundSchema(
      courseSchema({
        name: "5D BIM for quantity surveyors",
        description: "Model-based measurement through to a priced bill.",
        url: "https://www.adlmstudio.net/product/courses",
      }),
      "Course",
    );
  });
});

describe("SoftwareApplication on a product page", () => {
  const base = {
    name: "QUIV",
    description: "Quantity takeoff inside Revit.",
    url: "https://www.adlmstudio.net/product/revit",
  };

  it("prices the offer in naira when the catalogue has a price", () => {
    const block = expectSoundSchema(
      softwareApplicationSchema({ ...base, priceNGN: 25000, interval: "month" }),
      "SoftwareApplication",
    );
    expect(block.offers.price).toBe("25000");
    expect(block.offers.priceCurrency).toBe("NGN");
    expect(block.operatingSystem).toBe("Windows");
  });

  it("omits the offer entirely when there is no price to quote", () => {
    const block = expectSoundSchema(softwareApplicationSchema(base), "SoftwareApplication");
    expect(block.offers).toBeUndefined();
  });

  it("never invents a rating or a review count", () => {
    const block = softwareApplicationSchema({ ...base, priceNGN: 25000 });
    const keys = leaves(block).map(([p]) => p.toLowerCase());
    expect(keys.some((k) => k.includes("aggregaterating"))).toBe(false);
    expect(keys.some((k) => k.includes("reviewcount"))).toBe(false);
    expect(keys.some((k) => k.includes("ratingvalue"))).toBe(false);
  });

  it("says Product and SoftwareApplication the same price", () => {
    const soft = softwareApplicationSchema({ ...base, priceNGN: 25000 });
    const prod = productSchema({ ...base, priceNGN: 25000 });
    expect(soft.offers.price).toBe(prod.offers.price);
    expect(soft.offers.priceCurrency).toBe(prod.offers.priceCurrency);
  });
});

describe("FAQPage", () => {
  it("marks up questions that have answers", () => {
    const block = expectSoundSchema(
      faqSchema([
        { question: "Does QUIV need Revit?", answer: "Yes. It loads as a Revit add-in." },
      ]),
      "FAQPage",
    );
    expect(block.mainEntity).toHaveLength(1);
  });

  it("is null rather than empty when the page carries no Q and A", () => {
    expect(faqSchema([])).toBeNull();
    expect(faqSchema(undefined)).toBeNull();
    expect(faqSchema([{ question: "Half a question" }])).toBeNull();
  });
});

describe("BreadcrumbList", () => {
  it("numbers the trail from one and resolves every item to a URL", () => {
    const block = expectSoundSchema(
      breadcrumbSchema([
        { name: "Home", path: "/" },
        { name: "Products", path: "/products" },
        { name: "QUIV", path: "/product/revit" },
      ]),
      "BreadcrumbList",
    );
    expect(block.itemListElement.map((i) => i.position)).toEqual([1, 2, 3]);
    for (const item of block.itemListElement) {
      expect(item.item.startsWith("https://www.adlmstudio.net/")).toBe(true);
    }
  });
});

describe("Event", () => {
  const venue = {
    name: "A training in Lagos",
    url: "https://www.adlmstudio.net/ptrainings/lagos",
    startDate: "2026-11-02T09:00:00.000Z",
    venueName: "ADLM Studio office",
    city: "Lagos",
    region: "Lagos",
  };

  it("marks up a venue event with a Place", () => {
    const block = expectSoundSchema(eventSchema(venue), "Event");
    expect(block.location["@type"]).toBe("Place");
    expect(block.eventAttendanceMode).toBe("https://schema.org/OfflineEventAttendanceMode");
    expect(block.location.address.addressLocality).toBe("Lagos");
  });

  it("marks up an online cohort with a VirtualLocation", () => {
    const block = expectSoundSchema(
      eventSchema({ ...venue, online: true, city: "", region: "" }),
      "Event",
    );
    expect(block.location["@type"]).toBe("VirtualLocation");
    expect(block.eventAttendanceMode).toBe("https://schema.org/OnlineEventAttendanceMode");
  });

  it("is null when nobody recorded where it happens", () => {
    expect(eventSchema({ ...venue, venueName: "", city: "", region: "" })).toBeNull();
  });

  it("is null when the start date is missing or unreadable", () => {
    expect(eventSchema({ ...venue, startDate: "" })).toBeNull();
    expect(eventSchema({ ...venue, startDate: "sometime in November" })).toBeNull();
  });

  it("keeps a calendar date a calendar date", () => {
    const block = eventSchema({ ...venue, startDate: "2026-10-06" });
    expect(block.startDate).toBe("2026-10-06");
  });

  it("carries no offer when there is no price", () => {
    expect(eventSchema(venue).offers).toBeUndefined();
    expect(eventSchema({ ...venue, priceNGN: 0 }).offers).toBeUndefined();
  });
});

describe("Event built from a physical training record", () => {
  const record = {
    title: "5D BIM intensive",
    subtitle: "Four days, from model to priced bill.",
    slug: "5d-bim-intensive",
    startAt: "2026-11-02T09:00:00.000Z",
    endAt: "2026-11-05T16:00:00.000Z",
    status: "open",
    pricing: { normalNGN: 250000, groupOf3NGN: 600000, earlyBird: { priceNGN: 0, endsAt: null } },
    location: { name: "ADLM Studio", address: "12 Example Road", city: "Lagos", state: "Lagos" },
    flyerUrl: "https://res.cloudinary.com/demo/image/upload/flyer.jpg",
  };

  it("quotes the price checkout will charge", () => {
    const block = expectSoundSchema(ptrainingEventSchema(record), "Event");
    expect(block.offers.price).toBe("250000");
    expect(block.offers.priceCurrency).toBe("NGN");
  });

  it("quotes the early-bird price only while it is still live", () => {
    const live = ptrainingEventSchema({
      ...record,
      pricing: {
        ...record.pricing,
        earlyBird: { priceNGN: 180000, endsAt: "2099-01-01T00:00:00.000Z" },
      },
    });
    expect(live.offers.price).toBe("180000");

    const lapsed = ptrainingEventSchema({
      ...record,
      pricing: {
        ...record.pricing,
        earlyBird: { priceNGN: 180000, endsAt: "2020-01-01T00:00:00.000Z" },
      },
    });
    expect(lapsed.offers.price).toBe("250000");
  });

  it("drops the offer once registration is closed", () => {
    const block = ptrainingEventSchema({ ...record, status: "closed" });
    expectSoundSchema(block, "Event");
    expect(block.offers).toBeUndefined();
  });

  it("leaves out a flyer that is not a real URL", () => {
    const block = ptrainingEventSchema({ ...record, flyerUrl: "flyer.jpg" });
    expect(block.image).toBeUndefined();
    expectSoundSchema(block, "Event");
  });

  it("is null for a record with no date or venue yet", () => {
    expect(ptrainingEventSchema({ title: "Unscheduled", slug: "x" })).toBeNull();
  });
});

describe("Event for the Beyond BIM programme", () => {
  it("matches the dates and the fee the page prints", () => {
    const block = expectSoundSchema(beyondBimEventSchema(), "Event");
    expect(block.startDate).toBe(BEYOND_BIM.startDate);
    expect(block.endDate).toBe(BEYOND_BIM.endDate);
    expect(block.offers.price).toBe(String(BEYOND_BIM.feeNGN));
    expect(block.offers.url).toBe(`https://www.adlmstudio.net${BEYOND_BIM.registerPath}`);
    expect(block.location["@type"]).toBe("VirtualLocation");
  });
});

// The end of the pipe. Everything above tests the value; this tests what
// actually reaches the crawler, using the same injector the Vercel function
// uses rather than a copy of it.
describe("what the HTML actually carries", () => {
  it("re-parses to the same blocks after being written into the head", () => {
    const blocks = [
      organizationSchema(),
      beyondBimEventSchema(),
      breadcrumbSchema([
        { name: "Home", path: "/" },
        { name: "Products", path: "/products" },
      ]),
    ];

    const html = injectJsonLd("<html><head><title>x</title></head><body></body></html>", blocks);
    const found = extractJsonLd(html);

    expect(found).toHaveLength(3);
    expect(found).toEqual(blocks);
    for (const block of found) expectSoundSchema(block, block["@type"]);
  });

  it("escapes a closing tag so the script cannot be broken out of", () => {
    const html = injectJsonLd("<html><head></head></html>", [
      { "@context": "https://schema.org", "@type": "Event", name: "</script><b>x</b>" },
    ]);
    expect(html).not.toContain("</script><b>");
    expect(extractJsonLd(html)[0].name).toBe("</script><b>x</b>");
  });

  it("leaves the HTML untouched when there is nothing to say", () => {
    const html = "<html><head></head></html>";
    expect(injectJsonLd(html, [])).toBe(html);
    expect(injectJsonLd(html, undefined)).toBe(html);
  });
});

// The server-rendered path, end to end. <Seo> pushes into this collector
// during renderToString; the Vercel function takes what it collected and
// stamps it into the head. If a block can be lost or mangled between those two
// points, a marketing page ships without its metadata and nothing else in the
// suite notices.
describe("the server-render pipeline", () => {
  it("carries a page's blocks from render to parsed HTML", () => {
    resetHead();
    pushHead({
      title: "5D BIM intensive | ADLM Studio",
      jsonLd: [
        ptrainingEventSchema({
          title: "5D BIM intensive",
          slug: "5d-bim-intensive",
          startAt: "2026-11-02T09:00:00.000Z",
          status: "open",
          pricing: { normalNGN: 250000 },
          location: { name: "ADLM Studio", city: "Lagos" },
        }),
        // Nulls are how every builder here says "this page has nothing to
        // declare". They must not reach the HTML as an empty script tag.
        null,
        breadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "Training and events", path: "/trainings" },
        ]),
      ],
    });

    const blocks = collectHead().jsonLd;
    expect(blocks).toHaveLength(2);

    const found = extractJsonLd(injectJsonLd("<html><head></head></html>", blocks));
    expect(found.map((b) => b["@type"])).toEqual(["Event", "BreadcrumbList"]);
    for (const block of found) expectSoundSchema(block, block["@type"]);
  });
});
