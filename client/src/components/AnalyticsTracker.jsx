import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { trackPageView } from "../ga";

export default function AnalyticsTracker() {
  const location = useLocation();

  useEffect(() => {
    const path = location.pathname + location.search;

    // Avoid dev double-fire from React.StrictMode
    const last = window.__ADLM_LAST_PV || { path: "", ts: 0 };
    const ts = Date.now();

    if (last.path === path && ts - last.ts < 1200) return;

    window.__ADLM_LAST_PV = { path, ts };
    trackPageView(path);
  }, [location.pathname, location.search]);

  return null;
}
