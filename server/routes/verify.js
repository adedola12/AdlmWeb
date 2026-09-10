// Checking a certificate, without an account.
//
// This exists because of a sentence on Richard's revoke confirm: a withdrawn
// certificate "stops verifying, and anybody checking it will be told it was
// withdrawn". There was nothing here that could verify anything, so the button
// would have been a label — and a Revoke that only writes a row tells an
// administrator a problem is dealt with when it is not.
//
// WHO THIS IS FOR
//
// Not the holder. An employer with a CV in front of them, or a tender board
// checking a submitted certificate — people with no account here who need one
// question answered about a reference somebody handed them.
//
// SO IT ANSWERS ONE QUESTION AND VOLUNTEERS NOTHING
//
// A reference is a bearer token of sorts: anybody who has the certificate has
// it, and anybody guessing can try. So the reply carries what is already
// printed on the document they are holding — the name, the course, the date —
// and nothing that is not: no email, no marks, no other courses, no id.
// Guessing a reference should reveal nothing that guessing a name would not.
//
// A withdrawn certificate says so, and says when. It does NOT say why: the
// reason is written for the studio and for the person holding it, and an
// employer reading "issued against the wrong submission" learns something the
// studio has not decided to tell them.

import express from "express";
import { CourseEnrollment } from "../models/CourseEnrollment.js";
import { PaidCourse } from "../models/PaidCourse.js";
import { User } from "../models/User.js";

const router = express.Router();

const day = (d) =>
  d
    ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : "";

router.get("/:ref", async (req, res, next) => {
  try {
    const ref = String(req.params.ref || "").trim().toUpperCase();

    // Shape-checked before it reaches the database, so a scanner throwing
    // rubbish at this costs a regex rather than a query.
    if (!/^CERT-[A-Z0-9]{4,12}$/.test(ref)) {
      return res.status(404).json({ found: false, said: "No certificate has that reference." });
    }

    const enr = await CourseEnrollment.findOne({
      certificateRef: ref,
      certificateIssuedAt: { $ne: null },
    })
      .select("userId email courseSku certificateIssuedAt certificateState certificateStateAt")
      .lean();

    if (!enr) {
      return res.status(404).json({ found: false, said: "No certificate has that reference." });
    }

    const [course, who] = await Promise.all([
      PaidCourse.findOne({ sku: enr.courseSku }).select("title").lean(),
      enr.userId ? User.findById(enr.userId).select("firstName lastName").lean() : null,
    ]);

    const name = who
      ? [who.firstName, who.lastName].filter(Boolean).join(" ")
      : "";

    const revoked = enr.certificateState === "revoked";

    res.json({
      found: true,
      valid: !revoked,
      ref,
      // Everything below is already printed on the certificate being checked.
      who: name || "the holder",
      course: course?.title || enr.courseSku || "",
      issued: day(enr.certificateIssuedAt),
      withdrawn: revoked ? day(enr.certificateStateAt) : null,
      said: revoked
        ? `This certificate was withdrawn by ADLM Studio on ${day(enr.certificateStateAt)} and should not be relied on.`
        : `Issued by ADLM Studio on ${day(enr.certificateIssuedAt)}.`,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
