# kanji-trainer

Cross-platform Tauri app for learning JLPT kanji. Desktop and Android, all state
local, no account and no network sync.

## Scope

The app trains words: how they are written, how they sound, and what they mean.
Word to reading, kana to kanji, word to meaning, picture to word, and Listening —
hear a word and answer its reading or written form, or see a word and pick which
recording says it. Every answer is a property of a single word.

Anything that needs you to understand a sentence, grammar, sentence structure,
reading passages, conversation audio will be added in the planned `jlpt-trainer`
instead. That app assumes you already know the vocabulary this one trains.

The Chart tab doubles as a vocabulary reference: every word as a flip card with
its picture, reading, meaning and the on/kun readings of its kanji. The same
selection exports as a double-sided A4 PDF of flashcards to print and cut out.

No SRS and no review queue. You configure each run by hand. Past results get
charts and reports, but the app never decides what you practise next.

Typing a kanji answer needs a Japanese input method (IME) enabled on your device.

## Development

```sh
git submodule update --init   # vendor/kaizen-ui
npm ci
npm run content:build         # build data/packs from data/overlay (needed before the app runs)
npm run audio:fetch           # fetch a pack's clips into data/packs (needs ffmpeg)
npm run tauri:dev             # app against the vite dev server
npm run tauri:build           # release binary for this platform
npm run dev                   # vite only, browser mode
npm run preview               # serve the production build
npm run check                 # svelte-check
npm test                      # vitest
```

## Getting `data/`

`data/` is not in git. Its only home is the Hugging Face dataset: 
```sh
scripts/sync_data.sh --download  # everything, data/overlay/ included
```


The download comes from
[arsalan-anwari/kanji-data](https://huggingface.co/datasets/arsalan-anwari/kanji-data).

See [data/overlay/README.md](data/overlay/README.md) for the curated inputs and how to
update the upstream data.

## Licence

App code is Apache-2.0 (see [LICENSE](LICENSE)). The generated content in
`data/` is CC BY-SA 4.0, inherited from JMdict and KRADFILE.
