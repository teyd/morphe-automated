import { describe, expect, it } from "vite-plus/test";
import { compareVersions, majorMinor, newest, slugify, stripV } from "../src/domain/version.ts";

describe("compareVersions", () => {
  it("orders numerically, not lexically", () => {
    expect(compareVersions("21.16.256", "21.9.1")).toBeGreaterThan(0);
    expect(compareVersions("2026.24.0", "2026.38.0")).toBeLessThan(0);
  });

  it("treats missing trailing segments as zero", () => {
    expect(compareVersions("1.2", "1.2.0")).toBe(0);
    expect(compareVersions("439.0.0.37.89", "439.0.0.37")).toBeGreaterThan(0);
  });

  it("handles channel suffixes by their numbers", () => {
    expect(compareVersions("12.29.1-prod.01", "12.19.1-release.0")).toBeGreaterThan(0);
  });
});

describe("newest", () => {
  it("picks the highest version", () => {
    const items = [{ v: "20.31.42" }, { v: "21.16.256" }, { v: "21.13.164" }];
    expect(newest(items, (i) => i.v)).toEqual({ v: "21.16.256" });
  });

  it("returns undefined for an empty list", () => {
    expect(newest([], (i: string) => i)).toBeUndefined();
  });
});

describe("helpers", () => {
  it("majorMinor drops the patch level", () => {
    expect(majorMinor("1.18.1")).toBe("1.18");
  });

  it("stripV removes a leading v", () => {
    expect(stripV("v1.45.0")).toBe("1.45.0");
    expect(stripV("1.45.0")).toBe("1.45.0");
  });

  it("slugify matches URL-style versions", () => {
    expect(slugify("21.16.256")).toBe("21-16-256");
    expect(slugify("12.29.1-prod.01")).toBe("12-29-1-prod-01");
  });
});
