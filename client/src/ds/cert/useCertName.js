// The account's certificate name (R14): whether it has been confirmed, and the
// name to print. Confirmed once through the claim card; ADLM can reopen it
// from the admin certificates screen.

import React from "react";
import { apiAuthed } from "../../api.js";
import { certificateName } from "../lxCourses.js";
import { splitName } from "../../lib/certName.js";

export function useCertName(token, user) {
  const [info, setInfo] = React.useState(null);

  React.useEffect(() => {
    if (!token) return undefined;
    let alive = true;
    apiAuthed("/me/certificate-name", { token })
      .then((d) => alive && setInfo(d || { locked: false }))
      .catch(() => alive && setInfo({ locked: false }));
    return () => {
      alive = false;
    };
  }, [token]);

  const locked = !!info?.locked;
  const name = locked
    ? [info.certificateFirstName, info.certificateLastName].filter(Boolean).join(" ")
    : certificateName(user);

  const lock = React.useCallback((full) => {
    const { firstName, lastName } = splitName(full);
    setInfo({ locked: true, certificateFirstName: firstName, certificateLastName: lastName });
  }, []);

  return { ready: !!info, locked, name, lock };
}
