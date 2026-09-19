import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Source } from "../../src/lib/content/types.ts";

export type SourceFile = {
  url: string;
  sha256: string;
  as: string;
};

export type ManifestSource = Source & {
  files: SourceFile[];
};

export type Manifest = {
  sources: ManifestSource[];
};

export const MANIFEST_PATH = fileURLToPath(
  new URL("../../content/sources.json", import.meta.url)
);

const SHA256_HEX = /^[0-9a-f]{64}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(
  record: Record<string, unknown>,
  key: string,
  where: string
): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${where}: "${key}" must be a non-empty string`);
  }
  return value;
}

function parseSourceFile(value: unknown, where: string): SourceFile {
  if (!isRecord(value)) {
    throw new Error(`${where}: must be an object`);
  }
  const sha256 = requireString(value, "sha256", where);
  if (!SHA256_HEX.test(sha256)) {
    throw new Error(`${where}: "sha256" must be 64 lowercase hex digits`);
  }
  return {
    url: requireString(value, "url", where),
    sha256,
    as: requireString(value, "as", where)
  };
}

function parseSource(value: unknown, where: string): ManifestSource {
  if (!isRecord(value)) {
    throw new Error(`${where}: must be an object`);
  }
  const id = requireString(value, "id", where);
  const files = value.files;
  if (!Array.isArray(files)) {
    throw new Error(`${where}: "files" must be an array`);
  }
  return {
    id,
    title: requireString(value, "title", where),
    url: requireString(value, "url", where),
    licence: requireString(value, "licence", where),
    licenceUrl: requireString(value, "licenceUrl", where),
    version: requireString(value, "version", where),
    files: files.map((file, index) =>
      parseSourceFile(file, `${where} file ${index}`)
    )
  };
}

export function parseManifest(value: unknown): Manifest {
  if (!isRecord(value)) {
    throw new Error("sources manifest: must be an object");
  }
  const sources = value.sources;
  if (!Array.isArray(sources) || sources.length === 0) {
    throw new Error('sources manifest: "sources" must be a non-empty array');
  }
  const parsed = sources.map((source, index) =>
    parseSource(source, `sources manifest source ${index}`)
  );
  const seen = new Set<string>();
  for (const source of parsed) {
    if (seen.has(source.id)) {
      throw new Error(`sources manifest: duplicate source id "${source.id}"`);
    }
    seen.add(source.id);
  }
  const destinations = new Set<string>();
  for (const source of parsed) {
    for (const file of source.files) {
      if (destinations.has(file.as)) {
        throw new Error(`sources manifest: two files share destination "${file.as}"`);
      }
      destinations.add(file.as);
    }
  }
  return { sources: parsed };
}

export function loadManifest(path: string = MANIFEST_PATH): Manifest {
  return parseManifest(JSON.parse(readFileSync(path, "utf8")));
}

if (import.meta.vitest) {
  const { describe, test, expect } = import.meta.vitest;

  const source: ManifestSource = {
    id: "a",
    title: "A",
    url: "https://example.test/a",
    licence: "CC BY",
    licenceUrl: "https://example.test/licence",
    version: "1",
    files: []
  };
  const minimal: Manifest = { sources: [source] };

  describe("parseManifest", () => {
    test("accepts a source with no downloadable files", () => {
      expect(parseManifest(minimal).sources[0].files).toEqual([]);
    });

    test("rejects a source missing a licence url", () => {
      const broken = structuredClone(minimal);
      Reflect.deleteProperty(broken.sources[0], "licenceUrl");
      expect(() => parseManifest(broken)).toThrow(/licenceUrl/);
    });

    test("rejects a checksum that is not 64 hex digits", () => {
      const broken = structuredClone(minimal);
      broken.sources[0].files = [
        { url: "https://example.test/f", sha256: "abc", as: "f" }
      ];
      expect(() => parseManifest(broken)).toThrow(/64 lowercase hex/);
    });

    test("rejects two sources claiming the same id", () => {
      const broken: Manifest = { sources: [source, source] };
      expect(() => parseManifest(broken)).toThrow(/duplicate source id "a"/);
    });

    test("rejects two files that would overwrite one cache entry", () => {
      const broken = structuredClone(minimal);
      const file = {
        url: "https://example.test/f",
        sha256: "0".repeat(64),
        as: "same.json"
      };
      broken.sources[0].files = [file, { ...file, url: "https://example.test/g" }];
      expect(() => parseManifest(broken)).toThrow(/share destination "same.json"/);
    });
  });

  describe("the committed manifest", () => {
    const manifest = loadManifest();

    test("parses and pins every remote file to a checksum", () => {
      const remote = manifest.sources.flatMap((source) => source.files);
      expect(remote.length).toBeGreaterThan(0);
      for (const file of remote) {
        expect(file.sha256).toMatch(SHA256_HEX);
      }
    });

    test("pins the jmdict and kradfile releases to the same version", () => {
      const versionOf = (id: string) =>
        manifest.sources.find((source) => source.id === id)?.version;
      expect(versionOf("jmdict")).toBe(versionOf("kradfile"));
    });
  });
}
