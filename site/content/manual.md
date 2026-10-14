# Tabby Paste Guide

Use Tabby Paste one row at a time. The current production manual remains `docs/manual.html` until migration parity is verified.

## Quick start

1. Copy exactly one row of tab-separated values.
2. Click the first form field that should receive data.
3. Run Tabby Paste with the configured shortcut or the context menu.
4. Review the populated fields before submitting the form.

## Field behavior

Tabby Paste starts at the focused eligible field and continues through later eligible fields in document order. Select elements are matched against option values or labels. Dynamic select options can be given a short wait period through the extension settings.

## Site enablement

The extension checks whether the top-level page URL is enabled. URL patterns can be configured to limit where Tabby Paste runs.

## Frames

Same-origin iframe elements and legacy frame/frameset documents, including nested or mixed frames and srcdoc documents, are supported by the current product implementation. Cross-origin frames and sandboxed frames without same-origin access are not supported by the current permission set.

## Clipboard fallback

On pages where the Clipboard API cannot be used, supported browsers use extension-side clipboard handling so the active tab and focused field do not have to be changed.

## Troubleshooting

If filling does not start:

- confirm the current site is enabled;
- focus an eligible field before running the extension;
- verify that the copied data is a single tab-separated row;
- check whether the target field lives in a cross-origin or restricted frame;
- review the current production manual for browser-specific details.
