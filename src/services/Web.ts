import { Context, Effect, FileSystem, Layer, Schedule, Semaphore } from "effect";
import {
  FetchHttpClient,
  HttpClient,
  HttpClientRequest,
  type HttpClientResponse,
} from "effect/http";
import { WebError } from "../domain/errors.ts";
import { sha256Hex } from "../util/hash.ts";

export interface WebOptions {
  /** Pause after every request. Needed for sites that rate limit bursts (APKMirror). */
  readonly minIntervalMs?: number;
  readonly headers?: Readonly<Record<string, string>>;
}

export interface Downloaded {
  readonly sha256: string;
  readonly size: number;
  /** First bytes of the file, to sanity check its format. */
  readonly head: Uint8Array;
}

/** The same client with default headers on every request; per-call headers win. */
export const withHeaders = (
  web: WebClient,
  defaults: Readonly<Record<string, string>>,
): WebClient => ({
  text: (url, headers) => web.text(url, { ...defaults, ...headers }),
  json: (url, headers) => web.json(url, { ...defaults, ...headers }),
  download: (url, destination, headers) =>
    web.download(url, destination, { ...defaults, ...headers }),
});

/** `PK\x03\x04`: APKs, bundles and `.mpp` files are all ZIP archives. */
export const looksLikeZip = (head: Uint8Array): boolean =>
  head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04;

export interface WebClient {
  readonly text: (
    url: string,
    headers?: Readonly<Record<string, string>>,
  ) => Effect.Effect<string, WebError>;
  readonly json: (
    url: string,
    headers?: Readonly<Record<string, string>>,
  ) => Effect.Effect<unknown, WebError>;
  readonly download: (
    url: string,
    destination: string,
    headers?: Readonly<Record<string, string>>,
  ) => Effect.Effect<Downloaded, WebError>;
}

/** 429 and 5xx are worth retrying; a 403 challenge page is not. */
const retryable = (error: WebError): boolean =>
  error.status === undefined || error.status === 429 || error.status >= 500;

const retrySchedule = Schedule.max([Schedule.exponential("1 second"), Schedule.recurs(3)]).pipe(
  Schedule.jittered,
  Schedule.setInputType<WebError>(),
  Schedule.while(({ input }) => retryable(input)),
);

/** Retry transient failures with jittered exponential backoff, at most 3 times. */
export const withRetry = <A, R>(request: Effect.Effect<A, WebError, R>) =>
  request.pipe(Effect.retry(retrySchedule));

export const makeWeb = Effect.fn("makeWeb")(function* (options: WebOptions = {}) {
  const client = yield* HttpClient.HttpClient;
  const fs = yield* FileSystem.FileSystem;
  const gate = yield* Semaphore.make(1);

  const fetchOnce = (url: string, headers: Readonly<Record<string, string>> | undefined) =>
    gate.withPermits(1)(
      client
        .execute(
          HttpClientRequest.get(url).pipe(
            HttpClientRequest.setHeaders({ ...options.headers, ...headers }),
          ),
        )
        .pipe(
          Effect.mapError((error) => new WebError({ url, message: error.message })),
          Effect.flatMap((response) =>
            response.status >= 200 && response.status < 300
              ? Effect.succeed(response)
              : Effect.fail(
                  new WebError({
                    url,
                    status: response.status,
                    message: `HTTP ${response.status}`,
                  }),
                ),
          ),
          Effect.tap(() =>
            options.minIntervalMs ? Effect.sleep(options.minIntervalMs) : Effect.void,
          ),
        ),
    );

  const request = (url: string, headers?: Readonly<Record<string, string>>) =>
    withRetry(fetchOnce(url, headers));

  const body = <A>(
    url: string,
    read: (response: HttpClientResponse.HttpClientResponse) => Effect.Effect<A, unknown>,
    headers?: Readonly<Record<string, string>>,
  ) =>
    request(url, headers).pipe(
      Effect.flatMap((response) =>
        read(response).pipe(
          Effect.mapError((error) => new WebError({ url, message: String(error) })),
        ),
      ),
    );

  const web: WebClient = {
    text: (url, headers) => body(url, (r) => r.text, headers),
    json: (url, headers) => body(url, (r) => r.json, headers),
    download: (url, destination, headers) =>
      body(url, (r) => r.arrayBuffer, headers).pipe(
        Effect.flatMap((buffer) => {
          const bytes = new Uint8Array(buffer);

          return fs.writeFile(destination, bytes).pipe(
            Effect.mapError((error) => new WebError({ url, message: error.message })),
            Effect.as({
              sha256: sha256Hex(bytes),
              size: bytes.byteLength,
              head: bytes.slice(0, 4),
            } satisfies Downloaded),
          );
        }),
      ),
  };

  return web;
});

export class Web extends Context.Service<Web, WebClient>()("morphe-automated/Web") {
  static readonly layer = Layer.effect(Web, makeWeb()).pipe(Layer.provide(FetchHttpClient.layer));
}
