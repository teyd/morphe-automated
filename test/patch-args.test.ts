import { Redacted } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { patchArgs, type PatchJob } from "../src/patch/morphe.ts";

const job: PatchJob = {
  cliJar: "cli.jar",
  bundles: ["a.mpp"],
  input: "in.apk",
  output: "out.apk",
  scratch: "/tmp/scratch",
  arch: "arm64-v8a",
  patches: { enable: [], disable: [], exclusive: false, options: {} },
  key: {
    path: "/dev/shm/k.p12",
    alias: "apk-forge",
    password: Redacted.make("secret"),
    certSha256: "aa",
  },
};

describe("patchArgs", () => {
  it("builds a minimal signed, arm64-only patch command", () => {
    expect(patchArgs(job)).toEqual([
      "-jar",
      "cli.jar",
      "patch",
      "-p",
      "a.mpp",
      "--keystore",
      "/dev/shm/k.p12",
      "--keystore-password",
      "secret",
      "--keystore-entry-alias",
      "apk-forge",
      "--keystore-entry-password",
      "secret",
      "--striplibs",
      "arm64-v8a",
      "-t",
      "/tmp/scratch",
      "-o",
      "out.apk",
      "in.apk",
    ]);
  });

  it("puts the app's patch selection right after the first bundle", () => {
    const args = patchArgs({
      ...job,
      bundles: ["a.mpp", "b.mpp"],
      patches: {
        enable: ["Dark theme"],
        disable: ["Spoof signature"],
        exclusive: true,
        options: { "App name": "My App", Opacity: 0.5, Hide: true },
      },
    });
    const start = args.indexOf("-p");
    expect(args.slice(start, start + 10)).toEqual([
      "-p",
      "a.mpp",
      "--exclusive",
      "-e",
      "Dark theme",
      "-d",
      "Spoof signature",
      "-OApp name=My App",
      "-OOpacity=0.5",
      "-OHide=true",
    ]);
    expect(args.slice(start + 10, start + 12)).toEqual(["-p", "b.mpp"]);
  });

  it("refuses to run without a bundle", () => {
    expect(() => patchArgs({ ...job, bundles: [] })).toThrow(/no patch bundles/);
  });
});
