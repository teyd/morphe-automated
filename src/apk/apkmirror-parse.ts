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

const releaseHrefs = (html: string, appPath: string): string[] => {
  const pattern = new RegExp(`^/apk/${escapeRegExp(appPath)}/([^/]+)-release/$`);
  return parse(html)
    .querySelectorAll("a")
    .map((anchor) => anchor.getAttribute("href") ?? "")
    .filter((href) => pattern.test(href));
};

/**
 * The name APKMirror puts before the version in release URLs (`youtube` in `youtube-21-16-256-release`),
 * learned from the release links on the page: the most common one wins, since a renamed app
 * keeps its old releases under the old name. It is not always the app's own slug (`x` for twitter).
 */
export const releasePrefix = (html: string, appPath: string): string | undefined => {
  const pattern = new RegExp(`^/apk/${escapeRegExp(appPath)}/(.+?)-\\d[\\w-]*-release/$`);
  const counts = new Map<string, number>();
  for (const href of releaseHrefs(html, appPath)) {
    const prefix = pattern.exec(href)?.[1];
    if (prefix !== undefined) counts.set(prefix, (counts.get(prefix) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
};

/** URL a release page should have, if it exists. */
export const guessReleasePath = (appPath: string, prefix: string, version: string): string =>
  `/apk/${appPath}/${prefix}-${slugify(version)}-release/`;

/** Category id of the app's full upload history (`/uploads/?appcategory=<id>`). */
export const findUploadsCategory = (html: string): string | undefined => {
  for (const anchor of parse(html).querySelectorAll("a")) {
    const href = anchor.getAttribute("href") ?? "";
    const match = /^\/uploads\/\?appcategory=([\w-]+)$/.exec(href);
    if (match?.[1] !== undefined) return match[1];
  }
  return undefined;
};

export const uploadsPath = (category: string, page: number): string =>
  page === 1
    ? `/uploads/?appcategory=${category}`
    : `/uploads/page/${page}/?appcategory=${category}`;

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

const unescapeAmp = (href: string | undefined) => href?.replaceAll("&amp;", "&");

/** `Download APK` button on a variant page. */
export const findDownloadButton = (variantHtml: string): string | undefined =>
  unescapeAmp(parse(variantHtml).querySelector("a.downloadButton")?.getAttribute("href"));

/** The "click here if your download doesn't start" link on the download page. */
export const findDownloadLink = (downloadHtml: string): string | undefined =>
  unescapeAmp(parse(downloadHtml).querySelector("a#download-link")?.getAttribute("href"));

/** Cloudflare interstitial instead of the real page. */
export const isChallenge = (html: string): boolean =>
  /<title>\s*Just a moment/i.test(html) || html.includes("cf-chl");
