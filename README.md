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

`version.json` is the single source of truth for the extension version. After changing it locally, synchronize both browser manifests with:

```sh
node scripts/sync-manifest-version.mjs
```

The release workflow increments the version automatically, synchronizes both manifests, commits the new version, and builds Chromium and Firefox packages with the same version.

## Automated store submissions

After creating a GitHub release, the workflow submits the same release packages to every configured browser store. Store jobs run independently, and a store is skipped when any of its required settings is missing.

Create a GitHub Environment named `browser-stores`. Add the following Environment secrets and variables:

| Store | Environment secrets | Environment variables |
| --- | --- | --- |
| Chrome Web Store | `CHROME_CLIENT_ID`, `CHROME_CLIENT_SECRET`, `CHROME_REFRESH_TOKEN` | `CHROME_PUBLISHER_ID`, `CHROME_EXTENSION_ID` |
| Microsoft Edge Add-ons | `EDGE_CLIENT_ID`, `EDGE_API_KEY` | `EDGE_PRODUCT_ID` |
| Firefox Add-ons (AMO) | `AMO_JWT_ISSUER`, `AMO_JWT_SECRET` | None |

The Chrome credentials need the `https://www.googleapis.com/auth/chromewebstore` OAuth scope. Enable the Microsoft Edge Publish API v1.1 in Partner Center before creating the Edge API key. Generate the Firefox JWT credentials from the AMO developer credentials page.

Chrome and Edge products must be created in their developer dashboards before the first automated update. Firefox uses `amo-metadata.json` to create the initial AMO listing when necessary and to provide update metadata afterward.

For an approval gate before credentials become available to the jobs, configure required reviewers on the `browser-stores` Environment.

The workflow installs the exact `web-ext` version recorded in `package.json` and `pnpm-lock.yaml`. Update both files together when upgrading the Firefox submission tooling.

## User manual
You can see the user manual in this repository.
https://apricotpersonallabo.github.io/tabbypaste/
