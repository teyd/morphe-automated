# morphe-automated

Builds Morphe-patched Android apps on GitHub Actions, signs them with your own key, and publishes releases that
[Obtainium](https://github.com/ImranR98/Obtainium) updates from. A daily job builds an app only when its inputs changed.

Apps: YouTube, YouTube Music, Reddit ([Morphe](https://github.com/MorpheApp/morphe-patches)), X
([piko-newx](https://github.com/crimera/piko-newx)), Komoot
([riky's patches](https://github.com/riky-dev/morphe-patches)). Add apps or patch repos with a TOML file in `config/`.

## Setup

1. `mise install`, then `mise run keystore:init`. It writes `release.p12`, `release.p12.password` and
   `config/signing.toml` (public fingerprint, commit it).
2. Create a GitHub environment named `release` and run the `gh secret set` commands the previous step printed.
3. Back up the key offline. Losing it means every install must be removed and reinstalled.
4. Run the **Daily build** workflow once with _force_.

The repo is private, so Obtainium needs a fine-grained token with read access to this repo (Obtainium settings, GitHub source) before the links below can see releases. `mise run obtainium` reprints them; it reads the repo from `origin`.

| App           | Obtainium                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Komoot        | [Add to Obtainium](https://apps.obtainium.imranr.dev/redirect?r=obtainium://app/%7B%22id%22%3A%22de.komoot.android%22%2C%22url%22%3A%22https%3A%2F%2Fgithub.com%2Fteyd%2Fmorphe-automated%22%2C%22author%22%3A%22teyd%22%2C%22name%22%3A%22Komoot%22%2C%22preferredApkIndex%22%3A0%2C%22additionalSettings%22%3A%22%7B%5C%22includePrereleases%5C%22%3Afalse%2C%5C%22fallbackToOlderReleases%5C%22%3Atrue%2C%5C%22filterReleaseTitlesByRegEx%5C%22%3A%5C%22%5Ekomoot%3A%5C%22%2C%5C%22apkFilterRegEx%5C%22%3A%5C%22%5Ekomoot-arm64-v8a%5C%5C%5C%5C.apk%24%5C%22%2C%5C%22autoApkFilterByArch%5C%22%3Afalse%2C%5C%22versionDetection%5C%22%3Afalse%2C%5C%22sortMethodChoice%5C%22%3A%5C%22date%5C%22%2C%5C%22trackOnly%5C%22%3Afalse%7D%22%2C%22overrideSource%22%3Anull%7D)                                            |
| Reddit        | [Add to Obtainium](https://apps.obtainium.imranr.dev/redirect?r=obtainium://app/%7B%22id%22%3A%22com.reddit.frontpage%22%2C%22url%22%3A%22https%3A%2F%2Fgithub.com%2Fteyd%2Fmorphe-automated%22%2C%22author%22%3A%22teyd%22%2C%22name%22%3A%22Reddit%22%2C%22preferredApkIndex%22%3A0%2C%22additionalSettings%22%3A%22%7B%5C%22includePrereleases%5C%22%3Afalse%2C%5C%22fallbackToOlderReleases%5C%22%3Atrue%2C%5C%22filterReleaseTitlesByRegEx%5C%22%3A%5C%22%5Ereddit%3A%5C%22%2C%5C%22apkFilterRegEx%5C%22%3A%5C%22%5Ereddit-arm64-v8a%5C%5C%5C%5C.apk%24%5C%22%2C%5C%22autoApkFilterByArch%5C%22%3Afalse%2C%5C%22versionDetection%5C%22%3Afalse%2C%5C%22sortMethodChoice%5C%22%3A%5C%22date%5C%22%2C%5C%22trackOnly%5C%22%3Afalse%7D%22%2C%22overrideSource%22%3Anull%7D)                                         |
| X             | [Add to Obtainium](https://apps.obtainium.imranr.dev/redirect?r=obtainium://app/%7B%22id%22%3A%22com.twitter.android%22%2C%22url%22%3A%22https%3A%2F%2Fgithub.com%2Fteyd%2Fmorphe-automated%22%2C%22author%22%3A%22teyd%22%2C%22name%22%3A%22X%22%2C%22preferredApkIndex%22%3A0%2C%22additionalSettings%22%3A%22%7B%5C%22includePrereleases%5C%22%3Afalse%2C%5C%22fallbackToOlderReleases%5C%22%3Atrue%2C%5C%22filterReleaseTitlesByRegEx%5C%22%3A%5C%22%5Ex%3A%5C%22%2C%5C%22apkFilterRegEx%5C%22%3A%5C%22%5Ex-arm64-v8a%5C%5C%5C%5C.apk%24%5C%22%2C%5C%22autoApkFilterByArch%5C%22%3Afalse%2C%5C%22versionDetection%5C%22%3Afalse%2C%5C%22sortMethodChoice%5C%22%3A%5C%22date%5C%22%2C%5C%22trackOnly%5C%22%3Afalse%7D%22%2C%22overrideSource%22%3Anull%7D)                                                         |
| YouTube Music | [Add to Obtainium](https://apps.obtainium.imranr.dev/redirect?r=obtainium://app/%7B%22id%22%3A%22com.google.android.apps.youtube.music%22%2C%22url%22%3A%22https%3A%2F%2Fgithub.com%2Fteyd%2Fmorphe-automated%22%2C%22author%22%3A%22teyd%22%2C%22name%22%3A%22YouTube%20Music%22%2C%22preferredApkIndex%22%3A0%2C%22additionalSettings%22%3A%22%7B%5C%22includePrereleases%5C%22%3Afalse%2C%5C%22fallbackToOlderReleases%5C%22%3Atrue%2C%5C%22filterReleaseTitlesByRegEx%5C%22%3A%5C%22%5Eyoutube-music%3A%5C%22%2C%5C%22apkFilterRegEx%5C%22%3A%5C%22%5Eyoutube-music-arm64-v8a%5C%5C%5C%5C.apk%24%5C%22%2C%5C%22autoApkFilterByArch%5C%22%3Afalse%2C%5C%22versionDetection%5C%22%3Afalse%2C%5C%22sortMethodChoice%5C%22%3A%5C%22date%5C%22%2C%5C%22trackOnly%5C%22%3Afalse%7D%22%2C%22overrideSource%22%3Anull%7D) |
| YouTube       | [Add to Obtainium](https://apps.obtainium.imranr.dev/redirect?r=obtainium://app/%7B%22id%22%3A%22com.google.android.youtube%22%2C%22url%22%3A%22https%3A%2F%2Fgithub.com%2Fteyd%2Fmorphe-automated%22%2C%22author%22%3A%22teyd%22%2C%22name%22%3A%22YouTube%22%2C%22preferredApkIndex%22%3A0%2C%22additionalSettings%22%3A%22%7B%5C%22includePrereleases%5C%22%3Afalse%2C%5C%22fallbackToOlderReleases%5C%22%3Atrue%2C%5C%22filterReleaseTitlesByRegEx%5C%22%3A%5C%22%5Eyoutube%3A%5C%22%2C%5C%22apkFilterRegEx%5C%22%3A%5C%22%5Eyoutube-arm64-v8a%5C%5C%5C%5C.apk%24%5C%22%2C%5C%22autoApkFilterByArch%5C%22%3Afalse%2C%5C%22versionDetection%5C%22%3Afalse%2C%5C%22sortMethodChoice%5C%22%3A%5C%22date%5C%22%2C%5C%22trackOnly%5C%22%3Afalse%7D%22%2C%22overrideSource%22%3Anull%7D)                                |

YouTube and YouTube Music need [MicroG-RE](https://github.com/MorpheApp/MicroG-RE) installed.

## When it builds

An app rebuilds when its latest release's stored fingerprint differs from the current one:

- a new **stable** patch release that has been public for 6 hours (piko-newx sometimes hotfixes within minutes);
- a new supported app version (newest non-experimental);
- a new Morphe CLI **major or minor** version;
- changed app config, or a different signing certificate.

## Known limits

- Uptodown is a dead fallback: those app pages now return 410. APKMirror is the only working source.
- CI fetches APKMirror through trawl, because GitHub's own IPs are blocked.

## Legal

This publishes modified proprietary apps and may draw DMCA notices. On one, run
`mise run takedown <app> --repo <you>/<repo>`, commit the config change, and do not republish.
