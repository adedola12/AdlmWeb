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
// Creating, re-scoping and deleting a role, and moving somebody between roles,
// change who can see customer data. Those want a considered screen, and none
// is drawn in his grammar yet. Until it is, "Edit roles" opens the older
// build's editor at /admin/roles/edit. It confirms before a delete or a
// revoke, audits every move between roles, and sits behind the server's
// guards against removing the last administrator or demoting yourself. Area
// toggles there save at once, unconfirmed and unaudited — the gap a drawn
// editor should close.

import React from "react";
import { Link } from "react-router-dom";
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
        <div className="adm-acts">
          <Link className="ds-btn btn-p ds-btn-sm" to="/admin/roles/edit">
            Edit roles
          </Link>
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
        This screen reads. To create a role, change what one reaches, or move somebody between
        roles, use Edit roles. Area changes there save as you click; deleting a role or taking
        one away asks first, and every move between roles is written to the audit trail.
      </p>
    </>
  );
}
