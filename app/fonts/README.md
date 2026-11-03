# Bundled fonts

Inter (variable, 100–900) and Playfair Display (variable, 400–900) are loaded with
`next/font/local` in `app/layout.tsx`. Builds and browsers need no font-provider
connection. Both families retain their original SIL Open Font License, included
beside the assets.

Official upstream sources, retrieved 2026-11-03:

- https://github.com/google/fonts/tree/main/ofl/inter
- https://github.com/google/fonts/tree/main/ofl/playfairdisplay

To build into an isolated directory, set `HAVEN_BUILD_DIR` to a relative path inside
the project before running `npm run build`. The default remains `.next`.
