"""Generate the hint images in data/images/ with the Recraft API.

One image per N5 word. Prompts live under tools/images/data/{level}/{category}/
as a words.json (the entries) plus a skiplist.txt (files already judged good,
skipped by default) and a shared tools/images/data/{level}/style.json. Edit
those files to change what gets drawn; this script adds no wording.

Images are written to data/images/{level}/light/{category}/{subcategory}/{file}:
the light-theme picture, which is the one this API is asked to draw. The dark
variant is a separate step, see invert.py. The subcategory is not curated here —
it is read from the "subcategory" column of content/{level}-words.tsv, keyed by
the written form, so the pictures cannot drift from the word list.

    export RECRAFT_API_KEY=...
    python3 tools/images/generate.py                              # everything, minus skiplists
    python3 tools/images/generate.py --level=n5                   # one level, every category
    python3 tools/images/generate.py --level=n5 --category=numbers,nature
    python3 tools/images/generate.py --category=numbers           # error: no level given
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
CONTENT = ROOT / "content"
DATA = pathlib.Path(__file__).resolve().parent / "data"
OUT = ROOT / "data" / "images"
API = "https://external.api.recraft.ai/v1/images/generations"
MODEL = os.environ.get("RECRAFT_MODEL", "recraftv4_1")
SIZE = 1024  # smallest square the API offers; saved as-is, the UI scales it


def levels():
    return sorted(p.name for p in DATA.iterdir() if p.is_dir())


def categories(level):
    level_dir = DATA / level
    return sorted(p.name for p in level_dir.iterdir() if p.is_dir())


def style(level):
    return json.loads((DATA / level / "style.json").read_text())


def words(level, category):
    return json.loads((DATA / level / category / "words.json").read_text())["words"]


def subcategories(level):
    """{written form: subcategory} from the curated word list, the one source."""
    lines = (CONTENT / f"{level}-words.tsv").read_text().splitlines()
    header = lines[0].split("\t")
    written, sub = header.index("written"), header.index("subcategory")
    rows = (line.split("\t") for line in lines[1:] if line)
    return {row[written]: row[sub] for row in rows}


def png_dir(level, category, subcategory, theme="light"):
    return OUT / level / theme / category / subcategory


def skiplist(level, category):
    path = DATA / level / category / "skiplist.txt"
    if not path.exists():
        return set()
    lines = (l.split("#")[0].strip() for l in path.read_text().splitlines())
    return {l for l in lines if l}


def prompt(word, style_data):
    # Words that ask for text in the picture need the style line that permits it.
    text = style_data["style_text"] if word.get("text") else style_data["style"]
    return f"{word['prompt']}. {text}"


def plan(args):
    """Every (level, category) pair this run should touch."""
    if args.category and not args.level:
        sys.exit("--category needs --level: it is not clear which level's categories are meant")

    wanted_levels = [args.level] if args.level else levels()
    for level in wanted_levels:
        if not (DATA / level).is_dir():
            sys.exit(f"no such level: {level}")

    pairs = []
    for level in wanted_levels:
        available = categories(level)
        if args.category:
            wanted = args.category.split(",")
            unknown = [c for c in wanted if c not in available]
            if unknown:
                sys.exit(f"no such category in {level}: {', '.join(unknown)}")
            wanted_categories = wanted
        else:
            wanted_categories = available
        pairs += [(level, category) for category in wanted_categories]
    return pairs


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
    ap.add_argument("--level", metavar="LEVEL", help="only this level, e.g. n5")
    ap.add_argument("--category", metavar="CAT[,CAT...]", help="only these categories; requires --level")
    ap.add_argument("--all", action="store_true", help="regenerate every image, ignoring the skiplists")
    ap.add_argument("--dry-run", action="store_true", help="print the prompts, call nothing")
    ap.add_argument("--limit", type=int, help="stop after N images")
    args = ap.parse_args()

    todo = []
    for level, category in plan(args):
        style_data = style(level)
        entries = words(level, category)
        skip = set() if args.all else skiplist(level, category)
        subs = subcategories(level)
        for w in entries:
            if w["file"] in skip:
                continue
            out_dir = png_dir(level, category, subs[w["word"]])
            todo.append((level, category, w, prompt(w, style_data), out_dir / w["file"]))
    if args.limit:
        todo = todo[: args.limit]

    if args.dry_run:
        for level, category, w, text, path in todo:
            print(f"{level}/{category}/{w['file']}\n  {text}\n")
        return
    if not todo:
        print("nothing to do")
        return
    if not (key := os.environ.get("RECRAFT_API_KEY")):
        sys.exit("RECRAFT_API_KEY is not set")

    session = requests.Session()
    session.headers["Authorization"] = f"Bearer {key}"
    print(f"{len(todo)} image(s), model {MODEL}, style_id {os.environ.get('RECRAFT_STYLE_ID', '(none, style line only)')}")
    for i, (level, category, w, text, path) in enumerate(todo, 1):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(generate(text, session))
        print(f"[{i}/{len(todo)}] {level}/{category}/{w['file']}")


def check():
    total = 0
    for level in levels():
        subs = subcategories(level)
        for category in categories(level):
            style_data = style(level)
            rows = words(level, category)
            total += len(rows)
            assert len({w["file"] for w in rows}) == len(rows), f"duplicate file name in {level}/{category}"
            assert all(w["file"].endswith(".png") for w in rows)
            missing = [w["word"] for w in rows if w["word"] not in subs]
            assert not missing, f"{level}/{category}: not in the word list: {missing}"
            for theme in ("light", "dark"):
                absent = [
                    w["file"]
                    for w in rows
                    if not (png_dir(level, category, subs[w["word"]], theme) / w["file"]).exists()
                ]
                assert not absent, f"{level}/{theme}/{category}: missing {absent}"
            assert all(w["prompt"] and w["word"] and w["name"] for w in rows), "empty field"
            assert style_data["style"] and style_data["style_text"]
            skip = skiplist(level, category)
            assert skip <= {w["file"] for w in rows}, sorted(skip - {w["file"] for w in rows})
    assert total == 184, total
    print(f"ok, {total} words parsed across {len(levels())} level(s)")


if __name__ == "__main__":
    check() if "--check" in sys.argv else main()
