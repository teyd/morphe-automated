import { Schema } from "effect";

export const ReleaseAsset = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  size: Schema.Number,
  /** `sha256:<hex>`, computed by GitHub on upload. Missing on very old assets. */
  digest: Schema.NullOr(Schema.String),
  browser_download_url: Schema.String,
});

export type ReleaseAsset = typeof ReleaseAsset.Type;

export const Release = Schema.Struct({
  id: Schema.Number,
  tag_name: Schema.String,
  name: Schema.NullOr(Schema.String),
  draft: Schema.Boolean,
  prerelease: Schema.Boolean,
  published_at: Schema.NullOr(Schema.String),
  html_url: Schema.String,
  body: Schema.NullOr(Schema.String),
  assets: Schema.Array(ReleaseAsset),
});

export type Release = typeof Release.Type;

export const Releases = Schema.Array(Release);
