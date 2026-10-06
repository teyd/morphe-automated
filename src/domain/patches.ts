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
  /** MorpheApp/morphe-patches spells this `isExperimental`. */
  isExperimental: Schema.optional(Schema.Boolean),
  /** The patches library's `generatePatchesList` task spells it `experimental`. */
  experimental: Schema.optional(Schema.Boolean),
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

/**
 * Two shapes are in use for `compatiblePackages`:
 * - MorpheApp/morphe-patches lists it as an array carrying the package details;
 * - the patches library's `generatePatchesList` task keeps only a package-to-versions record
 *   there and moves the details (targets, signatures) to a separate `compatibility` array.
 */
const CompatiblePackages = Schema.Union([
  Schema.Array(CompatiblePackage),
  Schema.Record(Schema.String, Schema.Array(Schema.String)),
]);

export const PatchesList = Schema.Struct({
  version: Schema.optional(Schema.String),
  patches: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      compatiblePackages: Schema.optional(Schema.NullOr(CompatiblePackages)),
      compatibility: Schema.optional(Schema.NullOr(Schema.Array(CompatiblePackage))),
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

type PatchEntry = PatchesList["patches"][number];

/** Package entries of either list shape: `compatibility` when present, else the array form. */
const listedPackages = (patch: PatchEntry): ReadonlyArray<typeof CompatiblePackage.Type> => {
  if (
    patch.compatibility !== undefined &&
    patch.compatibility !== null &&
    patch.compatibility.length > 0
  ) {
    return patch.compatibility;
  }

  return Array.isArray(patch.compatiblePackages) ? patch.compatiblePackages : [];
};

/** True for the generated shape's package-to-versions record. */
const isVersionRecord = (
  packages: PatchEntry["compatiblePackages"],
): packages is Readonly<Record<string, ReadonlyArray<string>>> =>
  packages !== undefined && packages !== null && !Array.isArray(packages);

/** Versions from the generated shape's package-to-versions record. */
const recordedVersions = (patch: PatchEntry, packageName: string): ReadonlyArray<string> => {
  const packages = patch.compatiblePackages;

  if (!isVersionRecord(packages)) return [];

  return packages[packageName] ?? [];
};

/** Collapse the per-patch compatibility entries into one record per package. */
export const packageInfo = (list: PatchesList, packageName: string): PackageInfo | undefined => {
  let found = false;
  let apkFileType: string | null = null;
  const signatures = new Set<string>();
  const versions = new Map<string, boolean>();

  for (const patch of list.patches) {
    const packages = listedPackages(patch);

    for (const pkg of packages) {
      if (pkg.packageName !== packageName) continue;
      found = true;
      apkFileType ??= pkg.apkFileType ?? null;

      for (const sig of pkg.signatures ?? []) signatures.add(sig.toLowerCase());

      for (const target of pkg.targets ?? []) {
        // A version is experimental only if every patch that lists it says so.
        const experimental =
          (target.isExperimental ?? target.experimental ?? false) &&
          (versions.get(target.version) ?? true);

        versions.set(target.version, experimental);
      }
    }

    // The generated shape repeats the versions in the record; only fall back when the
    // structured entries did not cover this package.
    if (packages.some((pkg) => pkg.packageName === packageName)) continue;

    for (const version of recordedVersions(patch, packageName)) {
      found = true;
      versions.set(version, versions.get(version) ?? false);
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
