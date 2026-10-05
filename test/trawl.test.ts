import { describe, expect, it } from "vite-plus/test";
import { htmlFromScrape } from "../src/services/trawl.ts";

describe("htmlFromScrape", () => {
  it("returns the rendered page", () => {
    expect(
      htmlFromScrape({ statusCode: 200, html: '<html><a href="/apk/x/">x</a></html>' }),
    ).toContain("/apk/x/");
  });

  it("rejects a challenge page, a non-200, and a body with no html", () => {
    expect(
      htmlFromScrape({ statusCode: 200, html: "<title>Just a moment...</title>" }),
    ).toBeUndefined();
    expect(htmlFromScrape({ statusCode: 403, html: "<html>ok</html>" })).toBeUndefined();
    expect(htmlFromScrape({ statusCode: 200 })).toBeUndefined();
    expect(htmlFromScrape("nope")).toBeUndefined();
  });
});
