// The tool page's project grid, with nothing in it (item 13).
//
// It used to say "No projects found." whatever the reason, which is the
// filter sentence. A brand-new QUIV customer signing in for the first time
// was told their search had matched nothing, having typed nothing; a customer
// whose list had failed to load was told the same. Three situations, three
// sentences.
import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

import ProjectExplorerGrid from "./ProjectExplorerGrid.jsx";

const mount = (props) =>
  render(
    <ProjectExplorerGrid
      rowsShown={[]}
      sourceName="QUIV"
      hostName="Revit"
      {...props}
    />,
  );

afterEach(cleanup);

describe("an empty project grid", () => {
  it("tells a first run where a project actually comes from", () => {
    mount({ totalCount: 0 });
    expect(screen.getByText("No projects yet")).toBeTruthy();
    expect(screen.getByText(/Projects start in Revit\. Measure in QUIV/)).toBeTruthy();
  });

  it("does not tell a first run that nothing matched", () => {
    mount({ totalCount: 0 });
    expect(screen.queryByText("No project matches")).toBeNull();
  });

  it("says a search matched nothing only when something was searched for", () => {
    mount({ searching: true, totalCount: 7 });
    expect(screen.getByText("No project matches")).toBeTruthy();
    // And it says how many are behind the search, so clearing it is an
    // obvious move rather than a guess.
    expect(screen.getByText(/Clear the search box to see all 7 projects again\./)).toBeTruthy();
  });

  it("says the list failed rather than that the account is empty", () => {
    mount({ loadFailed: true, totalCount: 0 });
    expect(screen.getByText("Your projects could not be listed")).toBeTruthy();
    expect(screen.getByText(/Nothing has been deleted/)).toBeTruthy();
    expect(screen.queryByText("No projects yet")).toBeNull();
  });

  it("names the takeoff, not the host, on a material schedule list", () => {
    mount({ totalCount: 0, isMaterials: true });
    expect(screen.getByText(/A material schedule is generated from a priced bill/)).toBeTruthy();
    expect(screen.queryByText(/Projects start in Revit/)).toBeNull();
  });

  it("names no product at all when the tool is not one we have a name for", () => {
    mount({ totalCount: 0, sourceName: "", hostName: "" });
    expect(screen.getByText(/Projects start in the plugins/)).toBeTruthy();
  });
});
