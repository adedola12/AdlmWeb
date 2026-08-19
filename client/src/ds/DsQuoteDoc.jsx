// The quotation document, opened from "See the quotation".
//
// His build shows a real document here — logo, quotation number, addressee,
// terms, and an S/N table — not a print dialog. Ours used to call
// window.print() and hope the page looked like a quotation, which it did not:
// what came out was the marketing page with a summary panel in it.
//
// The sheet is built by adlmDoc.js (his engine, ported) and mounted into the
// stage imperatively, because that engine measures real geometry to paginate
// and needs the nodes in the document to do it. React owns the modal; the
// engine owns what is inside the stage.

import React from "react";
import { createPortal } from "react-dom";
import { mount } from "./adlmDoc.js";
import DsDocStyles from "./DsDocStyles.jsx";

/**
 * @param {object} props
 * @param {object} props.spec   an adlmDoc spec
 * @param {() => void} props.onClose
 */
export default function DsQuoteDoc({ spec, onClose }) {
  const stage = React.useRef(null);

  React.useEffect(() => {
    if (stage.current) mount(stage.current, spec);
  }, [spec]);

  React.useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    // His openDoc() locks the page behind the sheet; without it the marketing
    // page scrolls under the dialog while the quotation stays still.
    document.documentElement.classList.add("mk-open");
    return () => {
      document.removeEventListener("keydown", onKey);
      document.documentElement.classList.remove("mk-open");
    };
  }, [onClose]);

  // Portalled to <body>: the dialog is fixed and full-screen, and leaving it
  // inside the page means any ancestor with a transform — several of his
  // panels have one for the hover lift — becomes its containing block and
  // clips it.
  return createPortal(
    <div className="ds">
      <DsDocStyles />
      <div
        className="qt-doc"
        role="dialog"
        aria-modal="true"
        aria-label="Your quotation"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="qt-doc-bar doc-noprint">
          <b>Your quotation</b>
          <div>
            <button
              type="button"
              className="ds-btn btn-p ds-btn-sm"
              onClick={() => window.print()}
            >
              Print or save as PDF
            </button>
            <button type="button" className="ds-btn btn-o ds-btn-sm qt-close" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
        <div className="qt-doc-scroll">
          <div ref={stage} className="doc-stage" />
        </div>
      </div>
    </div>,
    document.body,
  );
}
