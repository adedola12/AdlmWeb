// Questions the product page gets asked before a purchase.
//
// Everything here is grounded in how the platform actually behaves — the
// Installer Hub flow, the auto-renew opt-in in Purchase.jsx, the per-product
// storage slots. Nothing about refunds is claimed, because there is no refund
// policy in the codebase to be accurate about; if one exists, add it here
// rather than letting a visitor guess.

/** Questions shown for every product. */
export const GENERAL_FAQ = [
  {
    q: "How do I get the software after I pay?",
    a: "Your licence activates as soon as payment is confirmed. Sign in to the ADLM Installer Hub with the same account, and the products you have paid for appear ready to install, no licence keys to copy, no email to wait for.",
  },
  {
    q: "Does the subscription renew automatically?",
    a: "Only if you ask it to. Auto-renew is an opt-in checkbox at checkout, available on card payments in Naira, and you can remove the saved card from your profile at any time. Leave it off and the subscription simply ends when the term does.",
  },
  {
    q: "What happens when my subscription ends?",
    a: "The plugin stops activating, but nothing you produced is taken away: your projects, bills and exports stay in your account and on your machine. Resubscribing restores access without redoing any setup.",
  },
  {
    q: "Can I pay for a longer term?",
    a: "Yes, and it costs less per month. Pick 6 months or a year at checkout and the discount is applied to the total. The price shown on this page is the price you pay.",
  },
  {
    q: "I am outside Nigeria. Can I still buy?",
    a: "Yes. Prices are shown in Naira with a US dollar equivalent, and checkout accepts international payment. Card auto-renew is the one feature limited to Naira cards.",
  },
  {
    q: "Is there someone to help if I get stuck?",
    a: "Support is included, not an upsell. Raise a ticket from your dashboard and a person answers; for anything that needs eyes on your screen, remote support sessions are available.",
  },
];

/**
 * Extra questions for specific products, prepended to the general set.
 * Keyed by the product `key` field.
 */
export const PRODUCT_FAQ = {
  revit: [
    {
      q: "Which versions of Revit does it work with?",
      a: "QUIV installs as a Revit add-in through the Installer Hub, which detects the Revit versions on your machine and installs into each of them. If a version is missing after install, support can confirm it in a few minutes.",
    },
    {
      q: "Do I have to model in a particular way?",
      a: "No. QUIV reads the model you already have. The built-in Model Checker tells you what it can and cannot measure before you commit to a takeoff, so you find gaps early rather than halfway through a bill.",
    },
  ],
  mep: [
    {
      q: "How is this different from QUIV for Revit?",
      a: "Same idea, different discipline. The MEP plugin understands services elements: ducts, pipes, fittings, equipment, and schedules them the way an M&E bill is structured, rather than treating them as generic geometry.",
    },
  ],
  planswift: [
    {
      q: "I work from PDFs and drawings, not 3D models. Is this the right one?",
      a: "Yes, HERON is the 2D tool. You scale the drawing, measure on it with the ADLM templates, and price the result. No model required.",
    },
  ],
  rategen: [
    {
      q: "Do I have to build every rate myself?",
      a: "No. RateGen ships with material and labour libraries you can price against, and Build with AI drafts a rate build-up you then correct. Your finished rates flow into QUIV and HERON, so a bill prices itself.",
    },
  ],
  civil3d: [
    {
      q: "What does CIVIQ measure?",
      a: "Civil works quantities out of Civil 3D: earthworks, corridors and the linear items that a building-focused tool handles badly.",
    },
  ],
  bimbld: [
    {
      q: "The live classes have finished. What am I buying?",
      a: "The full recorded programme, at your own pace. Every session from the cohort is available to stream from your dashboard, with the recap clips alongside each one.",
    },
    {
      q: "How long do I keep access?",
      a: "Course access runs for a year from purchase, so you can go back over a session when the work in front of you calls for it.",
    },
  ],
  BIMMEP: [
    {
      q: "Is this the same course as the Building Works one?",
      a: "No: this one covers building services: mechanical, electrical and HVAC. The Building Works course covers the architectural and structural side. They are separate programmes and can be taken in either order.",
    },
    {
      q: "How long do I keep access?",
      a: "Course access runs for a year from purchase, and every session streams from your dashboard.",
    },
  ],
};

export function faqFor(productKey) {
  const extra = PRODUCT_FAQ[String(productKey || "")] || [];
  return [...extra, ...GENERAL_FAQ];
}
