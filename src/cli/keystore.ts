import { Command, Flag } from "effect/cli";
import { initKeystore } from "../signing/init.ts";
import { configDirectory } from "./common.ts";

const init = Command.make(
  "init",
  {
    config: configDirectory,
    out: Flag.String("out").pipe(
      Flag.withDefault("release.p12"),
      Flag.withDescription("Where to write the keystore (keep it out of git)"),
    ),
    alias: Flag.String("alias").pipe(Flag.withDefault("morphe-automated")),
    name: Flag.String("name").pipe(
      Flag.withDefault("Morphe Automated"),
      Flag.withDescription("Common name in the certificate, e.g. your handle"),
    ),
    environment: Flag.String("environment").pipe(
      Flag.withDefault("release"),
      Flag.withDescription("GitHub environment the secrets will be stored in"),
    ),
  },
  ({ config, out, alias, name, environment }) =>
    initKeystore({ out, alias, commonName: name, configDirectory: config, environment }),
).pipe(Command.withDescription("Generate your personal signing keystore"));

export const keystore = Command.make("keystore").pipe(
  Command.withDescription("Manage the key your APKs are signed with"),
  Command.withSubcommands([init]),
);
