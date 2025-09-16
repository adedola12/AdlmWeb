import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import "./index.css";
import App from "./App.jsx";
import Login from "./pages/Login.jsx";
import Signup from "./pages/Signup.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Purchase from "./pages/Purchase.jsx";
import Admin from "./pages/Admin.jsx";
import ChangePassword from "./pages/ChangePassword.jsx";
import { useAuth } from "./store.js";

function Guard({ children, admin = false }) {
  const { user, refresh } = useAuth();
  const [ok, setOk] = React.useState(user ? true : null);

  React.useEffect(() => {
    if (user) return; // already signed
    refresh()
      .then((success) => setOk(success))
      .catch(() => setOk(false));
  }, []);

  if (ok === null) return <div className="p-6">Loading…</div>;
  if (!ok) return <Navigate to="/login" replace />;
  if (admin && useAuth.getState().user?.role !== "admin")
    return <Navigate to="/" replace />;
  return children;
}

createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <Routes>
      <Route element={<App />}>
        <Route
          index
          element={
            <Guard>
              <Dashboard />
            </Guard>
          }
        />
        <Route
          path="/purchase"
          element={
            <Guard>
              <Purchase />
            </Guard>
          }
        />
        <Route
          path="/admin"
          element={
            <Guard admin>
              <Admin />
            </Guard>
          }
        />
        <Route
          path="/change-password"
          element={
            <Guard>
              <ChangePassword />
            </Guard>
          }
        />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
      </Route>
    </Routes>
  </BrowserRouter>
);
