# kanji-trainer

Cross-platform Tauri app for learning JLPT kanji. Desktop and Android, all state
local, no account and no network sync.

## Scope

The app trains the writing system. Every answer is a form or a sound, never a
meaning. Word to reading, kana to kanji, hear a word and pick its kanji, build a
kanji from its components. Meaning shows up on the answer reveal only.

Anything that needs you to understand a sentence belongs in the planned
`jlpt-trainer` instead.

No SRS and no review queue. You configure each run by hand. Past results get
charts and reports, but the app never decides what you practise next.

## Development

```sh
git submodule update --init   # vendor/kaizen-ui
npm ci
npm run content:build         # generate data/ (needed before the app runs)
npm run tauri:dev             # app against the vite dev server
npm run tauri:build           # release binary for this platform
npm run dev                   # vite only, browser mode
npm run preview               # serve the production build
npm run check                 # svelte-check
npm test                      # vitest
```

## Getting `data/`

`data/` holds the generated content the app loads at runtime. It is not in git.
After a clone download it:

```sh
scripts/sync_data.sh --download  # download it from Hugging Face
```

The download comes from
[arsalan-anwari/kanji-data](https://huggingface.co/datasets/arsalan-anwari/kanji-data).

See [content/README.md](content/README.md) for the curated inputs and how to
update the upstream data.

## Licence

App code is Apache-2.0 (see [LICENSE](LICENSE)). The generated content in
`data/` is CC BY-SA 4.0, inherited from JMdict and KRADFILE.
