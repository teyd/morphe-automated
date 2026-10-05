import type { FingerprintInputs } from "../domain/manifest.ts";
import { stripV } from "../domain/version.ts";

export interface ReleaseIdentity {
  readonly slug: string;
  readonly name: string;
  readonly inputs: FingerprintInputs;
  readonly fingerprint: string;
}

const bundleLabel = (inputs: FingerprintInputs) =>
  inputs.bundles.map((bundle) => `${bundle.source}-${stripV(bundle.tag)}`).join("+");

/**
 * Unique per distinct build, so Obtainium (which tracks the tag) sees an update exactly when the
 * output changes: `youtube-21.16.256-morphe-1.45.0-a1b2c3d`.
 */
export const releaseTag = ({ slug, inputs, fingerprint }: ReleaseIdentity): string =>
  `${slug}-${inputs.appVersion}-${bundleLabel(inputs).replaceAll("+", "_")}-${fingerprint.slice(0, 7)}`;

/** `youtube: 21.16.256 (morphe-1.45.0)`. The `slug:` prefix is what Obtainium's title filter matches. */
export const releaseTitle = ({ slug, inputs }: ReleaseIdentity): string =>
  `${slug}: ${inputs.appVersion} (${bundleLabel(inputs)})`;

/** Stable across releases so Obtainium's APK filter never changes. */
export const apkAssetName = (slug: string, arch: string): string => `${slug}-${arch}.apk`;

export const MANIFEST_ASSET = "build-manifest.json";

/** Tags of one app: slug, dash, then a version number. Keeps `youtube` apart from `youtube-music`. */
export const tagBelongsTo = (slug: string, tag: string): boolean =>
  tag.startsWith(`${slug}-`) && /^\d/.test(tag.slice(slug.length + 1));
