// server/middleware/designMode.js
// "Design Access" — a role that can open every admin section but never sees a
// real record. Mounted once at the /admin boundary (server/index.js), BEFORE
// any admin router, so it covers every current and future admin endpoint
// without each route having to opt in.
//
// Three things happen for a design-access user:
//   1. Breadth  — the request is presented downstream as role "admin" so the
//      per-route gates (the shared requireAdmin and the half-dozen local copies
//      of it) all pass. Real authority still comes from the DB role, which is
//      checked here and nowhere else.
//   2. Read     — every JSON body is rewritten by maskValue() into deterministic
//      placeholder data of the SAME SHAPE, so the UI renders exactly as it does
//      in production while no real name, email, amount or count survives.
//   3. Write    — every mutating request is answered with a simulated success
//      and never reaches a handler. Nothing a designer clicks can change data.
//
// Determinism matters: the same field yields the same fake value on every
// reload, so the screens don't flicker while someone is designing against them.
import { User } from "../models/User.js";
import { verifyAccess } from "./auth.js";
import { isDesignRole } from "../util/rbac.js";

/* ────────────────────────── seeded value generation ───────────────────────── */

// FNV-1a. Small, fast, and stable across processes — which is the point: the
// fake data must not change between requests or between server instances.
function hash(str) {
  let h = 0x811c9dc5;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

const pick = (seed, arr) => arr[hash(seed) % arr.length];
const between = (seed, min, max) => min + (hash(seed) % (max - min + 1));

const FIRST_NAMES = [
  "Adaeze", "Bolaji", "Chinedu", "Damilola", "Emeka", "Funmi", "Gbenga",
  "Halima", "Ifeoma", "Jide", "Kemi", "Lanre", "Maryam", "Nkechi", "Obinna",
  "Peju", "Rasheed", "Segun", "Tobi", "Uche", "Yemi", "Zainab",
];
const LAST_NAMES = [
  "Abiodun", "Balogun", "Chukwu", "Danjuma", "Eze", "Fashola", "Garba",
  "Ibrahim", "Johnson", "Kalu", "Lawal", "Mohammed", "Nwosu", "Okafor",
  "Oyelaran", "Sanni", "Thomas", "Udeh", "Williams", "Yusuf",
];
const COMPANIES = [
  "Brightline Consult", "Cornerstone Builders", "Delta Ridge Ltd",
  "Everstone Engineering", "Foundry Works", "Granite & Co",
  "Harbourview Projects", "Ironclad Structures", "Juniper Design Studio",
  "Keystone Infrastructure", "Landmark QS Partners", "Meridian Contractors",
  "Northgate Developments", "Onyx Civil Works", "Pinnacle Surveyors",
  "Quarry Lane Group", "Redwood Interiors", "Summit Build Africa",
];
const CITIES = [
  "Lagos", "Abuja", "Port Harcourt", "Ibadan", "Kano", "Enugu", "Benin City",
  "Kaduna", "Jos", "Uyo", "Abeokuta", "Warri",
];
const TITLES = [
  "Sample entry", "Placeholder record", "Demo item", "Example listing",
  "Draft content", "Preview record", "Test entry", "Mock item",
];
const SENTENCES = [
  "Placeholder copy shown in Design Access — the real text is hidden.",
  "This is sample content for layout and spacing work only.",
  "Demo description standing in for the production record.",
  "Example body text so the component renders at a realistic length.",
  "Filler copy — no real customer information is shown here.",
];

const fakeFirst = (seed) => pick(seed + "|first", FIRST_NAMES);
const fakeLast = (seed) => pick(seed + "|last", LAST_NAMES);
const fakePerson = (seed) => `${fakeFirst(seed)} ${fakeLast(seed)}`;

const fakeEmail = (seed) =>
  `${fakeFirst(seed).toLowerCase()}.${fakeLast(seed).toLowerCase()}${between(
    seed + "|n",
    1,
    99,
  )}@example-demo.test`;

const fakePhone = (seed) =>
  `+234 ${between(seed + "|p1", 700, 916)} ${between(seed + "|p2", 100, 999)} ${between(
    seed + "|p3",
    1000,
    9999,
  )}`;

const fakeUsername = (seed) =>
  `${fakeFirst(seed).toLowerCase()}${between(seed + "|u", 10, 999)}`;

/* ──────────────────────────── key classification ──────────────────────────── */

const re = (src) => new RegExp(src, "i");

// Identifiers pass through untouched. They carry no personal meaning, and
// keeping them real is what lets a designer click a row and land on its detail
// page — the detail response is masked in turn.
// Case-sensitive on purpose. A lowercase "...id" tail is usually just an
// English word ending — amountPaid, isValid, hybrid — and matching it loosely
// let real money through untouched. Only "_id" and a camelCase "Id" actually
// name an identifier.
const K_ID_STRICT = /^(_?id|uuid|guid|.*_id|.*Id|.*ID)$/;
const K_ID_LOOSE = /^(sub|ref|reference)$/i;
const isIdKey = (k) => K_ID_STRICT.test(k) || K_ID_LOOSE.test(k);

// Structural / enum-ish values the UI switches on. Faking these would break
// status badges, filters and routing.
const K_ENUM = re(
  "^(key|slug|code|role|roleKey|status|state|type|kind|area|group|mode|" +
    "currency|provider|channel|method|plan|tier|interval|period|level|" +
    "productKey|product_key|sort|order|direction|locale|lang|timezone|tz|" +
    "version|schema|format|ext|mime|mimetype|action|event|scope|visibility)$",
);

const K_EMAIL = re("email|mail$");
const K_PERSON = re(
  "^(firstName|lastName|fullName|name|displayName|contactName|customerName|" +
    "clientName|ownerName|actorName|targetName|author|instructor|createdBy|" +
    "updatedBy|assignee|assignedTo|attendee|student|member|recipient|sender)$",
);
const K_USERNAME = re("^(username|handle|nickname|login)$");
const K_COMPANY = re("company|organi[sz]ation|^org$|business|firm|vendor|supplier");
const K_PHONE = re("phone|mobile|whatsapp|tel$|msisdn");
const K_PLACE = re("address|street|city|town|region|country|location|venue|postcode|zip");
const K_TITLE = re("^(title|label|heading|headline|subject|caption)$");
const K_TEXT = re(
  "descri|body|message|note|content|summary|excerpt|comment|reason|remark|" +
    "feedback|bio|about|answer|question|text$",
);

// Avatars are pictures of real people; other media are ADLM's own assets and
// are kept so the layouts render with real images.
const K_AVATAR = re("avatar|profilePhoto|profilePic|headshot|selfie|passport");
const K_MEDIA = re("url|uri|href|link|src|image|photo|thumb|poster|banner|logo|file|video|asset");

// Money and volume — the numbers that must never be the real ones.
const K_MONEY = re(
  "amount|price|cost|total|subtotal|revenue|balance|paid|due|owed|outstanding|" +
    "discount|fee|charge|value|worth|budget|spend|salary|rate$|ngn|usd",
);
const K_COUNT = re(
  "count|^n$|^num|total[A-Z]|users|subscribers|seats|licen[cs]es|sessions|" +
    "views|plays|downloads|installs|enroll|orders|purchases|tickets|leads|" +
    "signups|active|pending|tokens|credits|quantity|qty|stock",
);
const K_PERCENT = re("percent|pct|ratio|share|completion|progress|score|margin");

// Pagination and layout numbers must survive or the tables break.
const K_STRUCT_NUM = re("^(page|pages|limit|perPage|offset|skip|index|order|step|width|height|duration|size|year|month|day|hour|minute)$");

// Arrays that describe the app itself, not its customers.
const PASSTHROUGH_ARRAY_KEYS = new Set([
  "areas", "permissions", "groups", "columns", "fields", "options", "tabs", "steps",
]);

const ISO_DATE = /^\d{4}-\d{2}-\d{2}([T ]|$)/;
const EMAIL_VALUE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_VALUE = /^(https?:\/\/|\/|data:)/i;
const OBJECT_ID = /^[a-f0-9]{24}$/i;

/* ───────────────────────────────── the mask ───────────────────────────────── */

function maskString(key, value, seed) {
  if (isIdKey(key) || OBJECT_ID.test(value)) return value;
  if (K_ENUM.test(key)) return value;

  // A value that IS an email is masked whatever its key is called.
  if (EMAIL_VALUE.test(value) || K_EMAIL.test(key)) return fakeEmail(seed);

  if (K_USERNAME.test(key)) return fakeUsername(seed);
  if (K_PERSON.test(key)) return fakePerson(seed);
  if (K_COMPANY.test(key)) return pick(seed + "|co", COMPANIES);
  if (K_PHONE.test(key)) return fakePhone(seed);
  if (K_PLACE.test(key)) return pick(seed + "|city", CITIES);
  if (K_AVATAR.test(key)) {
    return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
      fakePerson(seed),
    )}`;
  }

  // Timestamps stay real: they are not identifying, and faking them would
  // scramble every "sorted by newest" list the designer is looking at.
  if (ISO_DATE.test(value)) return value;
  if (K_MEDIA.test(key) || URL_VALUE.test(value)) return value;

  if (K_TITLE.test(key)) return pick(seed + "|title", TITLES);
  if (K_TEXT.test(key)) return pick(seed + "|text", SENTENCES);

  // Anything long enough to be prose is treated as prose even if the key was
  // one we did not anticipate. Short unrecognised strings are almost always
  // enum-ish and are safer kept than mangled.
  if (value.length > 40) return pick(seed + "|text", SENTENCES);
  return value;
}

function maskNumber(key, value, seed) {
  if (isIdKey(key) || K_STRUCT_NUM.test(key)) return value;
  if (value === 0 || value === 1) return value; // usually a flag or an empty state
  if (K_PERCENT.test(key)) return between(seed, 5, 98);
  if (K_MONEY.test(key)) {
    // Keep the order of magnitude so currency formatting and column widths
    // still look like the real thing.
    if (value >= 1_000_000) return between(seed, 1_000_000, 9_500_000);
    if (value >= 100_000) return between(seed, 100_000, 950_000) ;
    if (value >= 1_000) return between(seed, 5_000, 95_000);
    return between(seed, 50, 950);
  }
  if (K_COUNT.test(key)) return between(seed, 3, 240);

  // Default to replacing. A number under a key we did not anticipate is more
  // likely a real figure than a layout constant — and the ones that genuinely
  // are layout constants are already named above. Magnitude is preserved so
  // nothing renders absurdly.
  if (value >= 1_000_000) return between(seed, 1_000_000, 9_500_000);
  if (value >= 1_000) return between(seed, 1_000, 95_000);
  if (Number.isInteger(value)) return between(seed, 2, Math.max(3, Math.min(999, value * 2)));
  return Math.round(between(seed, 100, 9900)) / 100;
}

function maskValue(key, value, seed, depth = 0) {
  if (value == null || depth > 12) return value;

  if (Array.isArray(value)) {
    if (PASSTHROUGH_ARRAY_KEYS.has(key)) return value;
    const isObjectList = value.some((v) => v && typeof v === "object");
    if (!isObjectList) return value; // enum/scalar lists are structural
    // Truncate — never grow — so a real total is never inferable from the row
    // count while ids stay unique and clickable.
    const cap = between(seed + "|cap", 6, 12);
    return value
      .slice(0, cap)
      .map((v, i) => maskValue(key, v, `${seed}|${i}`, depth + 1));
  }

  if (typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = maskValue(k, v, `${seed}|${k}`, depth + 1);
    }
    return out;
  }

  if (typeof value === "string") return maskString(key, value, seed);
  if (typeof value === "number" && Number.isFinite(value)) {
    return maskNumber(key, value, seed);
  }
  return value; // booleans drive UI states — always kept
}

/* ─────────────────────────────── path policy ──────────────────────────────── */

// Screens that describe the platform rather than its customers. Masking these
// would make the UAC matrix and the settings forms unreadable, and they contain
// nothing personal to begin with.
const UNMASKED_PATHS = [
  /^\/admin\/roles\/catalog\/?$/,
  /^\/admin\/roles\/?$/,
  /^\/admin\/settings(\/|$)/,
  /^\/admin\/products(\/|$)/,
  /^\/admin\/softwares(\/|$)/,
];

// File exports stream bytes, not JSON, so the mask cannot reach inside them.
// They are refused outright rather than allowed to leak a real invoice.
const BLOCKED_EXPORT_PATHS =
  /((\/(pdf|csv|xlsx?|export|download|receipt|certificate|invoice-file))(\/|$)|\.(pdf|csv|xlsx?|docx?|zip)$)/i;

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// What should happen to one request from a design-access user? Pure, so the
// policy can be pinned by tests without standing up Express or Mongo.
//   "block"       — a byte stream the mask cannot reach into; refuse it
//   "simulate"    — a write; answer with success, never reach a handler
//   "passthrough" — describes the platform, not its customers; safe unmasked
//   "mask"        — everything else; rewrite the JSON body
export function designPolicy(method, path) {
  if (BLOCKED_EXPORT_PATHS.test(path)) return "block";
  if (!SAFE_METHODS.has(String(method || "").toUpperCase())) return "simulate";
  if (UNMASKED_PATHS.some((p) => p.test(path))) return "passthrough";
  return "mask";
}

/* ───────────────────────────────── middleware ─────────────────────────────── */

function tokenFrom(req) {
  const auth = req.headers.authorization || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7).trim();
  const c = req.cookies || {};
  return c.at || c.accessToken || c.token || "";
}

// The middleware, with its two external lookups injectable. Production uses
// the defaults; the tests swap them so the whole request path can be driven
// over real HTTP without a Mongo connection.
export function makeDesignMode({ findRole, isDesign } = {}) {
  const lookupRole =
    findRole ||
    (async (uid) => (await User.findById(uid).select("role").lean())?.role);
  const designCheck = isDesign || isDesignRole;

  return async function designModeMiddleware(req, res, next) {
    let decoded;
    try {
      const token = tokenFrom(req);
      if (!token) return next(); // unauthenticated — the route's own gate answers
      decoded = verifyAccess(token);
    } catch {
      return next();
    }

    const uid = String(decoded?._id || decoded?.id || decoded?.sub || "");
    if (!uid) return next();

    let roleKey;
    try {
      roleKey = (await lookupRole(uid)) || decoded?.role || "user";
    } catch (err) {
      console.error("[designMode] role lookup failed:", err?.message || err);
      return next();
    }

    // Hand the resolved role to requirePermission so the DB is read once, not
    // twice, on every admin request.
    req.resolvedRole = roleKey;
    if (!designCheck(roleKey)) return next();

    req.designMode = true;
    req.designRole = roleKey;

    // Present as a full admin to everything downstream. Safe only because this
    // middleware has already taken away the ability to read real data or write
    // anything at all.
    req.user = { ...decoded, role: "admin", isAdmin: true, designMode: true };

    res.set("X-Design-Mode", "1");

    const path = req.originalUrl.split("?")[0];
    const policy = designPolicy(req.method, path);

    if (policy === "block") {
      return res.status(403).json({
        error: "File exports are disabled in Design Access.",
        code: "DESIGN_MODE_BLOCKED",
        designMode: true,
      });
    }

    if (policy === "simulate") {
      // Simulated success: the designer sees the same confirmation flow the real
      // admin does, and the request never reaches a handler.
      return res.status(200).json({
        ok: true,
        designMode: true,
        simulated: true,
        message: "Saved in Design Access — nothing was actually changed.",
        ...(req.body && typeof req.body === "object" && !Array.isArray(req.body)
          ? req.body
          : {}),
      });
    }

    if (policy === "passthrough") return next();

    const originalJson = res.json.bind(res);
    res.json = (body) => {
      try {
        const masked = maskValue("", body, path);
        if (masked && typeof masked === "object" && !Array.isArray(masked)) {
          masked.designMode = true;
        }
        return originalJson(masked);
      } catch (err) {
        // A mask failure must never fall through to the real body.
        console.error("[designMode] mask failed:", err?.message || err);
        return originalJson({ error: "Design Access data unavailable.", designMode: true });
      }
    };

  return next();
  };
}

export const designMode = makeDesignMode();

// Exported for unit testing.
export const __test = { maskValue, maskString, maskNumber };
