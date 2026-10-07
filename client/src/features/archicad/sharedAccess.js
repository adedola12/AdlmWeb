// src/features/archicad/sharedAccess.js
//
// What a reader may do on a shared ArchiCAD project, as the server reports it
// on the BoQ document (routes/archicad.routes.js sendBoqDocument):
//   canEdit      false for a view-only collaborator (and for samples)
//   canExport    false for a view-only collaborator (samples may export)
//   isOwner      false for anyone the project was shared with
//   moneyHidden  true when the prices are hidden from this reader, and
//   moneyHiddenBy "owner" (the owner's switch) or "rategen" (no RateGen)
//
// The server enforces all of it; the page only reads it to hide the controls
// that would be refused. A document from an API older than these flags reads
// as today: editable, owner, money shown.

export function sharedAccess(boq) {
  return {
    canEdit: boq?.canEdit !== false,
    canExport: boq?.canExport !== false,
    isOwner: boq?.isOwner !== false,
    moneyHidden: !!boq?.moneyHidden,
    moneyHiddenBy: boq?.moneyHiddenBy || null,
  };
}

// The one line that tells a collaborator why the bill has no prices or no
// edit controls. null when there is nothing to say (the owner, or a full
// collaborator who may see the money).
export function sharedAccessNote({ canEdit = true, moneyHidden = false, moneyHiddenBy } = {}) {
  const parts = [];
  if (moneyHidden) {
    parts.push(
      moneyHiddenBy === "owner"
        ? "The project owner has hidden this project's prices from you."
        : "Prices on a shared project need a RateGen subscription.",
    );
    parts.push("You can see what was measured, but not the rates, totals or margins.");
  }
  if (!canEdit) parts.push("You have view-only access, so this bill cannot be changed from here.");
  return parts.length ? parts.join(" ") : null;
}
