import { Effect } from "effect";
import { VerificationError, type WebError } from "../domain/errors.ts";
import { Web, type Downloaded } from "./Web.ts";

/** Download `url` to `destination` and fail unless its SHA-256 equals `expectedSha256`. */
export const fetchVerified = Effect.fn("fetchVerified")(function* (
  url: string,
  destination: string,
  expectedSha256: string,
) {
  const web = yield* Web;
  const downloaded: Downloaded = yield* web.download(url, destination);

  if (downloaded.sha256 !== expectedSha256.toLowerCase()) {
    return yield* new VerificationError({
      kind: "digest",
      message: `${url}: sha256 ${downloaded.sha256} does not match the published digest ${expectedSha256}`,
    });
  }

  return downloaded;
});

export type FetchError = WebError | VerificationError;
