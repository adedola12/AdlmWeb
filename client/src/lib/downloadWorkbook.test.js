import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  downloadFile,
  errorMessageFrom,
  filenameFromDisposition,
  sanitizeFilename,
} from "./downloadWorkbook.js";

// The content-type guard is the reason this file is worth testing. An HTML error
// page saved as .xlsx is the one export failure a QS cannot diagnose: Excel says
// the file is corrupt and nothing anywhere says the server actually answered
// "your session expired".

const EXCEL = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const res = ({ ok = true, status = 200, type = EXCEL, disposition = "", body = "PK\u0003\u0004" } = {}) => ({
  ok,
  status,
  headers: {
    get: (k) =>
      String(k).toLowerCase() === "content-type"
        ? type
        : String(k).toLowerCase() === "content-disposition"
          ? disposition
          : null,
  },
  blob: async () => new Blob([body]),
  text: async () => body,
});

let clicked;
let revoked;

beforeEach(() => {
  clicked = [];
  revoked = [];
  globalThis.URL.createObjectURL = vi.fn(() => "blob:x");
  globalThis.URL.revokeObjectURL = vi.fn((u) => revoked.push(u));
  // Record the anchor the helper builds rather than letting jsdom try to
  // navigate to a blob: URL.
  const realCreate = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tag) => {
    const el = realCreate(tag);
    if (tag === "a") el.click = () => clicked.push({ href: el.href, download: el.download });
    return el;
  });
});

afterEach(() => vi.restoreAllMocks());

describe("saving a file the server built", () => {
  it("saves it under the name the server asked for", async () => {
    globalThis.fetch = vi.fn(async () =>
      res({ disposition: 'attachment; filename="Ikoyi Complex - Elemental BOQ.xlsx"' }),
    );
    const name = await downloadFile({ path: "/x", token: "t", fallbackName: "fallback.xlsx" });
    expect(name).toBe("Ikoyi Complex - Elemental BOQ.xlsx");
    expect(clicked[0].download).toBe("Ikoyi Complex - Elemental BOQ.xlsx");
  });

  it("falls back to our own name when the server names nothing", async () => {
    // Which happens for real: Content-Disposition is only visible across origins
    // because every export route exposes it. If one ever stops, the file still
    // saves under a sensible name instead of "download".
    globalThis.fetch = vi.fn(async () => res());
    expect(await downloadFile({ path: "/x", token: "t", fallbackName: "fallback.xlsx" })).toBe(
      "fallback.xlsx",
    );
  });

  it("sends the token as a bearer header, not in the query string", async () => {
    const fetchSpy = vi.fn(async () => res());
    globalThis.fetch = fetchSpy;
    await downloadFile({ path: "/x?a=1", token: "secret-token", fallbackName: "f.xlsx" });
    const [url, init] = fetchSpy.mock.calls[0];
    expect(init.headers.Authorization).toBe("Bearer secret-token");
    expect(String(url)).not.toContain("secret-token");
  });

  it("releases the blob URL it made", async () => {
    globalThis.fetch = vi.fn(async () => res());
    await downloadFile({ path: "/x", token: "t", fallbackName: "f.xlsx" });
    expect(revoked).toEqual(["blob:x"]);
  });

  it("REFUSES to save an HTML error page as a spreadsheet", async () => {
    globalThis.fetch = vi.fn(async () =>
      res({ type: "text/html; charset=utf-8", body: "<html><body>Session expired</body></html>" }),
    );
    await expect(
      downloadFile({ path: "/x", token: "t", fallbackName: "f.xlsx" }),
    ).rejects.toThrow(/did not return a file/i);
    expect(clicked).toEqual([]);
  });

  it("accepts octet-stream, which a proxy that does not know Office types sends", async () => {
    globalThis.fetch = vi.fn(async () => res({ type: "application/octet-stream" }));
    await expect(
      downloadFile({ path: "/x", token: "t", fallbackName: "f.xlsx" }),
    ).resolves.toBe("f.xlsx");
  });

  it("raises the server's own message, not ours, when it has one", async () => {
    // "An active RateGen subscription lifts this" is the server explaining
    // itself, and it is the only thing on screen that tells a QS what to do.
    globalThis.fetch = vi.fn(async () =>
      res({
        ok: false,
        status: 403,
        body: JSON.stringify({
          error: "A RateGen subscription is required to export priced documents.",
          code: "RATEGEN_REQUIRED",
        }),
      }),
    );
    await expect(
      downloadFile({ path: "/x", token: "t", fallbackName: "f.xlsx", failureMessage: "Export failed" }),
    ).rejects.toThrow("A RateGen subscription is required to export priced documents.");
  });

  it("uses our message when the server says nothing readable", async () => {
    globalThis.fetch = vi.fn(async () => res({ ok: false, status: 502, body: "" }));
    await expect(
      downloadFile({ path: "/x", token: "t", fallbackName: "f.xlsx", failureMessage: "Export failed" }),
    ).rejects.toThrow("Export failed");
  });

  it("takes a calendar when that is what was asked for", async () => {
    globalThis.fetch = vi.fn(async () => res({ type: "text/calendar" }));
    await expect(
      downloadFile({ path: "/x", token: "t", fallbackName: "p.ics", accept: "text/calendar" }),
    ).resolves.toBe("p.ics");
  });
});

describe("the two helpers around it", () => {
  it("reads a filename out of a Content-Disposition, encoded or not", () => {
    expect(filenameFromDisposition('attachment; filename="Block A.xlsx"', "f")).toBe("Block A.xlsx");
    expect(filenameFromDisposition("attachment; filename*=UTF-8''Block%20A.xlsx", "f")).toBe(
      "Block A.xlsx",
    );
    expect(filenameFromDisposition("", "f.xlsx")).toBe("f.xlsx");
    expect(filenameFromDisposition(null, "f.xlsx")).toBe("f.xlsx");
  });

  it("strips what a filesystem will not take", () => {
    expect(sanitizeFilename('Block A/B: phase 1*')).toBe("Block A-B- phase 1-");
    expect(sanitizeFilename("")).toBe("Project");
    expect(sanitizeFilename(null)).toBe("Project");
  });

  it("prefers the server's error field, then message, then the fallback", async () => {
    expect(await errorMessageFrom({ text: async () => '{"error":"a"}' }, "f")).toBe("a");
    expect(await errorMessageFrom({ text: async () => '{"message":"b"}' }, "f")).toBe("b");
    expect(await errorMessageFrom({ text: async () => "plain text" }, "f")).toBe("plain text");
    expect(await errorMessageFrom({ text: async () => "" }, "f")).toBe("f");
    expect(await errorMessageFrom({ text: async () => { throw new Error("x"); } }, "f")).toBe("f");
  });
});
