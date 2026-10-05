import { Console, Effect } from "effect";
import { Command, Flag } from "effect/cli";
import { loadConfig } from "../config/load.ts";
import { obtainiumShareLink } from "../release/obtainium.ts";
import { configDirectory, thisRepo } from "./common.ts";

export const obtainium = Command.make(
  "obtainium",
  {
    config: configDirectory,
    repo: Flag.String("repo").pipe(
      Flag.withDescription("owner/name (default: $GITHUB_REPOSITORY, else the origin remote)"),
      Flag.optional,
    ),
  },
  Effect.fn("obtainium")(function* ({ config, repo }) {
    const loaded = yield* loadConfig(config);
    const slug = yield* thisRepo(repo);

    if (slug === undefined) {
      return yield* Effect.fail(
        new Error("pass --repo owner/name; no GITHUB_REPOSITORY or origin remote"),
      );
    }

    const rows = loaded.apps
      .filter((app) => app.config.enabled)
      .map((app) => {
        const link = obtainiumShareLink({
          slug: app.slug,
          name: app.config.name,
          packageName: app.config.package,
          arch: app.config.arch,
          repo: slug,
        });

        return `| ${app.config.name} | [Add to Obtainium](${link}) |`;
      });

    yield* Console.log(["| App | Obtainium |", "| --- | --- |", ...rows].join("\n"));
  }),
).pipe(Command.withDescription("Print a README table with one-tap Obtainium import links"));
