# Site migration

This directory is the candidate source for the future shared GitHub Pages platform.

**Current production source remains `docs/`.**

Until an explicit cutover PR is merged:

- keep `docs/` working and production-ready;
- keep product facts in `site/` semantically aligned with public behavior;
- do not deploy `site/` to GitHub Pages;
- do not generate output over `docs/`;
- use the Site preview workflow to inspect generated output.

The shared renderer/layout is owned outside this repository by the site platform.
