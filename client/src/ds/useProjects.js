// Every project on the account, one card per project (a material & labour
// schedule folded into its bill), for the Projects screen and the tool pages.

import React from "react";
import { apiAuthed } from "../api.js";
import { useAuth } from "../store.jsx";
import { foldMaterials, normaliseRollup } from "../lib/projectLinks.js";

export function useProjects() {
  const { accessToken } = useAuth();
  const [projects, setProjects] = React.useState(null);
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => {
    if (!accessToken) return undefined;
    let alive = true;
    apiAuthed("/me/projects-rollup", { token: accessToken })
      .then((d) => alive && setProjects(foldMaterials(normaliseRollup(d.projects))))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [accessToken]);
  return { projects, failed };
}
