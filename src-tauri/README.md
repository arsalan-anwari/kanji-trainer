# kanji-trainer

Cross-platform Tauri app for learning kanji at different levels by multiple categories.

## Development

```sh
git submodule update --init   # vendor/kaizen-ui
npm ci
npm run tauri:dev             # app against the vite dev server
npm run tauri:build           # release binary for this platform
npm run dev                   # vite only, browser mode
npm run preview               # serve the production build
npm run check                 # svelte-check
npm test                      # vitest
```

Needs Node 22+, Rust 1.77+, and GTK/WebKit development headers.
