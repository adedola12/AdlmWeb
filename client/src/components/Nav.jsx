import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../store.js";
import { api } from "../api.js";

export default function Nav() {
  const { user, clear, setAuth } = useAuth();
  const navigate = useNavigate();

  async function logout() {
    await api("/auth/logout", { method: "POST" });
    clear();
    navigate("/login");
  }

  return (
    <nav className="bg-white border-b">
      <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between">
        <Link to="/" className="font-semibold">
          ADLM Accounts
        </Link>
        <div className="flex items-center gap-4">
          {user?.role === "admin" && (
            <Link to="/admin" className="text-sm">
              Admin
            </Link>
          )}
          {!!user && (
            <Link to="/purchase" className="text-sm">
              Purchase
            </Link>
          )}
          {!!user && (
            <Link to="/change-password" className="text-sm">
              Change Password
            </Link>
          )}
          {!user ? (
            <>
              <Link to="/login" className="text-sm">
                Login
              </Link>
              <Link to="/signup" className="text-sm">
                Signup
              </Link>
            </>
          ) : (
            <button onClick={logout} className="btn">
              Logout
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}
