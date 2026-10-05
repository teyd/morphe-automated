import { Effect } from "effect";
import { ApkNotFound, SourceBlocked, type WebError } from "../domain/errors.ts";
import { looksLikeZip, type WebClient } from "../services/Web.ts";
import {
  findDownloadButton,
  findDownloadLink,
  findReleaseLink,
  findUploadsCategory,
  guessReleasePath,
  isChallenge,
  parseVariants,
  pickVariant,
  releasePrefix,
  uploadsPath,
} from "./apkmirror-parse.ts";
import type { ApkFile, ApkRequest, ApkSource } from "./source.ts";

const BASE = "https://www.apkmirror.com";

const NAME = "apkmirror";

/** Each uploads page holds ~30 releases; YouTube ships many betas, so older versions sit deep. */
const MAX_UPLOAD_PAGES = 12;

/** APKMirror rate limits bursts; space requests out. Pass these to `makeWeb`. */
export const APKMIRROR_WEB_OPTIONS = {
  minIntervalMs: 2500,
  headers: {
    "user-agent":
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "accept-language": "en-US,en;q=0.9",
  },
} as const;

const blocked = (message: string) => new SourceBlocked({ source: NAME, message });

const notFound = (message: string) => new ApkNotFound({ source: NAME, message });

const fromWeb = (error: WebError) =>
  error.status === 404
    ? notFound(`${error.url}: not found`)
    : blocked(`${error.url}: ${error.message}`);

export const apkMirrorSource = (web: WebClient): ApkSource => {
  const page = (path: string, referer?: string) =>
    web
      .text(`${BASE}${path}`, referer === undefined ? undefined : { referer: `${BASE}${referer}` })
      .pipe(
        Effect.mapError(fromWeb),
        Effect.filterOrFail(
          (html) => !isChallenge(html),
          () => blocked("Cloudflare challenge page"),
        ),
      );

  /**
   * Cheapest first: the app page (latest ~9 releases), then the release URL guessed from the naming
   * pattern, then the full upload history page by page.
   */
  const findRelease = Effect.fn("apkmirror.findRelease")(function* (
    appPath: string,
    version: string,
  ) {
    const appHtml = yield* page(`/apk/${appPath}/`);
    const listed = findReleaseLink(appHtml, appPath, version);

    if (listed !== undefined) return listed;

    const prefix = releasePrefix(appHtml, appPath);

    if (prefix !== undefined) {
      const guess = guessReleasePath(appPath, prefix, version);
      const attempt = yield* Effect.result(page(guess));

      if (attempt._tag === "Success") return guess;

      if (attempt.failure._tag === "SourceBlocked") return yield* attempt.failure;
    }

    const category = findUploadsCategory(appHtml);

    if (category === undefined) {
      return yield* notFound(
        `${appPath} ${version}: not on the app page and no upload history to search`,
      );
    }

    for (let number = 1; number <= MAX_UPLOAD_PAGES; number++) {
      const link = findReleaseLink(yield* page(uploadsPath(category, number)), appPath, version);

      if (link !== undefined) return link;
    }

    return yield* notFound(
      `${appPath} ${version} is not in the latest ${MAX_UPLOAD_PAGES} upload pages`,
    );
  });

  const fetch = Effect.fn("apkmirror.fetch")(function* (request: ApkRequest) {
    const appPath = request.download.apkmirror;

    if (appPath === undefined) return yield* notFound("no apkmirror path configured for this app");

    const releasePath = yield* findRelease(appPath, request.version);
    const releaseHtml = yield* page(releasePath);

    const variants = parseVariants(releaseHtml);
    const variant = pickVariant(variants, { arch: request.arch, apkFileType: request.apkFileType });

    if (variant === undefined) {
      const seen = variants.map((v) => `${v.kind}/${v.arch}`).join(", ") || "none";

      return yield* notFound(
        `no ${request.apkFileType === "APK_REQUIRED" ? "plain APK " : ""}variant for ${request.arch} (found: ${seen})`,
      );
    }

    const variantHtml = yield* page(variant.href, releasePath);
    const buttonPath = findDownloadButton(variantHtml);

    if (buttonPath === undefined) return yield* notFound("variant page has no download button");

    const downloadHtml = yield* page(buttonPath, variant.href);
    const filePath = findDownloadLink(downloadHtml);

    if (filePath === undefined) return yield* notFound("download page has no file link");

    const destination = `${request.destination}.${variant.kind === "apk" ? "apk" : "apkm"}`;

    const downloaded = yield* web
      .download(`${BASE}${filePath}`, destination, { referer: `${BASE}${buttonPath}` })
      .pipe(Effect.mapError(fromWeb));

    if (!looksLikeZip(downloaded.head)) {
      return yield* blocked("the download was not an APK archive");
    }

    return {
      source: NAME,
      kind: variant.kind,
      path: destination,
      sha256: downloaded.sha256,
      size: downloaded.size,
    } satisfies ApkFile;
  });

  return { name: NAME, fetch };
};
