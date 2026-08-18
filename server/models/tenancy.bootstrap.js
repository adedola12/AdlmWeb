// server/models/tenancy.bootstrap.js
// Side-effect module: registers the demo tenancy plugin globally.
//
// This exists as its own file so entry points can import it as the very FIRST
// statement. ES modules evaluate every import before any body code, so a
// function call in index.js could never run early enough — only an import
// placed above the others can. Everything downstream (routes → models) is then
// compiled with the plugin already in place.
import { registerDemoTenancy } from "./demoTenancy.js";

registerDemoTenancy();
