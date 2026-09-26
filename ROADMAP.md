# Roadmap

This roadmap describes the direction of Kanji Trainer. Design notes for each
feature live in [roadmap/](roadmap/).

## Status legend

| Mark | Meaning |
|------|---------|
| [✅] | Done |
| [⚙️] | In progress |
| [📋] | Planned, not started |

## How versions map to milestones

- **v1.0.0**: *The trainer.* Every question format, every platform, and content
  beyond N5. Feature-complete as a trainer for how a word is written, how it
  sounds and what it means.
- **v2.0.0 and beyond**: *On-device AI tutor.* Handwriting and speech practice
  with local models and delta-based feedback, the same split as Kana Trainer.

## Guiding principles

- **Words, not sentences.** Every answer is a property of a single word. Anything
  a learner can only answer by understanding a sentence belongs to `jlpt-trainer`.
- **The learner decides.** No SRS, no review queue, no streaks. The app diagnoses
  past runs, the learner configures the next one.
- **Offline first.** All state is local. Content packs download once and then work
  with no network. All audio is pre-recorded, nothing is synthesised.
- **WebKitGTK is the baseline.** Every layout and interaction has to hold on the
  weakest target: the page is the only scroll surface, tap-to-place over drag.
- **One codebase, many screens.** The same app on a wide monitor and on a small
  phone with large accessibility fonts.

---

## Milestone: The trainer (v1.0.0)

### Content foundation [✅]

- [✅] N5 word list, each word tagged with its kanji, reading, meaning and example sentence
- [✅] 23 topic sets in five families, 127 subcategories, frozen as taxonomy version 1
- [✅] Kanji component breakdown and the components worth teaching
- [✅] Source and licence recorded for every word, picture and recording

### Core loop [✅]

- [✅] Kanji to kana and kana to kanji, by multiple choice or typing
- [✅] Runs configured by hand: level, sets, subcategories, word shape, single words, length
- [✅] Result screen, results kept on the device
- [✅] Saved run presets

### Word meaning and pictures [✅]

- [✅] Word to meaning and meaning to word, from kanji and from kana
- [✅] Picture to word and picture to reading
- [✅] Meaning shown on the answer reveal of every format

### Difficulty [⚙️]

- [✅] Three tiers that decide how believable the wrong answers are
- [✅] Wrong answers that share a kanji, a component or a near-identical reading
- [📋] Two real compounds recombined into a plausible non-word, as real papers do
- [✅] Hints: kanji shape descriptions, word clues, picture descriptions

### Reports [✅]

- [✅] Accuracy per kanji, per set and per format
- [✅] Mistakes and time per question
- [✅] Reports exported and imported as `.kj-report` files
- [✅] Pre-fill a run from past mistakes, edited and confirmed by the learner

### Chart and flashcards [✅]

- [✅] Every word as a flip card: picture and kanji on the front, reading, romaji,
  meaning and example sentence on the back
- [✅] Filter by level, word shape, category, subcategory or search
- [✅] Double-sided A4 flashcard PDF, 1×1 to 4×4 cards per page

### Audio [⚙️]

- [✅] Hear a word, answer its reading or its written form
- [✅] See a word, pick the right recording
- [✅] Playback from the Chart view
- [📋] Move the clip cache and recording picker into `kaizen-ui`

### Content packs [⚙️]

- [✅] Packs classified by level and theme, downloaded from Hugging Face
- [✅] Marketplace tab to download, update, enable and disable packs
- [✅] Full N5 in four packs: `n5-base`, `n5-plus`, `n5-extra`, `n5-kana`, 715 words
- [✅] Several words sharing one kanji

### Timing [⚙️]

- [✅] Optional time limit per question and per run
- [📋] Preset at the real exam's pace
- [📋] Exam drill: kanji to kana and kana to kanji, timed, no reveal until the end
- [📋] Out of time, not reached and average time on the result screen

### Component assembly [✅]

- [✅] Build a word from its kanji components, tap-to-place
- [✅] Blocks laid out the way each character is built

### Platform parity and polish [📋]

- [📋] Layout holding from small phones at large font sizes to wide desktops
- [📋] Keyboard-only navigation and screen reader support on every screen
- [📋] Localisation across the same languages as Kana Trainer
- [📋] Packaged and published for Linux, Windows, macOS and Android
- [📋] External testing, with a regression test for every confirmed bug

### Beyond N5 [📋]

- [📋] N4 and higher levels as packs, no new question formats
- [📋] Theme packs: travel, food, work, school, culture, media
- [📋] Difficulty tuning against the larger pools of look-alikes and homophones

---

## Milestone: On-device AI tutor (v2.0.0+)

The shift from a right/wrong quiz to a tutor, mirroring Kana Trainer's v2. Every
model is profiled for energy and latency with [zinfer](#related-projects).

### Handwriting [📋]

- [📋] Evaluate stroke direction, angle and path over time rather than matching a
  template or a fixed stroke order
- [📋] Judge whether the result is readable, and show where a stroke diverged

### Speech [📋]

- [📋] Live feedback on pitch accent, tone and timing
- [📋] Tolerate accent and speaker variation

### Tutor loop [📋]

- [📋] Models running fully on-device, within a battery budget for a long session
- [📋] A guided "try again" loop that repeats a word until it is readable or
  intelligible, instead of marking it wrong and moving on

---

## Related projects

| Project | Relationship |
|---------|--------------|
| **kana-trainer** | Sibling app and structural reference. Drills a character; this app drills a word. |
| **jlpt-trainer** | Planned sibling app. Grammar, sentences, reading and listening comprehension. Assumes the vocabulary trained here is known. |
| **kaizen-ui** | Shared UI library for all sibling apps. |
| **zinfer** | Energy profiling for the v2 models. |

## Non-goals

- Online accounts, cloud sync of learning data, or server-side inference
- A spaced-repetition scheduler, review queue or anything that decides what the
  learner practises next
- Grammar, particles, reading passages, listening comprehension, or meaning that
  only a sentence resolves
- Runtime speech synthesis
