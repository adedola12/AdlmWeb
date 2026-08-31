// The /dash-course/:sku route: the course player inside his app frame.
//
// This screen used to live at /learn/course/:sku — under the PUBLIC learning
// prefix, in the marketing layout. That put the "Book a demo" nav and the
// marketing footer around a signed-in student watching a lesson, and left the
// player unprotected: a signed-out visitor reached it and got a broken page
// rather than the sign-in.
//
// Public learning is /learn — the catalogue and the free lessons, no sign-in
// needed. Everything that belongs to a person's own enrolment is under dash-*,
// behind ProtectedRoute and inside the rail. The old URL still resolves; it
// redirects here.

import React from "react";
import DsAppShell from "../ds/DsAppShell.jsx";
// His .lx-* sheet. It is not in the app shell because the marketing pages,
// which are almost all the traffic, have no use for it.
import DsLearnStyles from "../ds/DsLearnStyles.jsx";
import CourseDetail from "./CourseDetail.jsx";

export default function LearningCourse() {
  return (
    <DsAppShell title="Course" page="dash-course">
      <div className="dsh-in">
        <DsLearnStyles />
      <CourseDetail />
      </div>
    </DsAppShell>
  );
}
