// src/pages/RevitProjects.jsx
import React from "react";
import { useAuth } from "../store.jsx";
import { apiAuthed } from "../http.js";
import { useSearchParams } from "react-router-dom";

export default function RevitProjects() {
  const { accessToken } = useAuth();
  const [rows, setRows] = React.useState([]);
  const [sel, setSel] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [searchParams] = useSearchParams();

  async function load() {
    setErr("");
    try {
      const list = await apiAuthed("/projects", { token: accessToken });
      setRows(list);

      // deep-link selection: ?project=<id>
      const preselectId = searchParams.get("project");
      const toOpen = preselectId
        ? list.find((x) => x._id === preselectId)?._id
        : list[0]?._id;

      if (toOpen) view(toOpen);
      else setSel(null);
    } catch (e) {
      setErr(e.message || "Failed to load projects");
    }
  }

  async function view(id) {
    setErr("");
    try {
      const p = await apiAuthed(`/projects/${id}`, { token: accessToken });
      setSel(p);
    } catch (e) {
      setErr(e.message || "Failed to open project");
    }
  }

  React.useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  function copyId() {
    if (!sel?._id) return;
    navigator.clipboard.writeText(sel._id).catch(() => {});
  }

  // His pieces: .wk-head, a .wk-panel list of projects (his nav links, the
  // open one carrying his accent), and the takeoff as his use-lines.
  return (
    <div style={{ display: "grid", gap: 18, gridTemplateColumns: "minmax(0, 1fr)" }}>
      <div className="wk-head" style={{ marginBottom: 0 }}>
        <div>
          <h1>QUIV projects</h1>
          <p className="wk-ref">Takeoffs saved from QUIV to the cloud</p>
        </div>
        <div className="wk-acts">
          <button type="button" className="ds-btn ds-btn-sm btn-o" onClick={load}>
            Refresh
          </button>
        </div>
      </div>

      {err && (
        <p className="mk-note" role="alert" style={{ margin: 0, background: "var(--pal-orange-wash)", color: "var(--pal-orange-key)", borderColor: "var(--pal-orange-line)" }}>
          {err}
        </p>
      )}

      <div className="grid items-start gap-[18px] grid-cols-1 md:grid-cols-3">
        <nav className="wk-panel" aria-label="QUIV projects" style={{ marginBottom: 0, padding: "4px 14px 14px" }}>
          <p className="dsh-grp" style={{ marginTop: 14 }}>
            {rows.length} project{rows.length === 1 ? "" : "s"}
          </p>
          {rows.length === 0 ? (
            <div className="wk-empty" style={{ padding: "20px 8px" }}>No projects yet.</div>
          ) : (
            <ul className="dsh-nav" style={{ gridTemplateColumns: "minmax(0, 1fr)" }}>
              {rows.map((r) => {
                const on = sel?._id === r._id;
                return (
                  <li key={r._id}>
                    <a
                      href={`?project=${r._id}`}
                      className={on ? "on" : undefined}
                      aria-current={on ? "page" : undefined}
                      onClick={(e) => {
                        e.preventDefault();
                        view(r._id);
                      }}
                      style={{ display: "block" }}
                    >
                      <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {r.name}
                      </span>
                      <span className="wk-locnote" style={{ display: "block" }}>
                        {r.itemCount} items · {new Date(r.updatedAt).toLocaleString()}
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </nav>

        <section className="wk-panel md:col-span-2" style={{ marginBottom: 0, minWidth: 0 }}>
          {!sel ? (
            <div className="wk-empty">Select a project</div>
          ) : (
            <>
              <div className="wk-ph" style={{ flexWrap: "wrap" }}>
                <h2>{sel.name}</h2>
                <button type="button" className="ds-btn ds-btn-sm btn-o" onClick={copyId}>
                  Copy ID
                </button>
              </div>

              <div className="wk-use">
                {sel.items.map((it, i) => (
                  <div className="wk-useline" key={i}>
                    <span className="p">
                      {it.description}
                      <em>S/N {it.sn}</em>
                    </span>
                    <span className="q">{it.unit || ""}</span>
                    <span className="v">{Number(it.qty).toFixed(2)}</span>
                  </div>
                ))}
              </div>

              <div className="wk-note" style={{ borderTop: "1px solid var(--line)" }}>
                <div>
                  Project ID: <code>{sel._id}</code> (use this in QUIV to open/update)
                </div>
                <div>
                  <b>Tip:</b> In QUIV’s “Open from Cloud”, paste this ID to view the
                  saved takeoff.
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
