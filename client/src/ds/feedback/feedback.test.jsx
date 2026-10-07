import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { FeedbackProvider } from "./FeedbackProvider.jsx";
import { useFeedback } from "./feedbackContext.js";
import { guessTone, toastLife } from "./feedbackRules.js";

describe("feedback rules", () => {
  it("reads failure words as errors", () => {
    expect(guessTone("That could not be saved.")).toBe("error");
    expect(guessTone("Upload failed")).toBe("error");
    expect(guessTone("Saved.")).toBe("success");
  });

  it("keeps errors up longest", () => {
    expect(toastLife({ tone: "error" })).toBe(7000);
    expect(toastLife({ tone: "success", action: {} })).toBe(6500);
    expect(toastLife({ tone: "success" })).toBe(4200);
    expect(toastLife({ ms: 1000 })).toBe(1000);
  });
});

function Harness({ onCard }) {
  const fb = useFeedback();
  return (
    <>
      <button onClick={() => fb.toast("Saved.")}>toast</button>
      <button
        onClick={() =>
          fb.card({ title: "Submitted", rows: [["File", "a.pdf"]], primary: "Done" }).then(onCard)
        }
      >
        card
      </button>
    </>
  );
}

describe("FeedbackProvider", () => {
  it("shows at most three toasts inside a .ds wrapper", () => {
    render(
      <FeedbackProvider>
        <Harness />
      </FeedbackProvider>,
    );
    for (let i = 0; i < 5; i++) fireEvent.click(screen.getByText("toast"));
    const stack = document.querySelector(".ds .fb-stack");
    expect(stack).not.toBeNull();
    expect(stack.querySelectorAll(".fb-toast")).toHaveLength(3);
    cleanup();
  });

  it("resolves a card with the button pressed", async () => {
    let got;
    render(
      <FeedbackProvider>
        <Harness onCard={(v) => (got = v)} />
      </FeedbackProvider>,
    );
    fireEvent.click(screen.getByText("card"));
    expect(screen.getByRole("dialog").textContent).toContain("a.pdf");
    await act(async () => {
      fireEvent.click(screen.getByText("Done"));
      await new Promise((r) => setTimeout(r, 260));
    });
    expect(got).toBe("primary");
    expect(screen.queryByRole("dialog")).toBeNull();
    cleanup();
  });

  it("is silent outside the provider", () => {
    render(<Harness />);
    expect(() => fireEvent.click(screen.getByText("toast"))).not.toThrow();
    cleanup();
  });
});
