import React from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import "../src/index.css";
import "../src/styles/ds-admin.css";
import DsAdminTimeSaved from "../src/ds/DsAdminTimeSaved.jsx";

createRoot(document.getElementById("root")).render(
  <MemoryRouter>
    <div className="ds" style={{ padding: 24, maxWidth: 1180, margin: "0 auto" }}>
      <div className="adm-page-in">
        <DsAdminTimeSaved />
      </div>
    </div>
  </MemoryRouter>,
);
