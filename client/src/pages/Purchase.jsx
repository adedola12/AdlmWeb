import React from "react";
import { useAuth } from "../store.js";

export default function Purchase() {
  const { accessToken } = useAuth();
  const [productKey, setProduct] = React.useState("rategen");
  const [months, setMonths] = React.useState(1);
  const [msg, setMsg] = React.useState("");

  async function buy() {
    setMsg("");
    try {
      const res = await fetch("http://localhost:4000/purchase", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ productKey, months: Number(months) }),
      });
      if (!res.ok) throw new Error("Purchase failed");
      setMsg("Purchase successful. Check Dashboard for updated expiry.");
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
