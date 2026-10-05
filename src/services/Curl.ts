import { Context, Effect, FileSystem, Layer, Semaphore, type Schema } from "effect";
import { WebError } from "../domain/errors.ts";
import { sha256Hex } from "../util/hash.ts";
import { Shell } from "./Shell.ts";
import {
  withRetry,
  type Downloaded,
  type WebClient,
  type WebOptions,
  type WebProxy,
} from "./Web.ts";

/** curl flag for a header; `user-agent` and `referer` have dedicated flags. */
const headerArgs = (headers: Readonly<Record<string, string>>): string[] =>
  Object.entries(headers).flatMap(([name, value]) => {
    switch (name.toLowerCase()) {
      case "user-agent":
        return ["--user-agent", value];
      case "referer":
        return ["--referer", value];
      default:
        return ["--header", `${name}: ${value}`];
    }
  });

const proxyArgs = (proxy: WebProxy | undefined): string[] => {
  if (proxy === undefined) return [];

  const args = ["--proxy", proxy.url];

  if (proxy.caCertificate !== undefined) args.push("--cacert", proxy.caCertificate);

  return args;
};

/** Split `curl --write-out '\n%{http_code}'` output into body and status. */
export const splitStatus = (output: string) => {
  const cut = output.lastIndexOf("\n");

  return { body: cut < 0 ? "" : output.slice(0, cut), status: Number(output.slice(cut + 1)) };
};

/**
 * A `WebClient` that shells out to curl. Some sites (APKMirror) fingerprint the TLS handshake and refuse
 * Bun's `fetch` while accepting curl with identical headers, so those requests go through curl.
 */
export const makeCurlWeb = Effect.fn("makeCurlWeb")(function* (options: WebOptions = {}) {
  const shell = yield* Shell;
  const fs = yield* FileSystem.FileSystem;
  const gate = yield* Semaphore.make(1);

  const run = (
    url: string,
    args: ReadonlyArray<string>,
    headers?: Readonly<Record<string, string>>,
  ) =>
    gate.withPermits(1)(
      shell
        .run("curl", [
          "--silent",
          "--show-error",
          "--location",
          "--compressed",
          "--max-time",
          "900",
          ...proxyArgs(options.proxy),
          ...headerArgs({ ...options.headers, ...headers }),
          ...args,
          url,
        ])
        .pipe(
          Effect.mapError((error) => new WebError({ url, message: error.message })),
          Effect.tap(() =>
            options.minIntervalMs ? Effect.sleep(options.minIntervalMs) : Effect.void,
          ),
        ),
    );

  const statusOk = (url: string, status: number) =>
    status >= 200 && status < 300
      ? Effect.void
      : Effect.fail(new WebError({ url, status, message: `HTTP ${status}` }));

  const text = (url: string, headers?: Readonly<Record<string, string>>) =>
    withRetry(
      run(url, ["--write-out", "\n%{http_code}"], headers).pipe(
        Effect.flatMap(({ stdout }) => {
          const { body, status } = splitStatus(stdout);

          return statusOk(url, status).pipe(Effect.as(body));
        }),
      ),
    );

  const download = (url: string, destination: string, headers?: Readonly<Record<string, string>>) =>
    withRetry(
      run(url, ["--output", destination, "--write-out", "%{http_code}"], headers).pipe(
        Effect.flatMap(({ stdout }) => statusOk(url, Number(stdout.trim()))),
      ),
    ).pipe(
      Effect.flatMap(() =>
        fs.readFile(destination).pipe(
          Effect.mapError((error) => new WebError({ url, message: error.message })),
          Effect.map((bytes): Downloaded => ({
            sha256: sha256Hex(bytes),
            size: bytes.byteLength,
            head: bytes.slice(0, 4),
          })),
        ),
      ),
    );

  const web: WebClient = {
    text,
    json: (url, headers) =>
      text(url, headers).pipe(
        Effect.flatMap((body) =>
          Effect.try({
            try: (): Schema.Json => JSON.parse(body),
            catch: (cause) => new WebError({ url, message: `invalid JSON: ${String(cause)}` }),
          }),
        ),
      ),
    download,
  };

  return web;
});

/** A curl-backed web client, provided as its own service so callers pick their transport explicitly. */
export class CurlWeb extends Context.Service<CurlWeb, WebClient>()("morphe-automated/CurlWeb") {
  static readonly layer = (options: WebOptions) => Layer.effect(CurlWeb, makeCurlWeb(options));
}
