// The Buy schedule's "Nothing to buy yet" names one specific cause:
// "what is in it is labour, and labour is not bought ahead."
//
// That is only honest if the all-labour case is the ONLY way to reach it. It
// is: the schedule tab renders behind `hasBreakdown`, so a project with no
// breakdown at all never gets there and is told the true thing instead. These
// two tests pin both halves, so a later change to either condition cannot
// quietly put that sentence in front of a QS it is not true of.

import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

import ProjectBudgetTab from "./ProjectBudgetTab.jsx";

const bill = [{ code: "A1", description: "Excavate", qty: 10, unit: "m3" }];

const mount = (props) => render(<ProjectBudgetTab items={bill} {...props} />);

afterEach(cleanup);

describe("the buy schedule with nothing in it", () => {
  it("blames labour only when labour is genuinely all there is", () => {
    mount({
      budgetItems: [
        {
          componentKind: "labour",
          billIdentity: "A1",
          description: "Labourer",
          qty: 8,
          unit: "hr",
          rate: 0,
        },
      ],
    });

    fireEvent.click(screen.getByText("Buy schedule"));

    expect(screen.getByText("Nothing to buy yet")).toBeTruthy();
    expect(screen.getByText(/what is in it is labour/)).toBeTruthy();
  });

  it("is never shown to a project that has no breakdown to read", () => {
    mount({ budgetItems: [], materialItems: [] });

    // No Buy schedule tab at all: the screen says the breakdown is missing,
    // which is the true reason, and never claims the breakdown is all labour.
    expect(screen.queryByText("Buy schedule")).toBeNull();
    expect(screen.getByText(/No material & labour breakdown on this project yet/)).toBeTruthy();
    expect(screen.queryByText("Nothing to buy yet")).toBeNull();
    expect(screen.queryByText(/what is in it is labour/)).toBeNull();
  });

  it("lists the material once there is one, rather than the empty state", () => {
    mount({
      budgetItems: [
        { componentKind: "labour", billIdentity: "A1", description: "Labourer", qty: 8, rate: 0 },
        {
          componentKind: "material",
          billIdentity: "A1",
          materialName: "Cement",
          qty: 20,
          unit: "bag",
          rate: 0,
        },
      ],
    });

    fireEvent.click(screen.getByText("Buy schedule"));

    expect(screen.queryByText("Nothing to buy yet")).toBeNull();
    expect(screen.getByText("Cement")).toBeTruthy();
  });
});
