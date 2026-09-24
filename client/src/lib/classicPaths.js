// The classic build's page for each new-build screen (see NewBuildGate).

// Where each new-build screen's job lives in the classic build.
export function classicPathFor(pathname, params = {}) {
  const p = String(pathname || "");
  if (p.startsWith("/manage/settings")) return "/profile";
  if (p.startsWith("/manage/support")) return "/support";
  if (p.startsWith("/work/project/") && params.productKey) {
    const q = params.id ? `?project=${encodeURIComponent(params.id)}` : "";
    return `/projects/${encodeURIComponent(params.productKey)}${q}`;
  }
  if (p.startsWith("/dash-course/") && params.sku) {
    return `/learn/course/${encodeURIComponent(params.sku)}`;
  }
  if (p.startsWith("/dash-learning")) return "/learn";
  return "/dashboard";
}
