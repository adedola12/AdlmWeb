import React from "react";
import { useAuth } from "../store.js";
import { apiAuthed } from "../http.js";

export default function Purchase() {
  const { accessToken } = useAuth();
  const [productKey, setProduct] = React.useState("rategen");
  const [months, setMonths] = React.useState(1);
  const [msg, setMsg] = React.useState("");

  async function buy() {
    setMsg("");
    try {
      await apiAuthed(`/purchase`, {
        token: accessToken,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productKey, months: Number(months) }),
      });
      setMsg("Purchase submitted. An admin will approve or reject it soon.");
    } catch (e) {
      setMsg(e.message);
    }
  }
  return (
    <div className="max-w-md mx-auto card space-y-3">
      <h1 className="text-xl font-semibold">Purchase</h1>
      <select
        className="input"
        value={productKey}
        onChange={(e) => setProduct(e.target.value)}
      >
        <option value="rategen">RateGen</option>
        <option value="planswift">PlanSwift</option>
        <option value="revit">Revit</option>
        <option value="mep">Revit MEP</option>
      </select>
      <input
        className="input"
        type="number"
        min="1"
        value={months}
        onChange={(e) => setMonths(e.target.value)}
        placeholder="Months"
      />
      <button className="btn w-full" onClick={buy}>
        Pay (Simulated)
      </button>
      {msg && <div className="text-sm">{msg}</div>}
    </div>
  );
}
