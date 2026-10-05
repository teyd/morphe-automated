import { Schema } from "effect";

export class ConfigError extends Schema.TaggedError<ConfigError>()("ConfigError", {
  message: Schema.String,
}) {}

export class GitHubError extends Schema.TaggedError<GitHubError>()("GitHubError", {
  message: Schema.String,
  status: Schema.optional(Schema.Int),
}) {}

/** A plain HTTP failure. `status` is absent for transport-level errors. */
export class WebError extends Schema.TaggedError<WebError>()("WebError", {
  url: Schema.String,
  message: Schema.String,
  status: Schema.optional(Schema.Int),
}) {}

export class NoEligibleRelease extends Schema.TaggedError<NoEligibleRelease>()(
  "NoEligibleRelease",
  { repo: Schema.String, message: Schema.String },
) {}

export class NoCompatibleVersion extends Schema.TaggedError<NoCompatibleVersion>()(
  "NoCompatibleVersion",
  { packageName: Schema.String, message: Schema.String },
) {}

export class VerificationError extends Schema.TaggedError<VerificationError>()(
  "VerificationError",
  {
    kind: Schema.Literals(["digest", "signature", "certificate"]),
    message: Schema.String,
  },
) {}

/** A download source refused us (Cloudflare, rate limit, 403...). Triggers fallback to the next source. */
export class SourceBlocked extends Schema.TaggedError<SourceBlocked>()("SourceBlocked", {
  source: Schema.String,
  message: Schema.String,
}) {}

/** A download source works but does not have the requested app/version/variant. */
export class ApkNotFound extends Schema.TaggedError<ApkNotFound>()("ApkNotFound", {
  source: Schema.String,
  message: Schema.String,
}) {}

export class PatchError extends Schema.TaggedError<PatchError>()("PatchError", {
  message: Schema.String,
}) {}

export class KeystoreError extends Schema.TaggedError<KeystoreError>()("KeystoreError", {
  message: Schema.String,
}) {}
