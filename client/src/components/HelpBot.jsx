import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../store.jsx";
import { API_BASE } from "../config";

/* ------------------ WhatsApp ------------------ */
const WHATSAPP_NUMBER = "2348106503524";
const WHATSAPP_DEFAULT_TEXT =
  "Hi ADLM Support, I need help navigating the website. Please assist.";

function buildWhatsAppLink(text) {
  const msg = encodeURIComponent(text || WHATSAPP_DEFAULT_TEXT);
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${msg}`;
}

/* ------------------ Site map ------------------ */
const SITE_MAP = [
  {
    id: "home",
    label: "Home",
    to: "/",
    keywords: ["home", "landing", "start"],
    description: "Welcome page and overview.",
  },
  {
    id: "products",
    label: "Products",
    to: "/products",
    keywords: [
      "products",
      "software",
      "tools",
      "revit",
      "planswift",
      "rategen",
      "pricing",
    ],
    description: "Browse all products and pricing.",
  },
  {
    id: "purchase",
    label: "Checkout / Cart",
    to: "/purchase",
    keywords: ["checkout", "cart", "pay", "payment", "coupon"],
    description: "Checkout, apply coupons, pay.",
  },
  {
    id: "learn",
    label: "Learn",
    to: "/learn",
    keywords: ["learn", "academy", "course", "tutorial"],
    description: "Learning hub: courses and free videos.",
  },
  {
    id: "trainings",
    label: "Trainings",
    to: "/trainings",
    keywords: ["trainings", "training", "bootcamp"],
    description: "Browse available trainings.",
  },
  {
    id: "testimonials",
    label: "Testimonials",
    to: "/testimonials",
    keywords: ["testimonials", "reviews", "feedback"],
    description: "What users say about ADLM.",
  },
  {
    id: "about",
    label: "About ADLM",
    to: "/about",
    keywords: ["about", "company", "adlm"],
    description: "About ADLM Studio.",
  },
  {
    id: "login",
    label: "Login",
    to: "/login",
    keywords: ["login", "sign in"],
    description: "Sign in to your account.",
  },
  {
    id: "signup",
    label: "Signup",
    to: "/signup",
    keywords: ["signup", "register"],
    description: "Create a new account.",
  },
  {
    id: "dashboard",
    label: "Dashboard",
    to: "/dashboard",
    keywords: ["dashboard", "my account"],
    description: "Your account dashboard (requires login).",
    protected: true,
  },
  {
    id: "profile",
    label: "Profile",
    to: "/profile",
    keywords: ["profile", "account details"],
    description: "Manage profile info (requires login).",
    protected: true,
  },
  {
    id: "change-password",
    label: "Change Password",
    to: "/change-password",
    keywords: ["change password", "reset password"],
    description: "Update your password (requires login).",
    protected: true,
  },
  {
    id: "admin",
    label: "Admin Dashboard",
    to: "/admin",
    keywords: ["admin"],
    description: "Admin dashboard (admin only).",
    adminOnly: true,
  },
  {
    id: "admin-products",
    label: "Admin · Products",
    to: "/admin/products",
    keywords: ["admin products"],
    description: "Manage products (admin only).",
    adminOnly: true,
  },
  {
    id: "admin-coupons",
    label: "Admin · Coupons",
    to: "/admin/coupons",
    keywords: ["admin coupons"],
    description: "Manage coupons (admin only).",
    adminOnly: true,
  },
];

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .trim();
}

function findBestRoute(message) {
  const m = normalize(message);
  if (!m) return null;

  if (
    m === "site map" ||
    m.includes("show site map") ||
    m.includes("sitemap") ||
    m.includes("menu") ||
    m.includes("pages")
  ) {
    return { special: "SITEMAP" };
  }

  let best = null;
  let bestScore = 0;

  for (const item of SITE_MAP) {
    const keys = item.keywords || [];
    let score = 0;

    if (normalize(item.label) === m) score += 6;

    for (const k of keys) {
      const kk = normalize(k);
      if (!kk) continue;
      if (m.includes(kk)) score += 3;

      const words = m.split(/\s+/).filter(Boolean);
      if (words.some((w) => kk.includes(w) || w.includes(kk))) score += 1;
    }

    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }

  return bestScore >= 3 ? best : null;
}

function formatMoney(n, currency = "NGN") {
  if (n === undefined || n === null || n === "") return "";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(Number(n));
  } catch {
    return `${currency} ${Number(n).toLocaleString()}`;
  }
}

function summarizeServerMatch(m) {
  if (m.kind === "product") {
    const interval = m.meta?.billingInterval || "monthly";
    const ngn = m.meta?.priceNGN;
    const usd = m.meta?.priceUSD;

    const priceLine =
      ngn || usd
        ? ` — ${ngn ? formatMoney(ngn, "NGN") : ""}${ngn && usd ? " / " : ""}${
            usd ? formatMoney(usd, "USD") : ""
          } (${interval})`
        : "";

    return `${m.label}${priceLine}`;
  }

  if (m.kind === "training") {
    const mode = m.meta?.mode ? ` (${m.meta.mode})` : "";
    return `${m.label}${mode}`;
  }

  return m.label;
}

export default function HelpBot() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [open, setOpen] = React.useState(false);
  const [input, setInput] = React.useState("");
  const [messages, setMessages] = React.useState(() => [
    {
      role: "bot",
      text: "Hi 👋 I’m ADLM Help. Type a product/course/training name (e.g. RateGen, PlanSwift, BIM course) or type “site map”.",
      actions: [
        { label: "Products", to: "/products", kind: "nav" },
        { label: "Learn", to: "/learn", kind: "nav" },
        { label: "Trainings", to: "/trainings", kind: "nav" },
        { label: "Site Map", kind: "text", text: "site map" },
        { label: "WhatsApp Support", kind: "wa", href: buildWhatsAppLink() },
      ],
    },
  ]);

  function pushBot(text, actions = []) {
    setMessages((prev) => [...prev, { role: "bot", text, actions }]);
  }

  async function searchBackend(message) {
    const res = await fetch(`${API_BASE}/helpbot/search`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        includeTrainings: true,
        includeFreeVideos: true,
        limit: 6,
      }),
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json?.error || "Search failed");
    return json; // IMPORTANT: return full JSON, not only matches
  }

  async function send(text) {
    const userText = String(text || input).trim();
    if (!userText) return;

    setMessages((prev) => [...prev, { role: "user", text: userText }]);
    setInput("");

    // 1) site navigation match
    const routeMatch = findBestRoute(userText);

    if (routeMatch?.special === "SITEMAP") {
      const visible = SITE_MAP.filter((x) => !x.adminOnly || isAdmin);
      pushBot("Here’s the site map. Tap where you want to go 👇", [
        ...visible
          .slice(0, 12)
          .map((x) => ({ label: x.label, to: x.to, kind: "nav" })),
        { label: "WhatsApp Support", kind: "wa", href: buildWhatsAppLink() },
      ]);
      return;
    }

    // 2) backend search (matches OR AI reply)
    try {
      const result = await searchBackend(userText);

      // AI reply path
      if (result?.ai && result?.reply) {
        const actions = (result.actions || []).map((a) =>
          a.wa
            ? {
                label: "Chat on WhatsApp",
                kind: "wa",
                href: buildWhatsAppLink(
                  `Hi ADLM Support, I need help with: ${userText}`
                ),
              }
            : { label: a.label, kind: "nav", to: a.to }
        );

        pushBot(result.reply, [
          ...actions,
          { label: "Products", to: "/products", kind: "nav" },
        ]);
        return;
      }

      const matches = Array.isArray(result?.matches) ? result.matches : [];

      if (matches.length >= 1) {
        const lines = matches
          .map((m, idx) => `${idx + 1}) ${summarizeServerMatch(m)}`)
          .join("\n");

        const actions = matches
          .map((m) => [
            { label: `Open: ${m.label}`, to: m.to, kind: "nav" },
            ...(m.kind === "product"
              ? [{ label: "Go to Checkout", to: "/purchase", kind: "nav" }]
              : []),
          ])
          .flat()
          .slice(0, 8);

        pushBot(
          `I found ${matches.length} match(es):\n${lines}\n\nPick one 👇`,
          [
            ...actions,
            {
              label: "WhatsApp Support",
              kind: "wa",
              href: buildWhatsAppLink(
                `Hi ADLM Support, I need help with: ${userText}`
              ),
            },
          ]
        );
        return;
      }
    } catch (e) {
      console.warn("HelpBot backend search failed:", e);
    }

    // 3) route fallback
    if (routeMatch?.to) {
      if (routeMatch.adminOnly && !isAdmin) {
        pushBot("That page is for admins only. Contact support for access.", [
          {
            label: "WhatsApp Support",
            kind: "wa",
            href: buildWhatsAppLink("Hi ADLM Support, I need admin access."),
          },
          { label: "Products", to: "/products", kind: "nav" },
        ]);
        return;
      }

      pushBot(
        `${routeMatch.label}: ${routeMatch.description || "Opening page…"}`,
        [
          { label: `Open ${routeMatch.label}`, to: routeMatch.to, kind: "nav" },
          {
            label: "WhatsApp Support",
            kind: "wa",
            href: buildWhatsAppLink(
              `Hi ADLM Support, I need help with: ${routeMatch.label}.`
            ),
          },
        ]
      );
      return;
    }

    // 4) final fallback
    pushBot(
      "I’m not sure yet. Try “site map” or type the exact product/course name (e.g., RateGen, PlanSwift, BIM course).",
      [
        { label: "Site Map", kind: "text", text: "site map" },
        { label: "Products", to: "/products", kind: "nav" },
        { label: "Learn", to: "/learn", kind: "nav" },
        { label: "Trainings", to: "/trainings", kind: "nav" },
        { label: "WhatsApp Support", kind: "wa", href: buildWhatsAppLink() },
      ]
    );
  }

  function onAction(a) {
    if (!a) return;

    if (a.kind === "nav" && a.to) {
      navigate(a.to);
      setOpen(false);
      return;
    }
    if (a.kind === "wa" && a.href) {
      window.open(a.href, "_blank", "noopener,noreferrer");
      return;
    }
    if (a.kind === "text" && a.text) {
      send(a.text);
      return;
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-5 right-5 z-50 rounded-full px-4 py-3 shadow-lg bg-blue-600 text-white hover:bg-blue-700"
        aria-label="Open help chat"
      >
        {open ? "Close" : "Help"}
      </button>

      {open && (
        <div className="fixed bottom-20 right-5 z-50 w-[380px] max-w-[92vw] rounded-2xl bg-white shadow-xl ring-1 ring-black/10 overflow-hidden">
          <div className="px-4 py-3 bg-slate-900 text-white">
            <div className="font-semibold">ADLM Help</div>
            <div className="text-xs opacity-80">
              Server Search • Site Map • WhatsApp Support
            </div>
          </div>

          <div className="h-[380px] overflow-auto p-3 space-y-3 whitespace-pre-line">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex ${
                  m.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[88%] rounded-2xl px-3 py-2 text-sm ring-1 ${
                    m.role === "user"
                      ? "bg-blue-600 text-white ring-blue-600/20"
                      : "bg-slate-50 text-slate-900 ring-black/5"
                  }`}
                >
                  <div>{m.text}</div>

                  {m.role === "bot" &&
                    Array.isArray(m.actions) &&
                    m.actions.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {m.actions.map((a, idx) => (
                          <button
                            key={idx}
                            onClick={() => onAction(a)}
                            className="text-xs px-2 py-1 rounded-full bg-white ring-1 ring-black/10 hover:bg-slate-50"
                          >
                            {a.label}
                          </button>
                        ))}
                      </div>
                    )}
                </div>
              </div>
            ))}
          </div>

          <div className="p-3 border-t flex gap-2">
            <input
              className="flex-1 rounded-xl px-3 py-2 text-sm ring-1 ring-black/10 outline-none focus:ring-2 focus:ring-blue-600"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder='Ask… (e.g. "RateGen", "BIM course")'
              onKeyDown={(e) => e.key === "Enter" && send()}
            />
            <button
              className="rounded-xl px-3 py-2 text-sm bg-blue-600 text-white hover:bg-blue-700"
              onClick={() => send()}
            >
              Send
            </button>
          </div>
        </div>
      )}
    </>
  );
}
