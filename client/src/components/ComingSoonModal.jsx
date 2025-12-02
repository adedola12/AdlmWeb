import React from "react";

export default function ComingSoonModal({ show, onClose }) {
  if (!show) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />
      <div className="relative bg-white rounded p-6 max-w-lg w-full z-10">
        <h3 className="text-lg font-semibold mb-2">Coming Soon!</h3>
        <p className="text-sm text-slate-700 mb-4">
          This feature is under development and will be available soon.
        </p>
        <div className="flex gap-2 justify-end">
          <button
            className="btn"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
