"""Shared by the Python tools: one look for every progress bar.

A tool under tools/{area}/ puts tools/ on its path first, then:

    from common import console, track
    for item in track(items, "converting", group=lambda item: (item.pack, item.category)):
        console.print("a line", "that appears above the bars")

Scripts that need other bars use progress() or columns() directly.
"""

from collections import Counter

from rich.console import Console
from rich.markup import escape
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

console = Console()
LEVEL_STYLES = ("bold cyan", "yellow", "blue")


def columns(unit=""):
    """The bar's columns; unit labels the done/total count, e.g. "req"."""
    return (
        SpinnerColumn(finished_text="[green]✓"),
        TextColumn("{task.description}"),
        BarColumn(bar_width=None, complete_style="green", finished_style="bold green"),
        TaskProgressColumn(),
        MofNCompleteColumn(),
        *([TextColumn(unit)] if unit else []),
        TimeElapsedColumn(),
        TimeRemainingColumn(),
    )


def progress(**options):
    options.setdefault("console", console)
    return Progress(*columns(), expand=True, **options)


def grouped(items, group):
    """items in group order, each group where its first item stood, with their paths and group sizes."""
    paths = [tuple(map(str, group(item))) for item in items]
    first, sizes = {}, Counter()
    for path in paths:
        for depth in range(1, len(path) + 1):
            first.setdefault(path[:depth], len(first))
            sizes[path[:depth]] += 1
    order = sorted(range(len(items)), key=lambda n: [first[paths[n][:d]] for d in range(1, len(paths[n]) + 1)])
    return [items[n] for n in order], [paths[n] for n in order], sizes


def track(items, description, group=None):
    """Yield every item under a bar for the whole run.

    group maps an item to its path, outermost first, e.g. (pack, category,
    subcategory). Each level then gets a bar for the group being worked on, the
    items come grouped, and a ✓ line marks every finished group above the
    innermost level, so a run of any size stays readable.
    """
    items = list(items)
    items, paths, sizes = grouped(items, group or (lambda item: ()))
    depths = max(map(len, paths), default=0)
    done = Counter()
    with progress() as bars:
        overall = bars.add_task(f"[bold magenta]{escape(description)}", total=len(items))
        rows = [bars.add_task("", total=1) for _ in range(depths)]
        previous = None
        for item, path in zip(items, paths):
            for depth, row in enumerate(rows[: len(path)], 1):
                if previous is None or path[:depth] != previous[:depth]:
                    style = LEVEL_STYLES[(depth - 1) % len(LEVEL_STYLES)]
                    name = f"{'  ' * depth}[{style}]{escape(path[depth - 1])}[/]"
                    bars.reset(row, total=sizes[path[:depth]], description=name)
            previous = path
            yield item
            bars.advance(overall)
            for depth, row in enumerate(rows[: len(path)], 1):
                bars.advance(row)
                done[path[:depth]] += 1
            for depth in range(len(path) - 1, 0, -1):  # innermost first: a category ends before its pack
                if done[path[:depth]] == sizes[path[:depth]]:
                    bars.console.print(f"[green]✓[/] {escape('/'.join(path[:depth]))} [dim]{sizes[path[:depth]]}[/]")


if __name__ == "__main__":
    items = [("b", "x", 1), ("a", "y", 2), ("b", "z", 3), ("a", "y", 4), ("b", "x", 5)]
    ordered, paths, sizes = grouped(items, lambda item: item[:2])
    assert [item[2] for item in ordered] == [1, 5, 3, 2, 4], ordered
    assert sizes[("b",)] == 3 and sizes[("b", "x")] == 2 and sizes[("a", "y")] == 2
    assert [item[2] for item in track(items, "check", lambda item: item[:2])] == [1, 5, 3, 2, 4]
    assert list(track([3, 1], "check")) == [3, 1], "no group keeps the order"
    print("ok")
