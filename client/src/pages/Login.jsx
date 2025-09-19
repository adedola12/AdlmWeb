// src/pages/Login.jsx  (only the submit + useEffect changes shown)
import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../store.jsx";

export default function Login() {
  const nav = useNavigate();
  const [qs] = useSearchParams();
  const next = qs.get("next") || "/";

  const { setAuth } = useAuth();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [err, setErr] = React.useState("");

  async function submit(e) {
    e.preventDefault();
    setErr("");
    try {
      const res = await api("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setAuth({
        user: res.user,
        accessToken: res.accessToken,
        licenseToken: res.licenseToken,
      });
      nav(next, { replace: true });
    } catch (e) {
      setErr(e.message);
    }
  }

  return (
    <div className="max-w-md mx-auto card">
      <h1 className="text-xl font-semibold mb-4">Sign in</h1>
      <form onSubmit={submit} className="space-y-3">
        <input
          className="input"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className="input"
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {err && <div className="text-red-600 text-sm">{err}</div>}
        <button className="btn w-full">Sign in</button>
      </form>
    </div>
  );
}
