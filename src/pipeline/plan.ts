import { Effect } from "effect";
import { configHash, type LoadedApp, type LoadedConfig } from "../config/load.ts";
import type { FingerprintInputs } from "../domain/manifest.ts";
import { majorMinor } from "../domain/version.ts";
import { decide, fingerprint, type Decision } from "../plan/fingerprint.ts";
import { chooseAppVersion } from "../plan/target.ts";
import { previousBuild } from "../release/state.ts";
import { resolveCli } from "../services/cli.ts";
import { packageTargets, resolveBundle } from "../services/patch-sources.ts";

export interface PlanContext {
  readonly now: number;
  /** `owner/name` of this repository, where previous builds are looked up. */
  readonly repo: string | undefined;
  readonly force: boolean;
}

/** Everything resolved for one app, without having downloaded anything big. */
export const planApp = Effect.fn("planApp")(function* (
  app: LoadedApp,
  config: LoadedConfig,
  context: PlanContext,
) {
  const { package: packageName } = app.config;

  const bundles = yield* Effect.forEach(app.config.sources, (name) =>
    resolveBundle(name, config.sources[name]!, context.now),
  );
  const targets = yield* Effect.forEach(bundles, (bundle) =>
    packageTargets(bundle, config.sources[bundle.source]!, packageName),
  );

  const appVersion = yield* chooseAppVersion(targets[0], packageName, {
    pin: app.config.version,
    allowExperimental: app.config.allow_experimental,
  });
  const cli = yield* resolveCli(context.now);

  const inputs: FingerprintInputs = {
    app: app.slug,
    appVersion,
    arch: app.config.arch,
    bundles: bundles.map(({ source, tag, sha256 }) => ({ source, tag, sha256 })),
    cli: majorMinor(cli.version),
    configHash: configHash(app.config),
    certSha256: config.certSha256,
  };

  const previous = yield* previousBuild(context.repo, app.slug);
  const decision: Decision = decide(previous?.inputs, inputs, context.force);

  const known = targets.filter((t) => t !== undefined);
  return {
    app,
    inputs,
    fingerprint: fingerprint(inputs),
    decision,
    bundles,
    cli,
    apkFileType: known.map((t) => t.apkFileType).find((type) => type !== null) ?? null,
    /** Original publisher's signing certificates: the patch lists' plus any you pinned in the app config. */
    expectedSignatures: [
      ...new Set([...known.flatMap((t) => t.signatures), ...app.config.expected_signatures]),
    ],
  };
});

export type AppPlan = Effect.Success<ReturnType<typeof planApp>>;
