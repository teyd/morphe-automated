import { Effect, FileSystem, Path, Schema } from "effect";
import { parse as parseToml } from "smol-toml";
import { ConfigError } from "../domain/errors.ts";
import { sha256Hex, stableStringify } from "../util/hash.ts";
import { AppConfig, SigningFile, SourcesFile, type SourceConfig } from "./schema.ts";

export interface LoadedApp {
  /** File name without extension; used in release tags and asset names. */
  readonly slug: string;
  readonly config: AppConfig;
}

export interface LoadedConfig {
  readonly sources: Readonly<Record<string, SourceConfig>>;
  /** SHA-256 of the certificate every APK is signed with. */
  readonly certSha256: string;
  readonly apps: ReadonlyArray<LoadedApp>;
}

const toml = (label: string, text: string) =>
  Effect.try({
    try: () => parseToml(text),
    catch: (cause) => new ConfigError({ message: `${label}: invalid TOML: ${String(cause)}` }),
  });

const decode = <S extends Schema.Constraint & { readonly DecodingServices: never }>(
  label: string,
  schema: S,
  input: unknown,
) =>
  Schema.decodeUnknownEffect(schema)(input).pipe(
    Effect.mapError((error) => new ConfigError({ message: `${label}: ${error.message}` })),
  );

export const parseSources = (text: string) =>
  toml("sources.toml", text).pipe(
    Effect.flatMap((raw) => decode("sources.toml", SourcesFile, raw)),
    Effect.map((file) => file.sources),
  );

export const parseSigning = (text: string) =>
  toml("signing.toml", text).pipe(
    Effect.flatMap((raw) => decode("signing.toml", SigningFile, raw)),
    Effect.map((file) => file.cert_sha256),
  );

export const parseApp = (slug: string, text: string) =>
  toml(`apps/${slug}.toml`, text).pipe(
    Effect.flatMap((raw) => decode(`apps/${slug}.toml`, AppConfig, raw)),
    Effect.map((config): LoadedApp => ({ slug, config })),
  );

/** Hash of every setting that changes the produced APK. Cosmetic fields are left out. */
export const configHash = (app: AppConfig): string =>
  sha256Hex(
    stableStringify({
      sources: app.sources,
      arch: app.arch,
      version: app.version ?? null,
      allow_experimental: app.allow_experimental,
      patches: app.patches,
    }),
  );

export const loadConfig = Effect.fn("loadConfig")(function* (root: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const read = (file: string) =>
    fs
      .readFileString(path.join(root, file))
      .pipe(
        Effect.mapError(
          (error) => new ConfigError({ message: `cannot read ${file}: ${error.message}` }),
        ),
      );

  const sources = yield* read("sources.toml").pipe(Effect.flatMap(parseSources));

  const certSha256 = yield* fs.exists(path.join(root, "signing.toml")).pipe(
    Effect.mapError((error) => new ConfigError({ message: error.message })),
    Effect.flatMap((exists) =>
      exists
        ? read("signing.toml").pipe(Effect.flatMap(parseSigning))
        : Effect.fail(
            new ConfigError({
              message:
                "config/signing.toml is missing. Run `mise run keystore:init` and commit the result.",
            }),
          ),
    ),
  );

  const files = yield* fs
    .readDirectory(path.join(root, "apps"))
    .pipe(
      Effect.mapError(
        (error) => new ConfigError({ message: `cannot list apps/: ${error.message}` }),
      ),
    );

  const apps: LoadedApp[] = [];

  for (const file of files.filter((f) => f.endsWith(".toml")).sort()) {
    const slug = file.replace(/\.toml$/, "");
    const app = yield* read(`apps/${file}`).pipe(Effect.flatMap((text) => parseApp(slug, text)));

    for (const source of app.config.sources) {
      if (!(source in sources)) {
        return yield* new ConfigError({ message: `apps/${file}: unknown source "${source}"` });
      }
    }

    apps.push(app);
  }

  return { sources, certSha256, apps } satisfies LoadedConfig;
});
