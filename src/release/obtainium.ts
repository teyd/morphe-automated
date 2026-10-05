import { apkAssetName } from "./naming.ts";

export interface ObtainiumApp {
  readonly slug: string;
  readonly name: string;
  readonly packageName: string;
  readonly arch: string;
  /** `owner/name` of this repository. */
  readonly repo: string;
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Obtainium settings that make a patched app update correctly:
 * - release titles start with `<slug>:`, so one repo can serve many apps;
 * - older releases are scanned so another app's newer release never hides this one;
 * - version detection is off, because a patched APK keeps the stock `versionName` while the release
 *   tag changes with every rebuild. Obtainium then records the tag on install and flags any new one.
 */
export const obtainiumSettings = (app: ObtainiumApp) => ({
  includePrereleases: false,
  fallbackToOlderReleases: true,
  filterReleaseTitlesByRegEx: `^${escapeRegExp(app.slug)}:`,
  apkFilterRegEx: `^${escapeRegExp(apkAssetName(app.slug, app.arch))}$`,
  autoApkFilterByArch: false,
  versionDetection: false,
  sortMethodChoice: "date",
  trackOnly: false,
});

/** The JSON Obtainium's `obtainium://app/...` links carry. */
export const obtainiumApp = (app: ObtainiumApp) => ({
  id: app.packageName,
  url: `https://github.com/${app.repo}`,
  author: app.repo.split("/")[0] ?? app.repo,
  name: app.name,
  preferredApkIndex: 0,
  additionalSettings: JSON.stringify(obtainiumSettings(app)),
  overrideSource: null,
});

export const obtainiumLink = (app: ObtainiumApp): string =>
  `obtainium://app/${encodeURIComponent(JSON.stringify(obtainiumApp(app)))}`;
