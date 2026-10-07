import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../../http.js", () => ({ apiAuthed: vi.fn() }));

const { apiAuthed } = await import("../../http.js");
const { default: OpenInDesktopButton } = await import("./OpenInDesktopButton.jsx");

const ID = "66f1c0ffee0000000000abcd";

function mount(props) {
  return render(
    <MemoryRouter>
      <OpenInDesktopButton projectId={ID} accessToken="t" {...props} />
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  apiAuthed.mockReset();
});

describe("OpenInDesktopButton", () => {
  it("only appears for the products that have a desktop entry point", () => {
    mount({ productKey: "revitmep" });
    expect(screen.queryByRole("button")).toBeNull();
    cleanup();
    mount({ productKey: "planswift" });
    expect(screen.getByRole("button", { name: "Open in HERON" })).toBeTruthy();
    cleanup();
    mount({ productKey: "revit" });
    expect(screen.getByRole("button", { name: "Open in QUIV" })).toBeTruthy();
  });

  it("asks the API for a link and hands only that link to the browser", async () => {
    const url = `adlm://open?v=1&product=quiv&project=${ID}&ticket=a.b.c`;
    apiAuthed.mockResolvedValue({ url, product: "quiv" });
    const clicked = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function () {
      clicked.push(this.getAttribute("href"));
    });

    mount({ productKey: "revit" });
    fireEvent.click(screen.getByRole("button", { name: "Open in QUIV" }));

    await waitFor(() => expect(screen.getByText("Sent to QUIV")).toBeTruthy());
    expect(apiAuthed).toHaveBeenCalledWith("/projects/open-intent/issue", {
      token: "t",
      method: "POST",
      body: { projectId: ID },
    });
    expect(clicked).toEqual([url]);
    expect(screen.getByText("Install or update the ADLM Installer Hub")).toBeTruthy();
  });

  it("never launches anything that is not an adlm://open link", async () => {
    apiAuthed.mockResolvedValue({ url: "https://evil.example/" });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    mount({ productKey: "revit" });
    fireEvent.click(screen.getByRole("button", { name: "Open in QUIV" }));
    await waitFor(() => expect(screen.getByText("Could not open in QUIV")).toBeTruthy());
    expect(click).not.toHaveBeenCalled();
  });

  it("shows the server's reason when it refuses", async () => {
    const err = new Error("Request failed");
    err.data = { error: "A combined project has no single model.", code: "MERGED" };
    apiAuthed.mockRejectedValue(err);
    mount({ productKey: "revit" });
    fireEvent.click(screen.getByRole("button", { name: "Open in QUIV" }));
    await waitFor(() =>
      expect(screen.getByText("A combined project has no single model.")).toBeTruthy(),
    );
  });
});
