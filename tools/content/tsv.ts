export function parseTsv(
  text: string,
  columns: readonly string[],
  where: string
): string[][] {
  const lines = text.split("\n").map((line) => line.replace(/\r$/, ""));
  const found = lines[0].split("\t");
  if (found.length !== columns.length || found.some((cell, index) => cell !== columns[index])) {
    throw new Error(
      `${where}: header must be exactly "${columns.join("\\t")}", found "${found.join("\\t")}"`
    );
  }
  const rows: string[][] = [];
  const problems: string[] = [];
  lines.slice(1).forEach((line, index) => {
    if (line === "") {
      return;
    }
    const cells = line.split("\t");
    if (cells.length !== columns.length) {
      problems.push(
        `${where} line ${index + 2}: expected ${columns.length} columns, found ${cells.length}`
      );
      return;
    }
    rows.push(cells);
  });
  if (problems.length > 0) {
    throw new Error(problems.join("\n"));
  }
  return rows;
}

if (import.meta.vitest) {
  const { describe, test, expect } = import.meta.vitest;

  const columns = ["character", "level"] as const;

  describe("parseTsv", () => {
    test("reads the rows under a matching header", () => {
      expect(parseTsv("character\tlevel\n日\tN5\n月\tN5\n", columns, "t")).toEqual([
        ["日", "N5"],
        ["月", "N5"]
      ]);
    });

    test("tolerates the CRLF a spreadsheet writes", () => {
      expect(parseTsv("character\tlevel\r\n日\tN5\r\n", columns, "t")).toEqual([["日", "N5"]]);
    });

    test("ignores blank lines rather than reading them as rows", () => {
      expect(parseTsv("character\tlevel\n\n日\tN5\n\n", columns, "t")).toEqual([["日", "N5"]]);
    });

    test("keeps an empty trailing cell instead of dropping the column", () => {
      expect(parseTsv("a\tb\n1\t\n", ["a", "b"], "t")).toEqual([["1", ""]]);
    });

    test("rejects a header whose columns are in the wrong order", () => {
      expect(() => parseTsv("level\tcharacter\n", columns, "t")).toThrow(/header must be exactly/);
    });

    test("names the line of a row with too few columns", () => {
      expect(() => parseTsv("character\tlevel\n日\tN5\n月\n", columns, "t")).toThrow(
        /line 3: expected 2 columns, found 1/
      );
    });

    test("rejects an empty file", () => {
      expect(() => parseTsv("", columns, "t")).toThrow(/header must be exactly/);
    });
  });

}
