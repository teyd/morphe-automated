# morphe-automated

Builds Morphe-patched Android apps on GitHub Actions, signs them with your own key, and publishes releases that
[Obtainium](https://github.com/ImranR98/Obtainium) updates from. A daily job builds an app only when its inputs changed.

Apps: YouTube, YouTube Music, Reddit ([Morphe](https://github.com/MorpheApp/morphe-patches)), X
([piko-newx](https://github.com/crimera/piko-newx)). Instagram ([piko](https://github.com/crimera/piko)) is configured but
disabled. Add apps or patch repos with a TOML file in `config/`.

## Setup

1. `mise install`, then `mise run keystore:init`. It writes `release.p12`, `release.p12.password` and
   `config/signing.toml` (public fingerprint, commit it).
2. Create a GitHub environment named `release` and run the `gh secret set` commands the previous step printed.
3. Back up the key offline. Losing it means every install must be removed and reinstalled.
4. Run the **Daily build** workflow once with _force_, then `mise run obtainium --repo <you>/<repo>` for import links.

YouTube and YouTube Music need [MicroG-RE](https://github.com/MorpheApp/MicroG-RE) installed.

## When it builds

An app rebuilds when its latest release's stored fingerprint differs from the current one:

- a new **stable** patch release that has been public for 6 hours (piko-newx sometimes hotfixes within minutes);
- a new supported app version (newest non-experimental);
- a new Morphe CLI **major or minor** version;
- changed app config, or a different signing certificate.

## Known limits

- Uptodown is a dead fallback: it needs an interactive captcha. APKMirror is the only working source.
- Instagram is disabled: APKMirror serves it a Cloudflare challenge.
- APKMirror may also challenge GitHub's runner IPs. A failed app is reported and retried on the next run.

## Legal

This publishes modified proprietary apps and may draw DMCA notices. On one, run
`mise run takedown <app> --repo <you>/<repo>`, commit the config change, and do not republish.
