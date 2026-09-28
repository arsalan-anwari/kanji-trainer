#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["rich>=13"]
# ///
"""Render every flashcard PDF, one job (locale x pack) per app process.

One webview rendering all jobs piles up garbage until WebKit kills it at 4 GB,
so each job gets a fresh process. Finished jobs go to a skiplist,
tools/export/skiplist.txt, one locale/target per line, so a crashed or
interrupted export resumes where it stopped. The skiplist is removed once every
job is done; --fresh discards it up front.

Needs a release build: npm run tauri:build.
scripts/export_flashcards.sh runs this and passes its flags through.
"""

import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path

from rich.console import Console
from rich.progress import (
    BarColumn,
    MofNCompleteColumn,
    Progress,
    SpinnerColumn,
    TaskProgressColumn,
    TextColumn,
    TimeElapsedColumn,
    TimeRemainingColumn,
)

ROOT = Path(__file__).resolve().parents[2]
APP = ROOT / "src-tauri" / "target" / "release" / "kanji-trainer"
SKIPLIST = Path(__file__).with_name("skiplist.txt")

console = Console()


def app(data: Path, *flags: str, **popen) -> subprocess.Popen:
    command = [str(APP), "--export-flashcards", "--data", str(data), *flags]
    return subprocess.Popen(command, cwd=ROOT, stdout=subprocess.PIPE, text=True, **popen)


def events(process: subprocess.Popen):
    for line in process.stdout:
        line = line.strip()
        if line.startswith("{"):
            yield json.loads(line)


def fail(message: str, log) -> None:
    log.seek(0)
    console.print(log.read().decode(errors="replace").rstrip(), style="dim", markup=False, highlight=False)
    console.print(f"[bold red]✗ {message}[/]  rerun to resume")
    sys.exit(1)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--data", type=Path, default=Path("data"), help="data folder (default: data)")
    parser.add_argument("--fresh", action="store_true", help="forget finished jobs and render everything")
    args = parser.parse_args()
    if not APP.is_file():
        sys.exit(f"{APP} is missing; run npm run tauri:build first")

    if args.fresh:
        SKIPLIST.unlink(missing_ok=True)
    done = set(SKIPLIST.read_text().split()) if SKIPLIST.is_file() else set()

    with tempfile.TemporaryFile() as log, console.status("planning the export"):
        planner = app(args.data, "--plan", stderr=log)
        jobs = list(events(planner))
        if planner.wait() != 0 or not jobs:
            fail("could not plan the export", log)

    todo = [job for job in jobs if f"{job['locale']}/{job['target']}" not in done]
    if len(todo) < len(jobs):
        console.print(f"[cyan]↷ skipping {len(jobs) - len(todo)} finished jobs[/] ({SKIPLIST.relative_to(ROOT)})")

    columns = (
        SpinnerColumn(),
        TextColumn("{task.description}"),
        BarColumn(bar_width=None, complete_style="green", finished_style="bold green"),
        TaskProgressColumn(),
        MofNCompleteColumn(),
        TimeElapsedColumn(),
        TimeRemainingColumn(),
    )
    with Progress(*columns, console=console, expand=True) as progress:
        overall = progress.add_task(
            "[bold magenta]all jobs",
            total=sum(job["pages"] for job in jobs),
            completed=sum(job["pages"] for job in jobs if job not in todo),
        )
        current = progress.add_task("", total=1)
        for at, job in enumerate(todo, 1):
            name = f"{job['locale']}/{job['target']}"
            label = f"[bold cyan]{job['locale']:>5}[/] [yellow]{job['target']:<8}[/] [dim]{at}/{len(todo)}[/]"
            progress.reset(current, total=job["pages"], description=label)
            with tempfile.TemporaryFile() as log:
                process = app(args.data, "--only", name, stderr=log)
                for event in events(process):
                    size = event["size"]
                    progress.update(current, advance=1, description=f"{label} [blue]{size}x{size}[/]")
                    progress.advance(overall)
                if process.wait() != 0:
                    progress.stop()
                    fail(f"{name} failed with exit code {process.returncode}", log)
            with SKIPLIST.open("a") as file:
                file.write(name + "\n")
            progress.console.print(f"[green]✓[/] {name} [dim]{job['pages']} pages[/]")

    SKIPLIST.unlink(missing_ok=True)
    console.print(f"[bold green]done:[/] {len(jobs)} jobs in {args.data / 'flashcards'}")


if __name__ == "__main__":
    main()
