// Illustrated PDF user guides, published with the frontend under public/docs.
//
// Adding a guide: build it in the ADLMInstallerHub repo
// (Scripts\build-<name>-guide.ps1), copy the PDF into client/public/docs, and
// add a row here. `productKeys` lets a guide be matched to what a user owns —
// the dashboard shows the ones relevant to their subscriptions first.

export const GUIDES = [
  {
    id: "installer-hub",
    title: "ADLM Installer Hub",
    blurb:
      "Signing in, installing your products, applying updates, and fixing the things that go wrong.",
    file: "/docs/ADLM-Installer-Hub-User-Guide.pdf",
    pages: 21,
    productKeys: [],
    alwaysShow: true,
  },
  {
    id: "quiv",
    title: "QUIV for Revit",
    blurb:
      "Opening your model, the Model Checker, taking off every element, and turning it into a priced bill.",
    file: "/docs/ADLM-QUIV-Revit-User-Guide.pdf",
    pages: 22,
    productKeys: ["revit", "mep"],
  },
  {
    id: "rategen",
    title: "ADLM Rate Gen",
    blurb:
      "Rate build-ups, the material and labour libraries, custom rates, Build with AI, and how rates reach QUIV and Heron.",
    file: "/docs/ADLM-RateGen-User-Guide.pdf",
    pages: 19,
    productKeys: ["rategen"],
  },
  {
    id: "complete",
    title: "Installer Hub & ADLM Heron",
    blurb:
      "The combined book: the Hub end to end, then Heron — scaling drawings, measuring with the ADLM templates, pricing and export.",
    file: "/docs/ADLM-Complete-User-Guide.pdf",
    pages: 48,
    productKeys: ["planswift", "heron"],
  },
];

/**
 * Guides ordered for a given user: ones covering a product they own first,
 * then the rest. Never hides anything — a customer evaluating a product
 * should still be able to read its guide.
 */
export function orderGuidesFor(ownedProductKeys = []) {
  const owned = new Set(
    (ownedProductKeys || []).map((k) => String(k || "").toLowerCase()),
  );
  const relevant = (g) =>
    g.alwaysShow || g.productKeys.some((k) => owned.has(k));
  return [
    ...GUIDES.filter(relevant),
    ...GUIDES.filter((g) => !relevant(g)),
  ];
}
