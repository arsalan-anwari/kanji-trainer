import csv
import hashlib
import json
import pathlib
import re
import subprocess
import sys
import urllib.parse
import urllib.request
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[2]
CACHE = ROOT / ".cache" / "audio"
PACKS = ROOT / "data" / "packs"
OVERLAY = ROOT / "data" / "overlay" / "packs"

KA_DATA = "https://raw.githubusercontent.com/kanjialive/kanji-data-media/master/language-data/ka_data.csv"
KA_AUDIO = "https://media.kanjialive.com/examples_audio/audio-mp3.zip"
KA_LICENCE = "CC BY 4.0"
JPOD = "https://assets.languagepod101.com/dictionary/japanese/audiomp3.php"
JPOD_LICENCE = "unlicensed"
JPOD_UNAVAILABLE = "ae6398b5a27bc8c0a771df6c907ade794be15518174773c58c7c7ddd17098906"
COMMONS = "https://commons.wikimedia.org/w/api.php"
# Recordings no fetcher finds by search, pinned by their Wikimedia Commons title.
COMMONS_FILES = {
    ("七", "なな"): "File:Ja-7-nana.ogg",
}
USER_AGENT = "kanji-trainer-audio/0.1 (https://github.com/arsalan-anwari/kanji-trainer)"

SILENCE = "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.03"
FILTER = f"{SILENCE},areverse,{SILENCE},areverse,loudnorm=I=-20:TP=-1"
RATE = "44100"
BITRATE = "128k"


def clip_path(word):
    return pathlib.Path(word["set"]) / word["subcategory"] / f"{word['file']}.mp3"


def get(url, params=None):
    if params:
        url = f"{url}?{urllib.parse.urlencode(params)}"
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.geturl(), response.read()


def cached(name, url):
    path = CACHE / name
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        print(f"downloading {url}", file=sys.stderr)
        path.write_bytes(get(url)[1])
    return path


def kanji_alive_index():
    index = {}
    with open(cached("ka_data.csv", KA_DATA), encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            for position, (example, _) in enumerate(json.loads(row["examples"])):
                match = re.fullmatch(r"(.+?)（(.+?)）", example)
                if match is None:
                    continue
                name = f"audio-mp3/{row['kname']}_06_{'abcdefghijkl'[position]}.mp3"
                index.setdefault((match.group(1), match.group(2)), name)
    return index


def from_local(word, pack):
    path = OVERLAY / pack / "audio" / clip_path(word)
    if not path.exists():
        return None
    return path.read_bytes(), "unknown", path.relative_to(ROOT).as_posix()


def from_kanji_alive(word, index, archive):
    name = index.get((word["written"], word["reading"]))
    if name is None:
        return None
    return archive.read(name), KA_LICENCE, f"{KA_AUDIO}#{name}"


def from_jpod(word):
    path = CACHE / "jpod" / f"{word['written']}_{word['reading']}.mp3"
    source = CACHE / "jpod" / f"{word['written']}_{word['reading']}.url"
    if not path.exists():
        url, body = get(JPOD, {"kanji": word["written"], "kana": word["reading"]})
        path.parent.mkdir(parents=True, exist_ok=True)
        if len(body) == 0 or hashlib.sha256(body).hexdigest() == JPOD_UNAVAILABLE:
            body, url = b"", ""
        path.write_bytes(body)
        source.write_text(url)
    body = path.read_bytes()
    if len(body) == 0:
        return None
    return body, JPOD_LICENCE, source.read_text()


def lingua_libre_title(word):
    _, body = get(COMMONS, {
        "action": "query",
        "list": "search",
        "srnamespace": "6",
        "srlimit": "50",
        "format": "json",
        "srsearch": f"LL-Q5287 {word['written']}",
    })
    written = re.escape(word["written"])
    reading = re.escape(word["reading"])
    pattern = rf"File:LL-Q5287 \(jpn\)-.+-{written}(?:\s*[（(]{reading}[）)])?\.(?:wav|ogg|flac|mp3)"
    for hit in json.loads(body)["query"]["search"]:
        if re.fullmatch(pattern, hit["title"]):
            return hit["title"]
    return None


def from_lingua_libre(word):
    title = lingua_libre_title(word)
    return None if title is None else commons_file(title)


def from_commons(word):
    title = COMMONS_FILES.get((word["written"], word["reading"]))
    return None if title is None else commons_file(title)


def commons_file(title):
    _, body = get(COMMONS, {
        "action": "query",
        "prop": "imageinfo",
        "iiprop": "url|extmetadata",
        "format": "json",
        "titles": title,
    })
    info = next(iter(json.loads(body)["query"]["pages"].values()))["imageinfo"][0]
    licence = info["extmetadata"].get("LicenseShortName", {}).get("value", "unknown")
    return get(info["url"])[1], licence, info["descriptionurl"]


def encode(raw, destination):
    destination.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-i", "-", "-af", FILTER, "-ar", RATE, "-ac", "1",
         "-c:a", "libmp3lame", "-b:a", BITRATE, str(destination)],
        check=True, input=raw)


def main():
    pack = sys.argv[1] if len(sys.argv) > 1 else "n5-base"
    words = json.loads((PACKS / pack / "content.json").read_text())["words"]
    index = kanji_alive_index()
    archive = zipfile.ZipFile(cached("audio-mp3.zip", KA_AUDIO))
    fetchers = [
        ("local", lambda word: from_local(word, pack)),
        ("kanjialive", lambda word: from_kanji_alive(word, index, archive)),
        ("jpod101", from_jpod),
        ("lingualibre", from_lingua_libre),
        ("commons", from_commons),
    ]
    out = PACKS / pack / "audio"
    rows = []
    for word in words:
        path = clip_path(word)
        found = next(((name, clip) for name, fetch in fetchers if (clip := fetch(word))), None)
        if found is None:
            print(f"no clip: {word['written']} ({word['reading']}), removed {out / path}", file=sys.stderr)
            (out / path).unlink(missing_ok=True)
            rows.append([path.as_posix(), "none", "", ""])
            continue
        name, (raw, licence, url) = found
        if name == "local":
            (out / path).parent.mkdir(parents=True, exist_ok=True)
            (out / path).write_bytes(raw)
        else:
            encode(raw, out / path)
        rows.append([path.as_posix(), name, licence, url])
        print(f"{name}: {out / path}")
    with open(PACKS / pack / "sources.tsv", "w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle, delimiter="\t", lineterminator="\n")
        writer.writerow(["path", "source", "licence", "original_url"])
        writer.writerows(rows)
    print(PACKS / pack / "sources.tsv")
    counts = {}
    for row in rows:
        counts[row[1]] = counts.get(row[1], 0) + 1
    print(f"{len(words)} words: " + ", ".join(f"{name} {count}" for name, count in counts.items()))


if __name__ == "__main__":
    main()
