// Every assignment across a learner's courses, with state and alerts
// (util/assignmentAlerts.js). Shared by GET /me/courses/assignments and the
// rail's red dot in GET /me/rail.
import { PaidCourse } from "../models/PaidCourse.js";
import { CourseEnrollment } from "../models/CourseEnrollment.js";
import { CourseSubmission } from "../models/CourseSubmission.js";
import { assignmentRows } from "./assignmentAlerts.js";
import { withFileLinks } from "./submissionLinks.js";

export async function myAssignments(userId, { now = Date.now(), links = true } = {}) {
  const enrollments = await CourseEnrollment.find({ userId }).lean();
  if (!enrollments.length) return [];
  const skus = enrollments.map((e) => e.courseSku);
  const [courses, subsRaw] = await Promise.all([
    PaidCourse.find({ sku: { $in: skus } }, { sku: 1, title: 1, modules: 1 }).lean(),
    CourseSubmission.find({ userId, courseSku: { $in: skus } }).lean(),
  ]);
  const subs = links ? await withFileLinks(subsRaw) : subsRaw;
  const bySku = Object.fromEntries(courses.map((c) => [c.sku, c]));
  return enrollments.flatMap((enrollment) => {
    const course = bySku[enrollment.courseSku];
    if (!course) return [];
    return assignmentRows({
      course,
      enrollment,
      submissions: subs.filter((s) => s.courseSku === enrollment.courseSku),
      now,
    });
  });
}
