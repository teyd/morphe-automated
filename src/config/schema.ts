import { Effect, Schema } from "effect";

/** Optional key that decodes to `value` when absent. */
const defaulted = <S extends Schema.Constraint>(schema: S, value: S["Encoded"]) =>
  Schema.withDecodingDefaultKey(Effect.succeed(value))(schema);

const RepoName = Schema.String.pipe(Schema.check(Schema.isPattern(/^[\w.-]+\/[\w.-]+$/)));

/** A repository that publishes Morphe patch bundles (`.mpp` release assets). */
export const SourceConfig = Schema.Struct({
  repo: RepoName,
  /** Hours a release must be public before we use it. Rapid-fire repos often ship a hotfix within hours. */
  cooldown_hours: defaulted(Schema.Number, 6),
  /**
   * Where the supported app versions come from:
   * - `patches-list`: `patches-list.json` at the release tag (Morphe, piko)
   * - `bundle`: `app_version` in `patches-bundle.json` at the release tag (piko-newx)
   */
  versions: Schema.Literals(["patches-list", "bundle"]),
  /** Path to an ASCII-armored public key. When set, the bundle's `.asc` signature must verify. */
  gpg_public_key: Schema.optionalKey(Schema.String),
});
export type SourceConfig = typeof SourceConfig.Type;

export const SourcesFile = Schema.Struct({
  sources: Schema.Record(Schema.String, SourceConfig),
});

export const OptionValue = Schema.Union([Schema.String, Schema.Number, Schema.Boolean]);

export const AppConfig = Schema.Struct({
  name: Schema.NonEmptyString,
  package: Schema.NonEmptyString,
  /** Keys of `sources.toml`, applied in this order. */
  sources: Schema.Array(Schema.NonEmptyString).pipe(Schema.check(Schema.isMinLength(1))),
  enabled: defaulted(Schema.Boolean, true),
  arch: defaulted(Schema.Literals(["arm64-v8a", "armeabi-v7a", "x86_64", "x86"]), "arm64-v8a"),
  /** Pin an exact app version instead of the newest supported one. */
  version: Schema.optionalKey(Schema.String),
  /** Allow versions the patches mark as experimental. */
  allow_experimental: defaulted(Schema.Boolean, false),
  /** SHA-256 signing certificate fingerprints of the original app, when the patch list has none. */
  expected_signatures: defaulted(Schema.Array(Schema.String), []),
  patches: defaulted(
    Schema.Struct({
      enable: defaulted(Schema.Array(Schema.String), []),
      disable: defaulted(Schema.Array(Schema.String), []),
      exclusive: defaulted(Schema.Boolean, false),
      options: defaulted(Schema.Record(Schema.String, OptionValue), {}),
    }),
    {},
  ),
  download: Schema.Struct({
    /** `<developer>/<app>` as in `https://www.apkmirror.com/apk/<developer>/<app>/`. */
    apkmirror: Schema.optionalKey(Schema.String),
    /** Subdomain as in `https://<slug>.en.uptodown.com/android`. */
    uptodown: Schema.optionalKey(Schema.String),
  }),
});
export type AppConfig = typeof AppConfig.Type;

/** Public SHA-256 fingerprint of your signing certificate. Safe to commit; written by `keystore init`. */
export const SigningFile = Schema.Struct({
  cert_sha256: Schema.String.pipe(Schema.check(Schema.isPattern(/^[0-9a-f]{64}$/))),
});
export type SigningFile = typeof SigningFile.Type;
