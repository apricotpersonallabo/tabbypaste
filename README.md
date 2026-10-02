# README

Tabby Paste is a browser extension for Chrome, Edge, and Firefox. This extension is an input support tool.

## Overview
A cross-browser extension project. Auto paste tab-separated strings from the clipboard to each input field.

Pasting starts at the focused input and stays within its document. Same-origin iframes, including nested frames and `srcdoc` documents, are supported through both the shortcut and context menu. URL enablement is checked against the top-level page. Cross-origin frames and sandboxed frames without same-origin access require additional site permissions and are not supported by the current permission set.

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

Load `artifacts/extensions/chromium` as the unpacked Chrome or Edge extension. For Firefox, load `artifacts/extensions/firefox/manifest.json`. Do not load `src/` directly when verifying the extension version.

Generate verified store packages with:

```sh
pnpm run package:extensions
```

The Chromium and Firefox archives are written to `artifacts/packages/`. The package metadata in `artifacts/test-results/package-metadata.json` keeps their file names for CI and release jobs.

Pushes and pull requests validate the source templates and package generated builds but do not create a release. After the version commit is on `main` and validation passes, run **Validate and release browser extensions** manually from the GitHub Actions page using the `main` branch.

## Repository layout

```text
.
├── .github/                       # GitHub Actions workflows
├── config/                        # Build and release configuration
│   ├── version.json               # Single source of truth for the version
│   └── stores/                    # Browser-store metadata
├── docs/                          # GitHub Pages user documentation
├── scripts/                       # Development and CI automation
│   ├── extension/                 # Versioning, builds, and packages
│   ├── release/                   # Store validation and submission
│   ├── template/                  # Template archive maintenance
│   └── test/                      # Syntax, Docker, and E2E runners
├── src/                           # Shared browser-extension source
├── tests/
│   ├── unit/                      # Node.js unit tests
│   └── e2e/
│       ├── docker/                # E2E Compose and browser images
│       ├── fixtures/              # Browser test pages
│       └── support/               # E2E helpers and diagnostics
└── templates/
    ├── browser-extension/         # Reusable template source
    └── packages/                  # Downloadable template archives
```

The repository root keeps only documentation and standard project-management files. Every generated file is grouped under the untracked `artifacts/` directory:

```text
artifacts/
├── extensions/                    # Chromium, Firefox, and E2E builds
├── packages/                      # Verified store-submission ZIP files
└── test-results/                  # Package metadata and test diagnostics
```

To update the reusable browser-extension template after editing `templates/browser-extension/`, run `pnpm run template:package`. `pnpm run template:check` verifies that the source and `templates/packages/browser-extension-template.zip` have identical files and contents.

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

Failed browser tests save screenshots, page HTML, browser logs, and Selenium WebDriver logs under `artifacts/test-results/e2e/`. Docker and Docker Compose are required for the full suite.

## Automated store submissions

The manual release workflow submits the same packages to every configured browser store in parallel. It creates the GitHub release only after all configured store submissions succeed. A store is disabled when all of its settings are absent; a partially configured store fails the workflow.

Create a GitHub Environment named `browser-stores`. Add the following Environment secrets and variables:

| Store | Environment secrets | Environment variables |
| --- | --- | --- |
| Chrome Web Store | `CHROME_CLIENT_ID`, `CHROME_CLIENT_SECRET`, `CHROME_REFRESH_TOKEN` | `CHROME_PUBLISHER_ID`, `CHROME_EXTENSION_ID` |
| Microsoft Edge Add-ons | `EDGE_CLIENT_ID`, `EDGE_API_KEY` | `EDGE_PRODUCT_ID` |
| Firefox Add-ons (AMO) | `AMO_JWT_ISSUER`, `AMO_JWT_SECRET` | None |

The Chrome credentials need the `https://www.googleapis.com/auth/chromewebstore` OAuth scope. Enable the Microsoft Edge Publish API v1.1 in Partner Center before creating the Edge API key. Generate the Firefox JWT credentials from the AMO developer credentials page.

Chrome and Edge products must be created in their developer dashboards before the first automated update. Firefox uses `config/stores/firefox-addons.json` to create the initial AMO listing when necessary and to provide update metadata afterward.

Chrome Web Store listing metadata is managed in the Developer Dashboard and is not populated by the submission API. Complete and save every required Store listing and Privacy practices field before running a release. Tabby Paste uses these permission justifications:

- `storage`: Stores the user’s Tabby Paste preferences—including enabled URL patterns, paste delay, select-option behavior, and extension enabled state—in `chrome.storage.sync` so they persist and can sync through the user’s Chrome account. Tabby Paste does not send this data to developer-controlled servers.
- `tabs`: Uses tab IDs and URLs to determine whether Tabby Paste is enabled for each tab, update the toolbar icon and badge, and inject the paste helper only into the user-selected eligible tab. It also opens the extension settings and shortcut pages. Tabby Paste does not transmit browsing data to developer-controlled servers.
- `host_permissions` (`http://*/*`, `https://*/*`): Declares access to standard web pages so Chrome and Edge expose their site-access controls, including the option to allow Tabby Paste on all sites. The extension still injects the paste helper only after the user invokes Tabby Paste and the extension's own URL filter allows the page. Tabby Paste does not transmit page or browsing data to developer-controlled servers.

When Chrome returns `INVALID_ITEM_METADATA`, open the edit-item link from the Actions error, complete the fields identified by **Why can't I submit?**, and save the draft before retrying the failed Chrome job.

For an approval gate before credentials become available to the jobs, configure required reviewers on the `browser-stores` Environment.

The workflow installs the exact `web-ext` version recorded in `package.json` and `pnpm-lock.yaml`. Update both files together when upgrading the Firefox submission tooling.

To resubmit existing packages without rebuilding or creating another GitHub Release, run **Resubmit existing browser packages** from the Actions page. Choose `all`, `chrome`, `edge`, or `firefox` in `store`; `all` submits to the three stores in parallel. Leave both source inputs empty to use the latest GitHub Release, or enter an existing `release_tag` such as `v1.0.13`. If the original release did not finish, enter its `source_run_id` instead to use the package artifact from that manual run (retained for 7 days). Set only one source input. Chrome and Edge use the existing Chromium ZIP, while Firefox uses the Firefox ZIP. Each selected job verifies its ZIP's manifest version and uses the submission scripts and metadata from the matching tag or run commit. For Firefox, it accepts both the older root `amo-metadata.json` and current `config/amo-metadata.json` locations. The `browser-stores` Environment must contain the selected stores' credentials and variables; a selected store fails if its configuration is missing. A store may reject a version that has already been submitted there.

## User manual
You can see the user manual in this repository.
https://apricotpersonallabo.github.io/tabbypaste/
