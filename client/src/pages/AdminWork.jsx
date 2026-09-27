// client/src/pages/AdminWork.jsx
// The work board (docs/WORK_BOARD.md): everything in flight across ADLM, and
// the proposal-first rule for new features and buttons.
import React from "react";
import { FiClipboard } from "../components/icons.jsx";
import AdminPageHeader from "../components/AdminPageHeader.jsx";
import { WorkBoard } from "../features/work/WorkBoard.jsx";

export default function AdminWork() {
  return (
    <div className="space-y-6">
      <AdminPageHeader
        icon={FiClipboard}
        title="Work board"
        subtitle="What is being built across ADLM, and the business case behind every new feature, before it is built."
      />
      <WorkBoard />
    </div>
  );
}
