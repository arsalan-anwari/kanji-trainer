export type Inline = { text: string; bold: boolean };

export type Block =
  | { kind: "heading"; level: 1 | 2 | 3; parts: Inline[] }
  | { kind: "paragraph"; parts: Inline[] }
  | { kind: "list"; ordered: boolean; items: Inline[][] };

const HEADING = /^(#{1,6})\s+(.*)$/;
const BULLET = /^[-*]\s+(.*)$/;
const NUMBERED = /^\d+[.)]\s+(.*)$/;

export function inline(text: string): Inline[] {
  const parts: Inline[] = [];
  text.split("**").forEach((piece, index, pieces) => {
    const bold = index % 2 === 1 && index < pieces.length - 1;
    const chunk = index % 2 === 1 && !bold ? `**${piece}` : piece;
    if (chunk === "") return;
    const last = parts.at(-1);
    if (last !== undefined && last.bold === bold) last.text += chunk;
    else parts.push({ text: chunk, bold });
  });
  return parts;
}

export function parseMarkdown(source: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];

  const flush = (): void => {
    if (paragraph.length > 0) blocks.push({ kind: "paragraph", parts: inline(paragraph.join(" ")) });
    paragraph = [];
  };

  const addItem = (ordered: boolean, text: string): void => {
    flush();
    const last = blocks.at(-1);
    if (last?.kind === "list" && last.ordered === ordered) last.items.push(inline(text));
    else blocks.push({ kind: "list", ordered, items: [inline(text)] });
  };

  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();
    const heading = HEADING.exec(line);
    const bullet = BULLET.exec(line);
    const numbered = NUMBERED.exec(line);
    if (line === "") {
      flush();
    } else if (heading !== null) {
      flush();
      const depth = heading[1].length;
      const level = depth === 1 ? 1 : depth === 2 ? 2 : 3;
      blocks.push({ kind: "heading", level, parts: inline(heading[2]) });
    } else if (bullet !== null) {
      addItem(false, bullet[1]);
    } else if (numbered !== null) {
      addItem(true, numbered[1]);
    } else {
      paragraph.push(line);
    }
  }
  flush();
  return blocks;
}

if (import.meta.vitest) {
  const { describe, test, expect } = import.meta.vitest;

  describe("reading a pack description", () => {
    test("turns headings, lists and paragraphs into blocks", () => {
      const blocks = parseMarkdown("# N5\n\nThe first level.\nStill the same paragraph.\n\n- one\n- two\n\n1. first");
      expect(blocks).toEqual([
        { kind: "heading", level: 1, parts: [{ text: "N5", bold: false }] },
        { kind: "paragraph", parts: [{ text: "The first level. Still the same paragraph.", bold: false }] },
        { kind: "list", ordered: false, items: [[{ text: "one", bold: false }], [{ text: "two", bold: false }]] },
        { kind: "list", ordered: true, items: [[{ text: "first", bold: false }]] }
      ]);
    });

    test("marks bold runs and leaves an unclosed marker as text", () => {
      expect(inline("**79 kanji**, each")).toEqual([
        { text: "79 kanji", bold: true },
        { text: ", each", bold: false }
      ]);
      expect(inline("a ** b")).toEqual([{ text: "a ** b", bold: false }]);
    });

    test("keeps markup it does not know as plain text, never as html", () => {
      const [block] = parseMarkdown("<script>alert(1)</script> [link](x)");
      expect(block).toEqual({
        kind: "paragraph",
        parts: [{ text: "<script>alert(1)</script> [link](x)", bold: false }]
      });
    });

    test("folds deep headings into the third level", () => {
      expect(parseMarkdown("#### deep")[0]).toMatchObject({ kind: "heading", level: 3 });
    });

    test("starts a new list when the kind changes", () => {
      expect(parseMarkdown("- a\n1. b").map((block) => block.kind)).toEqual(["list", "list"]);
    });
  });
}
