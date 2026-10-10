// Your desk: the five kinds of row, and the three answers that must be refused.
//
// What these pin is not the layout. It is the things that would be expensive to
// get wrong and cheap to break by accident:
//
//   - all five sources reach one queue, in the order a deadline deserves;
//   - a release that has already gone out is never shown as a decision still
//     to be made;
//   - the three answers the server refuses without a note are refused here
//     first, so he is told in place rather than by a 400;
//   - approving a build sends the rollout he actually picked, because that is
//     the field that decides how many machines it lands on.

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

let answer = async () => ({ ok: true });
const calls = [];

vi.mock("../api.js", () => ({
  apiAuthed: vi.fn(async (path, opts) => {
    calls.push({ path, method: opts?.method || "GET", body: opts?.body });
    return answer(path, opts);
  }),
}));

const { default: DsAdminDesk } = await import("./DsAdminDesk.jsx");

const mount = () =>
  render(
    <MemoryRouter>
      <DsAdminDesk />
    </MemoryRouter>,
  );

const idea = {
  _id: "w1",
  title: "Auto take-off with AI",
  kind: "feature",
  products: ["quiv"],
  summary: "Measure the obvious items first, then check them.",
  submittedBy: "dolapo@adlmstudio.net",
  submittedAt: "2026-10-06T09:00:00Z",
  decision: { status: "pending" },
  design: { status: "needed", surfaces: "QUIV panel" },
  businessCase: { problem: "A take-off starts from nothing every time." },
};

const settledIdea = { ...idea, _id: "w2", title: "Already decided", decision: { status: "approved" } };

const batch = {
  _id: "b1",
  title: "Website 2026.10",
  status: "testing",
  headSha: "8f2c1ab",
  products: ["website"],
  createdAt: "2026-10-09T09:00:00Z",
  items: [
    { key: "f1", kind: "flow", title: "Price without an account", where: "https://preview/fit", steps: ["Open it"], verdict: "" },
    { key: "f2", kind: "behind-the-scenes", title: "Sync retries", steps: [] },
  ],
};

const build = {
  _id: "c1",
  kind: "deployment",
  productKey: "heron",
  displayName: "HERON for PlanSwift",
  fromVersion: "2.9.4",
  toVersion: "2.9.5",
  status: "pending",
  rollout: "organizations",
  submittedAt: "2026-10-08T09:00:00Z",
  notifyBody: { notifySubscribers: true, releaseNotes: ["Reads the installed template."] },
};

const setting = {
  _id: "c2",
  kind: "setting",
  productKey: "installer-hub",
  displayName: "Where the Hub downloads from",
  settingField: "installerHubUrl",
  settingPrevious: "https://cdn/old.exe",
  payload: { installerHubUrl: "https://cdn/new.exe" },
  status: "pending",
  submittedAt: "2026-10-09T09:00:00Z",
};

const emergency = {
  _id: "e1",
  kind: "deployment",
  productKey: "website",
  displayName: "ADLM Cloud",
  fromVersion: "2026.10.1",
  toVersion: "2026.10.2",
  status: "emergency",
  appliedTo: "everyone",
  decidedBy: "dolapo@adlmstudio.net",
  decidedAt: "2026-10-09T06:40:00Z",
  reviewDueAt: new Date(Date.now() + 19 * 3600_000).toISOString(),
  reviewVerdict: "",
  emergencyReason: "Sign-in was failing for every new account.",
  notifyBody: { releaseNotes: ["Verification links fixed."] },
};

function serve({ items = [], current = null, pending = [], awaitingReview = [], rollouts = [], recent = [] } = {}) {
  answer = async (path) => {
    if (path === "/admin/work") return { ok: true, items, you: { isApprover: true }, options: {} };
    if (path === "/admin/releases/batch") return { ok: true, batch: current, recent: [] };
    if (path === "/admin/releases") {
      return { ok: true, pending, awaitingReview, rollouts, recent, emergencyReviewHours: 24, you: { isApprover: true } };
    }
    return { ok: true };
  };
}

beforeEach(() => {
  calls.length = 0;
  serve();
});
afterEach(cleanup);

describe("Your desk", () => {
  it("merges all five sources into one queue, deadline first", async () => {
    serve({ items: [idea], current: batch, pending: [build, setting], awaitingReview: [emergency] });
    mount();

    await waitFor(() => expect(screen.getByText("5 things waiting. Open one, do what it says, and it leaves this list.")).toBeTruthy());

    const rows = document.querySelectorAll("tbody tr");
    expect(rows.length).toBe(5);
    // A 24-hour clock outranks everything; an idea nobody waits on comes last.
    expect(rows[0].textContent).toContain("Emergency");
    expect(rows[4].textContent).toContain("Idea");
  });

  it("leaves out anything already decided", async () => {
    serve({ items: [idea, settledIdea] });
    mount();
    await waitFor(() => expect(screen.getByText(/1 thing waiting/)).toBeTruthy());
    expect(screen.queryByText("Already decided")).toBeNull();
  });

  it("says what he has to do, never the database's word for it", async () => {
    serve({ items: [idea], current: batch, pending: [build, setting], awaitingReview: [emergency] });
    mount();
    await waitFor(() => expect(screen.getByText("Approve or decline")).toBeTruthy());

    expect(screen.getByText("Read the notes, then choose who gets it")).toBeTruthy();
    expect(screen.getByText("Check the new link, then approve it")).toBeTruthy();
    expect(screen.getByText("Say whether it should have gone out")).toBeTruthy();
    // the batch counts only what he can actually try
    expect(screen.getByText("Test 1 thing, then sign off")).toBeTruthy();
    expect(screen.queryByText(/awaiting-signoff|pending/i)).toBeNull();
  });

  it("refuses to send an idea back without a note, and does not call the server", async () => {
    serve({ items: [idea] });
    mount();
    await waitFor(() => expect(screen.getByText("Auto take-off with AI")).toBeTruthy());
    fireEvent.click(screen.getByText("Auto take-off with AI"));

    await waitFor(() => expect(screen.getByText("Send it back")).toBeTruthy());
    fireEvent.click(screen.getByText("Send it back"));

    await waitFor(() => expect(screen.getByText(/Say what to change/)).toBeTruthy());
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);
  });

  it("refuses an objection with no reason", async () => {
    serve({ awaitingReview: [emergency] });
    mount();
    await waitFor(() => expect(screen.getByText(/ADLM Cloud 2026.10.2/)).toBeTruthy());
    fireEvent.click(screen.getByText(/ADLM Cloud 2026.10.2/));

    await waitFor(() => expect(screen.getByText("It should not have gone out")).toBeTruthy());
    fireEvent.click(screen.getByText("It should not have gone out"));

    await waitFor(() => expect(screen.getByText(/not a record of anything/)).toBeTruthy());
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);
  });

  it("tells him an emergency has already gone out, rather than asking him to approve it", async () => {
    serve({ awaitingReview: [emergency] });
    mount();
    await waitFor(() => expect(screen.getByText(/ADLM Cloud 2026.10.2/)).toBeTruthy());
    fireEvent.click(screen.getByText(/ADLM Cloud 2026.10.2/));

    await waitFor(() => expect(screen.getByText("This has already gone out.")).toBeTruthy());
    expect(screen.getByText(/every customer/)).toBeTruthy();
    expect(screen.getByText(/Neither answer takes it back/)).toBeTruthy();
  });

  it("sends the rollout he picked when a build is let out", async () => {
    serve({ pending: [build] });
    mount();
    await waitFor(() => expect(screen.getByText(/HERON for PlanSwift 2.9.5/)).toBeTruthy());
    fireEvent.click(screen.getByText(/HERON for PlanSwift 2.9.5/));

    await waitFor(() => expect(screen.getByText("Everyone, now")).toBeTruthy());
    fireEvent.click(screen.getByText("Everyone, now"));
    fireEvent.click(screen.getByText("Let it out"));

    await waitFor(() => {
      const post = calls.find((c) => c.path === "/admin/releases/c1/approve");
      expect(post).toBeTruthy();
      expect(post.body.rollout).toBe("everyone");
    });
  });

  it("keeps the queue when one source fails", async () => {
    answer = async (path) => {
      if (path === "/admin/work") return { ok: true, items: [idea], you: { isApprover: true }, options: {} };
      throw new Error("releases is down");
    };
    mount();
    await waitFor(() => expect(screen.getByText("Auto take-off with AI")).toBeTruthy());
    expect(screen.getByText(/Part of the desk could not be loaded/)).toBeTruthy();
  });
});
