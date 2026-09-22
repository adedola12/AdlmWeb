// His Projects screen (work-projects.html, 17 Sep 2026): the heading, then
// his gallery (DsProjectGallery) over every project on the account, from
// /me/projects-rollup. A material & labour schedule is folded into its bill
// (foldMaterials), so one project is one card.

import React from "react";
import DsProjectGallery from "./DsProjectGallery.jsx";
import { useProjects } from "./useProjects.js";

export default function DsWorkProjects() {
  const { projects, failed } = useProjects();
  return (
    <div className="dsh-in">
      <div className="wk-head">
        <div>
          <h1>Projects</h1>
          <p>
            Every project starts where its quantities were extracted: QUIV or Revit MEP in Revit, HERON in
            PlanSwift, CIVIQ in Civil 3D. From then on it lives here.
          </p>
        </div>
      </div>
      {failed ? (
        <p className="ds-sub">Your projects could not be loaded just now. Please refresh.</p>
      ) : (
        <DsProjectGallery projects={projects} />
      )}
    </div>
  );
}
