import { Link } from "react-router-dom";

/**
 * The account switcher that sits at the top of the account menu.
 *
 * Ported from his site/assets/js/surface.js — markup, class names, icons and
 * wording are his. Somebody with admin rights holds two accounts' worth of
 * screens under one sign-in, and his answer is not a pair of links but a
 * pair of destinations that say what they hold: an icon, a name, a line of
 * what is over there, and a "Here" badge on the side you are already on. So
 * the menu tells you where you are as well as where you can go.
 *
 * A customer sees nothing — there is no second surface for them to be on,
 * and the caller passes `both={false}`, exactly as his dash.js does.
 */

// His SURFACES, with his hrefs swapped for our routes. The notes are his
// words: they describe what each side actually holds, which is the whole
// point of the row.
const SURFACES = [
  {
    id: "account",
    label: "Your account",
    note: "Products, seats, invoices and your learning",
    href: "/manage",
    icon: "hi-overview",
  },
  {
    id: "admin",
    label: "ADLM admin",
    note: "Approvals, documents, the price book and the billboard",
    href: "/admin",
    icon: "hi-shield",
  },
];

export default function DsSurfaceSwitch({ at }) {
  return (
    <div className="sw">
      <span className="sw-k">This account opens</span>
      {SURFACES.map((s) => {
        const on = s.id === at;
        return (
          <Link
            key={s.id}
            to={s.href}
            className={on ? "sw-row on" : "sw-row"}
            aria-current={on ? "page" : undefined}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <use href={`#${s.icon}`} />
            </svg>
            <span>
              <b>{s.label}</b>
              <em>{s.note}</em>
            </span>
            {on ? <i className="sw-now">Here</i> : null}
          </Link>
        );
      })}
    </div>
  );
}
