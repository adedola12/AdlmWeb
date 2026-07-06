// src/features/archicad/useArchicadUnits.jsx
// Metric / imperial display preference for the ArchiCAD screens.
// Persisted server-side via GET/PUT /api/archicad/preferences; defaults to
// metric. Toggling re-renders instantly and persists in the background —
// conversion is applied at display time only (see utils/archicadUnits.js).
import React from "react";
import { useAuth } from "../../store.jsx";
import { apiAuthed } from "../../http.js";

export default function useArchicadUnits() {
  const { accessToken } = useAuth();
  const [units, setUnitsState] = React.useState("metric");

  React.useEffect(() => {
    if (!accessToken) return undefined;
    let alive = true;
    apiAuthed("/api/archicad/preferences", { token: accessToken })
      .then((res) => {
        const val = res?.units ?? res?.preferences?.units;
        if (alive && val === "imperial") setUnitsState("imperial");
        if (alive && val === "metric") setUnitsState("metric");
      })
      .catch(() => {}); // preference is cosmetic — never block the page on it
    return () => {
      alive = false;
    };
  }, [accessToken]);

  const setUnits = React.useCallback(
    (next) => {
      const val = next === "imperial" ? "imperial" : "metric";
      setUnitsState(val); // instant re-render
      apiAuthed("/api/archicad/preferences", {
        token: accessToken,
        method: "PUT",
        data: { units: val },
      }).catch(() => {});
    },
    [accessToken],
  );

  return [units, setUnits];
}
