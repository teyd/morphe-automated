import { Effect, FileSystem, Path } from "effect";
import { FetchHttpClient } from "effect/http";
import { APKMIRROR_WEB_OPTIONS, apkMirrorSource } from "../apk/apkmirror.ts";
import { fetchApk } from "../apk/source.ts";
import { uptodownSource } from "../apk/uptodown.ts";
import { verifyStockApk } from "../apk/verify.ts";
import type { LoadedConfig } from "../config/load.ts";
import { PatchError, VerificationError } from "../domain/errors.ts";
import type { BuildManifest } from "../domain/manifest.ts";
import { runPatch } from "../patch/morphe.ts";
import { publishRelease } from "../release/publish.ts";
import { apkAssetName } from "../release/naming.ts";
import { fetchVerified } from "../services/artifacts.ts";
import { gpgVerify } from "../services/gpg.ts";
import { Web, makeWeb } from "../services/Web.ts";
import { sha256Hex } from "../util/hash.ts";
import { withSigningKey } from "../signing/keystore.ts";
import type { AppPlan } from "./plan.ts";

export interface BuildOptions {
  readonly config: LoadedConfig;
  /** Directory holding `sources.toml`; `gpg_public_key` paths are relative to it. */
  readonly configRoot: string;
  /** Scratch space; everything below is safe to delete. */
  readonly workRoot: string;
  /** Create the GitHub release. Without it the patched APK is only left in the work directory. */
  readonly publish: boolean;
  readonly repo: string | undefined;
}

const BROWSER_UA = APKMIRROR_WEB_OPTIONS.headers["user-agent"];

/** Download every input, patch, sign, and (optionally) publish. Returns the path of the patched APK. */
export const buildApp = Effect.fn("buildApp")(function* (plan: AppPlan, options: BuildOptions) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const { app } = plan;
  const directory = path.join(options.workRoot, app.slug);
  yield* fs.makeDirectory(directory, { recursive: true });
  yield* fs.makeDirectory(path.join(options.workRoot, "cli"), { recursive: true });

  yield* Effect.logInfo(`[${app.slug}] downloading Morphe CLI ${plan.cli.version}`);
  const cliJar = path.join(options.workRoot, "cli", plan.cli.assetName);
  yield* fetchVerified(plan.cli.assetUrl, cliJar, plan.cli.sha256);

  const bundles: string[] = [];
  for (const bundle of plan.bundles) {
    yield* Effect.logInfo(`[${app.slug}] downloading ${bundle.source} ${bundle.tag}`);
    const file = path.join(directory, `${bundle.source}-${bundle.assetName}`);
    yield* fetchVerified(bundle.assetUrl, file, bundle.sha256);

    const key = options.config.sources[bundle.source]?.gpg_public_key;
    if (key !== undefined) {
      if (bundle.signatureUrl === undefined) {
        return yield* new VerificationError({
          kind: "signature",
          message: `${bundle.source} ${bundle.tag} has no .asc signature but a gpg_public_key is configured`,
        });
      }
      const signature = `${file}.asc`;
      yield* (yield* Web).download(bundle.signatureUrl, signature);
      yield* gpgVerify(file, signature, path.join(options.configRoot, key));
      yield* Effect.logInfo(`[${app.slug}] ${bundle.source} signature verified`);
    }
    bundles.push(file);
  }

  const mirror = yield* makeWeb(APKMIRROR_WEB_OPTIONS);
  const uptodown = yield* makeWeb({ headers: { "user-agent": BROWSER_UA } });
  yield* Effect.logInfo(`[${app.slug}] fetching ${app.config.package} ${plan.inputs.appVersion}`);
  const stock = yield* fetchApk([apkMirrorSource(mirror), uptodownSource(uptodown)], {
    packageName: app.config.package,
    version: plan.inputs.appVersion,
    arch: app.config.arch,
    apkFileType: plan.apkFileType,
    download: app.config.download,
    destination: path.join(directory, "stock"),
  });
  yield* Effect.logInfo(
    `[${app.slug}] got ${stock.kind} from ${stock.source} (${stock.size} bytes)`,
  );

  const verification = yield* verifyStockApk(stock, plan.expectedSignatures);
  if (verification.verified) {
    yield* Effect.logInfo(`[${app.slug}] stock APK signed by ${verification.certSha256}: verified`);
  } else {
    yield* Effect.logWarning(
      `[${app.slug}] stock APK signed by ${verification.certSha256}, but no known fingerprint to compare it with. Add it to expected_signatures to enforce it.`,
    );
  }

  const output = path.join(directory, "patched.apk");
  yield* withSigningKey(options.config.certSha256, (key) =>
    runPatch({
      cliJar,
      bundles,
      input: stock.path,
      output,
      scratch: path.join(directory, "scratch"),
      arch: app.config.arch,
      patches: app.config.patches,
      key,
    }),
  );

  const bytes = yield* fs
    .readFile(output)
    .pipe(Effect.mapError((error) => new PatchError({ message: error.message })));
  yield* Effect.logInfo(`[${app.slug}] built ${output} (${bytes.byteLength} bytes)`);

  if (options.publish) {
    if (options.repo === undefined) {
      return yield* new PatchError({ message: "cannot publish: GITHUB_REPOSITORY is not set" });
    }
    const manifest: BuildManifest = {
      schema: 1,
      fingerprint: plan.fingerprint,
      inputs: plan.inputs,
      builtAt: new Date().toISOString(),
      apk: {
        name: apkAssetName(app.slug, app.config.arch),
        sha256: sha256Hex(bytes),
        size: bytes.byteLength,
      },
    };
    yield* publishRelease({
      repo: options.repo,
      identity: {
        slug: app.slug,
        name: app.config.name,
        inputs: plan.inputs,
        fingerprint: plan.fingerprint,
      },
      apkPath: output,
      manifest,
      bundles: plan.bundles.map(({ source, repo, tag }) => ({ source, repo, tag })),
      cliVersion: plan.cli.version,
      workDirectory: directory,
    });
  }

  return output;
}, Effect.provide(FetchHttpClient.layer));
