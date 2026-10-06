# Why the latest manual run built every APK

Investigated 2026-10-06 using read-only `gh` API/log queries and the repository's source/history. No existing `docs/` or research-note convention was present, so this report lives at `docs/research/latest-manual-build.md`. No workflow, release, issue, or pull request was created or changed.

## Finding

**The actual dispatch enabled force and selected all apps.** Independently, the run's commit changed the config-hash representation for every app, so even a non-forced check would have selected all nine at that point: five existing apps had changed fingerprints, and four apps had no previous published build. This was not evidence of nine upstream app or patch updates. [1–5]

## Run and actual inputs

- Run: [Daily build #8, 37405057485](https://github.com/teyd/morphe-automated/actions/runs/37405057485), created `2026-10-06T02:37:47Z`, successful, attempt 1, `workflow_dispatch`, branch `main`, actor `teyd`. [1]
- Workflow/source SHA: `b71404444099b31edec62b97ac358016c60b68b4` (the Brave addition), committed `2026-10-06T02:37:30Z`. The workflow was `.github/workflows/daily.yml`. [1, 3]
- The check-step log records `FORCE: --force` and an empty `APP:` at `02:38:23Z`. This proves the effective inputs were force enabled and no app restriction; the workflow defaults are **not** the actual inputs. The run API itself does not expose the dispatch-input payload. [1, 2]
- The workflow maps `inputs.force` to `--force`, and an empty app input means all enabled apps. Its default force input is false; manual dispatch alone does not automatically force builds. [4, 6]
- Every planning line ended in `(forced)`; the summary was `9 to build, 0 up to date, 0 failed`. `decide()` returns `build: true, reason: "forced"` before testing previous inputs or equality, masking any more informative change reason. [2, 5]

### Per-app planning results and published identities

All rows below were logged as **forced** by the check job. The release links and manifests also confirm publication, rather than merely matrix-job creation. Fingerprint columns show seven-character prefixes, as used in release tags. [2, 7]

| App           | Selected stock version             | Selected bundle        | Previous fingerprint                                                                                         | New fingerprint / release                                                                                                                |
| ------------- | ---------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| brave         | 1.96.61                            | kveld v2.4.0           | none                                                                                                         | [ca16d30](https://github.com/teyd/morphe-automated/releases/tag/brave-1.96.61-kveld-2.4.0-ca16d30)                                       |
| duolingo      | 6.98.4                             | hoo-dles v1.47.0       | none                                                                                                         | [08a9afe](https://github.com/teyd/morphe-automated/releases/tag/duolingo-6.98.4-hoo-dles-1.47.0-08a9afe)                                 |
| gboard        | 18.0.3.954559732-release-arm64-v8a | gboard-patches v3.12.0 | none                                                                                                         | [560a401](https://github.com/teyd/morphe-automated/releases/tag/gboard-18.0.3.954559732-release-arm64-v8a-gboard-patches-3.12.0-560a401) |
| komoot        | 2026.34.2                          | riky v2.2.0            | [7227796](https://github.com/teyd/morphe-automated/releases/tag/komoot-2026.34.2-riky-2.2.0-7227796)         | [5cc85c5](https://github.com/teyd/morphe-automated/releases/tag/komoot-2026.34.2-riky-2.2.0-5cc85c5)                                     |
| reddit        | 2026.24.0                          | morphe v1.45.0         | [c846655](https://github.com/teyd/morphe-automated/releases/tag/reddit-2026.24.0-morphe-1.45.0-c846655)      | [58f2862](https://github.com/teyd/morphe-automated/releases/tag/reddit-2026.24.0-morphe-1.45.0-58f2862)                                  |
| tiktok        | 47.1.4                             | hushfeed v0.67.1       | none                                                                                                         | [6922d96](https://github.com/teyd/morphe-automated/releases/tag/tiktok-47.1.4-hushfeed-0.67.1-6922d96)                                   |
| x             | 12.29.1-prod.01                    | piko-newx v3.51.0      | [523a3d9](https://github.com/teyd/morphe-automated/releases/tag/x-12.29.1-prod.01-piko-newx-3.51.0-523a3d9)  | [44d1e61](https://github.com/teyd/morphe-automated/releases/tag/x-12.29.1-prod.01-piko-newx-3.51.0-44d1e61)                              |
| youtube-music | 9.15.51                            | morphe v1.45.0         | [cf000a8](https://github.com/teyd/morphe-automated/releases/tag/youtube-music-9.15.51-morphe-1.45.0-cf000a8) | [29f71c7](https://github.com/teyd/morphe-automated/releases/tag/youtube-music-9.15.51-morphe-1.45.0-29f71c7)                             |
| youtube       | 21.16.256                          | morphe v1.45.0         | [f0ddd06](https://github.com/teyd/morphe-automated/releases/tag/youtube-21.16.256-morphe-1.45.0-f0ddd06)     | [c4b8051](https://github.com/teyd/morphe-automated/releases/tag/youtube-21.16.256-morphe-1.45.0-c4b8051)                                 |

## Independent cause: a config-hash migration

The Brave commit added a `download` object to `configHash()`, including `apkmirror`, `uptodown`, `github`, and `github_assets`, with absent fields represented as null. Previously the hash omitted that object altogether. This changes the serialized hash input for existing apps even when their TOML files do not change. It fixes omission of stock-download-source identity, but causes a one-time fingerprint migration across the fleet. [3, 8]

For the five previously released apps, comparing both releases' `build-manifest.json` assets shows **only `inputs.configHash` changed**. Their app version, architecture, bundle source/tag/SHA-256, CLI major/minor (`1.18`), and signing certificate remained identical. All nine new manifests use `arm64-v8a` and the same certificate; build logs download CLI `1.18.1`, while the fingerprint deliberately stores only `1.18`. [7, 9]

| Existing app  | Previous configHash prefix | New configHash prefix |
| ------------- | -------------------------- | --------------------- |
| komoot        | 36a7bd9                    | 6f7944d               |
| reddit        | 5f48c2b                    | 73cd455               |
| x             | 46213f6                    | 3dbd699               |
| youtube-music | 5f48c2b                    | 0301895               |
| youtube       | 5f48c2b                    | af4daa1               |

As a reproducibility cross-check, parsing current app TOML with `parseApp()` and hashing once with the pre-commit shape and once with the new `configHash()` reproduces the complete old/new hashes in those manifests. `git diff 8442e26 b714044 --` for those five TOML files is empty. Thus this is a hash-representation change, not five edited app configurations. [3, 7, 8]

The prior full manual check, [37391961540](https://github.com/teyd/morphe-automated/actions/runs/37391961540), ran at SHA `32c6377` with empty `FORCE` and `APP`, and reported Reddit, X, YouTube Music, and YouTube all up to date (`0 to build, 4 up to date`). The next manual run, [37394363568](https://github.com/teyd/morphe-automated/actions/runs/37394363568), ran at SHA `8442e26` with force off and `APP: --app komoot`, reported `no previous build`, and published Komoot fingerprint `7227796` at `00:32:25Z`. [10, 11]

The workflow-run history contains no intervening Daily build between that Komoot run and the latest run. TikTok, Duolingo, Gboard, and Brave were added after the Komoot-run SHA, and the release listing contains no earlier release for them. The inference that these four would have been first builds is supported by that history and config additions; unlike the Komoot prior run, the latest forced logs do not directly say `no previous build`. [12, 13]

## Build versus publish implications

1. **Selection happens in `check`, not in the build job.** The workflow only creates matrix jobs for `check` output; the build command then unconditionally re-plans with `force: true`. It does not independently skip an unchanged artifact. The latest workflow's matrix reason is genuinely `forced`, not merely the build command's internal force setting. [4–6, 14]
2. **Every selected job builds and publishes.** The workflow always passes `--publish`; there is no manual build-only dispatch input. Publishing is after APK download/patch/sign, so a publication-side guard alone would not avoid the APK-build work. [4, 14, 15]
3. **All nine were actually new releases.** Build-job logs print all nine release URLs, and their manifests have build times during this run. Five kept the same app/bundle version labels but acquired distinct fingerprint suffixes; four were first releases. The hash migration explains why forced publication did not reuse the previous tags in this run. [2, 7, 16]
4. **Force does not create a unique identity by itself.** Fingerprints hash resolved inputs, not the force flag, workflow SHA, build time, or APK output digest. Repeating an otherwise unchanged forced run would build again and attempt the same deterministic `gh release create` tag. The inspected publish implementation has no existing-release lookup/skip/update path. This is a concrete duplicate-publication risk inferred from the code, not an error observed in this successful run. [5, 9, 16, 17]
5. **Turning force off would not have reduced this particular run.** The config-hash migration and first builds independently select all nine. After these manifests become the stored prior state, an unforced check with unchanged resolved inputs should skip them; a forced check still selects them. Prior state comes from release manifests, not git history or a workflow-SHA comparison. [5, 9, 18]

## Follow-up safeguards in this worktree

The requested definition of "changed" is changed build inputs, not different APK bytes. The local
changes now make `build --publish` use an unforced input comparison and return before downloading or
patching unchanged apps. `publishRelease` independently checks the latest inputs before creating or
pruning releases. Missing, invalid, or unreadable latest manifests fail closed rather than being
treated as first builds. Provenance is skipped when no APK was built. These safeguards do not undo
the historical config-hash migration or change existing GitHub releases.

## Primary sources and retrieval

Source links below are pinned to the workflow SHA where applicable. Release-table links above contain the specific first-party `build-manifest.json` assets compared; the release list and asset API were retrieved on 2026-10-06.

1. [Run metadata API](https://api.github.com/repos/teyd/morphe-automated/actions/runs/37405057485).
2. [Check job and logs](https://github.com/teyd/morphe-automated/actions/runs/37405057485/job/112080656141); complete run logs retrieved with `gh run view 37405057485 --repo teyd/morphe-automated --log` (includes build-job release URLs).
3. [Workflow commit and diff](https://github.com/teyd/morphe-automated/commit/b71404444099b31edec62b97ac358016c60b68b4).
4. [Workflow inputs and jobs](https://github.com/teyd/morphe-automated/blob/b71404444099b31edec62b97ac358016c60b68b4/.github/workflows/daily.yml).
5. [Decision and fingerprint functions](https://github.com/teyd/morphe-automated/blob/b71404444099b31edec62b97ac358016c60b68b4/src/plan/fingerprint.ts#L41-L53).
6. [Check command and matrix selection](https://github.com/teyd/morphe-automated/blob/b71404444099b31edec62b97ac358016c60b68b4/src/cli/check.ts).
7. [Release API listing](https://api.github.com/repos/teyd/morphe-automated/releases); each manifest read with `gh api repos/teyd/morphe-automated/releases/assets/<asset-id> -H 'Accept: application/octet-stream'`. Asset IDs for old/new pairs: Komoot `614001668`/`614256203`, Reddit `613810189`/`614256650`, X `613810143`/`614256538`, YouTube Music `613810252`/`614257488`, YouTube `613810740`/`614257080`. First-release manifest IDs: Brave `614255752`, Duolingo `614256178`, Gboard `614256180`, TikTok `614258473`.
8. [New config-hash shape](https://github.com/teyd/morphe-automated/blob/b71404444099b31edec62b97ac358016c60b68b4/src/config/load.ts#L53-L70).
9. [Resolved fingerprint inputs](https://github.com/teyd/morphe-automated/blob/b71404444099b31edec62b97ac358016c60b68b4/src/pipeline/plan.ts#L39-L59).
10. [Earlier full check](https://github.com/teyd/morphe-automated/actions/runs/37391961540), logs retrieved with `gh run view ... --log`.
11. [Previous Komoot-only run](https://github.com/teyd/morphe-automated/actions/runs/37394363568), logs retrieved with `gh run view ... --log`.
12. [Daily workflow run history API](https://api.github.com/repos/teyd/morphe-automated/actions/workflows/daily.yml/runs).
13. [Config changes since the Komoot run](https://github.com/teyd/morphe-automated/compare/8442e26ff5f08592a969b4e8376172000347223f...b71404444099b31edec62b97ac358016c60b68b4).
14. [Always-build CLI command](https://github.com/teyd/morphe-automated/blob/b71404444099b31edec62b97ac358016c60b68b4/src/cli/build.ts#L36-L50).
15. [Build pipeline: publish after patch/sign](https://github.com/teyd/morphe-automated/blob/b71404444099b31edec62b97ac358016c60b68b4/src/pipeline/build.ts).
16. [Deterministic release naming](https://github.com/teyd/morphe-automated/blob/b71404444099b31edec62b97ac358016c60b68b4/src/release/naming.ts).
17. [Publish implementation and `gh release create` arguments](https://github.com/teyd/morphe-automated/blob/b71404444099b31edec62b97ac358016c60b68b4/src/release/publish.ts#L53-L102).
18. [Prior manifest lookup](https://github.com/teyd/morphe-automated/blob/b71404444099b31edec62b97ac358016c60b68b4/src/release/state.ts#L23-L46).
