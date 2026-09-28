# /// script
# requires-python = ">=3.11"
# dependencies = ["pydantic-ai-slim[openrouter]>=2.51,<3", "tqdm>=4.66"]
# ///
"""Translate the interface strings and the pack hint text through OpenRouter.

Two kinds of file are written. Both are rebuilt from their English source, so
their keys cannot drift from it:

  app     src/lib/assets/local/{lang}/{file}.json, from local/en/{file}.json
  {pack}  data/packs/{pack}/locale/{lang}.json, from data/packs/{pack}/content.json:
          { "words": { id: { meaning, glosses, clue, example? } }, "looks": { kanji: text } }

Only the English values are sent to the model, as numbered items. Keys never
leave this script. Chinese and Korean go to GLM, every other language to Gemini.

What a run touches is narrowed by --pack (app or a pack id), --category (an app
file such as common, a pack's word set such as numbers, or "looks") and
--subcategory (a top-level key of an app file, or a word subcategory).
tools/locale/skiplist.txt lists what a run leaves alone, one
lang[/target[/category[/subcategory]]] per line.

    export OPENROUTER_API_KEY=...
    uv run tools/locale/translate.py                              # everything, minus the skiplist
    uv run tools/locale/translate.py --lang fr,de
    uv run tools/locale/translate.py --pack app --category common,quiz
    uv run tools/locale/translate.py --pack n5-base --category numbers --subcategory frequency
    uv run tools/locale/translate.py --missing                    # only strings not translated yet
    uv run tools/locale/translate.py --all                        # ignore the skiplist
    uv run tools/locale/translate.py --dry-run                    # count what would be sent
    uv run tools/locale/translate.py --check                      # check the files on disk, no API

scripts/translate_locale.sh does the same with the key pulled from Bitwarden.
"""

import argparse
import asyncio
import collections
import itertools
import json
import os
import pathlib
import re
import sys
import time
from dataclasses import dataclass
from typing import NamedTuple

ROOT = pathlib.Path(__file__).resolve().parents[2]
APP = ROOT / "src" / "lib" / "assets" / "local"
PACKS = ROOT / "data" / "packs"
SKIPLIST = pathlib.Path(__file__).with_name("skiplist.txt")
LOGS = ROOT / ".cache" / "locale"

GLM = "z-ai/glm-5.3-flash"
GEMINI = "google/gemini-3.1-flash-lite"
# Thinking is billed as output. The lowest effort each model accepts, from the
# "reasoning" field of openrouter.ai/api/v1/models: GLM cannot turn it off and
# defaults to "max", Gemini defaults to "minimal".
REASONING = {GLM: "low", GEMINI: "minimal"}
LANGS = {
    "zh-CN": ("Simplified Chinese (mainland China)", GLM),
    "zh-TW": ("Traditional Chinese (Taiwan)", GLM),
    "ko": ("Korean", GLM),
    "es": ("Spanish", GEMINI),
    "pt-BR": ("Brazilian Portuguese", GEMINI),
    "id": ("Indonesian", GEMINI),
    "vi": ("Vietnamese", GEMINI),
    "th": ("Thai", GEMINI),
    "fr": ("French", GEMINI),
    "de": ("German", GEMINI),
    "nl": ("Dutch", GEMINI),
    "tr": ("Turkish", GEMINI),
    "ru": ("Russian", GEMINI),
    "ar": ("Arabic", GEMINI),
    "fa": ("Persian (Farsi)", GEMINI),
    "he": ("Hebrew", GEMINI),
}
PLACEHOLDER = re.compile(r"\{[^{}]+\}")
CONCURRENCY = 6


class Leaf(NamedTuple):
    text: str
    context: str
    category: str
    subcategory: str | None


@dataclass
class Job:
    lang: str
    target: str
    out: pathlib.Path
    skeleton: dict
    leaves: dict  # {path: Leaf}, every English string of the file
    todo: list  # the paths this run translates
    atomic: bool  # a pack locale drops a word that is not complete


# the English sources


def flatten(value, prefix=()):
    """{path: text} for every string in a nested dict/list."""
    if isinstance(value, str):
        return {prefix: value}
    if not isinstance(value, (dict, list)):
        return {}
    items = enumerate(value) if isinstance(value, list) else value.items()
    return {path: text for key, child in items for path, text in flatten(child, prefix + (key,)).items()}


def build(skeleton, values, atomic=False, path=()):
    """The skeleton with each string replaced by values[path]; untranslated strings are left out.

    A list is kept only whole. In a pack locale a word is too, since the app
    rejects the whole file over one incomplete word.
    """
    if isinstance(skeleton, str):
        return values.get(path)
    items = enumerate(skeleton) if isinstance(skeleton, list) else skeleton.items()
    out = {key: build(child, values, atomic, path + (key,)) for key, child in items}
    kept = {key: value for key, value in out.items() if value is not None}
    if isinstance(skeleton, list):
        return list(kept.values()) if len(kept) == len(out) else None
    if atomic and len(path) == 2 and path[0] == "words" and len(kept) < len(out):
        return None
    return kept if kept or not path or not out else None  # an empty section stays, as "looks": {}


def app_files():
    return sorted(p.stem for p in (APP / "en").glob("*.json"))


def pack_ids():
    return sorted(p.parent.name for p in PACKS.glob("*/content.json"))


def app_source(file):
    skeleton = json.loads((APP / "en" / f"{file}.json").read_text())
    leaves = {
        path: Leaf(text, f"interface string {file}.{'.'.join(map(str, path))}", file, str(path[0]))
        for path, text in flatten(skeleton).items()
    }
    return skeleton, leaves


def pack_source(pack):
    content = json.loads((PACKS / pack / "content.json").read_text())
    skeleton, leaves = {"words": {}, "looks": {}}, {}
    for w in content["words"]:
        entry = {"meaning": w["meaning"], "glosses": list(w["glosses"]), "clue": w["clue"]}
        if "example" in w:
            entry["example"] = w["example"]["english"]
        skeleton["words"][w["id"]] = entry
        word = f"the Japanese word {w['written']} ({w['reading']})"
        context = {
            "meaning": f"meaning of {word}, graded as a quiz answer; keep it as short as the English",
            "glosses": f"one accepted meaning of {word}; a word or short phrase",
            "clue": f"hint sentence for {word}",
            "example": f"translation of the example sentence {w.get('example', {}).get('japanese')}",
        }
        for path, text in flatten(entry, ("words", w["id"])).items():
            leaves[path] = Leaf(text, context[path[2]], w["set"], w["subcategory"])
    for k in content["kanji"]:
        if k["look"]:
            skeleton["looks"][k["character"]] = k["look"]
            context = f"what the kanji {k['character']} looks like: its strokes and parts"
            leaves[("looks", k["character"])] = Leaf(k["look"], context, "looks", None)
    return skeleton, leaves


def pack_categories(pack):
    content = json.loads((PACKS / pack / "content.json").read_text())
    return {w["set"] for w in content["words"]} | ({"looks"} if any(k["look"] for k in content["kanji"]) else set())


# what a run touches


def skiplist():
    if not SKIPLIST.exists():
        return []
    lines = (line.split("#")[0].strip() for line in SKIPLIST.read_text().splitlines())
    return [tuple(line.split("/")) for line in lines if line]


def skipped(scope, skip):
    return any(scope[: len(entry)] == entry for entry in skip)


def existing(out):
    return flatten(json.loads(out.read_text())) if out.exists() else {}


def plan(args):
    langs = args.lang.split(",") if args.lang else list(LANGS)
    if unknown := [lang for lang in langs if lang not in LANGS]:
        sys.exit(f"no such language: {', '.join(unknown)} (one of {', '.join(LANGS)})")
    if args.category and not args.pack:
        sys.exit("--category needs --pack: it is not clear which target's categories are meant")
    if args.subcategory and not args.category:
        sys.exit("--subcategory needs --category")

    available = ["app", *pack_ids()]
    targets = args.pack.split(",") if args.pack else available
    if unknown := [t for t in targets if t not in available]:
        sys.exit(f"no such target: {', '.join(unknown)} (one of {', '.join(available)}; is data/ downloaded?)")
    categories = set(args.category.split(",")) if args.category else None
    subcategories = set(args.subcategory.split(",")) if args.subcategory else None
    skip = [] if args.all else skiplist()

    sources = []  # (target, out path for a language, skeleton, leaves, atomic)
    for target in targets:
        known = set(app_files()) if target == "app" else pack_categories(target)
        if categories and (unknown := categories - known):
            sys.exit(f"no such category in {target}: {', '.join(sorted(unknown))}")
        if target == "app":
            for file in sorted(categories or known):
                out = lambda lang, file=file: APP / lang / f"{file}.json"
                sources.append((target, out, *app_source(file), False))
        else:
            out = lambda lang, target=target: PACKS / target / "locale" / f"{lang}.json"
            sources.append((target, out, *pack_source(target), True))

    jobs = []
    for lang in langs:
        for target, out, skeleton, leaves, atomic in sources:
            done = existing(out(lang)) if args.missing else {}
            todo = [
                path
                for path, leaf in leaves.items()
                if (not categories or leaf.category in categories)
                and (not subcategories or leaf.subcategory in subcategories)
                and not skipped((lang, target, leaf.category, leaf.subcategory), skip)
                and path not in done
            ]
            if todo:
                jobs.append(Job(lang, target, out(lang), skeleton, leaves, todo, atomic))
    return jobs


# the post check


def problems(out, skeleton):
    """What is wrong with a written locale file, measured against its English source."""
    english, got = flatten(skeleton), flatten(json.loads(out.read_text()))
    found = []
    # a list (the glosses) is a set of accepted answers, free in length per
    # language, so it is compared by its path alone
    keys = lambda paths: {p[:-1] if isinstance(p[-1], int) else p for p in paths}
    if extra := sorted(keys(got) - keys(english), key=str):
        found.append(f"{len(extra)} key(s) not in English, e.g. {'.'.join(map(str, extra[0]))}")
    if missing := sorted(keys(english) - keys(got), key=str):
        found.append(f"{len(missing)} string(s) untranslated, e.g. {'.'.join(map(str, missing[0]))}")
    for path in english.keys() & got.keys():
        where = ".".join(map(str, path))
        if not got[path].strip():
            found.append(f"{where} is empty")
        elif sorted(PLACEHOLDER.findall(english[path])) != sorted(PLACEHOLDER.findall(got[path])):
            found.append(f"{where} does not keep the placeholders of {english[path]!r}")
    return found


def report(jobs):
    bad = 0
    for out, skeleton in {job.out: job.skeleton for job in jobs}.items():
        if not out.exists():
            continue
        found = problems(out, skeleton)
        bad += bool(found)
        for line in found:
            print(f"  {out.relative_to(ROOT)}: {line}")
    return bad


# the model


def agent():
    os.environ.setdefault("PYDANTIC_AI_NO_BANNER", "1")
    from pydantic import BaseModel
    from pydantic_ai import Agent, ModelRetry, RunContext

    class Item(BaseModel):
        id: int
        text: str

    class Translation(BaseModel):
        items: list[Item]

    @dataclass
    class Batch:
        language: str
        sent: dict  # {id: English text}

    settings = {
        "temperature": 0.2,
        "timeout": 180,
        # GLM is served by dozens of providers at up to 7x the listed price
        "openrouter_provider": {"sort": "price"},
        # puts what OpenRouter actually charged on every response
        "openrouter_usage": {"include": True},
    }
    translator = Agent(output_type=Translation, deps_type=Batch, retries=3, model_settings=settings)

    @translator.instructions
    def instructions(ctx: RunContext[Batch]) -> str:
        language = ctx.deps.language
        return f"""You translate the English text of Kanji Trainer, an app for learning Japanese words written in kanji, into {language}.
The input is a JSON list of items, each with an id, a context saying what the text is, and the English text.
Return every id exactly once, with its {language} translation as the text.
- Translate for a learner who reads {language}. Match the length and register of the English: short labels stay short, sentences stay sentences.
- Copy every placeholder in curly braces, such as {{count}}, exactly as it is. Never translate or drop one.
- Leave Japanese (kana, kanji) and romaji exactly as they are, and keep names like Kanji Trainer, JLPT and N5 unchanged.
- Keep punctuation and markdown such as **bold** where the English has it.
- The context is only there to help; never translate it or add notes to the text."""

    @translator.output_validator
    def validate(ctx: RunContext[Batch], output: Translation) -> Translation:
        got = {item.id: item.text for item in output.items}
        if sorted(got) != sorted(ctx.deps.sent) or len(output.items) != len(got):
            raise ModelRetry(f"return exactly one item for each of the ids {sorted(ctx.deps.sent)}")
        if empty := [i for i, text in got.items() if not text.strip()]:
            raise ModelRetry(f"items {empty} are empty; translate them")
        wrong = [i for i, text in ctx.deps.sent.items() if sorted(PLACEHOLDER.findall(text)) != sorted(PLACEHOLDER.findall(got[i]))]
        if wrong:
            raise ModelRetry(f"items {wrong} changed or dropped a {{placeholder}}; copy each one verbatim from the English")
        return output

    return translator, Batch


ATTEMPTS = 3  # per request, on top of the HTTP client's own retries
GIVE_UP = 10  # failed requests in a row that stop the run: out of credit, bad key or network down


def clock(seconds):
    return f"{int(seconds // 3600)}:{int(seconds % 3600 // 60):02}:{int(seconds % 60):02}"


class Progress:
    """The live bar on the terminal, and a log file with every event plus a status line a minute."""

    def __init__(self, batches):
        from tqdm import tqdm

        self.strings, self.strings_done = sum(len(paths) for _, paths in batches), 0
        self.left = collections.Counter(job.lang for job, _ in batches)  # requests left per language
        self.tokens = collections.Counter()  # "in", "out", "reasoning" -> tokens
        self.spent = 0.0  # $, as reported by OpenRouter
        self.done = self.failed = self.skipped = self.in_a_row = self.in_flight = 0
        self.total = len(batches)
        self.stopped = False
        self.last_reply = time.monotonic()
        self.log_path = LOGS / f"translate-{time.strftime('%Y%m%d-%H%M%S')}.log"
        self.log_path.parent.mkdir(parents=True, exist_ok=True)
        self.file = self.log_path.open("a", buffering=1)
        self.bar = tqdm(
            total=len(batches),
            unit="req",
            dynamic_ncols=True,
            smoothing=0.05,
            disable=None,  # no bar when not on a terminal; the log file still gets a line a minute
            bar_format="{desc:<6}{percentage:5.1f}% |{bar}| {n_fmt}/{total_fmt} req [{elapsed}<{remaining}]{postfix}",
        )

    def status(self):
        langs = sum(1 for n in self.left.values() if n == 0)
        quiet = int(time.monotonic() - self.last_reply)
        return (
            f"{self.strings_done}/{self.strings} strings, {langs}/{len(self.left)} languages, ${self.spent:.3f} spent, "
            f"{self.in_flight} in flight, last reply {quiet}s ago"
            + (f", {self.tokens['reasoning']} REASONING tokens" if self.tokens["reasoning"] else "")
            + (f", {self.failed} FAILED" if self.failed else "")
        )

    def log(self, text):
        line = f"{time.strftime('%H:%M:%S')} {text}"
        self.bar.write(line, file=sys.stderr)
        self.file.write(line + "\n")

    def reply(self, result):
        from pydantic_ai.messages import ModelResponse

        self.last_reply = time.monotonic()
        usage = result.usage
        self.tokens["in"] += usage.input_tokens or 0
        self.tokens["out"] += usage.output_tokens or 0
        self.tokens["reasoning"] += usage.details.get("reasoning_tokens", 0)
        # every response of the run, so a validation retry is counted too
        responses = [m for m in result.all_messages() if isinstance(m, ModelResponse)]
        self.spent += sum((m.provider_details or {}).get("cost", 0) for m in responses)

    def step(self, job, strings, ok, skipped=False):
        self.last_reply = time.monotonic()
        self.done += 1
        self.strings_done += strings if ok else 0
        self.skipped += skipped
        self.failed += not ok and not skipped
        self.in_a_row = 0 if ok else self.in_a_row + 1
        self.left[job.lang] -= 1
        self.bar.set_description_str(job.lang, refresh=False)
        self.bar.set_postfix_str(self.status(), refresh=False)
        self.bar.update()
        if self.left[job.lang] == 0 and not self.stopped:
            self.log(f"done {job.lang}")
        if self.in_a_row >= GIVE_UP and not self.stopped:
            self.stopped = True
            self.log(f"{GIVE_UP} requests failed in a row: out of credit, a bad key or no network? Stopping.")

    async def heartbeat(self):
        """Keeps the bar moving while nothing finishes, so a stall shows as a growing 'last reply' time."""
        for tick in itertools.count(1):
            await asyncio.sleep(5)
            self.bar.set_postfix_str(self.status())
            if tick % 12 == 0:
                line = f"{time.strftime('%H:%M:%S')} {self.done}/{self.total} requests ({self.done / self.total:.1%}), {self.status()}"
                self.file.write(line + "\n")
                if self.bar.disable:
                    print(line, file=sys.stderr)

    def close(self, elapsed):
        self.bar.close()
        self.log(
            f"{self.strings_done}/{self.strings} strings translated in {elapsed}, {self.tokens['in']} tokens in, "
            f"{self.tokens['out']} out ({self.tokens['reasoning']} reasoning), ${self.spent:.3f} spent"
            + (f", {self.failed} request(s) failed" if self.failed else "")
            + (f", {self.skipped} skipped after the stop" if self.skipped else "")
        )
        if self.failed or self.skipped:
            self.log("rerun with --missing to translate only what is left")
        self.log(f"log: {self.log_path.relative_to(ROOT)}")
        self.file.close()


async def run(jobs, batch_size):
    from pydantic_ai.models.openrouter import OpenRouterModel

    translator, Batch = agent()
    models = {name: OpenRouterModel(name) for name in {LANGS[job.lang][1] for job in jobs}}
    gate = asyncio.Semaphore(CONCURRENCY)
    # batches follow the source order, so the fields of a word travel together
    batches = [(job, job.todo[i : i + batch_size]) for job in jobs for i in range(0, len(job.todo), batch_size)]
    values = {job.out: {p: t for p, t in existing(job.out).items() if p in job.leaves} for job in jobs}
    progress = Progress(batches)
    progress.log(f"{len(batches)} requests, {progress.strings} strings, {len(progress.left)} languages; log in {progress.log_path.relative_to(ROOT)}")

    async def translate(job, paths):
        model = LANGS[job.lang][1]
        items = [{"id": i, "context": job.leaves[p].context, "text": job.leaves[p].text} for i, p in enumerate(paths)]
        deps = Batch(LANGS[job.lang][0], {item["id"]: item["text"] for item in items})
        progress.in_flight += 1
        try:
            result = await translator.run(
                json.dumps(items, ensure_ascii=False),
                model=models[model],
                deps=deps,
                model_settings={"openrouter_reasoning": {"effort": REASONING[model]}},
            )
        finally:
            progress.in_flight -= 1
        progress.reply(result)
        got = {item.id: item.text for item in result.output.items}
        return {path: got[i] for i, path in enumerate(paths)}

    async def one(job, paths):
        name = job.out.relative_to(ROOT)
        async with gate:
            for attempt in range(1, ATTEMPTS + 1):
                if progress.stopped:
                    progress.step(job, len(paths), False, skipped=True)
                    return False
                try:
                    got = await translate(job, paths)
                    break
                except Exception as error:
                    reason = f"{type(error).__name__}: {str(error)[:300]}"
                    status = getattr(error, "status_code", None)
                    # a rejected request (bad setting, bad key, no credit) fails the same way every time
                    permanent = status is not None and 400 <= status < 500 and status not in (408, 429)
                    if permanent or attempt == ATTEMPTS:  # the file keeps what it had for these strings
                        progress.log(f"failed {name} after {attempt} attempt(s): {reason}")
                        progress.step(job, len(paths), False)
                        return False
                    progress.log(f"retrying {name} in {30 * attempt}s (attempt {attempt}/{ATTEMPTS}): {reason}")
                    await asyncio.sleep(30 * attempt)
        # saved after every request, so a stopped run keeps its work; --missing picks up the rest
        values[job.out].update(got)
        job.out.parent.mkdir(parents=True, exist_ok=True)
        job.out.write_text(json.dumps(build(job.skeleton, values[job.out], job.atomic), ensure_ascii=False, indent=2) + "\n")
        progress.step(job, len(paths), True)
        return True

    start = time.monotonic()
    beat = asyncio.create_task(progress.heartbeat())
    try:
        ok = all(await asyncio.gather(*(one(job, paths) for job, paths in batches)))
    finally:
        beat.cancel()
        progress.close(clock(time.monotonic() - start))
    return ok


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--lang", metavar="TAG[,TAG...]", help=f"only these languages, of {', '.join(LANGS)}")
    ap.add_argument("--pack", metavar="TARGET[,...]", help="only these targets: app, or a pack id such as n5-base")
    ap.add_argument("--category", metavar="CAT[,CAT...]", help="only these categories; requires --pack")
    ap.add_argument("--subcategory", metavar="SUB[,SUB...]", help="only these subcategories; requires --category")
    ap.add_argument("--all", action="store_true", help="ignore the skiplist")
    ap.add_argument("--missing", action="store_true", help="only strings the target file does not have yet")
    ap.add_argument("--batch", type=int, default=100, help="strings per request (default 100)")
    ap.add_argument("--dry-run", action="store_true", help="print what would be sent, send nothing")
    ap.add_argument("--check", action="store_true", help="check the locale files on disk against English, send nothing")
    ap.add_argument("--test", action="store_true", help="run the self-test of the JSON handling")
    args = ap.parse_args()

    if args.test:
        return test()
    if args.check:
        args.all, args.missing = True, False
        jobs = plan(args)
        bad = report(jobs)
        print(f"{bad} file(s) with problems" if bad else "ok")
        sys.exit(1 if bad else 0)

    jobs = plan(args)
    if not jobs:
        print("nothing to do")
        return
    if args.dry_run:
        for job in jobs:
            chars = sum(len(job.leaves[p].text) for p in job.todo)
            print(f"{job.lang:6} {str(job.out.relative_to(ROOT)):48} {len(job.todo):5} string(s) {chars:7} chars  {LANGS[job.lang][1]}")
    langs = list(dict.fromkeys(job.lang for job in jobs))
    print(f"{sum(len(job.todo) for job in jobs)} string(s) in {len(jobs)} file(s), {len(langs)} language(s): {' '.join(langs)}")
    if args.dry_run:
        return
    if not os.environ.get("OPENROUTER_API_KEY"):
        sys.exit("OPENROUTER_API_KEY is not set")

    try:
        ok = asyncio.run(run(jobs, args.batch))
    except KeyboardInterrupt:
        sys.exit("stopped; every finished request is saved, rerun with --missing to translate only the rest")
    bad = report(jobs)
    sys.exit(0 if ok and not bad else 1)


def test():
    skeleton = {"a": "one {n}", "b": {"c": "two"}, "words": {"x": {"meaning": "m", "glosses": ["g1", "g2"]}}}
    paths = flatten(skeleton)
    assert paths[("words", "x", "glosses", 1)] == "g2" and len(paths) == 5
    full = {p: t.upper() for p, t in paths.items()}
    assert build(skeleton, full, True) == {"a": "ONE {N}", "b": {"c": "TWO"}, "words": {"x": {"meaning": "M", "glosses": ["G1", "G2"]}}}
    # a half-translated list or word is dropped whole, a stray key never appears
    partial = {("a",): "één {n}", ("words", "x", "meaning"): "m", ("words", "x", "glosses", 0): "g", ("zz",): "stray"}
    assert build(skeleton, partial, True) == {"a": "één {n}"}
    assert build(skeleton, {}, True) == {}
    assert skipped(("nl", "app", "common", "nav"), [("nl",)])
    assert skipped(("fr", "n5-base", "numbers", "frequency"), [("fr", "n5-base", "numbers")])
    assert not skipped(("fr", "n5-base", "time", None), [("fr", "n5-base", "numbers")])
    print("ok")


if __name__ == "__main__":
    main()
