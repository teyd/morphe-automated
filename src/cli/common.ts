import { BunServices } from "@effect/platform-bun";
import { Config, Console, Effect, Layer, Option } from "effect";
import { Flag } from "effect/cli";
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

export const runtimeLayer = Layer.mergeAll(GitHub.layer, Web.layer, Shell.layer).pipe(
  Layer.provideMerge(BunServices.layer),
);
