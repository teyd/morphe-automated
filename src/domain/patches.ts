import { Schema } from "effect";

/** `patches-bundle.json` at the root of a Morphe patch repo. Only the fields we rely on. */
export const PatchesBundle = Schema.Struct({
  version: Schema.optional(Schema.String),
  /** piko-newx records the single target app version here. */
  app_version: Schema.optional(Schema.String),
});
export type PatchesBundle = typeof PatchesBundle.Type;

export const PatchTarget = Schema.Struct({
  version: Schema.String,
  isExperimental: Schema.optional(Schema.Boolean),
});

export const CompatiblePackage = Schema.Struct({
  packageName: Schema.String,
  name: Schema.optional(Schema.NullOr(Schema.String)),
  /** `APK_REQUIRED` (plain APK only) or `APKM` (split bundle is fine). */
  apkFileType: Schema.optional(Schema.NullOr(Schema.String)),
  /** SHA-256 fingerprints of the original app's signing certificates. */
  signatures: Schema.optional(Schema.NullOr(Schema.Array(Schema.String))),
  targets: Schema.optional(Schema.NullOr(Schema.Array(PatchTarget))),
});

export const PatchesList = Schema.Struct({
  version: Schema.optional(Schema.String),
  patches: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      compatiblePackages: Schema.optional(Schema.NullOr(Schema.Array(CompatiblePackage))),
    }),
  ),
});
export type PatchesList = typeof PatchesList.Type;

export interface PackageInfo {
  readonly packageName: string;
  readonly apkFileType: string | null;
  readonly signatures: ReadonlyArray<string>;
  /** Supported versions, as published (newest first is NOT guaranteed). */
  readonly versions: ReadonlyArray<{ readonly version: string; readonly experimental: boolean }>;
}

/** Collapse the per-patch compatibility entries into one record per package. */
export const packageInfo = (list: PatchesList, packageName: string): PackageInfo | undefined => {
  let found = false;
  let apkFileType: string | null = null;
  const signatures = new Set<string>();
  const versions = new Map<string, boolean>();

  for (const patch of list.patches) {
    for (const pkg of patch.compatiblePackages ?? []) {
      if (pkg.packageName !== packageName) continue;
      found = true;
      apkFileType ??= pkg.apkFileType ?? null;
      for (const sig of pkg.signatures ?? []) signatures.add(sig.toLowerCase());
      for (const target of pkg.targets ?? []) {
        // A version is experimental only if every patch that lists it says so.
        const experimental =
          (target.isExperimental ?? false) && (versions.get(target.version) ?? true);
        versions.set(target.version, experimental);
      }
    }
  }

  if (!found) return undefined;
  return {
    packageName,
    apkFileType,
    signatures: [...signatures],
    versions: [...versions].map(([version, experimental]) => ({ version, experimental })),
  };
};
