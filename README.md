# README

Tabby Paste is a browser extension for Chrome, Edge, and Firefox. This extension is an input support tool.

## Overview
A cross-browser extension project. Auto paste tab-separated strings from the clipboard to each input field.

## Install
You can install from the Chrome Web Store and Microsoft Edge Add-ons.

https://chromewebstore.google.com/detail/tabby-paste/pnfhlnlilceabibdeamkinhjjgmmnhme

https://microsoftedge.microsoft.com/addons/detail/tabby-paste/gjkopcpoddbifofepjnopohpcoeehlbg

### Firefox (development installation)

1. Download the Firefox package from the GitHub release.
2. Open `about:debugging#/runtime/this-firefox` in Firefox.
3. Select **Load Temporary Add-on** and choose `manifest.json` from the extracted package.

The Firefox package uses `manifest.firefox.json` as its source manifest. Release builds rename it to `manifest.json` automatically.

## Version management

`config/version.json` is the single source of truth for the extension version. The source manifests are templates whose version remains `0.0.0.1`. Increment only `config/version.json` with:

```sh
pnpm run version:increment
```

Commit `config/version.json`. To validate it and confirm that both source manifests still use the template version, run:

```sh
pnpm run version:check
```

Generate local development builds with the real version from `config/version.json` by running:

```sh
pnpm run build:extensions
```

Load `build/chromium` as the unpacked Chrome or Edge extension. For Firefox, load `build/firefox/manifest.json`. Do not load `src/` directly when verifying the extension version.

Generate verified store packages with:

```sh
pnpm run package:extensions
```

The Chromium and Firefox archives are written to `dist/`. The package metadata in `test-results/package-metadata.json` keeps their file names for CI and release jobs.

Pushes and pull requests validate the source templates and package generated builds but do not create a release. After the version commit is on `main` and validation passes, run **Validate and release browser extensions** manually from the GitHub Actions page using the `main` branch.

## Repository layout

```text
.
├── .github/                    # CI, store submission, and releases
├── config/                     # Version and browser-store metadata
├── docker/                     # Docker Compose and test images
├── docs/                       # GitHub Pages user documentation
├── scripts/                    # Build, packaging, and automation
├── src/                        # Shared browser-extension source
├── tests/                      # Chromium and Firefox E2E fixtures
└── templates/
    ├── browser-extension-template/
    └── browser-extension-template.zip
```

The repository root keeps only documentation and standard project-management files. Generated `build/`, `dist/`, and `test-results/` directories remain untracked.

## Automated tests

Docker is the canonical test environment used by GitHub Actions. It runs the existing Node.js tests, JavaScript syntax and version checks, Firefox extension linting, package-integrity checks, and Chromium and Firefox end-to-end tests:

```sh
pnpm test
```

The end-to-end tests load test-only copies of the built extensions into pinned Selenium browser containers. They copy TSV data through the real Clipboard API and exercise the browser command, background script, content injection, form filling, settings persistence, URL filtering, and warning paths. Test-only extension IDs and keyboard shortcuts are never included in release packages.

For a fast local check that does not require Docker or start browsers, run:

```sh
pnpm run test:fast
```

Failed browser tests save screenshots, page HTML, browser logs, and Selenium WebDriver logs under `test-results/e2e/`. Docker and Docker Compose are required for the full suite.

## Automated store submissions

The manual release workflow submits the same packages to every configured browser store in parallel. It creates the GitHub release only after all configured store submissions succeed. A store is disabled when all of its settings are absent; a partially configured store fails the workflow.

Create a GitHub Environment named `browser-stores`. Add the following Environment secrets and variables:

| Store | Environment secrets | Environment variables |
| --- | --- | --- |
| Chrome Web Store | `CHROME_CLIENT_ID`, `CHROME_CLIENT_SECRET`, `CHROME_REFRESH_TOKEN` | `CHROME_PUBLISHER_ID`, `CHROME_EXTENSION_ID` |
| Microsoft Edge Add-ons | `EDGE_CLIENT_ID`, `EDGE_API_KEY` | `EDGE_PRODUCT_ID` |
| Firefox Add-ons (AMO) | `AMO_JWT_ISSUER`, `AMO_JWT_SECRET` | None |

The Chrome credentials need the `https://www.googleapis.com/auth/chromewebstore` OAuth scope. Enable the Microsoft Edge Publish API v1.1 in Partner Center before creating the Edge API key. Generate the Firefox JWT credentials from the AMO developer credentials page.

Chrome and Edge products must be created in their developer dashboards before the first automated update. Firefox uses `config/amo-metadata.json` to create the initial AMO listing when necessary and to provide update metadata afterward.

Chrome Web Store listing metadata is managed in the Developer Dashboard and is not populated by the submission API. Complete and save every required Store listing and Privacy practices field before running a release. Tabby Paste uses these permission justifications:

- `storage`: Stores the user’s Tabby Paste preferences—including enabled URL patterns, paste delay, select-option behavior, and extension enabled state—in `chrome.storage.sync` so they persist and can sync through the user’s Chrome account. Tabby Paste does not send this data to developer-controlled servers.
- `tabs`: Uses tab IDs and URLs to determine whether Tabby Paste is enabled for each tab, update the toolbar icon and badge, and inject the paste helper only into the user-selected eligible tab. It also opens the extension settings and shortcut pages. Tabby Paste does not transmit browsing data to developer-controlled servers.

When Chrome returns `INVALID_ITEM_METADATA`, open the edit-item link from the Actions error, complete the fields identified by **Why can't I submit?**, and save the draft before retrying the failed Chrome job.

For an approval gate before credentials become available to the jobs, configure required reviewers on the `browser-stores` Environment.

The workflow installs the exact `web-ext` version recorded in `package.json` and `pnpm-lock.yaml`. Update both files together when upgrading the Firefox submission tooling.

## User manual
You can see the user manual in this repository.
https://apricotpersonallabo.github.io/tabbypaste/
