import { BunServices } from "@effect/platform-bun";
import { Config, Console, Effect, Layer, Option } from "effect";
import { Flag } from "effect/cli";
import { APKMIRROR_WEB_OPTIONS } from "../apk/apkmirror.ts";
import { CurlWeb } from "../services/Curl.ts";
import { GitHub } from "../services/GitHub.ts";
import { Shell } from "../services/Shell.ts";
import { Web } from "../services/Web.ts";

export const configDirectory = Flag.String("config").pipe(
  Flag.withDefault("config"),
  Flag.withDescription("Directory with sources.toml, signing.toml and apps/*.toml"),
);

/** `owner/name` of the repository releases live in. Set automatically on GitHub Actions. */
export const repository = Config.option(Config.String("GITHUB_REPOSITORY")).pipe(
  Effect.map(Option.getOrUndefined),
);

const insideActions = Config.withDefault(Config.String("GITHUB_ACTIONS"), "").pipe(
  Effect.map((value) => value === "true"),
);

/** A GitHub Actions annotation on Actions, a plain line elsewhere. */
export const annotate = (level: "warning" | "error", title: string, message: string) =>
  insideActions.pipe(
    Effect.flatMap((actions) =>
      Console.log(
        actions
          ? `::${level} title=${title}::${message.replaceAll("\n", "%0A")}`
          : `${level.toUpperCase()} ${title}: ${message}`,
      ),
    ),
  );

/**
 * APKMirror goes through an HTTP proxy when `APKMIRROR_PROXY_URL` is set (CI runs trawl there to get past
 * Cloudflare); `APKMIRROR_PROXY_CA` is the proxy's root certificate. Unset, curl connects directly.
 */
const apkMirrorWeb = Layer.unwrap(
  Effect.gen(function* () {
    const url = yield* Config.option(Config.String("APKMIRROR_PROXY_URL"));
    const caCertificate = yield* Config.option(Config.String("APKMIRROR_PROXY_CA"));

    const proxy = Option.map(url, (value) => ({
      url: value,
      caCertificate: Option.getOrUndefined(caCertificate),
    }));

    return CurlWeb.layer({ ...APKMIRROR_WEB_OPTIONS, proxy: Option.getOrUndefined(proxy) }).pipe(
      Layer.provide(Shell.layer),
    );
  }).pipe(Effect.orDie),
);

export const runtimeLayer = Layer.mergeAll(
  GitHub.layer.pipe(Layer.provide(Web.layer)),
  Web.layer,
  Shell.layer,
  apkMirrorWeb,
).pipe(Layer.provideMerge(BunServices.layer));
