import type { FingerprintInputs } from "../domain/manifest.ts";
import { sha256Hex, stableStringify } from "../util/hash.ts";

export const fingerprint = (inputs: FingerprintInputs): string =>
  sha256Hex(stableStringify(inputs));

export interface Decision {
  readonly build: boolean;
  readonly reason: string;
}

/** Describe what differs between two input sets, for readable logs. */
export const explainChange = (previous: FingerprintInputs, next: FingerprintInputs): string => {
  const changes: string[] = [];
  if (previous.appVersion !== next.appVersion) {
    changes.push(`app ${previous.appVersion} -> ${next.appVersion}`);
  }
  for (const bundle of next.bundles) {
    const before = previous.bundles.find((b) => b.source === bundle.source);
    if (before === undefined) changes.push(`patches ${bundle.source} added`);
    else if (before.tag !== bundle.tag)
      changes.push(`patches ${bundle.source} ${before.tag} -> ${bundle.tag}`);
    else if (before.sha256 !== bundle.sha256)
      changes.push(`patches ${bundle.source} ${bundle.tag} content changed`);
  }
  if (previous.cli !== next.cli) changes.push(`cli ${previous.cli} -> ${next.cli}`);
  if (previous.configHash !== next.configHash) changes.push("config changed");
  if (previous.certSha256 !== next.certSha256) changes.push("signing certificate changed");
  if (previous.arch !== next.arch) changes.push(`arch ${previous.arch} -> ${next.arch}`);
  return changes.join(", ") || "inputs changed";
};

export const decide = (
  previous: FingerprintInputs | undefined,
  next: FingerprintInputs,
  force: boolean,
): Decision => {
  if (force) return { build: true, reason: "forced" };
  if (previous === undefined) return { build: true, reason: "no previous build" };
  if (fingerprint(previous) === fingerprint(next)) return { build: false, reason: "up to date" };
  return { build: true, reason: explainChange(previous, next) };
};
