import { Effect } from "effect";
import { NoCompatibleVersion } from "../domain/errors.ts";
import type { PackageInfo } from "../domain/patches.ts";
import { newest } from "../domain/version.ts";

export interface TargetOptions {
  readonly pin: string | undefined;
  readonly allowExperimental: boolean;
}

/** The app version to patch: the pin, else the newest version the patches support. */
export const chooseAppVersion = (
  info: PackageInfo | undefined,
  packageName: string,
  options: TargetOptions,
) => {
  if (options.pin !== undefined) return Effect.succeed(options.pin);
  if (info === undefined) {
    return Effect.fail(
      new NoCompatibleVersion({
        packageName,
        message: "the patch bundle does not patch this package",
      }),
    );
  }
  const candidates = info.versions.filter((v) => options.allowExperimental || !v.experimental);
  const best = newest(candidates, (v) => v.version);
  if (best === undefined) {
    return Effect.fail(
      new NoCompatibleVersion({
        packageName,
        message: `no ${options.allowExperimental ? "" : "non-experimental "}version is listed; set allow_experimental or pin "version"`,
      }),
    );
  }
  return Effect.succeed(best.version);
};
