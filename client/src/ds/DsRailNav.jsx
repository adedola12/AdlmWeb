// The signed-in rail, drawn from ds/railConfig.js (R03) in Richard's markup
// and classes (tools/rail.js, 17 Sep 2026). Replaces the generated
// chrome/DsRail.jsx in the shell so the items live in one array and the
// current item comes from lib/railActive.js (R04), not from the DOM.

import React from "react";
import { Link } from "react-router-dom";
import { RAIL } from "./railConfig.js";

const Svg = ({ id }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <use href={`#${id}`} />
  </svg>
);

function hrefOf(item) {
  if (!item.query) return item.to;
  return `${item.to}?${new URLSearchParams(item.query).toString()}`;
}

function readFold(key) {
  try {
    return localStorage.getItem(key) !== "shut";
  } catch {
    return true;
  }
}

function Item({ item, activeId, d, dots, onSignOut }) {
  const on = item.id === activeId;
  const cls = [item.state === "off" && "off", on && "on"].filter(Boolean).join(" ") || undefined;
  const inner = (
    <>
      {item.img ? <img src={item.img} alt="" /> : <Svg id={item.icon} />}
      {item.label}
      {item.tag === "Add" && <span className="add">Add</span>}
      {item.tag === "Soon" && <span className="soon">Soon</span>}
      {item.badge && d[item.badge] ? <span className="tail">{d[item.badge]}</span> : null}
      {item.dot && dots?.[item.dot] ? (
        <i className="adlm-dot" role="status" aria-label={dots[item.dot].label} />
      ) : null}
    </>
  );

  // Not built yet: shown so the rail matches his, but not a link to nowhere.
  if (item.ready === false) {
    return (
      <li>
        <a className="off" aria-disabled="true" title="Coming soon" onClick={(e) => e.preventDefault()}>
          {inner}
        </a>
      </li>
    );
  }
  if (item.action === "signOut") {
    return (
      <li>
        <a href="/" onClick={onSignOut}>
          {inner}
        </a>
      </li>
    );
  }
  return (
    <li>
      <Link
        to={hrefOf(item)}
        className={cls}
        data-rail-id={item.id}
        aria-current={on ? "page" : undefined}
      >
        {inner}
      </Link>
    </li>
  );
}

function Tools({ group, activeId, d, dots }) {
  const here = group.items.some((it) => it.id === activeId);
  const [open, setOpen] = React.useState(() => readFold(group.fold));
  // Opens on its own when the current page is one of the tools, so the
  // highlighted link is never hidden inside a closed group (his shell.js).
  const shown = open || here;
  const cls = ["has-grp", "dsh-tools", here && "here", !shown && "shut"].filter(Boolean).join(" ");
  return (
    <li className={cls} data-tools="">
      <button
        type="button"
        className="dsh-grp-b"
        aria-expanded={shown}
        onClick={() => {
          const next = !shown;
          setOpen(next);
          try {
            localStorage.setItem(group.fold, next ? "open" : "shut");
          } catch {
            /* a folded group is only a preference */
          }
        }}
      >
        <Svg id={group.icon} />
        <span className="lb">{group.label}</span>
        <i className="caret" />
      </button>
      <ul className="dsh-sub">
        {group.items.map((it) => (
          <Item key={it.id} item={it} activeId={activeId} d={d} dots={dots} />
        ))}
      </ul>
    </li>
  );
}

/**
 * @param {object} props
 * @param {string|null} props.activeId   from lib/railActive.js
 * @param {object} props.d               badges, initials, org name
 * @param {object} [props.dots]          { assignments: { label } } red dots
 * @param {(e) => void} props.onSignOut
 */
export default function DsRailNav({ activeId, d, dots, onSignOut, rail = RAIL }) {
  return (
    <aside className="dsh-rail" aria-label="ADLM Studio">
      <Link className="dsh-brand" to="/work" aria-label="ADLM Studio">
        <img className="logo-l" src="/ds/logo-light.svg" alt="ADLM Studio" />
        <img className="logo-d" src="/ds/logo-dark.svg" alt="ADLM Studio" />
      </Link>
      <button type="button" className="dsh-acct">
        <span className="dsh-avi">{d.initials}</span>
        <span style={{ minWidth: 0 }}>
          <b>{d.orgName}</b>
          <span>{d.orgSub}</span>
        </span>
        <i className="caret" />
      </button>
      <button type="button" className="dsh-ada" data-ada-open="">
        <Svg id="wi-ada" />
        <span>
          <b>Ask Ada</b>
          <em>Your library, answered</em>
        </span>
      </button>

      {rail.map((g, gi) => (
        <React.Fragment key={g.group || `g${gi}`}>
          {gi > 0 && <div className="dsh-rule" />}
          {g.group && (
            <p className="dsh-grp-t">
              {g.group}
              {g.sub ? (
                <>
                  {" "}
                  <span>{g.sub}</span>
                </>
              ) : null}
            </p>
          )}
          <ul className="dsh-nav">
            {g.items.map((it) =>
              it.items ? (
                <Tools key={it.id} group={it} activeId={activeId} d={d} dots={dots} />
              ) : (
                <Item key={it.id} item={it} activeId={activeId} d={d} dots={dots} onSignOut={onSignOut} />
              ),
            )}
          </ul>
        </React.Fragment>
      ))}
    </aside>
  );
}
