"""Generate the hint images in data/images/ with the Recraft API.

One image per N5 word. Every prompt comes from tools/images/n5.json: the
entry's own "prompt" plus the file's shared "style" line, and nothing else.
Edit that file to change what gets drawn; this script adds no wording.

A plain run regenerates all 185 images except the ones listed in
tools/images/n5_skiplist.txt, which are the ones already judged good. Add a
file name there once you are happy with its image; delete the line to have it
drawn again.

    export RECRAFT_API_KEY=...
    python3 tools/images/generate.py --one clock       # single image, to verify
    python3 tools/images/generate.py                   # all but the skip list
    python3 tools/images/generate.py --all             # ignore the skip list
    python3 tools/images/generate.py --one clock --dry-run

Set RECRAFT_STYLE_ID to a style id copied from the Recraft web platform
(Styles panel, three-dot menu, "copy style ID"). V4/V4.1 styles have no
name-based lookup in the API. Without it the look comes from the "style" line
in n5.json alone, which is close but not identical between images.
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
SPEC = pathlib.Path(__file__).resolve().parent / "n5.json"
SKIP = pathlib.Path(__file__).resolve().parent / "n5_skiplist.txt"
OUT = ROOT / "data" / "images"
API = "https://external.api.recraft.ai/v1/images/generations"
MODEL = os.environ.get("RECRAFT_MODEL", "recraftv4_1")
SIZE = 1024  # smallest square the API offers; saved as-is, the UI scales it


def spec():
    return json.loads(SPEC.read_text())


def skiplist():
    if not SKIP.exists():
        return set()
    lines = (l.split("#")[0].strip() for l in SKIP.read_text().splitlines())
    return {l for l in lines if l}


def prompt(word, data):
    # Words that ask for text in the picture need the style line that permits it.
    style = data["style_text"] if word.get("text") else data["style"]
    return f"{word['prompt']}. {style}"


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
    ap.add_argument("--one", metavar="NAME", help="generate a single image, e.g. clock or clock.png")
    ap.add_argument("--set", metavar="SET", help="only this topic set, e.g. numbers")
    ap.add_argument("--all", action="store_true", help="regenerate every image, ignoring the skip list")
    ap.add_argument("--dry-run", action="store_true", help="print the prompts, call nothing")
    ap.add_argument("--limit", type=int, help="stop after N images")
    args = ap.parse_args()

    data = spec()
    todo = data["words"]
    if args.one:
        name = args.one if args.one.endswith(".png") else args.one + ".png"
        todo = [w for w in todo if w["file"] == name]
        if not todo:
            sys.exit(f"{name} is not in {SPEC.relative_to(ROOT)}")
    if args.set:
        todo = [w for w in todo if w["set"] == args.set]
    if not args.all:
        skip = skiplist()
        todo = [w for w in todo if w["file"] not in skip]
    if args.limit:
        todo = todo[: args.limit]

    if args.dry_run:
        for w in todo:
            print(f"{w['file']}\n  {prompt(w, data)}\n")
        return
    if not todo:
        print("nothing to do")
        return
    if not (key := os.environ.get("RECRAFT_API_KEY")):
        sys.exit("RECRAFT_API_KEY is not set")

    session = requests.Session()
    session.headers["Authorization"] = f"Bearer {key}"
    print(f"{len(todo)} image(s), model {MODEL}, style_id {os.environ.get('RECRAFT_STYLE_ID', '(none, style line only)')}")
    for i, w in enumerate(todo, 1):
        (OUT / w["file"]).write_bytes(generate(prompt(w, data), session))
        print(f"[{i}/{len(todo)}] {w['file']}")


def check():
    data = spec()
    rows = data["words"]
    assert len(rows) == 185, len(rows)
    assert len({w["file"] for w in rows}) == len(rows), "duplicate file name"
    assert all(w["file"].endswith(".png") and (OUT / w["file"]).exists() for w in rows)
    assert all(w["prompt"] and w["word"] and w["name"] for w in rows), "empty field"
    clock = next(w for w in rows if w["file"] == "clock.png")
    assert "wall clock" in prompt(clock, data)
    assert "No letters" in prompt(clock, data)
    monday = next(w for w in rows if w["file"] == "monday.png")
    assert "No letters" not in prompt(monday, data), "text words must not get the no-letters style"
    assert "exactly as written" in prompt(monday, data)
    skip = skiplist()
    assert skip <= {w["file"] for w in rows}, sorted(skip - {w["file"] for w in rows})
    print(f"ok, {len(rows)} words parsed, {len(skip)} skipped, {len(rows) - len(skip)} would be drawn")


if __name__ == "__main__":
    check() if "--check" in sys.argv else main()
