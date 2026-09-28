# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-09-28

Platform parity: the standard Kana Trainer already ships at, on every target.

### Added
- The interface in 17 languages, the same set as Kana Trainer: English,
  Simplified and Traditional Chinese, Korean, Spanish, Brazilian Portuguese,
  Indonesian, Vietnamese, Thai, French, German, Dutch, Turkish, Russian, and
  Arabic, Persian and Hebrew laid out right to left.
- Pack content translated into every one of those languages: each word's
  meaning, the answers accepted when typed, its clue and example sentence, and
  each kanji's shape description. Anything without a translation falls back to
  English.
- Keyboard-only use of every screen.
- End-to-end checks for WCAG 2.2 AA on every screen, keyboard-only use, screen
  reader announcements, switching language and layout in long and right to
  left languages.

### Changed
- Layout holds from small phones at large font sizes to wide desktops.
- The Android launcher icon sits inside the safe area on a paper-coloured
  background instead of running full-bleed on white.
- The 279 JapanesePod101 recordings are now used with the publisher's
  permission.
- Removed flashcards from `data/`.

### Fixed
- Picture questions announce their prompt to screen readers instead of the
  image URL.
- Pressing `?` opens the keyboard shortcut sheet again.
- Starting a run no longer freezes the app for seconds on WebKitGTK: a pass
  over every word now starts in under a second instead of up to four. The
  Start button reads "Preparing…" while the run is built.
- Tab navigation of browser was conflicting with our keyboard mode. Fixed now. 

## [1.0.0] - 2026-09-27

The first release.

### Added
- JLPT N5 in four content packs, `n5-base`, `n5-plus`, `n5-extra` and
  `n5-kana`: 715 words using 409 kanji, each with a reading, a meaning, an
  example sentence, a picture and a recording.
- 23 topic sets in five families and 127 subcategories to build a run from.
- Twelve question formats in five groups: reading (kanji to kana, kana to
  kanji), meaning (word to meaning and back, from kanji and from kana), picture
  (picture to word, picture to reading), listening (hear a word and answer its
  reading or written form, see a word and pick its recording) and assembling a
  word from its kanji components.
- Answers by multiple choice or typing.
- Runs configured by hand: level, sets, subcategories, word shape, single words
  and length, saved as presets.
- Three difficulty levels that decide how believable the wrong answers are:
  words sharing a kanji, a component or a near-identical reading.
- Hints: kanji shape descriptions, word clues and picture descriptions.
- Optional time limit per question and per run.
- Result screen and score reports kept on the device: accuracy per kanji, per
  set and per format, mistakes and time per question.
- Reports exported and imported as `.kj-report` files.
- A run pre-filled from past mistakes, edited and confirmed by the learner.
- Chart view of every word as a flip card, filtered by level, word shape,
  category, subcategory or search, with playback of each recording.
- Printable double-sided A4 flashcards, 1×1 to 4×4 cards per page.
- Marketplace to download, update, enable and disable content packs from
  Hugging Face.
- Packages for Linux (deb, rpm, Arch), Windows, macOS and Android, each signed
  with OpenPGP and shipped with its sha256.

[1.1.0]: https://github.com/arsalan-anwari/kanji-trainer/releases/tag/v1.1.0
[1.0.0]: https://github.com/arsalan-anwari/kanji-trainer/releases/tag/v1.0.0
