// Admin route wrapper — Courses, at /admin/courses.
//
// His register: the free videos and the paid courses together, because they
// are the same object with a price on one of them.

import React from "react";
import DsAdminCourses from "../ds/DsAdminCourses.jsx";

export default function AdminLcCourses() {
  return <DsAdminCourses />;
}
