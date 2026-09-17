// Richard's feedback system (assets/js/feedback.js, 17 Sep 2026): one toast
// and one card for the whole site, so every action reports back.
//
//   const fb = useFeedback();   (from ./feedbackContext.js)
//   fb.toast({ tone, title, msg, action: { label, run }, ms })
//   fb.toast("Saved")                        → a success toast
//   fb.card({ tone, title, msg, rows: [[k, v]], primary, secondary })
//                                            → Promise<"primary"|"secondary"|null>
//
//
// His markup and classes (.fb-stack, .fb-toast, .fb-back, .fb-card), rendered
// through portals. ds-feedback.css scopes them under .ds, so each portal
// carries a .ds wrapper with display: contents.

import React from "react";
import { createPortal } from "react-dom";
import { guessTone, toastLife } from "./feedbackRules.js";
import { FeedbackContext } from "./feedbackContext.js";

const ICON = {
  success: <path d="M5 12.5l4.2 4.2L19 7" />,
  error: <path d="M7 7l10 10M17 7L7 17" />,
  warning: (
    <>
      <path d="M12 7.5v6" />
      <path d="M12 17h.01" />
      <path d="M10.3 3.9L2.6 17.2A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-2.8L13.7 3.9a2 2 0 0 0-3.4 0z" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5" />
      <path d="M12 7.6h.01" />
    </>
  ),
};

const Ic = ({ tone }) => (
  <i className="fb-ic">
    <svg viewBox="0 0 24 24">{ICON[tone] || ICON.info}</svg>
  </i>
);

const X = (
  <svg viewBox="0 0 24 24">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

let nextId = 1;

function Toast({ t, onGone }) {
  const [on, setOn] = React.useState(false);
  const [out, setOut] = React.useState(false);
  React.useEffect(() => {
    const r = requestAnimationFrame(() => setOn(true));
    return () => cancelAnimationFrame(r);
  }, []);
  const close = React.useCallback(() => {
    setOut(true);
    setTimeout(() => onGone(t.id), 260);
  }, [onGone, t.id]);
  const cls = ["fb-toast", t.tone, on && "on", out && "out"].filter(Boolean).join(" ");
  return (
    <div
      className={cls}
      role={t.tone === "error" ? "alert" : "status"}
      aria-live={t.tone === "error" ? "assertive" : "polite"}
    >
      <Ic tone={t.tone} />
      <div className="fb-tx">
        <b>{t.title}</b>
        {t.msg && <span>{t.msg}</span>}
        {t.action && (
          <div className="fb-act">
            <button
              type="button"
              onClick={() => {
                try {
                  t.action.run?.();
                } finally {
                  close();
                }
              }}
            >
              {t.action.label}
            </button>
          </div>
        )}
      </div>
      <button type="button" className="fb-x" aria-label="Dismiss" onClick={close}>
        {X}
      </button>
      <span
        className="fb-life"
        style={{ animationDuration: `${t.ms}ms` }}
        onAnimationEnd={close}
      />
    </div>
  );
}

function Card({ c, onClose }) {
  const [on, setOn] = React.useState(false);
  const ref = React.useRef(null);
  const last = React.useRef(typeof document !== "undefined" ? document.activeElement : null);
  const tone = c.tone || "info";

  const close = React.useCallback(
    (v) => {
      setOn(false);
      setTimeout(() => {
        onClose(c.id, v);
        last.current?.focus?.();
      }, 220);
    },
    [c.id, onClose],
  );

  React.useEffect(() => {
    const r = requestAnimationFrame(() => {
      setOn(true);
      ref.current?.querySelector(".fb-btns .p")?.focus();
    });
    const key = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close(null);
      }
      if (e.key === "Tab" && ref.current) {
        const f = ref.current.querySelectorAll("button,a[href],input,select,textarea");
        if (!f.length) return;
        const a = f[0];
        const z = f[f.length - 1];
        if (e.shiftKey && document.activeElement === a) {
          e.preventDefault();
          z.focus();
        } else if (!e.shiftKey && document.activeElement === z) {
          e.preventDefault();
          a.focus();
        }
      }
    };
    document.addEventListener("keydown", key, true);
    return () => {
      cancelAnimationFrame(r);
      document.removeEventListener("keydown", key, true);
    };
  }, [close]);

  const btn = (b, cls, value) => {
    if (!b) return null;
    const o = typeof b === "string" ? { label: b } : b;
    if (o.href) {
      return (
        <a className={cls} href={o.href}>
          {o.label}
        </a>
      );
    }
    return (
      <button
        type="button"
        className={o.danger ? `${cls} danger` : cls}
        onClick={() => {
          if (c.validate && value === "primary" && c.validate(ref.current) === false) return;
          close(value);
        }}
      >
        {o.label}
      </button>
    );
  };

  return (
    <div
      className={on ? "fb-back on" : "fb-back"}
      onClick={(e) => {
        if (e.target === e.currentTarget && !c.sticky) close(null);
      }}
    >
      <div
        ref={ref}
        className={`fb-card ${tone}`}
        role={tone === "error" || tone === "warning" ? "alertdialog" : "dialog"}
        aria-modal="true"
        aria-labelledby={`fb-h-${c.id}`}
      >
        <button type="button" className="fb-x" aria-label="Close" onClick={() => close(null)}>
          {X}
        </button>
        {!c.noIcon && <Ic tone={tone} />}
        <h2 id={`fb-h-${c.id}`}>{c.title}</h2>
        {c.msg && <p>{c.msg}</p>}
        {c.body}
        {c.rows?.length > 0 && (
          <div className="fb-rows">
            {c.rows.map(([k, v]) => (
              <div key={k}>
                <span>{k}</span>
                <b>{v}</b>
              </div>
            ))}
          </div>
        )}
        <div className="fb-btns">
          {btn(c.secondary, "s", "secondary")}
          {btn(c.primary || "Done", "p", "primary")}
        </div>
      </div>
    </div>
  );
}

export function FeedbackProvider({ children }) {
  const [toasts, setToasts] = React.useState([]);
  const [cards, setCards] = React.useState([]);

  const dropToast = React.useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const toast = React.useCallback((o, tone) => {
    const opt = typeof o === "string" ? { title: o, tone: tone || guessTone(o) } : o || {};
    const t = { ...opt, tone: opt.tone || "success", id: nextId++ };
    t.ms = toastLife(t);
    // Never more than three at once; the oldest goes.
    setToasts((list) => [...list, t].slice(-3));
    return { close: () => dropToast(t.id) };
  }, [dropToast]);

  const card = React.useCallback(
    (o) =>
      new Promise((resolve) => {
        setCards((list) => [...list, { ...(o || {}), id: nextId++, resolve }]);
      }),
    [],
  );

  const closeCard = React.useCallback((id, value) => {
    setCards((list) => {
      list.find((c) => c.id === id)?.resolve(value);
      return list.filter((c) => c.id !== id);
    });
  }, []);

  const value = React.useMemo(() => ({ toast, card }), [toast, card]);

  const portal =
    typeof document !== "undefined"
      ? createPortal(
          <div className="ds" style={{ display: "contents" }}>
            {toasts.length > 0 && (
              <div className="fb-stack">
                {toasts.map((t) => (
                  <Toast key={t.id} t={t} onGone={dropToast} />
                ))}
              </div>
            )}
            {cards.map((c) => (
              <Card key={c.id} c={c} onClose={closeCard} />
            ))}
          </div>,
          document.body,
        )
      : null;

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      {portal}
    </FeedbackContext.Provider>
  );
}
