// Consolidated: re-export from http.js to avoid duplicate API implementations.
// All consumers should eventually import directly from "./http.js".
export { api, apiAuthed } from "./http.js";
