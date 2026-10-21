# Koda rebrand

How the app carries the Koda name, which upstream spellings are contracts that must survive, and the three ratchets that keep a merge from undoing the rename.

## Naming policy

Koda is the product name, Koda Cloud is the hosted service behind the account sign-in, and the upstream agent engine keeps its own technical names because those are contracts rather than branding.

| Spelling                                             | What it is                                               | Rule                                                                |
| ---------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------- |
| `Koda`                                               | The product, in user-facing text                         | Replaces the old product name everywhere                            |
| `Koda Cloud`                                         | The hosted service behind the account sign-in            | Replaces the old service name in display text                       |
| `Koda Agent`                                         | The local engine, in prose                               | Replaces the old engine name in prose                               |
| `hermes-agent`, `hermes_cli`                         | The Python engine's package and console script           | Never renamed — the install and update path depend on them          |
| `hermes`                                             | The console script a user types to drive the engine     | Never renamed — it is the engine's entry point                      |
| `~/.hermes`, `~/.hermes/profiles/<p>/.env`           | The engine's home on this machine and on remote hosts    | Never renamed — the engine writes and reads these paths             |
| `~/.config/hermes-desktop/remote-hermes`             | The managed remote launcher                              | Never renamed — the remote host looks for exactly this path         |
| `HERMES_*`, `HERMESONE_API_KEY`                      | Environment variables read by the engine and the desktop | Never renamed — renaming one silently disables the feature it gates |
| `analytics.hermesone.org`, `inference.hermesone.org` | The service hostnames                                    | Never renamed — the desktop has to reach them                       |
| `X-Hermes-Session-Token`, `X-Hermes-Session-Id`      | Wire-protocol header names                               | Never renamed — the gateway checks them                             |
| `hermes-one`, `hermes-account-login`                 | IPC handler names and localStorage keys                  | Never renamed — renaming one orphans saved state                    |
| `hermes` as the container's service user              | The user inside the official image                       | Never renamed — the probe logs in as that user                      |

The rule that decides which row a string falls in is the same one the brand ratchet uses: a word is the product name only when it stands alone, written with a capital H. That casing is what separates "Koda" from every technical spelling of the same word.

## Contracts that the rebrand must not rewrite

A blind find-and-replace over the source tree broke real contracts, because it rewrote strings that name a path, a variable or a hostname rather than a brand.

- `HERMES_DISABLE_GPU` became `Koda_DISABLE_GPU`. The desktop reads `process.env.HERMES_DISABLE_GPU` in [[src/main/gpu-fallback.ts]]; after the rename the setting said one thing and the code did another, and the GPU fallback could not be turned off.
- `~/.hermes/.env` and `~/.hermes/profiles/<profile>/.env` became `~/.Koda/...`. The remote-setup instructions then told users to edit files the engine never reads.
- `~/.config/hermes-desktop/remote-hermes` became `~/.config/Koda-desktop/remote-Koda`. [[src/main/ssh-remote.ts]] probes that exact path to decide whether a host supplies its own launcher, so the prose and the probe disagreed.
- `analytics.hermesone.org` became `analytics.Kodaone.org`, a hostname that does not resolve.
- `docker exec -it <container>` in the same sentence named the container `Koda`; the container name is the user's, and `/opt/data` inside it is real.

The repair was to restore the true values and to leave the display strings rebranded. A UI that names a file that does not exist is worse than one that names an old brand in a lowercase path.

## The lowercase class

The brand ratchet matches a standalone capital-H "Hermes". Every other spelling of the same word is invisible to it.

A rename of one of those is what broke the contracts above. The rebrand's own repair pass rewrote 72 lowercase spellings; 34 of them were in the locale bundles, and two of those broke the app at runtime.

| What the rename wrote | What it had to say                                                                                            | Where                                                                                       |
| --------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `Koda-agent`          | `hermes-agent` — the folder the engine installs itself into                                                   | the "use an existing installation" hint in the `install.ts` bundle of 12 locales             |
| `Koda mcp add/remove` | `hermes mcp add/remove` — the console script users type                                                        | the MCP tools hint in the `tools.ts` bundle of 8 locales                                     |
| `docker exec -it koda` | `docker exec -it hermes` — the service user inside the official image                                        | the remote-server help in the `settings.ts` bundle of 10 locales                            |
| `-KodaHome`           | `-HermesHome` — the only flag upstream's `install.ps1` accepts                                                 | [[src/main/installer-windows-download.ts]]                                                  |
| `$userKodaHome`       | `$userHermesHome` — the variable the rest of the wrapper reads                                                | [[src/main/installer.ts]]                                                                   |
| `X-the engine-Session-Token` | `X-Hermes-Session-Token` — the header the gateway checks                                               | [[src/main/remote-api.ts]]                                                                  |

The first three are prose: a user who followed the install screen was told to look for a folder the engine never creates. The last two are code: the Windows install passed a flag upstream's installer does not accept, and read a PowerShell variable that no longer existed.

A fourth class was a rename that lost information rather than breaking a contract. The settings modal resolved `/settings hermesagent` as a legacy anchor name — the whole point of a legacy anchor is that the old spelling keeps working. [[src/renderer/src/components/settings/SettingsModal.tsx#resolveSection]] now accepts both `kodaagent` and `hermesagent`.

## Contract ratchet

A build-time check that holds the engine's technical spellings in place, so an upstream merge that renames one of them fails the build instead of breaking the engine later.

It runs as `scripts/check-hermes-contracts.mjs` over `src`, `tests`, `scripts`, `build`, `.github` and the root configuration files, and works in both directions:

- **Required** — a spelling that must still exist somewhere in the tree: `hermes-agent`, `hermes_cli`, `"hermes"`, `~/.hermes`, `HERMES_HOME`, `HERMES_DISABLE_GPU`, `hermesone.org`, `X-Hermes-Session-Token`, `hermes-account-login`, `hermes-one`, `remote-hermes`, `Chatgpt-cli-agent/koda-desktop`. If a merge renamed one, the check fails.
- **Forbidden** — the exact wrong spellings a rename produces: `Koda-agent`, `Koda mcp`, `KodaHome`, `Koda_HOME`, `Koda_DISABLE_GPU`, `Kodaone`, `Koda-cli`, `Koda-one`, `Koda-account-login`, `X-Koda-Session-Token`, `~/.Koda`, `docker exec -it koda`, `.config/Koda-desktop`, `Chatgpt-cli-agent/hermes-desktop`, `repo: hermes-desktop`. If one appears, the check fails.

Both lists are small and every entry says why. The forbidden list is the one that pays for itself: it is exactly the set of shapes the rebrand's own repair had to undo.

Run it with `npm run check:contracts`. CI runs it on every pull request.

## Brand ratchet

A build-time check rejects any user-visible "Hermes" in the source tree, so an upstream merge that reintroduces the old name fails the build instead of shipping.

It runs as `scripts/check-no-hermes-brand.mjs` over `src/main`, `src/renderer/src`, `src/preload` and `src/shared`. Every string literal is extracted with the TypeScript compiler API, so a comment, a regular expression or a template interpolation is never mistaken for text. A word is the brand only if it stands alone — it must not be glued to letters, digits, dashes or underscores on either side — so `X-Hermes-Session-Token` and `hermes-agent` pass while "Hermes One" fails.

JSX text nodes and the renderer's HTML shell are searched as well. The string-literal pass cannot see either: `>Hermes<` between two tags is not a literal, and `<title>` is not TypeScript. Both are places a merge can put the brand straight back into the UI.

The allowlist matches whole literals, never substrings. A substring allowlist is unsafe: one allowed token such as `HERMES_` would excuse every other brand mention in the same literal.

Run it with `npm run check:brand`. CI runs it on every pull request.

## Surfaces that still point upstream

Two parts of the app link to the upstream project's channels. They are real channels, and the links work, but nothing in the Koda UI prints their URL — a raw URL is where a third party's brand would become visible next to a Koda label.

- The follow-us-on-X promo was removed. It pointed at the upstream project's account while its copy promised "the latest Koda features", which was a promise about an account Koda does not own. Repointing it is a one-line change in a new component when Koda has an account of its own.
- The community pane keeps its Discord, website, X and Telegram buttons, and the Ko-fi support card, but the buttons no longer carry the URL as a tooltip. The URLs live in one file — [[src/renderer/src/components/settings/settingsHelpers.ts]] — so they can be repointed at Koda's own channels in one edit.
- The Help menu's "Koda on GitHub" and "Report an Issue" items point at Koda's own repository. They used to point at the engine's repository and at upstream's issue tracker, so a menu item labelled "Koda on GitHub" opened somebody else's project — and the old brand was the only thing the user saw, in their browser.

## Translation key ratchet

A build-time check resolves every translation key the app asks for against the English bundle, because a renamed key with an unrenamed consumer renders as its own raw path.

It runs as `scripts/check-i18n-keys.mjs` and covers two routes a key can take into i18next:

1. A literal passed to a translate call — `t("chat.worktree.loading")`.
2. A literal stored in a key-carrying property and translated later — `{ labelKey: "settings.nav.groups.koda" }`, `{ label: "constants.kodaCloudApiKey", hint: "constants.kodaCloudHint" }`.

The second route is where the rebrand's worst breakage hid. The settings nav group id and the provider's API-key label are translated a second later, from a property, so a scan of `t(...)` arguments never saw them. The property names that carry a key are enumerated in `KEY_PROPERTIES`; a property called `file` or `type` also holds dotted strings, but those are file names and protocol types.

Keys are resolved against the **English** bundle only. English is the source of truth and the fallback every translated bundle defers to — the translated bundles legitimately lag it by hundreds of keys. A key missing from English is a real bug; a key missing from a translation is not.

Run it with `npm run check:i18n`. CI runs it on every pull request.

### The rename that motivated the ratchet

The rebrand renamed the locale keys but not their consumers, so several labels rendered as their own raw path in the settings modal. The keys and their consumers now agree:

| Locale key                    | Consumer                                                   |
| ----------------------------- | ---------------------------------------------------------- |
| `settings.sections.kodaAgent` | [[src/renderer/src/components/settings/AboutPane.tsx]]     |
| `settings.nav.groups.koda`    | [[src/renderer/src/components/settings/SettingsModal.tsx]] |
| `settings.migrateToKoda`      | [[src/renderer/src/components/settings/DataPane.tsx]]      |
| `install.installingKoda`      | [[src/renderer/src/screens/Install/Install.tsx]]           |
| `constants.kodaCloudApiKey`   | [[src/renderer/src/constants.ts]]                          |
| `constants.kodaCloudHint`     | [[src/renderer/src/constants.ts]]                          |

The same sweep found keys that were already broken before the rebrand: `common.saving`, `common.forward` and `common.reload` were never defined, and the `worktree.*` tree was nested one level too high in the English bundle — the correct path is `chat.worktree.*`.

## Packaging and release identity

The installer, the auto-updater feed and the release workflow all point at Koda's own GitHub repository, so an upstream release can never install over this app.

- `electron-builder.yml` publishes from `Chatgpt-cli-agent/koda-desktop`.
- `dev-app-update.yml` — the feed the auto-updater reads — points at the same owner.
- `.github/workflows/release.yml` generates its winget manifests with `PUBLISH_OWNER=Chatgpt-cli-agent`, so the installer URL resolves to a Koda release.
- The macOS update feed is built from artifact names, which follow `package.json`'s `name` — `koda-desktop`, not `hermes-desktop`.

The repository itself was renamed to `koda-desktop`, so the name in the URL, the name in the release publisher and the name in the winget manifest are the same word. The contract ratchet holds that: `Chatgpt-cli-agent/koda-desktop` is required, and both `Chatgpt-cli-agent/hermes-desktop` and `repo: hermes-desktop` are forbidden, so a merge that repoints the feed at the old name fails the build instead of installing upstream's releases over Koda.

One path in the tree keeps the old spelling on purpose, because it is a path rather than a brand: `~/.config/hermes-desktop/remote-hermes`, the launcher a remote host looks for. The AppArmor profile, by contrast, is installed under the executable's name, so it follows the rename to `/etc/apparmor.d/koda-desktop`.

The landing-page rebuild is opt-in through the `LANDING_PAGE_REPO` repository variable. It used to dispatch into upstream's landing-page repository, which would have rebuilt upstream's site from a Koda release; with no Koda landing page of its own yet, the step is skipped rather than pointed at upstream.

The winget manifest templates live in `build/winget/` and are excluded from Prettier. Prettier rewrites `{{TOKEN}}` in YAML into the flow mapping `{ { TOKEN } }`, which the generator does not substitute, so a formatted template would publish a manifest with literal placeholders. The generator now fails loudly on an unsubstituted token.

winget lays a manifest out as `manifests/<publisher's first letter>/<Publisher>/<Package>/<version>/`. The letter is derived from the publisher in [[scripts/generate-winget-manifests.mjs]] rather than written out, so it cannot drift away from the directory name — which is what happened when the publisher changed and the letter did not. The test reads the directory back from the generator instead of rebuilding the path, so the two cannot disagree again.
