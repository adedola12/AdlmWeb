// GET /templates/:template/key?kid=<id>
// Hands the content key of an encrypted desktop template to a signed-in user who holds the
// owning product's licence. See util/templateKeys.js.
import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { requireEntitlement } from "../middleware/requireEntitlement.js";
import { loadTemplateKeys, resolveTemplateKey, templateRegistry } from "../util/templateKeys.js";

const router = express.Router();
const KEYS = loadTemplateKeys();

function noCache(_req, res, next) {
  res.set("Cache-Control", "no-store");
  next();
}

function requireTemplateLicence(req, res, next) {
  const entry = templateRegistry()[req.params.template];
  if (!entry) return res.status(404).json({ error: "Unknown template" });
  return requireEntitlement(entry.productKey)(req, res, next);
}

router.get("/:template/key", noCache, requireAuth, requireTemplateLicence, (req, res) => {
  const { status, body } = resolveTemplateKey(req.params.template, req.query.kid, KEYS);
  // Who fetched which version, never the key itself.
  console.log(JSON.stringify({ evt: "template.key", template: req.params.template, kid: String(req.query.kid || ""), user: String(req.user?._id || req.user?.id || ""), status }));
  res.status(status).json(body);
});

export default router;
