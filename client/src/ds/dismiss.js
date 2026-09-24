// One rule for every dropdown, menu and panel (R05).
//
// An open dropdown closes when:
//   1. the pointer goes down anywhere outside it,
//   2. Escape is pressed,
//   3. another dropdown opens.
//
// (3) needs a shared registry, so this is a module rather than per-component
// effects: whichever dropdown opens last asks every other open one to close.
// React components use useDismiss(); plain-DOM code (his nav mega-panel in
// useDsBehaviours) uses claimOpen() directly.

import React from "react";

const open = new Set();

/**
 * Register an open dropdown. Closes every other open one first.
 *
 * @param {() => void} close        closes this dropdown
 * @param {object} [opts]
 * @param {() => Array<Element|null>} [opts.inside]  elements a pointer-down
 *        may land in without closing (the trigger and the menu itself)
 * @param {boolean} [opts.escape=true]  close on Escape
 * @returns {() => void} release: call when the dropdown closes on its own
 */
export function claimOpen(close, { inside = () => [], escape = true } = {}) {
  for (const other of [...open]) {
    if (other !== close) other();
  }
  open.add(close);

  const onPointer = (e) => {
    const t = e.target;
    if (inside().some((el) => el && (el === t || el.contains?.(t)))) return;
    close();
  };
  const onKey = (e) => {
    if (escape && e.key === "Escape") close();
  };
  document.addEventListener("pointerdown", onPointer, true);
  document.addEventListener("keydown", onKey);

  return () => {
    open.delete(close);
    document.removeEventListener("pointerdown", onPointer, true);
    document.removeEventListener("keydown", onKey);
  };
}

/**
 * React: while `isOpen`, close on outside pointer-down, Escape, or another
 * dropdown opening.
 *
 * @param {boolean} isOpen
 * @param {() => void} close
 * @param {Array<React.RefObject>} refs  the trigger and the menu
 */
export function useDismiss(isOpen, close, refs = []) {
  const closeRef = React.useRef(close);
  closeRef.current = close;
  const refsRef = React.useRef(refs);
  refsRef.current = refs;

  React.useEffect(() => {
    if (!isOpen) return undefined;
    // A stable identity for the registry, calling the latest close.
    const doClose = () => closeRef.current();
    return claimOpen(doClose, {
      inside: () => refsRef.current.map((r) => r?.current),
    });
  }, [isOpen]);
}

/** For tests: how many dropdowns are registered open. */
export function openCount() {
  return open.size;
}
