// The share dialog's money switch (R4b).
//
// The server does the hiding; what this pins is that the dialog ASKS it to:
// the choice made when generating a code goes out as `showMoney`, a person's
// switch goes out on its own PATCH without touching their access level, and
// what the server says is shown back.
import React from "react";
import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

const calls = [];
let collabResponse = { collaborators: [], codes: [] };

vi.mock("../../http.js", () => ({
  apiAuthed: vi.fn(async (path, init = {}) => {
    calls.push({ path, method: init.method || "GET", body: init.body });
    if ((init.method || "GET") === "GET") return collabResponse;
    return { ok: true };
  }),
}));

const { default: CollaboratorsModal } = await import("./CollaboratorsModal.jsx");

const mount = () =>
  render(
    <CollaboratorsModal open onClose={() => {}} tool="planswift" projectId="p1" accessToken="t" />,
  );

beforeEach(() => {
  calls.length = 0;
  collabResponse = { collaborators: [], codes: [] };
});
afterEach(cleanup);

describe("sharing: who sees the money", () => {
  it("sends showMoney: true by default, as every share before the switch behaved", async () => {
    mount();
    fireEvent.click(await screen.findByText("Generate code"));
    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
    expect(calls.find((c) => c.method === "POST").body.showMoney).toBe(true);
  });

  it("sends showMoney: false when the owner picks Hide money", async () => {
    mount();
    fireEvent.click(await screen.findByText("Hide money"));
    fireEvent.click(screen.getByText("Generate code"));
    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
    const post = calls.find((c) => c.method === "POST");
    expect(post.path).toBe("/projects/planswift/p1/collab/codes");
    expect(post.body.showMoney).toBe(false);
  });

  it("marks a code that hides money, and flips one person's money without their level", async () => {
    collabResponse = {
      codes: [{ id: "c1", codePlain: "ABCDE-FGHIJ", accessLevel: "view", uses: 0, showMoney: false }],
      collaborators: [{ userId: "u1", email: "sub@example.com", accessLevel: "full", showMoney: true }],
    };
    mount();
    expect(await screen.findByText("Money hidden", { selector: "span" })).toBeTruthy();

    const select = screen.getByLabelText("Money visibility for sub@example.com");
    expect(select.value).toBe("show");
    fireEvent.change(select, { target: { value: "hide" } });
    await waitFor(() => expect(calls.some((c) => c.method === "PATCH")).toBe(true));
    const patch = calls.find((c) => c.method === "PATCH");
    expect(patch.path).toBe("/projects/planswift/p1/collab/u1");
    expect(patch.body).toEqual({ showMoney: false });
  });
});
