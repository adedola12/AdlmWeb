// Getting off the marketing list.
//
// NO SIGN-IN, ON PURPOSE
//
// This link is opened from an email, on a phone, in a browser nobody is
// signed in to, possibly months later. Any flow that starts with "log in
// first" is a flow that mostly does not complete — and an unsubscribe that
// does not complete is worse than useless, because the person keeps getting
// mail they have told you twice they do not want.
//
// So the link carries a signed token: the user id plus an HMAC of it. It
// cannot be guessed and cannot be edited into somebody else's id, and the
// worst it can do if it leaks is stop that one person's newsletter.
//
// GET SHOWS, POST DOES
//
// Mail clients and corporate scanners fetch links to check them. If GET
// unsubscribed, Outlook's link scanner would quietly opt people out of a
// list they never asked to leave. So GET renders a page with a button, and
// only the POST behind it changes anything.

import express from "express";
import { User } from "../models/User.js";
import { readUnsubscribeToken, readTopicUnsubscribeToken, VIDEO_TOPIC } from "../util/campaigns.js";

const router = express.Router();

const page = (title, body) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} · ADLM Studio</title>
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f6f7f9;
    font:400 15px/1.6 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111827;padding:24px}
  .c{max-width:460px;background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:28px 30px}
  h1{margin:0 0 12px;font-size:20px;letter-spacing:-.01em}
  p{margin:0 0 14px;color:#374151}
  .m{color:#6b7280;font-size:13.5px}
  button{appearance:none;border:0;cursor:pointer;background:#F26B21;color:#fff;
    font:600 14px/1 inherit;padding:12px 20px;border-radius:9px}
  a{color:#6b7280}
  .brand{font-weight:600;margin-bottom:18px}
  .brand span{color:#F26B21}
</style></head><body><div class="c">
<div class="brand">ADLM<span>Studio</span></div>
${body}
</div></body></html>`;

router.get("/", async (req, res) => {
  const id = readUnsubscribeToken(req.query.t);
  if (!id) {
    return res
      .status(400)
      .send(
        page(
          "Link not recognised",
          `<h1>That link is not one of ours</h1>
           <p>It may have been broken by the mail client that showed it to you.</p>
           <p class="m">You can change this from your account settings, or reply to any
           message from us and we will do it.</p>`,
        ),
      );
  }

  const user = await User.findById(id).select("email emailPrefs").lean();
  if (!user) {
    return res.status(404).send(page("Not found", `<h1>We cannot find that account</h1>`));
  }

  if (user.emailPrefs?.marketing === false) {
    return res.send(
      page(
        "Already unsubscribed",
        `<h1>You are already unsubscribed</h1>
         <p>${user.email} is not on the marketing list.</p>
         <p class="m">Receipts, licence and support messages are separate and still arrive —
         those are part of your account, not a newsletter.</p>`,
      ),
    );
  }

  // A button, not an automatic action: link scanners fetch this page.
  res.send(
    page(
      "Unsubscribe",
      `<h1>Stop marketing email?</h1>
       <p>${user.email} will stop receiving news and offers from ADLM Studio.</p>
       <p class="m">Receipts, licence activations, renewal notices and support replies keep
       coming. Those are part of your account and are not affected.</p>
       <form method="POST" action="/unsubscribe">
         <input type="hidden" name="t" value="${String(req.query.t).replace(/"/g, "&quot;")}">
         <button type="submit">Stop marketing email</button>
       </form>`,
    ),
  );
});

router.post("/", express.urlencoded({ extended: false }), async (req, res) => {
  const id = readUnsubscribeToken(req.body?.t || req.query?.t);
  if (!id) return res.status(400).send(page("Link not recognised", `<h1>That link is not one of ours</h1>`));

  const user = await User.findByIdAndUpdate(
    id,
    {
      $set: {
        "emailPrefs.marketing": false,
        "emailPrefs.marketingChangedAt": new Date(),
        "emailPrefs.marketingOffReason": "asked",
      },
    },
    { new: true },
  )
    .select("email")
    .lean();

  if (!user) return res.status(404).send(page("Not found", `<h1>We cannot find that account</h1>`));

  res.send(
    page(
      "Unsubscribed",
      `<h1>Done</h1>
       <p>${user.email} will not get marketing email from us again.</p>
       <p class="m">Receipts, licence and support messages still arrive — those are part of
       your account. If you change your mind, it is a switch in your account settings.</p>`,
    ),
  );
});

/* ═══════════════════════════════════════════════ getting off ONE list ══ */

/**
 * The video list, at /api/email/unsubscribe/:token.
 *
 * A SEPARATE ROUTER, and a separate switch from the one above. Somebody who is
 * tired of the tutorial announcements has not asked to stop hearing that their
 * card was declined, and one link that does both is a link that will
 * eventually do the wrong one.
 *
 * The token is topic-scoped (see util/campaigns.js): the word "videos" is
 * inside the signed material, so a link out of a video announcement cannot be
 * edited into a general unsubscribe. It is not a session and it reads nothing
 * — the worst a leaked one can do is stop that person's video mail.
 *
 * GET SHOWS, POST DOES — the same rule the marketing unsubscribe above
 * follows, and for the same reason: mail clients and corporate link scanners
 * FETCH the links in a message to check them. Outlook's scanner opening this
 * would quietly opt people out of a list they never asked to leave, and the
 * only evidence would be a customer wondering why the videos stopped. So the
 * GET renders a page with a button and changes nothing.
 */
export const videoUnsubscribeRouter = express.Router();

const notOurs = (res) =>
  res.status(400).send(
    page(
      "Link not recognised",
      `<h1>That link is not one of ours</h1>
       <p>It may have been broken by the mail client that showed it to you.</p>
       <p class="m">You can turn video updates off in your account settings, or reply to
       any message from us and we will do it.</p>`,
    ),
  );

videoUnsubscribeRouter.get("/:token", async (req, res) => {
  const id = readTopicUnsubscribeToken(VIDEO_TOPIC, req.params.token);
  if (!id) return notOurs(res);

  // A malformed id would throw inside the cast rather than 404, and a link
  // scanner hitting a 500 is a page of noise in the logs every time a message
  // goes out.
  const user = await User.findById(id).select("email emailPrefs").lean().catch(() => null);
  if (!user) {
    return res.status(404).send(page("Not found", `<h1>We cannot find that account</h1>`));
  }

  if (user.emailPrefs?.videoUpdates === false) {
    return res.send(
      page(
        "Already off",
        `<h1>Video updates are already off</h1>
         <p>${user.email} is not on the list for new videos.</p>
         <p class="m">Receipts, licence and support messages are separate and still arrive —
         those are part of your account, not a mailing list.</p>`,
      ),
    );
  }

  res.send(
    page(
      "Stop video updates",
      `<h1>Stop emails about new videos?</h1>
       <p>${user.email} will stop hearing when ADLM Studio publishes a video.</p>
       <p class="m">Everything else is unaffected: receipts, licence activations, renewal
       notices, support replies and any other news from us keep coming.</p>
       <form method="POST" action="/api/email/unsubscribe/${encodeURIComponent(req.params.token)}">
         <button type="submit">Stop video updates</button>
       </form>`,
    ),
  );
});

videoUnsubscribeRouter.post("/:token", express.urlencoded({ extended: false }), async (req, res) => {
  const id = readTopicUnsubscribeToken(VIDEO_TOPIC, req.params.token);
  if (!id) return notOurs(res);

  // The date is built here rather than in a module-level constant: one frozen
  // at import would stamp every unsubscribe for the life of the process with
  // the time the process started.
  const user = await User.findByIdAndUpdate(
    id,
    {
      $set: {
        "emailPrefs.videoUpdates": false,
        "emailPrefs.videoUpdatesChangedAt": new Date(),
      },
    },
    { new: true },
  )
    .select("email")
    .lean()
    .catch(() => null);

  if (!user) {
    return res.status(404).send(page("Not found", `<h1>We cannot find that account</h1>`));
  }

  res.send(
    page(
      "Done",
      `<h1>Done</h1>
       <p>${user.email} will not get emails about new videos again.</p>
       <p class="m">Receipts, licence and support messages still arrive — those are part of
       your account. If you change your mind, it is a switch in your account settings.</p>`,
    ),
  );
});

export default router;
