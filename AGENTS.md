# morphe-automated

Daily GitHub Actions builder for Morphe-patched apps. User-facing behaviour lives in `README.md`.

Finish every change with `mise run check && mise run test`.

## Conventions

- Effect 4: `Context.Service` for services, `Schema.TaggedError` for errors, `Effect.fn("name")(function*..., ...combinators)`.
  Extra combinators go in as arguments, since the result of `Effect.fn` has no `.pipe`.
- Tests run on Node under Vitest. Cover Effect code with fake layers; reach real processes and the network only through scripts.
- Keep passwords inside `Redacted`, pass them to child processes through env vars, and keep them out of logs.
- Commit in small steps, one logical change each.

## Lint

- `tools/oxlint/anti-slop` is vendored and owned here (provenance in its `UPSTREAM.md`). Fix findings in the code, and change rules there deliberately; keep every rule at `error` and add no suppressions.
- `@oxlint/plugins` is pinned to the oxlint version bundled by `vite-plus`. Bump both together.

## Gotchas

- Route APKMirror through curl (the `CurlWeb` service). Cloudflare rejects Bun's `fetch` on download pages by TLS fingerprint, whatever the headers.
- piko-newx's `patches-bundle.json` describes the release before the one it is tagged with. Read it at the next release's tag.
- Obtainium tracks the release tag and runs with version detection off, because a patched APK keeps the stock `versionName`. Every distinct build needs a distinct tag, which the fingerprint suffix provides.
- A release's previous `build-manifest.json` is the only stored state. Keep state out of git.
- Effect's config provider snapshots env at startup, so tests that change env mid-run see the old values.
- Fixtures under `test/fixtures` are trimmed real pages. Refresh them from live pages when a site's markup changes.
