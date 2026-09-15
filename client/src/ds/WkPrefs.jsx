// His zone and currency dropdowns — .wk-prefs, two .wk-dd controls.
//
// His note on them is the specification: "Six zones and six currencies are too
// many for a segmented control, and both are profile settings rather than
// per-screen toggles — so they read as what the profile currently says, and
// changing one here changes the profile."
//
// Ours does exactly that. The zone list comes from GET /me/profile, which
// already returns every zone and state, and picking one writes back through
// the same POST /me/profile the Account settings screen uses. There is no
// separate per-screen state to drift out of step with the account.
//
// Zone matters because the rate library is priced by it: the same blockwork
// rate is a different number in Lagos and in Kano. Changing it here changes
// what every price on the Work screens says.
//
// Currency is NOT a profile field. POST /me/profile does not accept one and
// there is no `currency` on the user — Account settings keeps it in
// localStorage under `adlm-cur`, because it only changes how a number is
// displayed and never what is charged. This control writes to the same key
// rather than to the account, so the two screens agree; posting it would have
// looked like it worked and changed nothing.

import React from "react";
import { apiAuthed } from "../api.js";
import { useAuth } from "../store.jsx";
import Dropdown from "./WkDropdown.jsx";

const CURRENCIES = [
  { value: "NGN", label: "NGN", note: "Nigerian naira" },
  { value: "USD", label: "USD", note: "US dollar" },
];

const CURRENCY_KEY = "adlm-cur";

export default function WkPrefs({ onChange }) {
  const { accessToken } = useAuth();
  const [profile, setProfile] = React.useState(null);
  const [saving, setSaving] = React.useState(false);
  const [currency, setCurrency] = React.useState(() => {
    try {
      return window.localStorage.getItem(CURRENCY_KEY) || "NGN";
    } catch {
      return "NGN";
    }
  });

  React.useEffect(() => {
    if (!accessToken) return undefined;
    let alive = true;
    apiAuthed("/me/profile", { token: accessToken })
      .then((d) => alive && setProfile(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [accessToken]);

  // Nothing to choose between until the profile says what the zones are.
  if (!profile) return null;

  const zones = (profile.zones || []).map((z) => ({
    value: z.key,
    label: z.label,
    // The states in a zone are what make the choice meaningful — "South West"
    // means nothing until you see Lagos in it.
    note: (profile.states || [])
      .filter((st) => st.zone === z.key)
      .slice(0, 3)
      .map((st) => st.label)
      .join(", "),
  }));
  if (!zones.length) return null;

  const save = async (patch) => {
    const next = { ...profile, ...patch };
    setProfile(next); // optimistic: the control should not lag the click
    setSaving(true);
    try {
      await apiAuthed("/me/profile", {
        token: accessToken,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (onChange) onChange(next);
    } catch {
      // Put it back rather than showing a setting the account does not hold.
      setProfile(profile);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="wk-prefs" aria-busy={saving}>
      <Dropdown
        label="Zone"
        value={profile.zone || zones[0].value}
        options={zones}
        onPick={(zone) => save({ zone })}
      />
      <Dropdown
        label="Currency"
        value={currency}
        options={CURRENCIES}
        onPick={(v) => {
          setCurrency(v);
          try {
            window.localStorage.setItem(CURRENCY_KEY, v);
          } catch {
            /* a display preference is not worth an error state */
          }
          if (onChange) onChange({ ...profile, currency: v });
        }}
      />
    </div>
  );
}
