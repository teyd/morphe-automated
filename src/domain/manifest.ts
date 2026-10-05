import { Schema } from "effect";

export const BundleInput = Schema.Struct({
  source: Schema.String,
  tag: Schema.String,
  sha256: Schema.String,
});

/** Everything that, when changed, should produce a new APK. */
export const FingerprintInputs = Schema.Struct({
  app: Schema.String,
  appVersion: Schema.String,
  arch: Schema.String,
  bundles: Schema.Array(BundleInput),
  /** Major.minor only: patch-level CLI releases do not change the output. */
  cli: Schema.String,
  configHash: Schema.String,
  /** SHA-256 of the signing certificate, so rotating the keystore forces a rebuild. */
  certSha256: Schema.String,
});

export type FingerprintInputs = typeof FingerprintInputs.Type;

/** Attached to every release as `build-manifest.json`; the previous release is our only state. */
export const BuildManifest = Schema.Struct({
  schema: Schema.Literal(1),
  fingerprint: Schema.String,
  inputs: FingerprintInputs,
  builtAt: Schema.String,
  apk: Schema.Struct({
    name: Schema.String,
    sha256: Schema.String,
    size: Schema.Number,
  }),
});

export type BuildManifest = typeof BuildManifest.Type;
