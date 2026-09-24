// Read-only: print every PaidCourse with its module list, plus how many
// enrollments/submissions hang off it, so we know what an edit would touch.
import "dotenv/config";
import { connectDB } from "../db.js";
import { PaidCourse } from "../models/PaidCourse.js";
import { CourseEnrollment } from "../models/CourseEnrollment.js";
import { CourseSubmission } from "../models/CourseSubmission.js";

await connectDB();
const courses = await PaidCourse.find({}).sort({ sort: -1 }).lean();

for (const c of courses) {
  const [enrolled, subs] = await Promise.all([
    CourseEnrollment.countDocuments({ courseSku: c.sku }),
    CourseSubmission.countDocuments({ courseSku: c.sku }),
  ]);
  console.log("=".repeat(70));
  console.log(`sku: ${c.sku}\ntitle: ${c.title}\npublished: ${c.isPublished}`);
  console.log(`enrollments: ${enrolled}  submissions: ${subs}`);
  console.log(`blurb: ${c.blurb || "(none)"}`);
  console.log(`description: ${c.description || "(none)"}`);
  console.log(`onboardingVideo: ${c.onboardingVideoUrl || "(none)"}`);
  console.log(`modules (${(c.modules || []).length}):`);
  for (const m of c.modules || []) {
    console.log(`  - [${m.code}] ${m.title}`);
  }
}
process.exit(0);
