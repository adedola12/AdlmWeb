import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import WaitlistForm from "./WaitlistForm.jsx";

// The wrapper makes the ported marketing forms submit. His markup has no action
// and no handler, so without it a submit reloads the page and sends nothing.
//
// The Beyond BIM registration page was in exactly that state: press "Register
// for Beyond BIM" on a ₦180,000 programme and the page reloaded, with nothing
// saved and nothing said. It also cannot carry a hidden `topic` field, because
// the page is generated from his markup — so it is recognised by its form id.

let posts = [];

beforeEach(() => {
  posts = [];
  vi.stubGlobal("fetch", async (url, init) => {
    posts.push({ url: String(url), body: JSON.parse(init.body) });
    return {
      ok: true,
      json: async () => ({ ok: true, message: "You're on the list. We'll be in touch." }),
    };
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// His Beyond BIM markup, field names verbatim.
function BeyondBimForm() {
  return (
    <form className="bb-form" id="bb-form" noValidate>
      <input name="name" defaultValue="Adaeze Okonkwo" />
      <input name="email" defaultValue="Adaeze@Firm.com" />
      <input name="phone" defaultValue="+234 810 650 3524" />
      <input name="country" defaultValue="Nigeria" />
      <input name="organisation" defaultValue="Okonkwo & Partners" />
      <input name="membership" defaultValue="NIQS/2019/4412" />
      <select name="role" defaultValue="Quantity surveyor">
        <option>Quantity surveyor</option>
      </select>
      <select name="experience" defaultValue="5–10 years">
        <option>5–10 years</option>
      </select>
      <select name="revit" defaultValue="I model in Revit">
        <option>I model in Revit</option>
      </select>
      <select name="adlm" defaultValue="QUIV">
        <option>QUIV</option>
      </select>
      <select name="seats" defaultValue="2">
        <option>2</option>
      </select>
      <select name="heard" defaultValue="LinkedIn">
        <option>LinkedIn</option>
      </select>
      <textarea name="goal" defaultValue="Price a bill off a model." />
      <input type="checkbox" name="consent" defaultChecked />
      <button type="submit" id="bb-submit">Register for Beyond BIM</button>
    </form>
  );
}

// One of his solutions forms, which does carry a hidden topic.
function SolutionsForm() {
  return (
    <form action="thanks" method="get">
      <input type="hidden" name="topic" value="Individual QS" />
      <input name="name" defaultValue="Chidi Eze" />
      <input name="email" defaultValue="chidi@example.com" />
      <input name="org" defaultValue="Freelance" />
      <textarea name="message" defaultValue="Interested in RateGen." />
      <button type="submit">Send</button>
    </form>
  );
}

function FormNobodyWired() {
  return (
    <form action="thanks" method="get" id="some-new-form">
      <input name="name" defaultValue="Nobody" />
      <input name="email" defaultValue="nobody@example.com" />
      <button type="submit">Send</button>
    </form>
  );
}

describe("the Beyond BIM registration form", () => {
  it("posts instead of reloading the page", async () => {
    render(<WaitlistForm><BeyondBimForm /></WaitlistForm>);
    fireEvent.click(screen.getByText("Register for Beyond BIM"));
    await waitFor(() => expect(posts.length).toBe(1));
    expect(posts[0].url).toMatch(/\/waitlist$/);
    expect(posts[0].body.topic).toBe("Beyond BIM registration");
  });

  it("sends the name and email, and his organisation field as the org", async () => {
    render(<WaitlistForm><BeyondBimForm /></WaitlistForm>);
    fireEvent.click(screen.getByText("Register for Beyond BIM"));
    await waitFor(() => expect(posts.length).toBe(1));
    const b = posts[0].body;
    expect(b.name).toBe("Adaeze Okonkwo");
    expect(b.email).toBe("Adaeze@Firm.com"); // the server lowercases it
    // His field is "organisation"; the solutions forms call it "org".
    expect(b.org).toBe("Okonkwo & Partners");
  });

  it("loses nothing else the visitor typed", async () => {
    // The waitlist row holds name / email / org / message, and his form asks
    // fourteen questions. The rest go into message as labelled lines — a phone
    // number and a country on a paid registration are what whoever works the
    // list needs most, and dropping them silently would be the same bug again.
    render(<WaitlistForm><BeyondBimForm /></WaitlistForm>);
    fireEvent.click(screen.getByText("Register for Beyond BIM"));
    await waitFor(() => expect(posts.length).toBe(1));
    const msg = posts[0].body.message;
    expect(msg).toContain("Phone: +234 810 650 3524");
    expect(msg).toContain("Country: Nigeria");
    expect(msg).toContain("NIQS membership: NIQS/2019/4412");
    expect(msg).toContain("Role: Quantity surveyor");
    expect(msg).toContain("Seats: 2");
    expect(msg).toContain("Heard about us via: LinkedIn");
    expect(msg).toContain("What they want from it: Price a bill off a model.");
  });

  it("confirms in place rather than leaving the visitor guessing", async () => {
    render(<WaitlistForm><BeyondBimForm /></WaitlistForm>);
    fireEvent.click(screen.getByText("Register for Beyond BIM"));
    await waitFor(() => expect(screen.getByText("Thank you")).toBeTruthy());
    expect(screen.getByText(/on the list/i)).toBeTruthy();
  });
});

describe("the forms that were already wired", () => {
  it("still posts a solutions form by its hidden topic", async () => {
    render(<WaitlistForm><SolutionsForm /></WaitlistForm>);
    fireEvent.click(screen.getByText("Send"));
    await waitFor(() => expect(posts.length).toBe(1));
    expect(posts[0].body.topic).toBe("Individual QS");
    expect(posts[0].body.message).toBe("Interested in RateGen.");
    expect(posts[0].body.org).toBe("Freelance");
  });

  it("leaves a form nobody wired alone, so it fails visibly rather than posting somewhere odd", async () => {
    render(<WaitlistForm><FormNobodyWired /></WaitlistForm>);
    fireEvent.click(screen.getByText("Send"));
    // Nothing intercepted: the browser does whatever his markup says. jsdom
    // logs "HTMLFormElement.prototype.requestSubmit not implemented" here, which
    // is the proof — the native submit was reached rather than our handler.
    await new Promise((r) => setTimeout(r, 10));
    expect(posts.length).toBe(0);
  });
});
