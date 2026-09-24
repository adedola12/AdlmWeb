// server/routes/waitlist.public.js
//
// POST /waitlist — the public endpoint every marketing form posts to.
//
// Deliberately unauthenticated: these forms are for people who do not have an
// account yet, which is the whole point of a waitlist. That makes it an open
// write endpoint, so it is rate limited, size capped, field whitelisted, and
// it returns the same shape whether the address is new or already on the list
// (see the note on enumeration below).
import express from "express";
import rateLimit from "express-rate-limit";
import { WaitlistEntry } from "../models/WaitlistEntry.js";

const router = express.Router();

// Topics a form is allowed to submit under. An open `topic` field would let
// anyone create arbitrary buckets in the admin list.
const ALLOWED_TOPICS = new Set([
  // His own hidden `topic` values, taken verbatim from the forms — see
  // `grep 'name="topic"' src/*.html` in his repo. Using his labels rather than
  // invented ones means the markup needs no edit and the admin list reads the
  // same words the page does.
  "CIVIQ waitlist",
  "Firms & consultancies",
  "Individual QS",
  "Students & early career",
  "Institutions",
]);

// Generous enough for a real person who mistypes their email twice, tight
// enough that the collection cannot be flooded from one address.
const submitLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "Too many submissions. Please try again shortly." },
});

const str = (v, max) => String(v ?? "").trim().slice(0, max);

// Deliberately permissive: the goal is to reject obvious junk, not to litigate
// RFC 5322. A wrong-but-plausible address is better handled by the follow-up
// email bouncing than by us refusing a real customer.
function looksLikeEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
}

router.post("/", submitLimiter, async (req, res) => {
  try {
    const body = req.body || {};

    const topic = str(body.topic, 120);
    if (!ALLOWED_TOPICS.has(topic)) {
      return res.status(400).json({ ok: false, error: "Unknown form." });
    }

    const name = str(body.name, 140);
    const email = str(body.email, 200).toLowerCase();
    if (!name) return res.status(400).json({ ok: false, error: "Please tell us your name." });
    if (!looksLikeEmail(email)) {
      return res.status(400).json({ ok: false, error: "That email address does not look right." });
    }

    const doc = {
      topic,
      name,
      email,
      org: str(body.org, 200),
      civil3d: str(body.civil3d, 80),
      message: str(body.message, 4000),
      sourcePath: str(body.sourcePath, 300),
    };

    // Submitting twice bumps a counter rather than creating a second row —
    // whoever works the list should see one person, not two tasks. The upsert
    // is what makes concurrent double-submits safe; the unique index on
    // (topic, email) is the backstop.
    //
    // Only non-empty values are written. A second, sparser submission (someone
    // who filled in their organisation the first time and skipped it the
    // second) must not blank out what we already have.
    const $set = { name: doc.name };
    for (const k of ["org", "civil3d", "message", "sourcePath"]) {
      if (doc[k]) $set[k] = doc[k];
    }

    await WaitlistEntry.findOneAndUpdate(
      { topic: doc.topic, email: doc.email },
      {
        $set,
        $inc: { submissions: 1 },
        $setOnInsert: { status: "new" },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    // Always the same response, whether this address was already on the list
    // or not. Saying "you're already signed up" would turn this into an oracle
    // for checking whether a given person is a customer.
    return res.json({ ok: true, message: "You're on the list. We'll be in touch." });
  } catch (err) {
    // A duplicate-key error can still surface if two requests race past the
    // upsert; from the visitor's point of view that is a success.
    if (err?.code === 11000) {
      return res.json({ ok: true, message: "You're on the list. We'll be in touch." });
    }
    console.error("[waitlist] submit failed:", err);
    return res.status(500).json({ ok: false, error: "Something went wrong. Please try again." });
  }
});

export default router;
