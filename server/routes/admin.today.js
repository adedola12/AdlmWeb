// server/routes/admin.today.js
//
// Today — the admin dashboard, computed.
//
// Richard's rule for this screen, kept: "Draws from the admin model and
// decides nothing itself, which is the only reason the numbers on it can be
// trusted." His model was a fixture file standing in for a server. This is the
// server. Every figure below is a query; nothing on the screen is typed into
// the page, and the client does no arithmetic beyond drawing a bar.
//
// THE NULL RULE, WHICH IS THE WHOLE POINT OF THE SCREEN
//
// A queue that does not exist and a queue with nothing in it are different
// states, and Today has to say which is which. `n: null` means we do not
// record the thing at all; `n: 0` means we record it and it is empty. The
// client draws a dash for one and a zero for the other. Inventing a zero for
// something unmeasured would be the single most damaging thing this endpoint
// could do — it reads as calm.
//
// WHERE HIS COPY DID NOT SURVIVE CONTACT
//
// His purchases queue says "Transfers awaiting verification — a payment proof
// uploaded, waiting on a human. Card and USSD purchases activate themselves."
// Ours cannot say that. A Purchase in this database carries no proof field and
// no payment method on any of the 33 rows currently pending, so there is no
// way to tell a transfer from a card order once it is sitting in the queue.
// What we can say truthfully is that these are orders awaiting a decision. The
// copy says that instead, and the difference is noted here rather than papered
// over with his sentence.
//
// Two of his queues we genuinely do not have: Ada refusals are not recorded
// (AgentConversation stores turns, not whether she declined), and there is no
// failed-jobs register. Both come back null, which is what his own fixture did
// for them.

import express from "express";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { Purchase } from "../models/Purchase.js";
import { User } from "../models/User.js";
import { SupportTicket } from "../models/SupportTicket.js";
import { FollowUp } from "../models/FollowUp.js";
import { CourseSubmission } from "../models/CourseSubmission.js";
import { TrainingEnrollment } from "../models/TrainingEnrollment.js";
import { Proposal } from "../models/Proposal.js";

const router = express.Router();
// Gated on the hub area, the same permission /admin itself is gated on —
// this screen is a summary of what is behind it and must not be reachable
// by anybody who could not open the queues it counts.
router.use(requireAuth, requirePermission("adminhub"));

const DAY = 864e5;
const days = (d) => Math.floor((Date.now() - new Date(d).getTime()) / DAY);
const n0 = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

router.get("/", async (_req, res, next) => {
  try {
    const now = new Date();
    const soon = new Date(Date.now() + 30 * DAY);

    const [
      pending,
      installRows,
      enrolPending,
      submissionsUngraded,
      ticketsOpen,
      callsToMake,
      expiring,
      quotesOpen,
    ] = await Promise.all([
      // The orders queue. Selected, not counted, because the money, the age
      // and the by-firm chart all come off the same rows — a count and the
      // rows it counts must not be two statements that can disagree.
      Purchase.find({ status: "pending" })
        .select("userId email totalAmount currency createdAt lines")
        .lean(),

      // An installation belongs to an approved purchase. "pending" is the
      // queue; "complete" is history; "none" was never requested.
      Purchase.find({ status: "approved", "installation.status": "pending" })
        .select("userId createdAt")
        .lean(),

      TrainingEnrollment.countDocuments({ status: "payment_pending" }),

      // Handed in and not yet marked.
      //
      // The field is `gradeStatus`, not `grade`. That distinction is not
      // cosmetic: Mongoose strips unknown paths out of a query, so the earlier
      // `{ grade: ... }` filter was dropped entirely and this counted EVERY
      // submission rather than the ungraded ones. It read as correct only
      // because the collection is currently empty.
      CourseSubmission.countDocuments({ gradeStatus: "pending" }),

      SupportTicket.countDocuments({ status: { $nin: ["resolved", "closed"] } }),
      FollowUp.countDocuments({ status: "to_call" }),

      User.countDocuments({
        entitlements: {
          $elemMatch: { status: "active", expiresAt: { $gte: now, $lte: soon } },
        },
      }),

      // Written and never turned into an order.
      Proposal.countDocuments({ status: { $nin: ["converted", "accepted", "rejected"] } }),
    ]);

    // ── the orders queue, in detail ──────────────────────────────────────
    const money = pending.reduce((t, p) => t + n0(p.totalAmount), 0);
    const oldest = pending.reduce((t, p) => Math.max(t, days(p.createdAt)), 0);

    // An order with no account behind it cannot be actioned: there is nobody
    // to grant the entitlement to. Same shape as his "orphans".
    const ids = [...new Set(pending.map((p) => String(p.userId)).filter(Boolean))];
    const owners = await User.find({ _id: { $in: ids } })
      .select("_id organizationName licenseType email firstName lastName")
      .lean();
    const byId = new Map(owners.map((u) => [String(u._id), u]));
    const orphanOrders = pending.filter((p) => !p.userId || !byId.has(String(p.userId))).length;

    const installIds = [...new Set(installRows.map((r) => String(r.userId)).filter(Boolean))];
    const installLive = new Set(
      (await User.find({ _id: { $in: installIds } }).select("_id").lean()).map((u) =>
        String(u._id),
      ),
    );
    const orphanInstalls = installRows.filter(
      (r) => !r.userId || !installLive.has(String(r.userId)),
    ).length;

    // Money by firm. A personal licence is its own name rather than being
    // lumped into an "Other" bucket that would hide who is owed what.
    const firms = new Map();
    for (const p of pending) {
      const u = byId.get(String(p.userId));
      const name =
        String(u?.organizationName || "").trim() ||
        [u?.firstName, u?.lastName].filter(Boolean).join(" ").trim() ||
        String(p.email || u?.email || "").trim() ||
        "Unattributed";
      firms.set(name, (firms.get(name) || 0) + n0(p.totalAmount));
    }
    const byFirm = [...firms.entries()]
      .map(([k, v]) => ({ k, v }))
      .sort((a, b) => b.v - a.v)
      .slice(0, 8);

    // ── the queues ───────────────────────────────────────────────────────
    const work = [
      {
        id: "purchases",
        n: pending.length,
        title: "Orders awaiting a decision",
        note:
          "Somebody paid and is waiting to be let in. Nothing about the payment method is " +
          "recorded on these rows, so they cannot be split into transfers and cards here.",
        href: "/admin/pending",
        flag: oldest >= 3 ? "due" : null,
        flagText: oldest >= 3 ? `oldest ${oldest}d` : null,
      },
      {
        id: "installations",
        n: installRows.length,
        title: "Installations pending",
        note: orphanInstalls
          ? `${orphanInstalls} of them have no account behind them — nobody can complete those, they have to be adopted or discarded.`
          : "An approved order whose software has not been marked installed yet.",
        href: "/admin/installations",
        flag: orphanInstalls ? "due" : null,
        flagText: orphanInstalls ? "orphans" : null,
      },
      {
        id: "enrolments",
        n: enrolPending,
        title: "Enrolment payments to verify",
        note: "Physical training. A proof submitted, not yet approved or rejected.",
        href: "/admin/ptrainings",
      },
      {
        id: "submissions",
        n: submissionsUngraded,
        title: "Submissions waiting to be graded",
        note: "Course work handed in. Passing one issues the certificate it is owed.",
        href: "/admin/course-grading",
      },
      {
        // Not recorded. AgentConversation stores the turns of a conversation,
        // not whether Ada declined to answer, so there is no way to count this
        // without first deciding to log it.
        id: "ada",
        n: null,
        title: "Ada refusals to review",
        note: "Questions she declined because ADLM publishes no answer. A content gap arriving as a work item.",
        href: null,
      },
      {
        // Tickets and follow-up calls were one row, and that was wrong twice
        // over. It made the headline unexplainable — 66 waiting, with the
        // largest contributor of 32 hidden inside a row that read as being
        // about tickets — and it put a badge of 32 on Support when there are
        // no open tickets at all. They are also two different jobs done by
        // different people, and they have their own screens.
        id: "support",
        n: ticketsOpen,
        title: "Tickets unanswered",
        note: "Somebody asked for help through a product or the website and has not had a reply.",
        href: "/admin/support-tickets",
      },
      {
        id: "followups",
        n: callsToMake,
        title: "Follow-up calls to make",
        note: "Licences that lapsed and orders never paid. Nobody is waiting on a reply — these are calls to place.",
        href: "/admin/follow-ups",
      },
    ];

    const watch = [
      {
        id: "expiring",
        n: expiring,
        title: "Subscriptions expiring within 30 days",
        note: "What the renewal job will act on. A lapse nobody rang about is a customer lost quietly.",
        href: "/admin/subscriptions",
      },
      {
        id: "quotations",
        n: quotesOpen,
        title: "Quotations not converted",
        note: "Built on the site, stored, never turned into an order.",
        href: "/admin/proposals",
      },
      {
        // The hub reports storage per account, but nothing records a quota, so
        // "at their limit" has no threshold to compare against.
        id: "storage",
        n: null,
        title: "Accounts at their storage limit",
        note: "A quota block is a silent support ticket. No quota is recorded, so there is nothing to be at the limit of.",
        href: "/admin/storage",
      },
      {
        id: "jobs",
        n: null,
        title: "Failed jobs",
        note: "The renewal and expiry crons report to the log and nowhere else, so a failure is not counted anywhere.",
        href: null,
      },
    ];

    // "Where the work is sitting" — his short names, in queue order, so the
    // chart and the list underneath cannot disagree about what is in them.
    const NAMES = {
      purchases: "Orders",
      installations: "Installations",
      enrolments: "Enrolments",
      submissions: "Submissions",
      ada: "Ada refusals",
      support: "Tickets",
      followups: "Calls to make",
    };
    const bySource = work.map((q) => ({ k: NAMES[q.id] || q.title, v: q.n, hot: !!q.flag }));

    const openWork = work.reduce((t, q) => t + (q.n || 0), 0);
    const liveQueues = work.filter((q) => q.n).length;

    // What the headline is made of, biggest first. A total nobody can take
    // apart is a total nobody trusts — and this one is dominated by whichever
    // queue happens to be largest, which is not always the one being looked
    // at.
    const composition = work
      .filter((q) => q.n)
      .sort((a, b) => b.n - a.n)
      .map((q) => ({ n: q.n, label: NAMES[q.id] || q.title }));

    res.json({
      kpis: {
        openWork,
        liveQueues,
        composition,
        money,
        currency: pending[0]?.currency || "NGN",
        orders: pending.length,
        oldest,
        blocked: orphanInstalls + orphanOrders,
        orphanInstalls,
        orphanOrders,
        firms: firms.size,
      },
      work,
      watch,
      bySource,
      byFirm,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
