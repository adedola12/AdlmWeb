// Roles — who can reach which part of the admin.
//
// Richard drew no Roles screen: his prototype has one administrator and no
// notion of a permission. Ours has five roles and a list of areas, and the
// admin rail is filtered by them — so the screen exists here because the
// software does something his did not. Built in his grammar rather than a new
// one: the same register table, filter row and tone vocabulary.
//
// READ-ONLY, DELIBERATELY
//
// /admin/roles can create, rename, re-scope and delete a role, and moving
// somebody between roles changes what they can see. Those are exactly the
// actions that want a considered screen — a confirmation, an audit line, a
// warning when the last super-admin is about to lose their own access — and
// none of that is designed yet. Showing the state truthfully is worth having
// now; a delete button that skips the thinking is not.

import React from "react";
import { apiAuthed } from "../api.js";
import { useAuth } from "../store.jsx";
import { AdmTable, AdmTwo, AdmDim, AdmChip } from "./adminUi.jsx";

export default function DsAdminRoles() {
  const { accessToken } = useAuth();
  const [d, setD] = React.useState(null);
  const [areas, setAreas] = React.useState([]);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    if (!accessToken) return undefined;
    let alive = true;
    Promise.all([
      apiAuthed("/admin/roles", { token: accessToken }),
      apiAuthed("/admin/roles/catalog", { token: accessToken }).catch(() => ({ areas: [] })),
    ])
      .then(([roles, cat]) => {
        if (!alive) return;
        setD(roles);
        setAreas(cat?.areas || []);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [accessToken]);

  if (failed) {
    return <p className="adm-note">Roles could not be loaded just now. Please refresh.</p>;
  }

  const roles = d?.roles || [];
  const areaCount = areas.length;

  const cols = [
    {
      h: "Role",
      w: "24%",
      cell: (r) => (
        <AdmTwo top={r.name || r.key} under={r.system ? "Built in — cannot be deleted" : "Custom role"} />
      ),
    },
    {
      h: "Can reach",
      cell: (r) => {
        const perms = r.permissions || [];
        // A role with no permissions listed is not a role with no access:
        // admin and super-admin are allowed everywhere by rule rather than by
        // enumeration, so saying "nothing" would be exactly backwards.
        if (r.key === "admin") return <b>Everything, by rule rather than by list</b>;
        if (!perms.length) return <AdmDim>no areas</AdmDim>;
        if (areaCount && perms.length === areaCount) return <b>Every area ({perms.length})</b>;
        return (
          <span className="adm-two">
            <b>
              {perms.length} of {areaCount || "?"} areas
            </b>
            <span>{perms.slice(0, 6).join(" · ")}{perms.length > 6 ? " …" : ""}</span>
          </span>
        );
      },
    },
    {
      h: "People",
      num: true,
      cell: (r) => (r.userCount ? r.userCount : <AdmDim>none</AdmDim>),
    },
    {
      h: "Kind",
      cell: (r) => (
        <AdmChip tone={r.system ? "calm" : "ok"}>{r.system ? "system" : "custom"}</AdmChip>
      ),
    },
  ];

  return (
    <>
      <div className="adm-pagehead">
        <div>
          <h1 className="adm-h">Roles</h1>
          <p className="adm-lede">
            What each role can reach, and how many people hold it. The admin rail is filtered by
            exactly these permissions, so a person never sees a screen that would turn them away.
          </p>
        </div>
      </div>

      {!d ? (
        <p className="adm-note">Reading the roles…</p>
      ) : (
        <AdmTable
          cols={cols}
          rows={roles}
          rowKey={(r) => r.key}
          empty={["No roles", "Nothing defines who can reach what, which should not be possible."]}
        />
      )}

      <p className="adm-foot-note">
        This screen reads. Creating a role, changing what one reaches, or moving somebody between
        roles all change who can see customer data — those want a confirmation and an audit line
        before a button, and that is not designed yet.
      </p>
    </>
  );
}
