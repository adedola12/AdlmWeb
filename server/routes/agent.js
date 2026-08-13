// server/routes/agent.js
// Public endpoint for the ADLM AI Agent widget. Optional auth (personalizes
// for logged-in users), rate-limited, with best-effort transcript logging.

import express from "express";
import { verifyAccess } from "../middleware/auth.js";
import { User } from "../models/User.js";
import { AgentConversation } from "../models/AgentConversation.js";
import { runSalesAgent } from "../services/salesAgent.js";
import { agentEnabled, agentProvider } from "../services/aiClient.js";
import { checkAiAllowance } from "../services/aiUsage.js";
import {
  agentHealthSnapshot,
  recordAgentFailure,
  recordAgentSuccess,
} from "../services/agentHealth.js";

const router = express.Router();

function getIP(req) {
  return (
    req.headers["x-forwarded-for"]?.toString().split(",")[0].trim() ||
    req.socket?.remoteAddress ||
    "unknown"
  );
}

/* ------------------ optional auth ------------------ */
// Populates req.agentUser (with entitlements) when a valid Bearer is present;
// stays a guest otherwise. Never 401s — the agent works for anonymous visitors.
async function optionalAuth(req, _res, next) {
  try {
    const auth = req.headers.authorization || "";
    if (auth.startsWith("Bearer ")) {
      const raw = auth.slice(7).trim();
      const decoded = verifyAccess(raw);
      const uid = decoded?._id || decoded?.id || decoded?.sub;
      if (uid) {
        req.agentUser = await User.findById(uid)
          .select("name email role entitlements")
          .lean();
        // Kept so the agent can call the ADLM AI Service ON THIS USER'S BEHALF
        // (it verifies the same token and meters the call to them). Only set
        // once the token has verified and resolved to a real user.
        if (req.agentUser) req.agentAccessToken = raw;
      }
    }
  } catch {
    // ignore — treat as guest
  }
  next();
}

/* ------------------ rate limit (no deps) ------------------ */
const RL_WINDOW_MS = 10 * 60 * 1000; // 10 min
const RL_MAX = 40; // messages per IP per window
const rlHits = new Map();

function rateLimit(req, res, next) {
  const ip = getIP(req);
  const now = Date.now();
  const rec = rlHits.get(ip) || { ts: now, count: 0 };
  if (now - rec.ts > RL_WINDOW_MS) {
    rec.ts = now;
    rec.count = 0;
  }
  rec.count += 1;
  rlHits.set(ip, rec);

  // Opportunistic cleanup so the map can't grow unbounded.
  if (rlHits.size > 5000) {
    for (const [k, v] of rlHits) if (now - v.ts > RL_WINDOW_MS) rlHits.delete(k);
  }

  if (rec.count > RL_MAX) {
    return res
      .status(429)
      .json({ error: "You're sending messages very fast. Please slow down a little." });
  }
  next();
}

/* ------------------ health ------------------ */
// `ok` still means "this endpoint is alive", unchanged, because uptime checks
// key on it. Whether the AGENT is working is the `agent` block: a configured,
// enabled agent that rejects every message used to look identical here to a
// perfectly healthy one.
//
// optionalAuth so an admin can read the provider's own words. Everyone else
// gets the classification and the hint, which is enough to tell "our card was
// declined" from "our egress is broken" without leaking request details to
// whoever curls a public endpoint.
router.get("/health", optionalAuth, (req, res) => {
  const role = req.agentUser?.role;
  const isAdmin = role === "admin" || role === "mini_admin";
  res.json({
    ok: true,
    enabled: agentEnabled(),
    provider: agentProvider(),
    agent: agentHealthSnapshot({ includeMessage: isAdmin }),
  });
});

/* ------------------ chat ------------------ */
router.post("/chat", rateLimit, optionalAuth, async (req, res) => {
  try {
    if (!agentEnabled()) {
      return res.json({
        reply:
          "Our AI assistant is briefly offline. You can browse products or reach us on WhatsApp and we'll help right away.",
        actions: [
          { type: "nav", label: "Browse products", to: "/products" },
          { type: "whatsapp", label: "Chat on WhatsApp", number: process.env.SUPPORT_WHATSAPP || "2348106503524" },
        ],
        disabled: true,
      });
    }

    const message = String(req.body?.message || "").trim();
    if (!message) return res.status(400).json({ error: "Message is required." });
    if (message.length > 1000)
      return res.status(400).json({ error: "Message is too long." });

    const history = Array.isArray(req.body?.history) ? req.body.history : [];
    const sessionId = String(req.body?.sessionId || "").slice(0, 80);
    const ip = getIP(req);

    // Monthly AI allocation (admin-managed, see /admin/ai-usage). Checked here
    // rather than inside the agent loop so a spent allowance costs nothing at
    // all — one user message can otherwise trigger four model round-trips.
    // Answered in-character with a WhatsApp escape hatch, never as an error.
    const allowance = await checkAiAllowance({
      user: req.agentUser || null,
      feature: "ada-chat",
      ip,
    });
    if (!allowance.allowed) {
      return res.json({
        reply: allowance.reason,
        actions: [
          ...(req.agentUser ? [] : [{ type: "signup", label: "Create a free account" }]),
          {
            type: "whatsapp",
            label: "Chat on WhatsApp",
            number: process.env.SUPPORT_WHATSAPP || "2348106503524",
          },
        ],
        quota: allowance.code,
        sessionId,
      });
    }

    const { reply, actions, outcome } = await runSalesAgent(history, message, {
      user: req.agentUser || null,
      accessToken: req.agentAccessToken || "",
      sessionId,
      ip,
    });

    // Best-effort transcript logging for conversion tuning.
    if (sessionId) {
      AgentConversation.findOneAndUpdate(
        { sessionId },
        {
          $setOnInsert: {
            sessionId,
            userId: req.agentUser?._id || null,
            role: req.agentUser?.role || "guest",
            ip,
          },
          $push: {
            messages: {
              $each: [
                { role: "user", text: message },
                { role: "assistant", text: reply },
              ],
            },
          },
          $inc: { turns: 1 },
          $set: {
            ...(outcome.capturedLead ? { capturedLead: true } : {}),
            ...(outcome.offeredCheckout ? { offeredCheckout: true } : {}),
            ...(outcome.offeredSignup ? { offeredSignup: true } : {}),
          },
          ...(outcome.productKeysOffered?.length
            ? { $addToSet: { productKeysOffered: { $each: outcome.productKeysOffered } } }
            : {}),
        },
        { upsert: true, new: false },
      ).catch(() => {});
    }

    recordAgentSuccess();
    res.json({ reply, actions, sessionId });
  } catch (err) {
    console.error("POST /agent/chat error:", err?.message || err);
    recordAgentFailure(err);
    res.status(500).json({
      reply:
        "Sorry — I hit a snag. Please try again, or reach us on WhatsApp and we'll help you right away.",
      actions: [
        { type: "whatsapp", label: "Chat on WhatsApp", number: process.env.SUPPORT_WHATSAPP || "2348106503524" },
      ],
      error: "agent_error",
    });
  }
});

export default router;
