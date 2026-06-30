// server/util/audit.js
// Fire-and-forget audit writer. NEVER throws — auditing must not break the
// request it is recording. Used mainly for the God support account.
import { AuditLog } from "../models/AuditLog.js";

/**
 * Write an audit entry. Best-effort: failures are logged, not propagated.
 * @param {object} entry - see AuditLog schema (actorId, actorEmail, isGod,
 *   action, method, path, status, ip, userAgent, targetEmail, productKey, meta)
 */
export async function writeAudit(entry = {}) {
  try {
    await AuditLog.create({
      actorId: entry.actorId || null,
      actorEmail: entry.actorEmail || "",
      isGod: !!entry.isGod,
      action: entry.action || "",
      method: entry.method || "",
      path: entry.path || "",
      status: entry.status ?? null,
      ip: entry.ip || "",
      userAgent: entry.userAgent || "",
      targetEmail: entry.targetEmail || "",
      productKey: entry.productKey || "",
      meta: entry.meta ?? null,
    });
  } catch (err) {
    console.error("[audit] failed to write audit log:", err?.message || err);
  }
}

/** Pull the request context most audit calls need. */
export function reqAuditContext(req) {
  return {
    ip: req?.ip || req?.headers?.["x-forwarded-for"] || "",
    userAgent: req?.headers?.["user-agent"] || "",
    method: req?.method || "",
    path: req?.originalUrl || req?.url || "",
  };
}
