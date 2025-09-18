// src/App.jsx
import React from "react";
import { Outlet } from "react-router-dom";
import Nav from "./components/Nav.jsx";
import Footer from "./components/Footer.jsx";

export default function App() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <Nav />
      <main className="max-w-6xl mx-auto w-full px-6 py-8 flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
