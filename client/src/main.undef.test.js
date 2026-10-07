// @vitest-environment node
//
// main.jsx names every route's screen. A screen used as <Foo /> without an
// import is not a build error: Vite ships it, and the route white-screens with
// "Foo is not defined" only when someone opens it. That is how /admin/work
// went blank after the #22 merge dropped its import. Nothing runs eslint on
// PRs, so this test runs the one rule that catches it.
import { describe, it, expect } from "vitest";
import { ESLint } from "eslint";
import { fileURLToPath } from "node:url";

describe("main.jsx", () => {
  it("imports every component it renders", async () => {
    const eslint = new ESLint({
      cwd: fileURLToPath(new URL("..", import.meta.url)),
      overrideConfig: { rules: { "react/jsx-no-undef": "error", "no-undef": "error" } },
    });
    const [res] = await eslint.lintFiles(["src/main.jsx"]);
    const undef = res.messages
      .filter((m) => m.ruleId === "react/jsx-no-undef" || m.ruleId === "no-undef")
      .map((m) => `${m.line}: ${m.message}`);
    expect(undef).toEqual([]);
  }, 60000);
});
