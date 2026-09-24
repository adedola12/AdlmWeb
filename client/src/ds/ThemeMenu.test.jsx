// The theme swatch carries the class the generated stylesheet actually
// defines.
//
// This exists because of a real, shipped bug: Richard renamed the swatch from
// .sw to .tsw on 17 Sep 2026 (6a85b22) so it would stop colliding with his
// account switcher, we regenerated ds.css from his HEAD, and this hand-written
// component kept emitting .sw. The CSS no longer had a .sw swatch rule, so the
// coloured square in the #tt menu and in Settings > Appearance rendered as a
// bordered line on every page. Nothing failed; it just looked broken.
//
// So the assertion is deliberately about the class name, not about a colour:
// a future rename has to come back through here.

import React from "react";
import { describe, it, expect, afterEach, beforeAll } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { ThemeProvider } from "../theme.jsx";
import ThemeMenu, { ThemePicker } from "./ThemeMenu.jsx";
import { THEMES } from "./themes.js";

// jsdom has no matchMedia, and ThemeProvider asks it whether the device is
// dark as soon as the preference is "system" (the default).
beforeAll(() => {
  if (!window.matchMedia) {
    window.matchMedia = () => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
    });
  }
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

describe("theme swatches use his .tsw class (CHR-1)", () => {
  it("renders one .tsw per theme in the #tt menu", () => {
    const anchor = document.createElement("button");
    document.body.appendChild(anchor);

    render(
      <ThemeProvider>
        <ThemeMenu anchor={anchor} onClose={() => {}} />
      </ThemeProvider>,
    );

    const menu = document.querySelector(".tt-menu");
    expect(menu).toBeTruthy();
    expect(menu.querySelectorAll("i.tsw")).toHaveLength(THEMES.length);
    // The old name would pick up the account switcher's container rule.
    expect(menu.querySelectorAll("i.sw")).toHaveLength(0);
  });

  it("gives each of his four keys its own modifier, so each square is coloured", () => {
    const anchor = document.createElement("button");
    document.body.appendChild(anchor);

    render(
      <ThemeProvider>
        <ThemeMenu anchor={anchor} onClose={() => {}} />
      </ThemeProvider>,
    );

    for (const t of THEMES) {
      expect(document.querySelector(`.tt-menu i.tsw.${t.key}`)).toBeTruthy();
    }
  });

  it("uses the same class in the Settings > Appearance picker", () => {
    const { container } = render(
      <ThemeProvider>
        <ThemePicker />
      </ThemeProvider>,
    );

    const pick = container.querySelector(".th-pick");
    expect(pick).toBeTruthy();
    expect(pick.querySelectorAll("i.tsw")).toHaveLength(THEMES.length);
    expect(pick.querySelectorAll("i.sw")).toHaveLength(0);
    for (const t of THEMES) {
      expect(pick.querySelector(`i.tsw.${t.key}`)).toBeTruthy();
    }
  });
});
