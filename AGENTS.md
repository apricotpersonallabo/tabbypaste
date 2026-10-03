# Repository agent rules

## GitHub Pages migration state

The current production GitHub Pages source is `docs/`.

The `site/` directory is the candidate future source for the shared site platform and is **not** the production deployment source yet.

When a product change affects public documentation:

1. Read the implementation and tests before changing documentation.
2. Update the current production documentation under `docs/` as needed.
3. Keep the corresponding product facts under `site/` semantically aligned.
4. Do not replace, delete, or generate over `docs/`.
5. Do not change the GitHub Pages deployment source unless the task explicitly concerns the migration cutover.

## Responsibility boundary

This repository owns:

- product facts and behavior;
- product-specific manual/privacy content;
- store and repository links;
- product-specific translations and media.

The shared site platform owns:

- shared layout and HTML shell;
- common header/footer/navigation behavior;
- shared styling and design tokens;
- baseline accessibility behavior;
- preview/build implementation.

If a requested change is primarily a shared layout or renderer concern, do not duplicate that implementation here.
