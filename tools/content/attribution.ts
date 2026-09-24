import type { Source } from "../../src/lib/content/types.ts";

const SHARE_ALIKE = "CC BY-SA 4.0";
const SHARE_ALIKE_URL = "https://creativecommons.org/licenses/by-sa/4.0/";

export function renderAttribution(sources: readonly Source[]): string {
  const lines = [
    "# Attribution",
    "",
    "The content files in this directory are generated from the sources below.",
    `They are licensed ${SHARE_ALIKE}; see LICENSE in this directory.`,
    "",
    "This file is generated from `data/overlay/shared/sources.json`. Do not edit it by hand:",
    "`npm run content:build` overwrites it.",
    ""
  ];

  for (const source of sources) {
    lines.push(
      `## ${source.title}`,
      "",
      `- Source: <${source.url}>`,
      `- Licence: ${source.licence} <${source.licenceUrl}>`,
      `- Version ingested: ${source.version}`,
      ""
    );
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

export function renderLicence(sources: readonly Source[]): string {
  const shareAlike = sources.filter((source) => source.licence === SHARE_ALIKE);
  const lines = [
    `The content files in this directory are licensed ${SHARE_ALIKE}.`,
    "",
    `<${SHARE_ALIKE_URL}>`,
    ""
  ];

  if (shareAlike.length > 0) {
    lines.push(
      "They are derived from material under that licence, whose share-alike term",
      "carries forward to anything built from it:",
      ""
    );
    for (const source of shareAlike) {
      lines.push(`- ${source.title}: <${source.licenceUrl}>`);
    }
    lines.push("");
  }

  lines.push(
    "This applies to the content only. The application that reads it is licensed",
    "separately; see the LICENSE file at the root of the repository.",
    "",
    "Per-source attribution, which this licence requires, is in ATTRIBUTION.md",
    "next to this file. Both files are generated from data/overlay/shared/sources.json."
  );

  return `${lines.join("\n").trimEnd()}\n`;
}

if (import.meta.vitest) {
  const { describe, test, expect } = import.meta.vitest;

  const source = (id: string, licence: string): Source => ({
    id,
    title: `Title of ${id}`,
    url: `https://example.test/${id}`,
    licence,
    licenceUrl: `https://example.test/${id}/licence`,
    version: `${id}-1.0`
  });

  describe("renderAttribution", () => {
    test("gives every source its url, licence, licence url and version", () => {
      const sources = [source("a", "CC BY"), source("b", "CC BY-SA 4.0")];
      const text = renderAttribution(sources);
      for (const entry of sources) {
        expect(text).toContain(entry.title);
        expect(text).toContain(entry.url);
        expect(text).toContain(entry.licence);
        expect(text).toContain(entry.licenceUrl);
        expect(text).toContain(entry.version);
      }
    });

    test("mentions a source added to the manifest without any other edit", () => {
      const before = renderAttribution([source("a", "CC BY")]);
      const after = renderAttribution([source("a", "CC BY"), source("kanjidic2", "CC BY-SA 4.0")]);
      expect(before).not.toContain("kanjidic2");
      expect(after).toContain("Title of kanjidic2");
    });

    test("ends with exactly one newline", () => {
      expect(renderAttribution([source("a", "CC BY")])).toMatch(/[^\n]\n$/);
    });
  });

  describe("renderLicence", () => {
    test("names the share-alike sources that force the content licence", () => {
      const text = renderLicence([source("a", "CC BY"), source("b", "CC BY-SA 4.0")]);
      expect(text).toContain("Title of b");
      expect(text).not.toContain("Title of a");
    });

    test("keeps the content licence separate from the application licence", () => {
      expect(renderLicence([source("b", "CC BY-SA 4.0")])).toContain(
        "root of the repository"
      );
    });
  });
}
