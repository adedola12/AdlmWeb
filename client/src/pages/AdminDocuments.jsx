// The /admin/documents route.
//
// Gated on the invoices permission rather than a new one: this composes the
// documents ADLM sends clients — fee notes, proposals, letters, statements —
// and whoever is trusted to raise an invoice is exactly the group that should
// be able to write one of those on the letterhead. Adding a permission nobody
// has assigned yet would lock the screen to nobody.

import React from "react";
import DsDocComposer from "../ds/DsDocComposer.jsx";

export default function AdminDocuments() {
  return <DsDocComposer />;
}
