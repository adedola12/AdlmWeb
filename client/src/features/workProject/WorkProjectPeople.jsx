// Who else is on this project — his Collaborators card (work-proj.js:521), in
// the side panel rather than a modal, because everything else on this page that
// is about one thing opens there.
//
// WHAT IS DIFFERENT FROM HIS
//
// His card has a role <select> per person, an invite row and a "copy a view-only
// link" button. Ours reads only. Sharing on this account is not a role field: it
// is share codes (view or full) that a colleague claims, each with its own
// allowed emails, use count and revocation — see TakeoffProject's ShareCodeSchema.
// Reproducing "change this person's role" as a dropdown would misdescribe a
// system where access came from a code, so the panel says who is on it and sends
// anyone who wants to change that to where the codes actually live.

import React from "react";
import { Link } from "react-router-dom";
import { accessName } from "./headModel.js";
import { initials } from "./workProjectFormat.js";

const when = (d) => {
  if (!d) return "";
  const t = new Date(d);
  return Number.isFinite(t.getTime())
    ? t.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : "";
};

export default function WorkProjectPeople({ project, classicWorkspaceHref }) {
  const people = Array.isArray(project?.collaborators) ? project.collaborators : [];
  const codes = Array.isArray(project?.shareCodes) ? project.shareCodes : [];
  const live = codes.filter((c) => !c.revoked).length;

  return (
    <>
      <div className="pn-sec">
        <span className="k">On this project</span>
        {people.length ? (
          <div className="pj-people">
            {people.map((c) => (
              <div className="pp" key={c.userId || c.email}>
                <span className="av">{initials(c.email)}</span>
                <span className="nm">
                  <b>{c.email || "A colleague"}</b>
                  <em>{when(c.addedAt) ? `Joined ${when(c.addedAt)}` : "Joined by share code"}</em>
                </span>
                <span className="rl">{accessName(c.accessLevel)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="hint">
            Nobody else yet. A colleague joins with a share code, and what they can do is set by
            the code they use.
          </p>
        )}
      </div>

      <div className="pn-sec">
        <span className="k">Share codes</span>
        <div className="big">{live}</div>
        <p className="hint">
          {live === 1 ? "One code can be used" : `${live} codes can be used`} to join this project.
        </p>
        <Link className="ds-btn btn-o ds-btn-sm" to={classicWorkspaceHref}>
          Manage codes and access
        </Link>
      </div>
    </>
  );
}
