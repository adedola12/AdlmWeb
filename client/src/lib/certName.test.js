import { describe, it, expect } from "vitest";
import { certNameProblem, splitName, tidyName, nameSize } from "./certName.js";

describe("the name on a certificate (R14)", () => {
  it("wants a full name, tidied", () => {
    expect(tidyName("  Ada   Obi  ")).toBe("Ada Obi");
    expect(certNameProblem("")).toMatch(/Write your name/);
    expect(certNameProblem("Ada")).toMatch(/full name/);
    expect(certNameProblem("Adaeze Nwachukwu-Obi")).toBe("");
    expect(certNameProblem("Ọlá Adébáyọ̀")).toBe("");
    expect(certNameProblem("Ada O'Neil")).toBe("");
  });
  it("refuses digits and symbols, and names too long for the line", () => {
    expect(certNameProblem("Ada 0bi")).toMatch(/Letters/);
    expect(certNameProblem("A".repeat(20) + " " + "B".repeat(25))).toMatch(/40 characters/);
  });
  it("splits into the first and last name the account stores", () => {
    expect(splitName("Mary Ann Okafor")).toEqual({ firstName: "Mary Ann", lastName: "Okafor" });
  });
  it("steps a long name down in size", () => {
    expect(nameSize("Ada Obi")).toBe(7.6);
    expect(nameSize("Adaeze Chinwendu Nwachukwu")).toBeLessThan(7.6);
    expect(nameSize("x".repeat(60))).toBe(4.2);
  });
});
