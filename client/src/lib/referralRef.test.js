import { describe, it, expect, beforeEach } from "vitest";
import {
  captureRef,
  clearRef,
  readRef,
  refFromSearch,
  rememberRef,
  REF_STORAGE_KEY,
} from "./referralRef.js";

beforeEach(() => {
  try { localStorage.clear(); } catch { /* ignore */ }
});

describe("reading a code off the address bar", () => {
  it("takes a plausible code", () => {
    expect(refFromSearch("?ref=ABCD2345")).toBe("ABCD2345");
    expect(refFromSearch("?utm=x&ref=abcd2345&y=1")).toBe("ABCD2345");
  });

  it("drops anything that is not one, at the door", () => {
    // The server's alphabet has no O, I, 0 or 1. Matching it here means junk
    // never travels all the way to signup to be rejected there.
    for (const q of ["", "?ref=", "?ref=abc", "?ref=ABCD234O", "?ref=ABCD2340",
                     "?ref=<script>", "?ref=" + "A".repeat(64), "?nope=ABCD2345"]) {
      expect(refFromSearch(q)).toBe("");
    }
  });

  it("does not throw on rubbish", () => {
    expect(refFromSearch(null)).toBe("");
    expect(refFromSearch("%%%")).toBe("");
  });
});

describe("holding it until signup", () => {
  it("survives being read back", () => {
    rememberRef("ABCD2345");
    expect(readRef()).toBe("ABCD2345");
  });

  it("keeps the FIRST link, not the last", () => {
    // Somebody who arrives on one person's link and later clicks another was
    // referred by the first; letting the last overwrite makes credit a race.
    rememberRef("AAAA2345");
    rememberRef("BBBB2345");
    expect(readRef()).toBe("AAAA2345");
  });

  it("refuses a code that is not one", () => {
    expect(rememberRef("nope")).toBe(false);
    expect(readRef()).toBe("");
  });

  it("forgets a code older than thirty days", () => {
    const old = Date.now() - 31 * 24 * 60 * 60 * 1000;
    localStorage.setItem(REF_STORAGE_KEY, JSON.stringify({ code: "ABCD2345", at: old }));
    expect(readRef()).toBe("");
    expect(localStorage.getItem(REF_STORAGE_KEY)).toBe(null);
  });

  it("ignores a stored value that has been tampered with", () => {
    localStorage.setItem(REF_STORAGE_KEY, "not json");
    expect(readRef()).toBe("");
    localStorage.setItem(REF_STORAGE_KEY, JSON.stringify({ code: "<script>", at: Date.now() }));
    expect(readRef()).toBe("");
    localStorage.setItem(REF_STORAGE_KEY, JSON.stringify({ code: "ABCD2345" }));
    expect(readRef()).toBe("");
  });

  it("clears on demand", () => {
    rememberRef("ABCD2345");
    clearRef();
    expect(readRef()).toBe("");
  });
});

describe("capture on landing", () => {
  it("remembers and returns in one step", () => {
    expect(captureRef("?ref=ABCD2345")).toBe("ABCD2345");
  });

  it("returns what is already held when the address has none", () => {
    // The whole point: the code outlives the URL it arrived on, including a
    // round trip through Google or Microsoft.
    rememberRef("ABCD2345");
    expect(captureRef("?tab=bill")).toBe("ABCD2345");
  });

  it("returns nothing when there is nothing", () => {
    expect(captureRef("")).toBe("");
  });
});
