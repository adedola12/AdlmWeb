// src/pages/AdminRoles.jsx
// UAC — Roles & Access Control. Admin-only (gated by AdminRoute roles={["admin"]}
// and, server-side, by the "roles" admin-exclusive area). Lets the admin edit
// each role's per-area permissions, create/delete custom roles, and assign roles
// to users. Matrix toggles save immediately (optimistic, revert on error).
import React from "react";
import { useAuth } from "../store.jsx";
import { apiAuthed } from "../http.js";
import { Reveal } from "../components/effects.jsx";
import AdminPageHeader from "../components/AdminPageHeader.jsx";
import {
  FiShield, FiPlus, FiTrash2, FiLock, FiUsers, FiSearch,
  FiChevronDown, FiChevronRight, FiUserX, FiClock,
} from "react-icons/fi";

export default function AdminRoles() {
  const { accessToken, user } = useAuth();
  const currentUserId = user?.id || user?._id || null;

  const [areas, setAreas] = React.useState([]); // full catalog
  const [roles, setRoles] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState("");
  const [notice, setNotice] = React.useState("");

  // create-role form
  const [newName, setNewName] = React.useState("");
  const [newPerms, setNewPerms] = React.useState([]);
  const [creating, setCreating] = React.useState(false);

  // assignment
  const [userQuery, setUserQuery] = React.useState("");
  const [users, setUsers] = React.useState([]);
  const [searching, setSearching] = React.useState(false);

  // per-role members (lazy-loaded on expand) + role-change audit
  const [expandedRole, setExpandedRole] = React.useState(null);
  const [membersByRole, setMembersByRole] = React.useState({});
  const [audit, setAudit] = React.useState([]);
  // areaKey -> [{ email, role }] — who holds each admin section (via role)
  const [areaUsers, setAreaUsers] = React.useState({});

  const staffAreas = React.useMemo(() => areas.filter((a) => a.staffGrantable), [areas]);
  const adminAreas = React.useMemo(() => areas.filter((a) => !a.staffGrantable), [areas]);

  const flash = (msg) => {
    setNotice(msg);
    setErr("");
  };

  React.useEffect(() => {
    if (!accessToken) return;
    (async () => {
      setLoading(true);
      try {
        const [cat, list, aud, au] = await Promise.all([
          apiAuthed("/admin/roles/catalog", { token: accessToken }),
          apiAuthed("/admin/roles", { token: accessToken }),
          apiAuthed("/admin/roles/audit", { token: accessToken }).catch(() => ({ entries: [] })),
          apiAuthed("/admin/roles/area-users", { token: accessToken }).catch(() => ({ areaUsers: {} })),
        ]);
        setAreas(cat?.areas || []);
        setRoles(list?.roles || []);
        setAreaUsers(au?.areaUsers || {});
        setAudit(aud?.entries || []);
      } catch (e) {
        setErr(e?.message || "Failed to load roles.");
      } finally {
        setLoading(false);
      }
    })();
  }, [accessToken]);

  async function togglePerm(role, areaKey) {
    if (role.isSuperAdmin) return; // admin is all-on, locked
    const had = role.permissions.includes(areaKey);
    const next = had
      ? role.permissions.filter((k) => k !== areaKey)
      : [...role.permissions, areaKey];

    const prev = role.permissions;
    setRoles((rs) => rs.map((r) => (r.key === role.key ? { ...r, permissions: next } : r)));
    try {
      await apiAuthed(`/admin/roles/${role.key}`, {
        token: accessToken,
        method: "PATCH",
        body: { permissions: next },
      });
      flash(`Updated “${role.name}”.`);
    } catch (e) {
      setRoles((rs) => rs.map((r) => (r.key === role.key ? { ...r, permissions: prev } : r)));
      setErr(e?.message || "Couldn't update the role.");
    }
  }

  async function createRole(e) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    setErr("");
    try {
      const res = await apiAuthed("/admin/roles", {
        token: accessToken,
        method: "POST",
        body: { name, permissions: newPerms },
      });
      setRoles((rs) => [...rs, res.role]);
      setNewName("");
      setNewPerms([]);
      flash(`Role “${res.role.name}” created.`);
    } catch (e2) {
      setErr(e2?.message || "Couldn't create the role.");
    } finally {
      setCreating(false);
    }
  }

  async function deleteRole(role) {
    if (!window.confirm(`Delete the “${role.name}” role? This can't be undone.`)) return;
    try {
      await apiAuthed(`/admin/roles/${role.key}`, { token: accessToken, method: "DELETE" });
      setRoles((rs) => rs.filter((r) => r.key !== role.key));
      flash(`Role “${role.name}” deleted.`);
    } catch (e) {
      setErr(e?.message || "Couldn't delete the role.");
    }
  }

  async function searchUsers(e) {
    e?.preventDefault?.();
    setSearching(true);
    setErr("");
    try {
      const res = await apiAuthed("/admin/roles/users", {
        token: accessToken,
        params: { q: userQuery.trim() },
      });
      setUsers(res?.users || []);
    } catch (e2) {
      setErr(e2?.message || "Couldn't search users.");
    } finally {
      setSearching(false);
    }
  }

  async function assignRole(u, roleKey) {
    const prev = u.role;
    setUsers((us) => us.map((x) => (x._id === u._id ? { ...x, role: roleKey } : x)));
    try {
      await apiAuthed(`/admin/roles/users/${u._id}`, {
        token: accessToken,
        method: "PATCH",
        body: { role: roleKey },
      });
      flash(`${u.email || u.username} is now “${roleKey}”.`);
    } catch (e) {
      setUsers((us) => us.map((x) => (x._id === u._id ? { ...x, role: prev } : x)));
      setErr(e?.message || "Couldn't change that user's role.");
    }
  }

  async function toggleMembers(roleKey) {
    if (expandedRole === roleKey) {
      setExpandedRole(null);
      return;
    }
    setExpandedRole(roleKey);
    if (!membersByRole[roleKey]) fetchMembers(roleKey);
  }

  async function fetchMembers(roleKey) {
    setMembersByRole((m) => ({
      ...m,
      [roleKey]: { ...(m[roleKey] || {}), loading: true, error: "" },
    }));
    try {
      const res = await apiAuthed(`/admin/roles/${roleKey}/members`, { token: accessToken });
      setMembersByRole((m) => ({
        ...m,
        [roleKey]: {
          members: res?.members || [],
          total: res?.total || 0,
          capped: !!res?.capped,
          loading: false,
          error: "",
        },
      }));
    } catch (e) {
      setMembersByRole((m) => ({
        ...m,
        [roleKey]: { ...(m[roleKey] || {}), loading: false, error: e?.message || "Failed to load members" },
      }));
    }
  }

  async function loadAudit() {
    try {
      const res = await apiAuthed("/admin/roles/audit", { token: accessToken });
      setAudit(res?.entries || []);
    } catch {
      /* non-fatal */
    }
  }

  async function revokeMember(role, member) {
    const who = member.email || member.username || "this user";
    if (!window.confirm(`Revoke the “${role.name}” role from ${who}? They'll be set back to a regular user.`))
      return;
    try {
      await apiAuthed(`/admin/roles/users/${member._id}`, {
        token: accessToken,
        method: "PATCH",
        body: { role: "user" },
      });
      setMembersByRole((m) => {
        const cur = m[role.key] || {};
        const members = (cur.members || []).filter((x) => x._id !== member._id);
        return { ...m, [role.key]: { ...cur, members, total: Math.max((cur.total || 1) - 1, 0) } };
      });
      setRoles((rs) =>
        rs.map((r) => {
          if (r.key === role.key) return { ...r, userCount: Math.max((r.userCount || 1) - 1, 0) };
          if (r.key === "user") return { ...r, userCount: (r.userCount || 0) + 1 };
          return r;
        }),
      );
      flash(`Revoked “${role.name}” from ${who}.`);
      loadAudit();
    } catch (e) {
      setErr(e?.message || "Couldn't revoke the role.");
    }
  }

  const toggleNewPerm = (k) =>
    setNewPerms((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));

  const cellCls =
    "h-9 w-9 grid place-items-center rounded-lg border transition disabled:opacity-100";

  return (
    <div className="max-w-6xl mx-auto">
      <AdminPageHeader
        icon={FiShield}
        title="Roles & Access Control"
        subtitle="Define what each role can manage, create custom roles, and assign roles to people."
      />

      {err ? (
        <div className="mb-4 rounded-xl border border-red-300 bg-red-50 text-red-700 px-4 py-2 text-sm dark:bg-red-900/30 dark:border-red-700 dark:text-red-200">
          {err}
        </div>
      ) : null}
      {notice ? (
        <div className="mb-4 rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-700 px-4 py-2 text-sm dark:bg-emerald-900/30 dark:border-emerald-700 dark:text-emerald-200">
          {notice}
        </div>
      ) : null}

      {loading ? (
        <div className="card text-sm text-slate-500 dark:text-adlm-dark-muted">Loading roles…</div>
      ) : (
        <>
          {/* ── Permission matrix ── */}
          <Reveal as="div" className="card overflow-x-auto">
            <h2 className="font-semibold mb-1">Permission matrix</h2>
            <p className="text-xs text-slate-500 dark:text-adlm-dark-muted mb-4">
              Tick an area to grant it to a role. Changes save automatically. The Administrator role
              always has full access and can't be changed.
            </p>

            <table className="w-full text-sm border-separate border-spacing-0">
              <thead>
                <tr className="text-left">
                  <th className="sticky left-0 bg-white dark:bg-adlm-dark-panel py-2 pr-3 align-bottom">
                    Role
                  </th>
                  {staffAreas.map((a) => (
                    <th
                      key={a.key}
                      className="px-1 pb-2 text-center align-bottom text-[11px] font-medium text-slate-600 dark:text-adlm-dark-muted whitespace-nowrap"
                      title={a.label}
                    >
                      <span className="inline-block max-w-[72px] leading-tight">{a.label}</span>
                    </th>
                  ))}
                  <th className="px-2 pb-2 text-right align-bottom" />
                </tr>
              </thead>
              <tbody>
                {roles.map((role) => (
                  <tr key={role.key} className="border-t border-slate-100 dark:border-adlm-dark-border">
                    <td className="sticky left-0 bg-white dark:bg-adlm-dark-panel py-2 pr-3 align-middle">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{role.name}</span>
                        {role.isSuperAdmin ? (
                          <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-adlm-orange/15 text-amber-700 dark:text-amber-300 ring-1 ring-adlm-orange/30">
                            <FiLock className="w-3 h-3" /> full
                          </span>
                        ) : role.system ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-adlm-dark-raised text-slate-500 dark:text-adlm-dark-muted">
                            built-in
                          </span>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleMembers(role.key)}
                        className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-adlm-blue-700 dark:text-adlm-dark-dim dark:hover:text-adlm-blue-400 transition"
                        title="Show who holds this role"
                      >
                        {expandedRole === role.key ? (
                          <FiChevronDown className="w-3 h-3" />
                        ) : (
                          <FiChevronRight className="w-3 h-3" />
                        )}
                        {role.userCount || 0} {role.userCount === 1 ? "user" : "users"}
                      </button>
                    </td>

                    {staffAreas.map((a) => {
                      const on = role.isSuperAdmin || role.permissions.includes(a.key);
                      return (
                        <td key={a.key} className="px-1 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => togglePerm(role, a.key)}
                            disabled={role.isSuperAdmin}
                            aria-pressed={on}
                            title={`${on ? "Remove" : "Grant"} ${a.label}`}
                            className={`${cellCls} ${
                              on
                                ? "bg-adlm-blue-700 border-adlm-blue-700 text-white"
                                : "bg-white dark:bg-adlm-dark-raised border-slate-300 dark:border-adlm-dark-border text-transparent hover:border-adlm-blue-600"
                            } ${role.isSuperAdmin ? "cursor-not-allowed" : "cursor-pointer"}`}
                          >
                            ✓
                          </button>
                        </td>
                      );
                    })}

                    <td className="px-2 py-2 text-right">
                      {!role.system ? (
                        <button
                          type="button"
                          onClick={() => deleteRole(role)}
                          className="text-slate-400 hover:text-red-600 transition"
                          title={`Delete ${role.name}`}
                        >
                          <FiTrash2 className="w-4 h-4" />
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {adminAreas.length ? (
              <p className="mt-4 text-xs text-slate-500 dark:text-adlm-dark-muted">
                <FiLock className="inline w-3 h-3 mr-1" />
                Admin-only areas (not grantable):{" "}
                {adminAreas.map((a) => a.label).join(", ")}.
              </p>
            ) : null}

            {/* Per-role member list — expanded from the count link in a role row. */}
            {expandedRole
              ? (() => {
                  const role = roles.find((r) => r.key === expandedRole);
                  if (!role) return null;
                  const state = membersByRole[expandedRole] || {};
                  const total = state.total ?? role.userCount ?? 0;
                  const members = state.members || [];
                  return (
                    <div className="mt-5 rounded-xl border border-slate-200 dark:border-adlm-dark-border p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <h3 className="flex items-center gap-2 text-sm font-semibold">
                          <FiUsers className="h-4 w-4 text-adlm-blue-700" />
                          Members of “{role.name}”
                          <span className="text-xs font-normal text-slate-400">{total}</span>
                        </h3>
                        <button
                          type="button"
                          className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-adlm-dark-text"
                          onClick={() => setExpandedRole(null)}
                        >
                          Close
                        </button>
                      </div>

                      {state.loading ? (
                        <div className="text-sm text-slate-500 dark:text-adlm-dark-muted">Loading members…</div>
                      ) : state.error ? (
                        <div className="text-sm text-red-600">{state.error}</div>
                      ) : !members.length ? (
                        <div className="text-sm text-slate-400">No users currently hold this role.</div>
                      ) : (
                        <>
                          <ul className="divide-y divide-slate-100 dark:divide-adlm-dark-border">
                            {members.map((m) => {
                              const name =
                                [m.firstName, m.lastName].filter(Boolean).join(" ") || m.username || "—";
                              const isSelf = String(m._id) === String(currentUserId);
                              const isLastAdmin = role.key === "admin" && total <= 1;
                              const blockRevoke = isSelf || isLastAdmin;
                              return (
                                <li key={m._id} className="flex items-center justify-between gap-3 py-2">
                                  <div className="min-w-0">
                                    <div className="truncate text-sm font-medium">
                                      {name}
                                      {isSelf ? (
                                        <span className="ml-2 text-[10px] uppercase tracking-wide text-slate-400">
                                          you
                                        </span>
                                      ) : null}
                                    </div>
                                    <div className="truncate text-xs text-slate-500 dark:text-adlm-dark-muted">
                                      {m.email}
                                    </div>
                                  </div>
                                  {role.key !== "user" ? (
                                    <button
                                      type="button"
                                      onClick={() => revokeMember(role, m)}
                                      disabled={blockRevoke}
                                      title={
                                        isSelf
                                          ? "You can't revoke your own role"
                                          : isLastAdmin
                                            ? "Can't revoke the last administrator"
                                            : `Revoke ${role.name} from ${m.email || m.username}`
                                      }
                                      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium text-red-600 ring-1 ring-red-200 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 dark:ring-red-900/40 dark:hover:bg-red-900/20"
                                    >
                                      <FiUserX className="h-3.5 w-3.5" />
                                      Revoke
                                    </button>
                                  ) : null}
                                </li>
                              );
                            })}
                          </ul>
                          {state.capped ? (
                            <div className="mt-2 text-xs text-slate-400">
                              Showing the first 200. Use “Assign roles” below to find a specific user.
                            </div>
                          ) : null}
                        </>
                      )}
                    </div>
                  );
                })()
              : null}
          </Reveal>

          {/* ── Access by section — who holds each admin area (via role) ── */}
          <Reveal as="div" className="card mt-6" delay={40}>
            <h2 className="font-semibold mb-1 flex items-center gap-2">
              <FiUsers className="w-4 h-4 text-adlm-blue-700" /> Access by
              section
            </h2>
            <p className="text-xs text-slate-500 dark:text-adlm-dark-muted mb-3">
              The users who currently hold each admin section, through their
              role. Super-admins hold every section.
            </p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {areas.map((a) => {
                const holders = areaUsers[a.key] || [];
                return (
                  <div
                    key={a.key}
                    className="rounded-xl border border-slate-200 dark:border-adlm-dark-border p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-semibold text-slate-800 dark:text-white truncate">
                        {a.label}
                      </div>
                      <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-adlm-dark-muted">
                        {holders.length}
                      </span>
                    </div>
                    {holders.length ? (
                      <ul className="mt-1.5 space-y-0.5">
                        {holders.slice(0, 6).map((h) => (
                          <li
                            key={`${a.key}-${h.email}`}
                            className="text-xs text-slate-600 dark:text-adlm-dark-muted truncate"
                            title={`${h.email} (${h.role})`}
                          >
                            {h.email}{" "}
                            <span className="text-slate-400">· {h.role}</span>
                          </li>
                        ))}
                        {holders.length > 6 ? (
                          <li className="text-xs text-slate-400">
                            +{holders.length - 6} more
                          </li>
                        ) : null}
                      </ul>
                    ) : (
                      <div className="mt-1.5 text-xs text-slate-400">
                        No one holds this section.
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Reveal>

          {/* ── Create role ── */}
          <Reveal as="form" onSubmit={createRole} className="card mt-6" delay={60}>
            <h2 className="font-semibold mb-3 flex items-center gap-2">
              <FiPlus className="w-4 h-4 text-adlm-blue-700" /> Create a custom role
            </h2>
            <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <div>
                <label className="form-label">Role name</label>
                <input
                  className="input"
                  placeholder="e.g. Trainer, Finance Clerk"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>
              <button className="btn" disabled={creating || !newName.trim()}>
                {creating ? "Creating…" : "Create role"}
              </button>
            </div>
            <div className="mt-3">
              <div className="text-xs text-slate-500 dark:text-adlm-dark-muted mb-2">
                Grant areas:
              </div>
              <div className="flex flex-wrap gap-2">
                {staffAreas.map((a) => {
                  const on = newPerms.includes(a.key);
                  return (
                    <button
                      key={a.key}
                      type="button"
                      onClick={() => toggleNewPerm(a.key)}
                      className={`px-2.5 py-1 rounded-full text-xs ring-1 transition ${
                        on
                          ? "bg-adlm-blue-700 text-white ring-adlm-blue-700"
                          : "bg-white dark:bg-adlm-dark-raised text-slate-600 dark:text-adlm-dark-muted ring-slate-300 dark:ring-adlm-dark-border hover:ring-adlm-blue-600"
                      }`}
                    >
                      {a.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </Reveal>

          {/* ── Assign roles to users ── */}
          <Reveal as="div" className="card mt-6" delay={120}>
            <h2 className="font-semibold mb-3 flex items-center gap-2">
              <FiUsers className="w-4 h-4 text-adlm-blue-700" /> Assign roles
            </h2>
            <form onSubmit={searchUsers} className="flex gap-2">
              <input
                className="input flex-1"
                placeholder="Search users by name, email, or username"
                value={userQuery}
                onChange={(e) => setUserQuery(e.target.value)}
              />
              <button className="btn" disabled={searching}>
                <FiSearch className="w-4 h-4" />
              </button>
            </form>

            {users.length ? (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500 dark:text-adlm-dark-muted">
                      <th className="py-2 pr-3">User</th>
                      <th className="py-2 pr-3">Email</th>
                      <th className="py-2 pr-3">Role</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u._id} className="border-t border-slate-100 dark:border-adlm-dark-border">
                        <td className="py-2 pr-3">
                          {[u.firstName, u.lastName].filter(Boolean).join(" ") || u.username || "—"}
                        </td>
                        <td className="py-2 pr-3 text-slate-500 dark:text-adlm-dark-muted">{u.email}</td>
                        <td className="py-2 pr-3">
                          <select
                            className="input !h-8 !py-0 text-sm"
                            value={u.role || "user"}
                            onChange={(e) => assignRole(u, e.target.value)}
                          >
                            {roles.map((r) => (
                              <option key={r.key} value={r.key}>
                                {r.name}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-3 text-xs text-slate-400 dark:text-adlm-dark-dim">
                Search for a user to change their role.
              </p>
            )}
          </Reveal>

          {/* ── Recent role changes (audit) ── */}
          <Reveal as="div" className="card mt-6" delay={150}>
            <h2 className="font-semibold mb-3 flex items-center gap-2">
              <FiClock className="w-4 h-4 text-adlm-blue-700" /> Recent role changes
            </h2>
            {audit.length ? (
              <ul className="space-y-2 text-sm">
                {audit.map((a) => (
                  <li
                    key={a._id}
                    className="flex items-center justify-between gap-3 border-b border-slate-100 dark:border-adlm-dark-border pb-2 last:border-0"
                  >
                    <div className="min-w-0">
                      <span className="font-medium">{a.targetEmail || "user"}</span>
                      <span className="text-slate-500 dark:text-adlm-dark-muted">
                        {" "}
                        · {a.fromRole || "—"} → {a.toRole || "—"}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 whitespace-nowrap">
                      {a.actorEmail ? `by ${a.actorEmail} · ` : ""}
                      {a.createdAt ? new Date(a.createdAt).toLocaleString() : ""}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-400">No role changes recorded yet.</p>
            )}
          </Reveal>
        </>
      )}
    </div>
  );
}
