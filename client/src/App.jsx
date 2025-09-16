import React from "react";
import { Outlet } from "react-router-dom";
import Nav from "./components/Nav.jsx";

export default function App() {
  return (
    <div>
      <Nav />
      <div className="max-w-5xl mx-auto p-6">
        <Outlet />
      </div>
    </div>
  );
}
