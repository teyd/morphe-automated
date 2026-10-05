import { Effect } from "effect";
import type { AppConfig } from "../config/schema.ts";
import { ApkNotFound, type SourceBlocked } from "../domain/errors.ts";
import type { VariantKind } from "./apkmirror-parse.ts";

export interface ApkRequest {
  readonly packageName: string;
  readonly version: string;
  readonly arch: string;
  /** From the patch list: `APK_REQUIRED` demands a plain APK. */
  readonly apkFileType: string | null;
  readonly download: AppConfig["download"];
  /** Where to put the file, without an extension. */
  readonly destination: string;
}

export interface ApkFile {
  readonly source: string;
  readonly kind: VariantKind;
  readonly path: string;
  readonly sha256: string;
  readonly size: number;
}

export interface ApkSource {
  readonly name: string;
  readonly fetch: (request: ApkRequest) => Effect.Effect<ApkFile, SourceBlocked | ApkNotFound>;
}

/** Try each source in order; a blocked or empty source just moves on to the next. */
export const fetchApk = Effect.fn("fetchApk")(function* (
  sources: ReadonlyArray<ApkSource>,
  request: ApkRequest,
) {
  const failures: string[] = [];

  for (const source of sources) {
    const result = yield* Effect.result(source.fetch(request));

    if (result._tag === "Success") return result.success;
    yield* Effect.logWarning(`${source.name}: ${result.failure.message}`);
    failures.push(`${source.name}: ${result.failure.message}`);
  }

  return yield* new ApkNotFound({
    source: "all",
    message: `${request.packageName} ${request.version} unavailable (${failures.join("; ") || "no sources configured"})`,
  });
});
