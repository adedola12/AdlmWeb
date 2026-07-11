// server/routes/agent.js
// Public endpoint for the ADLM AI Agent widget. Optional auth (personalizes
// for logged-in users), rate-limited, with best-effort transcript logging.

import express from "express";
import { verifyAccess } from "../middleware/auth.js";
import { User } from "../models/User.js";
import { AgentConversation } from "../models/AgentConversation.js";
import { runSalesAgent } from "../services/salesAgent.js";
import { agentEnabled, agentProvider } from "../services/aiClient.js";

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
      const decoded = verifyAccess(auth.slice(7).trim());
      const uid = decoded?._id || decoded?.id || decoded?.sub;
      if (uid) {
        req.agentUser = await User.findById(uid)
          .select("name email role entitlements")
          .lean();
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
router.get("/health", (_req, res) => {
  res.json({ ok: true, enabled: agentEnabled(), provider: agentProvider() });
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

    const { reply, actions, outcome } = await runSalesAgent(history, message, {
      user: req.agentUser || null,
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

    res.json({ reply, actions, sessionId });
  } catch (err) {
    console.error("POST /agent/chat error:", err?.message || err);
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
