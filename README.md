# kanji-trainer

[![crates.io](https://img.shields.io/crates/v/kanji-trainer.svg?style=flat-square)](https://crates.io/crates/kanji-trainer)
[![GitHub Release](https://img.shields.io/github/v/release/arsalan-anwari/kanji-trainer?style=flat-square)](https://github.com/arsalan-anwari/kanji-trainer/releases)
[![GitHub Downloads](https://img.shields.io/github/downloads/arsalan-anwari/kanji-trainer/total?style=flat-square)](https://github.com/arsalan-anwari/kanji-trainer/releases)
[![Crates Downloads](https://img.shields.io/crates/d/kanji-trainer.svg?style=flat-square)](https://crates.io/crates/kanji-trainer)
[![CI](https://github.com/arsalan-anwari/kanji-trainer/actions/workflows/ci.yml/badge.svg)](https://github.com/arsalan-anwari/kanji-trainer/actions/workflows/ci.yml)
[![license](https://img.shields.io/github/license/arsalan-anwari/kanji-trainer?style=flat-square)](LICENSE)
[![Content License](https://img.shields.io/badge/content-CC%20BY--SA%204.0-lightgrey?style=flat-square)](https://huggingface.co/datasets/arsalan-anwari/kanji-data)
[![Hugging Face](https://img.shields.io/badge/data-kanji--data-1a1b27?style=flat-square&logo=huggingface&logoColor=white&labelColor=0d1117)](https://huggingface.co/datasets/arsalan-anwari/kanji-data)
[![F-Droid](https://img.shields.io/badge/F--Droid-kanji--trainer-1a1b27?style=flat-square&logo=fdroid&logoColor=white&labelColor=0d1117)](https://arsalan-anwari.github.io/kanji-trainer/)
[![Microsoft Store](https://img.shields.io/badge/Microsoft%20Store-kanji--trainer-1a1b27?style=flat-square&logo=microsoft&logoColor=white&labelColor=0d1117)]()

Trainer for JLPT vocabulary written in kanji, on desktop, tablet and phone.
Built with Tauri 2 and Svelte 5, the second app after
[kana-trainer](https://github.com/arsalan-anwari/kana-trainer).

See the [roadmap](ROADMAP.md) for planned features.

<table>
  <tr>
    <td align="center" valign="bottom">
      <img src="packaging/repo/showcase.gif" width="420"
           alt="Kanji Trainer on a desktop window, walking through the practice setup, a question in each of the twelve formats across reading, meaning, picture, listening and assembling, a run scored, the reports screen, the flashcard chart and the marketplace">
    </td>
    <td align="center" valign="bottom">
      <img src="packaging/repo/showcase-phone.gif" width="160"
           alt="The same walkthrough of Kanji Trainer on a phone screen">
    </td>
  </tr>
  <tr>
    <td align="center">
      <b>Desktop</b><br>
    </td>
    <td align="center">
      <b>Phone</b><br>
    </td>
  </tr>
</table>

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

## Installing

<table>
  <tr>
    <td align="center"><a href="https://arsalan-anwari.github.io/kanji-trainer/"><img src="https://img.shields.io/badge/Get%20it%20on-F--Droid-1a1b27?style=for-the-badge&labelColor=0d1117&logo=data%3Aimage%2Fsvg%2Bxml%3Bbase64%2CPHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iI2ZmZiIgY29sb3I9IiNmZmYiPjxwYXRoIGQ9Ik01LjUgMS41IDcuNSA1bTExLTMuNS0yIDMuNSIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJjdXJyZW50Q29sb3IiIHN0cm9rZS13aWR0aD0iMS42IiBzdHJva2UtbGluZWNhcD0icm91bmQiLz48cGF0aCBmaWxsLXJ1bGU9ImV2ZW5vZGQiIGQ9Ik01IDVoMTRhMyAzIDAgMCAxIDMgM3YxMWEzIDMgMCAwIDEtMyAzSDVhMyAzIDAgMCAxLTMtM1Y4YTMgMyAwIDAgMSAzLTN6bTcgMy41YTUgNSAwIDEgMCAwIDEwIDUgNSAwIDAgMCAwLTEwem0wIDJhMyAzIDAgMSAxIDAgNiAzIDMgMCAwIDEgMC02eiIvPjwvc3ZnPg%3D%3D" alt="Get it on F-Droid"></a></td>
    <td align="center"><a href=""><img src="https://img.shields.io/badge/Get%20it%20from-Microsoft%20Store-1a1b27?style=for-the-badge&labelColor=0d1117&logo=data%3Aimage%2Fsvg%2Bxml%3Bbase64%2CPHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iI2ZmZiIgY29sb3I9IiNmZmYiPjxwYXRoIGQ9Ik0zLjQgNy42aDE3LjJsLTEuMiAxMi42YTIgMiAwIDAgMS0yIDEuOEg2LjZhMiAyIDAgMCAxLTItMS44eiIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJjdXJyZW50Q29sb3IiIHN0cm9rZS13aWR0aD0iMS42Ii8%2BPHBhdGggZD0iTTguMiA3LjZWNS40YTMuOCAzLjggMCAwIDEgNy42IDB2Mi4yIiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIxLjYiLz48cGF0aCBkPSJNOS4xIDExLjZoMi42djIuNkg5LjF6bTMuMiAwaDIuNnYyLjZoLTIuNnptLTMuMiAzLjJoMi42djIuNkg5LjF6bTMuMiAwaDIuNnYyLjZoLTIuNnoiLz48L3N2Zz4%3D" alt="Get it from Microsoft Store"></a></td>
  </tr>
  <tr>
    <td align="center"><a href="https://github.com/arsalan-anwari/kanji-trainer/releases/download/v1.2.0/kanji-trainer-1.2.0-1-x86_64.pkg.tar.zst"><img src="https://img.shields.io/badge/Download%20for-Arch%20Linux-1a1b27?style=for-the-badge&labelColor=0d1117&logo=data%3Aimage%2Fsvg%2Bxml%3Bbase64%2CPHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iI2ZmZiIgY29sb3I9IiNmZmYiPjxwYXRoIGQ9Ik0xMiAuOGMuOCAxLjYgMS4zIDIuNyAyLjIgNC4zLS42LS42LTEuMi0xLTEuOC0xLjQuOSAyLjMgMS40IDQuNyAxLjIgNy4xLS4xIDIuNi0xLjEgNS0yLjcgNyAxLjYtLjQgMy4yLTEuMyA0LjQtMi41LS4xLjctLjQgMS40LS45IDIuMSAyLjEtMS40IDMuMi0zLjQgMy40LTUuNGw0LjYgMTAuMkgxLjZMMTIgLjh6bS4zIDE1LjRjMSAuNiAxLjkgMS40IDIuNSAyLjRIOS4yYy42LTEgMS41LTEuOCAyLjUtMi40eiIvPjwvc3ZnPg%3D%3D" alt="Download for Arch Linux"></a></td>
    <td align="center"><a href="https://github.com/arsalan-anwari/kanji-trainer/releases/download/v1.2.0/Kanji.Trainer-1.2.0-1.x86_64.rpm"><img src="https://img.shields.io/badge/Download%20for-Fedora-1a1b27?style=for-the-badge&labelColor=0d1117&logo=data%3Aimage%2Fsvg%2Bxml%3Bbase64%2CPHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iI2ZmZiIgY29sb3I9IiNmZmYiPjxwYXRoIGQ9Ik0xMiAwYTEyIDEyIDAgMCAwIDAgMjRoNS43YTYuMyA2LjMgMCAwIDAgNi4zLTYuM1YxMkExMiAxMiAwIDAgMCAxMiAwem0xLjYgNS42YTMuNiAzLjYgMCAwIDEgMy42IDMuNiAxLjIgMS4yIDAgMSAxLTIuNCAwIDEuMiAxLjIgMCAwIDAtMS4yLTEuMiAxLjIgMS4yIDAgMCAwLTEuMiAxLjJ2Mi4yaDJhMS4yIDEuMiAwIDEgMSAwIDIuNGgtMnYxLjRhMy42IDMuNiAwIDEgMS0zLjYtMy42aDEuMlY5LjJhMy42IDMuNiAwIDAgMSAzLjYtMy42ek05LjIgMTMuNmExLjIgMS4yIDAgMSAwIDEuMiAxLjJ2LTEuMnoiLz48L3N2Zz4%3D" alt="Download for Fedora"></a></td>
    <td align="center"><a href="https://github.com/arsalan-anwari/kanji-trainer/releases/download/v1.2.0/Kanji.Trainer_1.2.0_amd64.deb"><img src="https://img.shields.io/badge/Download%20for-Ubuntu%20%2F%20Debian-1a1b27?style=for-the-badge&labelColor=0d1117&logo=data%3Aimage%2Fsvg%2Bxml%3Bbase64%2CPHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iI2ZmZiIgY29sb3I9IiNmZmYiPjxjaXJjbGUgY3g9IjEyIiBjeT0iMTIiIHI9IjUuMiIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJjdXJyZW50Q29sb3IiIHN0cm9rZS13aWR0aD0iMiIvPjxjaXJjbGUgY3g9IjEyIiBjeT0iMy4yIiByPSIyLjYiLz48Y2lyY2xlIGN4PSI0LjQiIGN5PSIxNi40IiByPSIyLjYiLz48Y2lyY2xlIGN4PSIxOS42IiBjeT0iMTYuNCIgcj0iMi42Ii8%2BPC9zdmc%2B" alt="Download for Ubuntu / Debian"></a></td>
  </tr>
  <tr>
    <td align="center"><a href="https://github.com/arsalan-anwari/kanji-trainer/releases/download/v1.2.0/Kanji.Trainer_1.2.0_universal.dmg"><img src="https://img.shields.io/badge/Download%20for-macOS-1a1b27?style=for-the-badge&labelColor=0d1117&logo=data%3Aimage%2Fsvg%2Bxml%3Bbase64%2CPHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iI2ZmZiIgY29sb3I9IiNmZmYiPjxwYXRoIGQ9Ik0xNi40IDEyLjdjMC0yLjcgMi4yLTQgMi4zLTQuMS0xLjItMS44LTMuMi0yLTMuOS0yLjEtMS42LS4yLTMuMi45LTQgLjlzLTIuMS0uOS0zLjUtLjljLTEuOCAwLTMuNCAxLTQuMyAyLjYtMS45IDMuMi0uNSA4IDEuMyAxMC42LjkgMS4zIDEuOSAyLjcgMy4zIDIuNiAxLjMtLjEgMS44LS44IDMuNC0uOHMyIC44IDMuNC44IDIuMy0xLjMgMy4yLTIuNWMxLTEuNSAxLjQtMi45IDEuNC0zLS4xIDAtMi43LTEtMi43LTQuMXpNMTMuOCA0LjNjLjctLjkgMS4yLTIuMSAxLjEtMy4zLTEgMC0yLjMuNy0zLjEgMS42LS43LjgtMS4zIDItMS4xIDMuMiAxLjEuMSAyLjMtLjYgMy4xLTEuNXoiLz48L3N2Zz4%3D" alt="Download for macOS"></a></td>
    <td align="center"><a href="https://github.com/arsalan-anwari/kanji-trainer/releases/download/v1.2.0/Kanji.Trainer_1.2.0_x64-setup.exe"><img src="https://img.shields.io/badge/Download%20for-Windows-1a1b27?style=for-the-badge&labelColor=0d1117&logo=data%3Aimage%2Fsvg%2Bxml%3Bbase64%2CPHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iI2ZmZiIgY29sb3I9IiNmZmYiPjxwYXRoIGQ9Ik0wIDMuNCA5LjggMnY5LjRIMHptMTAuOS0xLjZMMjQgMHYxMS40SDEwLjl6TTAgMTIuNmg5LjhWMjJMMCAyMC42em0xMC45IDBIMjRWMjRsLTEzLjEtMS44eiIvPjwvc3ZnPg%3D%3D" alt="Download for Windows"></a></td>
    <td align="center"><a href="https://github.com/arsalan-anwari/kanji-trainer/releases/download/v1.2.0/kanji-trainer-1.2.0.apk"><img src="https://img.shields.io/badge/Download%20the-Android%20APK-1a1b27?style=for-the-badge&labelColor=0d1117&logo=data%3Aimage%2Fsvg%2Bxml%3Bbase64%2CPHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iI2ZmZiIgY29sb3I9IiNmZmYiPjxwYXRoIGQ9Ik02IDl2Ny41YzAgLjYuNCAxIDEgMWgxVjIxYTEuNSAxLjUgMCAwIDAgMyAwdi0zLjVoMlYyMWExLjUgMS41IDAgMCAwIDMgMHYtMy41aDFjLjYgMCAxLS40IDEtMVY5SDZ6TTQgOWExLjUgMS41IDAgMCAwLTEuNSAxLjV2NWExLjUgMS41IDAgMCAwIDMgMHYtNUExLjUgMS41IDAgMCAwIDQgOXptMTYgMGExLjUgMS41IDAgMCAwLTEuNSAxLjV2NWExLjUgMS41IDAgMCAwIDMgMHYtNUExLjUgMS41IDAgMCAwIDIwIDl6TTE1LjkgMi43bDEuMS0xLjlhLjMuMyAwIDAgMC0uNS0uM2wtMS4xIDJBNi43IDYuNyAwIDAgMCAxMiAyYy0uOSAwLTEuNy4yLTIuNC41TDguNS41YS4zLjMgMCAwIDAtLjUuM2wxLjEgMS45QTUuNiA1LjYgMCAwIDAgNiA3LjVoMTJhNS42IDUuNiAwIDAgMC0yLjEtNC44ek05LjUgNS40YS42LjYgMCAxIDEgMC0xLjIuNi42IDAgMCAxIDAgMS4yem01IDBhLjYuNiAwIDEgMSAwLTEuMi42LjYgMCAwIDEgMCAxLjJ6Ii8%2BPC9zdmc%2B" alt="Download the Android APK"></a></td>
  </tr>
</table>

Every download is on the [releases page](https://github.com/arsalan-anwari/kanji-trainer/releases).

```sh
sudo dnf install ./Kanji.Trainer-*.rpm           # fedora, opensuse
sudo apt install ./Kanji.Trainer_*.deb           # debian 13+, ubuntu 24.04+
sudo pacman -U ./kanji-trainer-*.pkg.tar.zst     # arch
```

Or run the apk, exe or dmg with your system's installer.

### From crates.io

Needs Rust and the GTK and WebKit development headers, see
[Development](#development).

```sh
cargo install kanji-trainer
```

### Verifying a download

Every package on the releases page has two files next to it: a `.sha256`
checksum and a `.asc` OpenPGP signature by Arsalan Anwari (`arsalan-anwari`).
The checksum shows the file arrived intact, the signature that it was
published by the maintainer and nobody else.

```sh
# once: import the signing key, from github or from keys.openpgp.org
curl -sL https://github.com/arsalan-anwari.gpg | gpg --import
gpg --keyserver hkps://keys.openpgp.org --recv-keys 88A9AE5871B9A36EE3305977829EFCCDE81402E6

# for each download, next to its .asc and .sha256
sha256sum -c Kanji.Trainer_1.0.0_amd64.deb.sha256
gpg --verify Kanji.Trainer_1.0.0_amd64.deb.asc Kanji.Trainer_1.0.0_amd64.deb
```

`gpg` must print `Good signature` and the primary key fingerprint
`88A9 AE58 71B9 A36E E330  5977 829E FCCD E814 02E6`. Any other fingerprint, or
a `BAD signature`, means the file is not the one that was published: do not install it.

Each package also carries a build provenance attestation, which shows it was
built by this repository's release workflow from the tagged source:

```sh
gh attestation verify Kanji.Trainer_1.0.0_amd64.deb --repo arsalan-anwari/kanji-trainer
```

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
scripts/record.sh --all           # showcase stills, readme gifs and promo clip
scripts/update_version.sh 1.x.x   # set the version everywhere before tagging a release
scripts/publish.sh --dry-run      # check the crates.io package, the release publishes it
```

## Content

`data/` is not in git. It lives in the
[kanji-data](https://huggingface.co/datasets/arsalan-anwari/kanji-data) dataset on
Hugging Face, see [its README](https://huggingface.co/datasets/arsalan-anwari/kanji-data/blob/main/README.md) for the packs and
[overlay/README.md](https://huggingface.co/datasets/arsalan-anwari/kanji-data/blob/main/overlay/README.md) for the curated input.

## Licence

App code is Apache-2.0 (see [LICENSE](LICENSE)). The content in `data/` is
CC BY-SA 4.0, inherited from JMdict and KRADFILE.
