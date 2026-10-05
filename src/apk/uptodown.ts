import { Data, Effect } from "effect";
import { parse } from "node-html-parser";
import { ApkNotFound, SourceBlocked, type WebError } from "../domain/errors.ts";
import { looksLikeZip, type WebClient } from "../services/Web.ts";
import type { VariantKind } from "./apkmirror-parse.ts";
import type { ApkFile, ApkRequest, ApkSource } from "./source.ts";

const NAME = "uptodown";

export interface UptodownVersion {
  readonly id: string;
  readonly version: string;
  readonly kind: VariantKind;
}

export const parseVersions = (html: string): ReadonlyArray<UptodownVersion> =>
  parse(html)
    .querySelectorAll("#versions-items-list > div[data-version-id]")
    .flatMap((row) => {
      const id = row.getAttribute("data-version-id");
      const version = row.querySelector(".version")?.text.trim();
      const type = row.querySelector(".type")?.text.trim().toLowerCase();

      if (id === undefined || !version) return [];

      return [{ id, version, kind: type === "apk" ? ("apk" as const) : ("bundle" as const) }];
    });

export type DownloadPage = Data.TaggedEnum<{
  Direct: { readonly path: string };
  Captcha: {};
  Missing: {};
}>;

export const DownloadPage = Data.taggedEnum<DownloadPage>();

/**
 * Uptodown hands out the file through a one-off token. Today that token is gated behind an
 * interactive Cloudflare Turnstile captcha, which a CI job cannot solve; if the page ever exposes the
 * token directly (`data-url` on the download button) we use it.
 */
export const parseDownloadPage = (html: string): DownloadPage => {
  const root = parse(html);
  const token = root.querySelector("#detail-download-button")?.getAttribute("data-url");

  if (token) return DownloadPage.Direct({ path: token });

  if (root.querySelector("#download-turnstile-widget") !== null) return DownloadPage.Captcha();

  return DownloadPage.Missing();
};

const blocked = (message: string) => new SourceBlocked({ source: NAME, message });

const notFound = (message: string) => new ApkNotFound({ source: NAME, message });

const fromWeb = (error: WebError) =>
  error.status === 404
    ? notFound(`${error.url}: not found`)
    : blocked(`${error.url}: ${error.message}`);

export const uptodownSource = (web: WebClient): ApkSource => {
  const fetch = Effect.fn("uptodown.fetch")(function* (request: ApkRequest) {
    const slug = request.download.uptodown;

    if (slug === undefined) return yield* notFound("no uptodown slug configured for this app");
    const base = `https://${slug}.en.uptodown.com/android`;

    const versions = parseVersions(
      yield* web.text(`${base}/versions`).pipe(Effect.mapError(fromWeb)),
    );

    const matches = versions.filter((v) => v.version === request.version);
    const wanted = request.apkFileType === "APK_REQUIRED" ? "apk" : undefined;
    const chosen = matches.find((v) => v.kind === wanted) ?? (wanted ? undefined : matches[0]);

    if (chosen === undefined) {
      return yield* notFound(`${request.version} not in the latest versions list`);
    }

    const page = parseDownloadPage(
      yield* web.text(`${base}/download/${chosen.id}`).pipe(Effect.mapError(fromWeb)),
    );

    if (DownloadPage.$is("Captcha")(page)) {
      return yield* blocked("download requires an interactive captcha (Cloudflare Turnstile)");
    }

    if (DownloadPage.$is("Missing")(page))
      return yield* notFound("download page has no download button");

    const destination = `${request.destination}.${chosen.kind === "apk" ? "apk" : "apkm"}`;

    const downloaded = yield* web
      .download(`https://dw.uptodown.com/dwn/${page.path}`, destination)
      .pipe(Effect.mapError(fromWeb));

    if (!looksLikeZip(downloaded.head))
      return yield* blocked("the download was not an APK archive");

    return {
      source: NAME,
      kind: chosen.kind,
      path: destination,
      sha256: downloaded.sha256,
      size: downloaded.size,
    } satisfies ApkFile;
  });

  return { name: NAME, fetch };
};
