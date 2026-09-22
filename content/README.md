# Curated content

Hand-edited input files. `npm run content:build` joins them with
the upstream dictionaries and writes `data/content/`, which is Vite's `publicDir`.

`content/` is in git, `data/` is not. After a clone, run `npm run content:build`
or `scripts/sync_data.sh --download` to get `data/` from the
[kanji-data dataset](https://huggingface.co/datasets/arsalan-anwari/kanji-data). `npm test` fails with that
instruction if you forget.

| File | Columns | Edited by |
|---|---|---|
| `sources.json` | (none) | hand, when an upstream version is bumped |
| `n5-kanji.tsv` | `character`, `level`, `look` | hand |
| `n5-words.tsv` | `written`, `reading`, `set`, `level`, `meaning`, `clue`, `note` | hand |
| `bound-readings.tsv` | `written`, `reading`, `why` | hand |
| `components.tsv` | `character`, `name` | hand |

Tab-separated, one header row, UTF-8, no quoting. A cell cannot contain a tab.

The `set` column in `n5-words.tsv` is one of `numbers`, `calendar`, `time`,
`people`, `position`, `body`, `actions`, `places`, `nature`, `describing`,
`objects`, `food`. Put a word where its **meaning** belongs, not where the upstream
level list grouped its kanji: `numbers` is quantity only, dates go to `calendar`
and clock times to `time`. The same kanji may appear in several sets when the
words differ, but each word has exactly one set. `GUIDELINES.md` §7 is the rule;
an in-source test in `tools/content/validate.ts` pins the size of every set, so
moving words between sets means updating those numbers in the same commit.

`clue` is one or two English sentences describing the word without naming it;
the build rejects a clue that contains its own `meaning`, since that clue would
hand the learner the answer. `look` describes the shape of a kanji in words.
Both feed the hint panel, and both may be left blank — a word or kanji with
nothing written there simply offers no hint.

Nothing in this file records word shape. Whether a word is one kanji, two or more,
or kanji with a kana tail is derived from `written` at build time.

`bound-readings.tsv` holds readings that must never be curated as words like
characters that only occur bound to something else, like 万 (まん), which is
10,000 only as 一万. The build rejects a word row that matches one, so an import
from a kanji deck cannot quietly reintroduce it.

## Commands

```sh
npm run content:fetch            # download pinned upstream releases into .cache/content
npm run content:build            # regenerate data/content/ (runs content:fetch first)
npm test                         # validate curated and generated files
scripts/sync_data.sh --upload    # publish data/ to the Hugging Face dataset
scripts/sync_data.sh --download  # fetch data/ from the Hugging Face dataset
```

The cache is gitignored. Delete it and rebuild to reproduce the same bytes.

## Updating the upstream data

The EDRDG licence (section 4) requires a procedure for regular updating of
JMdict and KRADFILE data. This is it. Run it when preparing a release.

1. Open the latest [jmdict-simplified release](https://github.com/scriptin/jmdict-simplified/releases)
   and note its tag, e.g. `3.6.2+20260914172325`.
2. In `sources.json`, replace the old tag in `version` and every `files[].url`
   for the `jmdict`, `kradfile` and `kanjidic` entries. URLs encode `+` as `%2B`.
3. Record each archive's SHA-256 in `files[].sha256`:

   ```sh
   curl -sL <url> | sha256sum
   ```

   Upstream publishes no checksum file, so this manifest is the only pin.
4. `rm -rf .cache/content && npm run content:build`.
5. `npm test`. If a curated word vanished upstream, the build names the row.
   Fix the row, not the generated file.
6. Commit `content/sources.json`, then `scripts/sync_data.sh --upload`.

Same steps for OpenJLPT, whose `version` is a commit SHA instead of a tag.

## Licensing

Generated content is **CC BY-SA 4.0**, inherited from JMdict and KRADFILE. The
app code stays Apache-2.0 (see the top-level `LICENSE`). The published dataset
card must state CC BY-SA 4.0, not CC BY.

`data/content/LICENSE` and `data/content/ATTRIBUTION.md` are generated from
`sources.json`. Never hand-edit them. EDRDG also requires the acknowledgement
to be reachable from a menu in the app; a later phase renders the generated file.

To add a source, add an entry to `sources.json`. The attribution test fails on
any unattributed source.
