import { parse } from "node-html-parser";
import { slugify } from "../domain/version.ts";

export type VariantKind = "apk" | "bundle";

export interface Variant {
  readonly href: string;
  readonly kind: VariantKind;
  /** As shown by APKMirror: `arm64-v8a`, `arm64-v8a + armeabi-v7a`, `universal`... */
  readonly arch: string;
  readonly dpi: string;
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Link to the release page of `version` within an app listing page, if present. */
export const findReleaseLink = (
  listingHtml: string,
  appPath: string,
  version: string,
): string | undefined => {
  const pattern = new RegExp(
    `^/apk/${escapeRegExp(appPath)}/[^/]*-${escapeRegExp(slugify(version))}-release/$`,
  );
  return parse(listingHtml)
    .querySelectorAll("a")
    .map((anchor) => anchor.getAttribute("href") ?? "")
    .find((href) => pattern.test(href));
};

/** Variant rows (one per APK/bundle build) on a release page. */
export const parseVariants = (releaseHtml: string): ReadonlyArray<Variant> => {
  const variants: Variant[] = [];
  for (const row of parse(releaseHtml).querySelectorAll("div.table-row")) {
    const href = row.querySelector("a.accent_color")?.getAttribute("href");
    if (href === undefined || !href.endsWith("-download/")) continue;

    const badges = row.querySelectorAll("span.apkm-badge").map((badge) => badge.text.trim());
    const kind: VariantKind | undefined = badges.includes("BUNDLE")
      ? "bundle"
      : badges.includes("APK")
        ? "apk"
        : undefined;
    if (kind === undefined) continue;

    const cells = row.querySelectorAll("div.table-cell").map((cell) => cell.text.trim());
    variants.push({ href, kind, arch: cells[1] ?? "", dpi: cells[3] ?? "" });
  }
  return variants;
};

const archScore = (arch: string, target: string): number | undefined => {
  const parts = arch.split("+").map((part) => part.trim().toLowerCase());
  if (parts.length === 1 && parts[0] === target) return 0;
  if (parts.includes(target)) return 1;
  if (parts.includes("universal") || parts.includes("noarch")) return 2;
  return undefined;
};

export interface PickOptions {
  readonly arch: string;
  /** `APK_REQUIRED` accepts plain APKs only; anything else also accepts bundles. */
  readonly apkFileType: string | null;
}

/**
 * Best variant for the target architecture. A plain APK beats a bundle (no merging step); within a
 * kind, an exact architecture match beats a multi-arch build, which beats a universal one.
 */
export const pickVariant = (
  variants: ReadonlyArray<Variant>,
  options: PickOptions,
): Variant | undefined => {
  const allowed = variants.filter(
    (v) => options.apkFileType !== "APK_REQUIRED" || v.kind === "apk",
  );
  return allowed
    .flatMap((variant) => {
      const score = archScore(variant.arch, options.arch);
      return score === undefined ? [] : [{ variant, score }];
    })
    .sort(
      (a, b) =>
        Number(a.variant.kind === "bundle") - Number(b.variant.kind === "bundle") ||
        a.score - b.score ||
        Number(b.variant.dpi === "nodpi") - Number(a.variant.dpi === "nodpi"),
    )[0]?.variant;
};

/** `Download APK` button on a variant page. */
export const findDownloadButton = (variantHtml: string): string | undefined =>
  parse(variantHtml).querySelector("a.downloadButton")?.getAttribute("href");

/** The "click here if your download doesn't start" link on the download page. */
export const findDownloadLink = (downloadHtml: string): string | undefined =>
  parse(downloadHtml).querySelector("a#download-link")?.getAttribute("href");

/** Cloudflare interstitial instead of the real page. */
export const isChallenge = (html: string): boolean =>
  /<title>\s*Just a moment/i.test(html) || html.includes("cf-chl");
