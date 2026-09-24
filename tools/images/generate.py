"""Generate the hint images of every pack with the Recraft API.

One image per word. Prompts live under data/overlay/packs/{pack}/prompts/{category}/
as a words.json (the entries) plus a skiplist.txt (files already judged good,
skipped by default) and a shared data/overlay/packs/{pack}/prompts/style.json. Edit
those files to change what gets drawn; this script adds no wording.

Images are written to data/packs/{pack}/images/light/{category}/{subcategory}/{file}.png:
the light-theme picture, which is the one this API is asked to draw. The dark
variant is a separate step, see invert.py, and convert.py then turns both into
the WebP the app loads. Neither the subcategory nor the file name is curated
here — both are read from the "subcategory" and "file" columns of
data/overlay/packs/{pack}/words.tsv, keyed by written form and reading, so the
pictures cannot drift from the word list or from the paths the app asks for.

    export RECRAFT_API_KEY=...
    python3 tools/images/generate.py                              # everything, minus skiplists
    python3 tools/images/generate.py --pack=n5-base               # one pack, every category
    python3 tools/images/generate.py --pack=n5-base --category=numbers,nature
    python3 tools/images/generate.py --category=numbers           # error: no pack given
    python3 tools/images/generate.py --all                        # ignore every skiplist
    python3 tools/images/generate.py --dry-run

Set RECRAFT_STYLE_ID to a style id copied from the Recraft web platform
(Styles panel, three-dot menu, "copy style ID"). V4/V4.1 styles have no
name-based lookup in the API. Without it the look comes from the "style" line
in style.json alone, which is close but not identical between images.
"""

import argparse
import base64
import json
import os
import pathlib
import sys
import time

import requests

ROOT = pathlib.Path(__file__).resolve().parents[2]
OVERLAY = ROOT / "data" / "overlay" / "packs"
OUT = ROOT / "data" / "packs"
API = "https://external.api.recraft.ai/v1/images/generations"
MODEL = os.environ.get("RECRAFT_MODEL", "recraftv4_1")
SIZE = 1024  # smallest square the API offers; saved as-is, the UI scales it


def prompts(pack):
    return OVERLAY / pack / "prompts"


def packs():
    return sorted(p.name for p in OVERLAY.iterdir() if prompts(p.name).is_dir())


def categories(pack):
    return sorted(p.name for p in prompts(pack).iterdir() if p.is_dir())


def style(pack):
    return json.loads((prompts(pack) / "style.json").read_text())


def words(pack, category):
    """The prompt entries, each given its subcategory and file from the word list."""
    rows = curated(pack)
    entries = json.loads((prompts(pack) / category / "words.json").read_text())["words"]
    for w in entries:
        key = (w["word"], w["reading"])
        if key not in rows:
            sys.exit(f"{pack}/{category}: {w['word']} ({w['reading']}) is not in the word list")
        w.update(rows[key])
    return entries


def curated(pack):
    """{(written, reading): {subcategory, file}} from the curated word list, the one source."""
    lines = (OVERLAY / pack / "words.tsv").read_text().splitlines()
    header = lines[0].split("\t")
    written, reading = header.index("written"), header.index("reading")
    sub, file = header.index("subcategory"), header.index("file")
    rows = (line.split("\t") for line in lines[1:] if line)
    return {(row[written], row[reading]): {"subcategory": row[sub], "file": f"{row[file]}.png"} for row in rows}


def png_dir(pack, category, subcategory, theme="light"):
    return OUT / pack / "images" / theme / category / subcategory


def skiplist(pack, category):
    path = prompts(pack) / category / "skiplist.txt"
    if not path.exists():
        return set()
    lines = (l.split("#")[0].strip() for l in path.read_text().splitlines())
    return {l for l in lines if l}


def prompt(word, style_data):
    # Words that ask for text in the picture need the style line that permits it.
    text = style_data["style_text"] if word.get("text") else style_data["style"]
    return f"{word['prompt']}. {text}"


def plan(args):
    """Every (pack, category) pair this run should touch."""
    if args.category and not args.pack:
        sys.exit("--category needs --pack: it is not clear which pack's categories are meant")

    wanted_packs = [args.pack] if args.pack else packs()
    for pack in wanted_packs:
        if not prompts(pack).is_dir():
            sys.exit(f"no such pack: {pack}")

    pairs = []
    for pack in wanted_packs:
        available = categories(pack)
        if args.category:
            wanted = args.category.split(",")
            unknown = [c for c in wanted if c not in available]
            if unknown:
                sys.exit(f"no such category in {pack}: {', '.join(unknown)}")
            wanted_categories = wanted
        else:
            wanted_categories = available
        pairs += [(pack, category) for category in wanted_categories]
    return pairs


def add_filters(ap, all_help):
    ap.add_argument("--pack", metavar="PACK", help="only this pack, e.g. n5-base")
    ap.add_argument("--category", metavar="CAT[,CAT...]", help="only these categories; requires --pack")
    ap.add_argument("--all", action="store_true", help=all_help)
    ap.add_argument("--dry-run", action="store_true", help="print what would be done, do nothing")
    ap.add_argument("--limit", type=int, help="stop after N images")


def generate(text, session):
    body = {
        "prompt": text,
        "model": MODEL,
        "size": f"{SIZE}x{SIZE}",
        "response_format": "b64_json",
    }
    if style_id := os.environ.get("RECRAFT_STYLE_ID"):
        body["style_id"] = style_id
        # "precise" copies the reference style down to its subject matter, which is
        # what turned these into anime figures. "flexible" keeps the look, lets the
        # prompt decide what is drawn. Override with RECRAFT_STYLE_MATCH=precise.
        body["style_match"] = os.environ.get("RECRAFT_STYLE_MATCH", "flexible")

    for attempt in range(4):
        r = session.post(API, json=body, timeout=180)
        if r.status_code in (429, 500, 502, 503, 504) and attempt < 3:
            time.sleep(5 * 2**attempt)  # ponytail: fixed backoff, honour Retry-After if rate limits bite
            continue
        r.raise_for_status()
        return base64.b64decode(r.json()["data"][0]["b64_json"])
    raise RuntimeError("unreachable")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    add_filters(ap, "regenerate every image, ignoring the skiplists")
    args = ap.parse_args()

    todo = []
    for pack, category in plan(args):
        style_data = style(pack)
        entries = words(pack, category)
        skip = set() if args.all else skiplist(pack, category)
        for w in entries:
            if w["file"] in skip:
                continue
            out_dir = png_dir(pack, category, w["subcategory"])
            todo.append((pack, category, w, prompt(w, style_data), out_dir / w["file"]))
    if args.limit:
        todo = todo[: args.limit]

    if args.dry_run:
        for pack, category, w, text, path in todo:
            print(f"{pack}/{category}/{w['file']}\n  {text}\n")
        return
    if not todo:
        print("nothing to do")
        return
    if not (key := os.environ.get("RECRAFT_API_KEY")):
        sys.exit("RECRAFT_API_KEY is not set")

    session = requests.Session()
    session.headers["Authorization"] = f"Bearer {key}"
    print(f"{len(todo)} image(s), model {MODEL}, style_id {os.environ.get('RECRAFT_STYLE_ID', '(none, style line only)')}")
    for i, (pack, category, w, text, path) in enumerate(todo, 1):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(generate(text, session))
        print(f"[{i}/{len(todo)}] {pack}/{category}/{w['file']}")


def check():
    total = 0
    for pack in packs():
        for category in categories(pack):
            style_data = style(pack)
            rows = words(pack, category)
            total += len(rows)
            assert len({w["file"] for w in rows}) == len(rows), f"duplicate file name in {pack}/{category}"
            for theme in ("light", "dark"):
                absent = [
                    w["file"]
                    for w in rows
                    if not (png_dir(pack, category, w["subcategory"], theme) / w["file"]).with_suffix(".webp").exists()
                ]
                assert not absent, f"{pack}/{theme}/{category}: missing {absent}"
            assert all(w["prompt"] and w["word"] and w["name"] for w in rows), "empty field"
            assert style_data["style"] and style_data["style_text"]
            skip = skiplist(pack, category)
            assert skip <= {w["file"] for w in rows}, sorted(skip - {w["file"] for w in rows})
    assert total == 184, total
    print(f"ok, {total} words parsed across {len(packs())} pack(s)")


if __name__ == "__main__":
    check() if "--check" in sys.argv else main()
