import React from "react";
import { api } from "../api.js";
import { useAuth } from "../store.jsx";

export default function ChangePassword() {
  const { user } = useAuth();
  const [oldPassword, setOld] = React.useState("");
  const [newPassword, setNew] = React.useState("");
  const [msg, setMsg] = React.useState("");

  async function submit(e) {
    e.preventDefault();
    setMsg("");
    try {
      await api("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ email: user.email, oldPassword, newPassword }),
      });
      setMsg("Password changed. Please login again on other devices.");
    } catch (e) {
      setMsg(e.message);
    }
  }

  return (
    <div className="max-w-md mx-auto card">
      <h1 className="text-xl font-semibold mb-4">Change password</h1>
      <form onSubmit={submit} className="space-y-3">
        <input
          className="input"
          placeholder="Old password"
          type="password"
          value={oldPassword}
          onChange={(e) => setOld(e.target.value)}
        />
        <input
          className="input"
          placeholder="New password"
          type="password"
          value={newPassword}
          onChange={(e) => setNew(e.target.value)}
        />
        {msg && <div className="text-sm">{msg}</div>}
        <button className="btn w-full">Update</button>
      </form>
    </div>
  );
}
