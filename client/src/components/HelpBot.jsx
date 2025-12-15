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
    keywords: ["home", "landing", "start", "main page"],
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
      "revit plugin",
      "planswift",
      "rategen",
      "marketplace",
      "pricing",
      "plans",
      "subscriptions",
      "buy",
      "purchase product",
      "shop",
    ],
    description: "Browse all products and pricing.",
  },
  {
    id: "purchase",
    label: "Checkout / Cart",
    to: "/purchase",
    keywords: [
      "checkout",
      "cart",
      "pay",
      "payment",
      "purchase",
      "buy",
      "order",
      "coupon",
      "discount",
      "promo",
      "code",
    ],
    description: "Checkout, apply coupons, pay.",
  },
  {
    id: "learn",
    label: "Learn",
    to: "/learn",
    keywords: ["learn", "academy", "classes", "course", "tutorial", "videos"],
    description: "Learning hub: courses and free videos.",
  },
  {
    id: "trainings",
    label: "Trainings",
    to: "/trainings",
    keywords: ["trainings", "training", "bootcamp", "bim training", "classes"],
    description: "Browse available trainings.",
  },
  {
    id: "testimonials",
    label: "Testimonials",
    to: "/testimonials",
    keywords: ["testimonials", "reviews", "feedback", "students", "rating"],
    description: "What users say about ADLM.",
  },
  {
    id: "about",
    label: "About ADLM",
    to: "/about",
    keywords: ["about", "company", "who are you", "adlm", "mission"],
    description: "About ADLM Studio.",
  },
  {
    id: "login",
    label: "Login",
    to: "/login",
    keywords: ["login", "sign in", "signin", "access", "account login"],
    description: "Sign in to your account.",
  },
  {
    id: "signup",
    label: "Signup",
    to: "/signup",
    keywords: ["signup", "register", "create account", "join"],
    description: "Create a new account.",
  },
  {
    id: "dashboard",
    label: "Dashboard",
    to: "/dashboard",
    keywords: ["dashboard", "my account", "my tools", "my stuff", "overview"],
    description: "Your account dashboard (requires login).",
    protected: true,
  },
  {
    id: "profile",
    label: "Profile",
    to: "/profile",
    keywords: ["profile", "my profile", "account details", "settings"],
    description: "Manage profile info (requires login).",
    protected: true,
  },
  {
    id: "change-password",
    label: "Change Password",
    to: "/change-password",
    keywords: ["change password", "reset password", "password", "security"],
    description: "Update your password (requires login).",
    protected: true,
  },
  {
    id: "revit-projects",
    label: "Revit Projects",
    to: "/revit-projects",
    keywords: [
      "revit projects",
      "projects",
      "takeoff",
      "project",
      "saved projects",
    ],
    description: "Your Revit-related projects (requires login).",
    protected: true,
  },

  // Admin
  {
    id: "admin",
    label: "Admin Dashboard",
    to: "/admin",
    keywords: ["admin", "admin dashboard", "manage site"],
    description: "Admin dashboard (admin only).",
    adminOnly: true,
  },
  {
    id: "admin-products",
    label: "Admin · Products",
    to: "/admin/products",
    keywords: [
      "admin products",
      "manage products",
      "add product",
      "edit product",
    ],
    description: "Manage products (admin only).",
    adminOnly: true,
  },
  {
    id: "admin-coupons",
    label: "Admin · Coupons",
    to: "/admin/coupons",
    keywords: [
      "admin coupons",
      "create coupon",
      "discount settings",
      "coupon rules",
    ],
    description: "Create & manage coupons (admin only).",
    adminOnly: true,
  },
  {
    id: "admin-learn",
    label: "Admin · Learn",
    to: "/admin/learn",
    keywords: ["admin learn", "manage learn", "courses admin"],
    description: "Manage learn content (admin only).",
    adminOnly: true,
  },
  {
    id: "admin-trainings",
    label: "Admin · Trainings",
    to: "/admin/trainings",
    keywords: ["admin trainings", "manage trainings", "training admin"],
    description: "Manage trainings (admin only).",
    adminOnly: true,
  },
  {
    id: "admin-showcase",
    label: "Admin · Showcase",
    to: "/admin/showcase",
    keywords: ["admin showcase", "showcase admin", "manage showcase"],
    description: "Manage showcase (admin only).",
    adminOnly: true,
  },
  {
    id: "admin-rategen",
    label: "Admin · RateGen",
    to: "/admin/rategen",
    keywords: ["admin rategen", "manage rategen", "rategen admin"],
    description: "Manage RateGen library (admin only).",
    adminOnly: true,
  },
  {
    id: "admin-courses",
    label: "Admin · Courses",
    to: "/admin/courses",
    keywords: ["admin courses", "manage courses", "course admin"],
    description: "Manage courses (admin only).",
    adminOnly: true,
  },
  {
    id: "admin-course-grading",
    label: "Admin · Course Grading",
    to: "/admin/course-grading",
    keywords: [
      "grading",
      "admin grading",
      "course grading",
      "grade submissions",
    ],
    description: "Grade courses (admin only).",
    adminOnly: true,
  },
];

/* ------------------ Helpers ------------------ */
function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .trim();
}
function uniq(arr) {
  return Array.from(new Set(arr.filter(Boolean)));
}
function tokenize(text) {
  return uniq(
    normalize(text)
      .replace(/[^\w\s-]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 3)
  );
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

/* ------------------ Cache ------------------ */
const CACHE_KEY = "adlm_helpbot_catalog_v2";
const CACHE_TTL_MS = 1000 * 60 * 30;

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj?.ts || !obj?.data) return null;
    if (Date.now() - obj.ts > CACHE_TTL_MS) return null;
    return obj.data;
  } catch {
    return null;
  }
}
function writeCache(data) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
  } catch {}
}

/* ------------------ Build catalog from backend response ------------------ */
function buildCatalog(payload) {
  const products = Array.isArray(payload?.products) ? payload.products : [];
  const courses = Array.isArray(payload?.courses) ? payload.courses : [];
  const trainings = Array.isArray(payload?.trainings) ? payload.trainings : [];
  const freeVideos = Array.isArray(payload?.freeVideos)
    ? payload.freeVideos
    : [];

  const productItems = products.map((p) => {
    const key = p.key || p.slug || p._id;
    const label = p.name || key;

    const priceNGN =
      p?.billingInterval === "yearly"
        ? p?.price?.yearlyNGN
        : p?.price?.monthlyNGN;
    const priceUSD =
      p?.billingInterval === "yearly"
        ? p?.price?.yearlyUSD
        : p?.price?.monthlyUSD;

    const textBlob = [
      p.name,
      p.key,
      p.slug,
      p.blurb,
      p.description,
      Array.isArray(p.features) ? p.features.join(" ") : "",
    ].join(" ");

    return {
      kind: "product",
      id: key,
      label,
      to: key ? `/product/${encodeURIComponent(key)}` : "/products",
      tokens: tokenize(textBlob),
      meta: {
        billingInterval: p.billingInterval || "monthly",
        priceNGN,
        priceUSD,
      },
      raw: p,
    };
  });

  const courseItems = courses.map((c) => {
    const sku = c.sku || c._id;
    const label = c.title || sku;

    const textBlob = [
      c.sku,
      c.title,
      c.description,
      Array.isArray(c.bullets) ? c.bullets.join(" ") : "",
    ].join(" ");

    return {
      kind: "course",
      id: sku,
      label,
      to: sku ? `/learn/course/${encodeURIComponent(sku)}` : "/learn",
      tokens: tokenize(textBlob),
      meta: {},
      raw: c,
    };
  });

  // Optional: trainings (if you enabled includeTrainings=1)
  const trainingItems = trainings.map((t) => {
    const id = t._id;
    const label = t.title || "Training";

    const textBlob = [t.title, t.description, t.mode, t.location, t.date].join(
      " "
    );

    return {
      kind: "training",
      id,
      label,
      to: id ? `/trainings/${encodeURIComponent(id)}` : "/trainings",
      tokens: tokenize(textBlob),
      meta: { mode: t.mode, date: t.date },
      raw: t,
    };
  });

  // Optional: free videos (if you enabled includeFreeVideos=1)
  const freeVideoItems = freeVideos.map((v) => {
    const id = v._id;
    const label = v.title || "Free video";
    const textBlob = [v.title, v.description].join(" ");
    return {
      kind: "freeVideo",
      id,
      label,
      to: id ? `/learn/free/${encodeURIComponent(id)}` : "/learn",
      tokens: tokenize(textBlob),
      meta: {},
      raw: v,
    };
  });

  const all = [
    ...productItems,
    ...courseItems,
    ...trainingItems,
    ...freeVideoItems,
  ];
  return {
    products: productItems,
    courses: courseItems,
    trainings: trainingItems,
    freeVideos: freeVideoItems,
    all,
  };
}

/* ------------------ Matching logic ------------------ */
function scoreMatch(message, item) {
  const mTokens = tokenize(message);
  if (!mTokens.length) return 0;

  let score = 0;
  for (const t of mTokens) {
    if (item.tokens.includes(t)) score += 3;
    else if (item.tokens.some((x) => x.includes(t) || t.includes(x)))
      score += 1;
  }

  const m = normalize(message);
  if (item.id && m.includes(normalize(item.id))) score += 6;

  // small boost by kind keywords
  if (item.kind === "product" && (m.includes("buy") || m.includes("price")))
    score += 1;
  if (item.kind === "course" && (m.includes("learn") || m.includes("course")))
    score += 1;

  return score;
}

function topMatches(message, items, limit = 6) {
  return items
    .map((it) => ({ it, score: scoreMatch(message, it) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function summarizeItem(it) {
  if (it.kind === "product") {
    const interval = it.meta?.billingInterval || "monthly";
    const ngn = it.meta?.priceNGN;
    const usd = it.meta?.priceUSD;

    const priceLine =
      ngn || usd
        ? `Price: ${ngn ? formatMoney(ngn, "NGN") : ""}${
            ngn && usd ? " / " : ""
          }${usd ? formatMoney(usd, "USD") : ""} (${interval})`
        : "";

    return `${it.label}${priceLine ? ` — ${priceLine}` : ""}`;
  }

  if (it.kind === "training") {
    const mode = it.meta?.mode ? ` (${it.meta.mode})` : "";
    return `${it.label}${mode}`;
  }

  return it.label;
}

/* ------------------ Route matching (site map) ------------------ */
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

  const goMatch = m.match(/^(go to|open|take me to)\s+(.+)$/i);
  const goText = goMatch?.[2] ? normalize(goMatch[2]) : "";

  let best = null;
  let bestScore = 0;

  for (const item of SITE_MAP) {
    const keys = item.keywords || [];
    let score = 0;

    if (normalize(item.label) === m) score += 6;
    if (goText && normalize(item.label).includes(goText)) score += 5;

    for (const k of keys) {
      const kk = normalize(k);
      if (!kk) continue;

      if (m.includes(kk)) score += 3;
      if (goText && goText.includes(kk)) score += 4;

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

/* ------------------ Component ------------------ */
export default function HelpBot() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [open, setOpen] = React.useState(false);
  const [input, setInput] = React.useState("");

  const [catalog, setCatalog] = React.useState(() => readCache() || null);
  const [catalogReady, setCatalogReady] = React.useState(!!readCache());

  const [messages, setMessages] = React.useState(() => [
    {
      role: "bot",
      text: "Hi 👋 I’m ADLM Help. I can guide you to any page, product, course, or training. Try: “RateGen”, “Revit plugin”, “BIM course”, “pricing”, or type “site map”.",
      actions: [
        { label: "Products", to: "/products", kind: "nav" },
        { label: "Learn", to: "/learn", kind: "nav" },
        { label: "Trainings", to: "/trainings", kind: "nav" },
        { label: "Site Map", kind: "text", text: "site map" },
        {
          label: "Live Support (WhatsApp)",
          kind: "wa",
          href: buildWhatsAppLink(),
        },
      ],
    },
  ]);

  function pushBot(text, actions = []) {
    setMessages((prev) => [...prev, { role: "bot", text, actions }]);
  }

  // Load catalog when opened
  React.useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const cached = readCache();
        if (cached && !cancelled) {
          setCatalog(cached);
          setCatalogReady(true);
        }

        // One endpoint: include trainings + free videos if you want
        const res = await fetch(
          `${API_BASE}/helpbot/catalog?includeTrainings=1&includeFreeVideos=1`,
          { credentials: "include" }
        );

        if (!res.ok) throw new Error("Catalog fetch failed");

        const payload = await res.json();
        const built = buildCatalog(payload);

        if (!cancelled) {
          setCatalog(built);
          writeCache(built);
          setCatalogReady(true);
        }
      } catch (err) {
        console.warn("HelpBot catalog load error:", err);
      }
    }

    if (open) load();
    return () => {
      cancelled = true;
    };
  }, [open]);

  function send(text) {
    const userText = String(text || input).trim();
    if (!userText) return;

    setMessages((prev) => [...prev, { role: "user", text: userText }]);
    setInput("");

    const routeMatch = findBestRoute(userText);

    // Site map
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

    // Catalog matches (products/courses/trainings/videos)
    const allItems = catalog?.all || [];
    const matches = allItems.length ? topMatches(userText, allItems, 6) : [];

    if (
      matches.length >= 2 ||
      (matches.length === 1 && matches[0].score >= 6)
    ) {
      const lines = matches
        .map(({ it }, idx) => `${idx + 1}) ${summarizeItem(it)}`)
        .join("\n");

      const actions = matches
        .map(({ it }) => {
          const isProduct = it.kind === "product";
          return [
            {
              label: `${isProduct ? "View" : "Open"}: ${it.label}`,
              to: it.to,
              kind: "nav",
            },
            ...(isProduct
              ? [{ label: "Go to Checkout", to: "/purchase", kind: "nav" }]
              : []),
          ];
        })
        .flat()
        .slice(0, 8);

      pushBot(`I found ${matches.length} match(es):\n${lines}\n\nPick one 👇`, [
        ...actions,
        {
          label: "WhatsApp Support",
          kind: "wa",
          href: buildWhatsAppLink(
            `Hi ADLM Support, I need help with: ${userText}`
          ),
        },
      ]);
      return;
    }

    // Route fallback
    if (routeMatch?.to) {
      if (routeMatch.adminOnly && !isAdmin) {
        pushBot(
          "That page is for admins only. If you need help with admin access, contact support.",
          [
            {
              label: "WhatsApp Support",
              kind: "wa",
              href: buildWhatsAppLink(
                "Hi ADLM Support, I need help with admin access."
              ),
            },
            { label: "Products", to: "/products", kind: "nav" },
          ]
        );
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

    // Final fallback
    pushBot(
      catalogReady
        ? "I’m not fully sure. Try “site map” or mention the exact product/course name (e.g., “RateGen”, “PlanSwift”, “BIM course”)."
        : "I’m still loading the catalog. Try again in a moment, or type “site map”.",
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
              Site Map • Products • Courses • Trainings • WhatsApp Support
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
              placeholder='Ask… (e.g. "RateGen", "Revit plugin", "BIM course")'
              onKeyDown={(e) => e.key === "Enter" && send()}
            />
            <button
              className="rounded-xl px-3 py-2 text-sm bg-blue-600 text-white hover:bg-blue-700"
              onClick={() => send()}
            >
              Send
            </button>
          </div>

          {/* <div className="px-3 pb-3">
            <button
              onClick={() =>
                window.open(
                  buildWhatsAppLink(),
                  "_blank",
                  "noopener,noreferrer"
                )
              }
              className="w-full rounded-xl px-3 py-2 text-sm bg-emerald-600 text-white hover:bg-emerald-700"
            >
              Chat with Live Support on WhatsApp
            </button>
          </div> */}
        </div>
      )}
    </>
  );
}
