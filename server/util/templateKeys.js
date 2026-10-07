// Content keys for encrypted desktop templates (.adlmtpl).
//
// A desktop app ships its template package sealed. At sign-in it asks
// GET /templates/:template/key?kid=<id> for the key that opens it, and this server only
// answers a signed-in user with a live entitlement for the product that owns the template.
// See ADLM C3D RoadTools, tools/civil-template (pack.mjs writes the packages and the keys).
//
// Keys come from the environment (SSM in production), never from the repo:
//   TEMPLATE_CONTENT_KEYS = {"civil-works": {"<kid>": "<base64 32-byte key>", ...}}
// One kid per template version. Removing a kid withdraws that version (the app gets a 404).
import crypto from "node:crypto";

// Which product licence opens which template. CIVIL_TEMPLATE_PRODUCT_KEY lets the owner move the
// civil template to its own product without a code change (until that is decided it is CIVIQ's).
export function templateRegistry(env = process.env) {
  return {
    "civil-works": { productKey: String(env.CIVIL_TEMPLATE_PRODUCT_KEY || "civil3d").trim().toLowerCase() },
  };
}

export const keyIdOf = (keyBuf) => crypto.createHash("sha256").update(keyBuf).digest("hex").slice(0, 16);

// Parses and validates TEMPLATE_CONTENT_KEYS. A key whose id does not match its hash is dropped
// (a pasted-wrong key must fail closed rather than hand out garbage). Never logs key material.
export function loadTemplateKeys(env = process.env, log = console) {
  const raw = env.TEMPLATE_CONTENT_KEYS;
  if (!raw) return {};
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    log.error?.("[templateKeys] TEMPLATE_CONTENT_KEYS is not valid JSON; no template keys loaded");
    return {};
  }
  const out = {};
  for (const [template, byKid] of Object.entries(parsed || {})) {
    for (const [kid, b64] of Object.entries(byKid || {})) {
      const key = Buffer.from(String(b64), "base64");
      if (key.length !== 32 || keyIdOf(key) !== kid) {
        log.error?.(`[templateKeys] dropped ${template}/${kid}: key does not match its id`);
        continue;
      }
      (out[template] ||= {})[kid] = key;
    }
  }
  return out;
}

// Returns { status, body } so the route stays a thin wrapper and this stays testable.
export function resolveTemplateKey(templateKey, kid, keys, registry = templateRegistry()) {
  if (!registry[templateKey]) return { status: 404, body: { error: "Unknown template" } };
  if (!/^[0-9a-f]{16}$/.test(String(kid || ""))) return { status: 400, body: { error: "kid is required" } };
  if (!keys[templateKey] || !Object.keys(keys[templateKey]).length) {
    return { status: 503, body: { error: "Template keys are not configured on this server" } };
  }
  const key = keys[templateKey][kid];
  if (!key) return { status: 404, body: { error: "This template version has been withdrawn" } };
  return { status: 200, body: { template: templateKey, kid, key: key.toString("base64") } };
}
