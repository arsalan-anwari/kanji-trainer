import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync, gzipSync } from "node:zlib";
import { loadManifest } from "./sources.ts";
import type { SourceFile } from "./sources.ts";

export const CACHE_DIR = fileURLToPath(new URL("../../.cache/content/", import.meta.url));
export const ARCHIVE_DIR = join(CACHE_DIR, "archive");

const TAR_BLOCK = 512;

export function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function readNulTerminated(block: Uint8Array, start: number, length: number): string {
  const field = block.subarray(start, start + length);
  const end = field.indexOf(0);
  return new TextDecoder().decode(end === -1 ? field : field.subarray(0, end));
}

export function readSingleTarEntry(tar: Uint8Array): Uint8Array {
  let offset = 0;
  while (offset + TAR_BLOCK <= tar.length) {
    const name = readNulTerminated(tar, offset, 100);
    if (name === "") {
      break;
    }
    const size = Number.parseInt(readNulTerminated(tar, offset + 124, 12).trim(), 8);
    if (!Number.isFinite(size) || size < 0) {
      throw new Error(`tar entry "${name}" has an unreadable size field`);
    }
    const type = readNulTerminated(tar, offset + 156, 1);
    const start = offset + TAR_BLOCK;
    if (type === "" || type === "0") {
      return tar.subarray(start, start + size);
    }
    offset = start + Math.ceil(size / TAR_BLOCK) * TAR_BLOCK;
  }
  throw new Error("tar archive contains no regular file");
}

export function unpack(url: string, bytes: Uint8Array): Uint8Array {
  if (url.endsWith(".tgz")) return readSingleTarEntry(gunzipSync(bytes));
  return url.endsWith(".gz") ? gunzipSync(bytes) : bytes;
}

async function download(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url}: ${response.status} ${response.statusText}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

type FetchOutcome = {
  as: string;
  sha256: string;
  from: "cache" | "network";
};

async function fetchFile(file: SourceFile): Promise<FetchOutcome> {
  const archivePath = join(ARCHIVE_DIR, `${file.as}.download`);
  let archive = existsSync(archivePath) ? readFileSync(archivePath) : null;
  let from: FetchOutcome["from"] = "cache";

  if (archive === null || sha256(archive) !== file.sha256) {
    archive = Buffer.from(await download(file.url));
    const actual = sha256(archive);
    if (actual !== file.sha256) {
      throw new Error(
        `${file.url}: checksum mismatch\n  expected ${file.sha256}\n  actual   ${actual}`
      );
    }
    writeFileSync(archivePath, archive);
    from = "network";
  }

  writeFileSync(join(CACHE_DIR, file.as), unpack(file.url, archive));
  return { as: file.as, sha256: file.sha256, from };
}

async function main(): Promise<void> {
  mkdirSync(ARCHIVE_DIR, { recursive: true });
  const manifest = loadManifest();
  for (const source of manifest.sources) {
    for (const file of source.files) {
      const outcome = await fetchFile(file);
      process.stdout.write(
        `${source.id.padEnd(10)} ${outcome.sha256} ${outcome.from.padEnd(7)} ${outcome.as}\n`
      );
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}

if (import.meta.vitest) {
  const { describe, test, expect } = import.meta.vitest;

  const octal = (value: number, width: number) =>
    value.toString(8).padStart(width - 1, "0") + "\0";

  const tarOf = (entries: { name: string; body: string; type: string }[]) => {
    const blocks: Uint8Array[] = [];
    const encoder = new TextEncoder();
    for (const entry of entries) {
      const body = encoder.encode(entry.body);
      const header = new Uint8Array(TAR_BLOCK);
      header.set(encoder.encode(entry.name), 0);
      header.set(encoder.encode(octal(body.length, 12)), 124);
      header.set(encoder.encode(entry.type), 156);
      const padded = new Uint8Array(Math.ceil(body.length / TAR_BLOCK) * TAR_BLOCK);
      padded.set(body, 0);
      blocks.push(header, padded);
    }
    blocks.push(new Uint8Array(TAR_BLOCK * 2));
    return Buffer.concat(blocks);
  };

  describe("readSingleTarEntry", () => {
    test("returns the body of a lone regular file", () => {
      const tar = tarOf([{ name: "a.json", body: '{"v":1}', type: "0" }]);
      expect(new TextDecoder().decode(readSingleTarEntry(tar))).toBe('{"v":1}');
    });

    test("skips a leading directory entry", () => {
      const tar = tarOf([
        { name: "dir/", body: "", type: "5" },
        { name: "dir/a.json", body: "payload", type: "0" }
      ]);
      expect(new TextDecoder().decode(readSingleTarEntry(tar))).toBe("payload");
    });

    test("reads a body longer than one block without truncating it", () => {
      const body = "x".repeat(TAR_BLOCK + 7);
      const tar = tarOf([{ name: "a.json", body, type: "0" }]);
      expect(readSingleTarEntry(tar).length).toBe(body.length);
    });

    test("treats a type flag of NUL as a regular file", () => {
      const tar = tarOf([{ name: "a.json", body: "old", type: "\0" }]);
      expect(new TextDecoder().decode(readSingleTarEntry(tar))).toBe("old");
    });

    test("refuses an archive holding only directories", () => {
      const tar = tarOf([{ name: "dir/", body: "", type: "5" }]);
      expect(() => readSingleTarEntry(tar)).toThrow(/no regular file/);
    });
  });

  describe("unpack", () => {
    test("passes a plain file through unchanged", () => {
      const bytes = new TextEncoder().encode("a,b\n1,2\n");
      expect(unpack("https://example.test/x.csv", bytes)).toBe(bytes);
    });
  });

  describe("unpack a gzip", () => {
    test("inflates a lone gzipped file", () => {
      const bytes = new TextEncoder().encode("<kanjivg/>");
      expect(new TextDecoder().decode(unpack("https://example.test/x.xml.gz", gzipSync(bytes)))).toBe("<kanjivg/>");
    });
  });

  describe("sha256", () => {
    test("hashes the empty input to the known digest", () => {
      expect(sha256(new Uint8Array())).toBe(
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
      );
    });
  });
}
