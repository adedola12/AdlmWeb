// Channels a flyer can be scheduled against.
//
// In its own module rather than exported from FlyerCalendar.jsx so that file
// exports only its component — mixing constants and components in one file
// breaks Fast Refresh, which silently costs you hot reload while editing.
//
// Must stay in step with the enum in server/models/Flyer.js and the CHANNELS
// whitelist in server/routes/admin.flyers.js; the server rejects anything else.
export const CHANNELS = [
  { id: "instagram", label: "Instagram" },
  { id: "facebook", label: "Facebook" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "x", label: "X" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "youtube", label: "YouTube" },
  { id: "other", label: "Other" },
];
