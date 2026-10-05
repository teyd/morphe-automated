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
}

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

  const retrySchedule = Schedule.max([Schedule.exponential("1 second"), Schedule.recurs(3)]).pipe(
    Schedule.jittered,
    Schedule.setInputType<WebError>(),
    Schedule.while(({ input }) => retryable(input)),
  );

  const request = (url: string, headers?: Readonly<Record<string, string>>) =>
    fetchOnce(url, headers).pipe(Effect.retry(retrySchedule));

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
            Effect.as({ sha256: sha256Hex(bytes), size: bytes.byteLength } satisfies Downloaded),
          );
        }),
      ),
  };
  return web;
});

export class Web extends Context.Service<Web, WebClient>()("apk-forge/Web") {
  static readonly layer = Layer.effect(Web, makeWeb()).pipe(Layer.provide(FetchHttpClient.layer));
}
