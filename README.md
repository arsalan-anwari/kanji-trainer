# kanji-trainer

Trainer for JLPT vocabulary written in kanji, on desktop, tablet and phone.
Built with Tauri 2 and Svelte 5, the second app after
[kana-trainer](https://github.com/arsalan-anwari/kana-trainer).

See the [roadmap](ROADMAP.md) for planned features.

<!-- Showcase from packaging/repo goes here. -->

## Features

- JLPT N5 in four packs: 715 words using 409 kanji, one picture and one recording per word
- Twelve question formats in five groups: reading, meaning, picture, listening and assembling a word from its pieces
- Answers by multiple choice or typing, typing kanji needs a Japanese IME
- Runs built by hand from sets, subcategories, word shapes and single words, at three difficulty levels that decide how look-alike the wrong answers are
- Optional time trial, per question and for the whole run
- Chart view of every word as a flip card with picture, reading, meaning and an example sentence
- Printable double-sided A4 flashcards, 1×1 to 4×4 cards per page
- Score reports saved on disk, exported and imported as `.kj-report` files
- No SRS and no review queue: the app shows your results, you decide what to practise
- Works on Linux, Windows, macOS and Android

Sentences, grammar, reading and listening comprehension belong to the planned
`jlpt-trainer`.

## Development

Needs Node 22+ and Rust 1.77+, plus the GTK and WebKit development headers
(same packages as [kana-trainer](https://github.com/arsalan-anwari/kana-trainer#development)).

```sh
git submodule update --init       # vendor/kaizen-ui, the UI kit
scripts/sync_data.sh --download   # data/, from Hugging Face
npm ci
npm run content:build             # data/overlay into data/packs
npm run tauri:dev                 # run the app against the vite dev server
npm run tauri:build               # release binary for this platform
npm run dev                       # vite only, browser mode
npm run check                     # svelte-check
npm test                          # unit tests
```

## Content

`data/` is not in git. It lives in the
[kanji-data](https://huggingface.co/datasets/arsalan-anwari/kanji-data) dataset on
Hugging Face, see [its README](https://huggingface.co/datasets/arsalan-anwari/kanji-data/blob/main/README.md) for the packs and
[overlay/README.md](https://huggingface.co/datasets/arsalan-anwari/kanji-data/blob/main/overlay/README.md) for the curated input.

## Licence

App code is Apache-2.0 (see [LICENSE](LICENSE)). The content in `data/` is
CC BY-SA 4.0, inherited from JMdict and KRADFILE.
