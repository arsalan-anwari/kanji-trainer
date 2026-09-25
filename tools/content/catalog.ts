import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  byShelf,
  parseCatalog,
  parsePackMeta,
  type CatalogEntry,
  type PackMeta
} from "../../src/lib/packs/catalog.ts";
import { packOutput, PACKS_DIR } from "./build.ts";

export const DATA_DIR = fileURLToPath(new URL("../../data/", import.meta.url));

export const ARCHIVES_DIR = join(DATA_DIR, "archives");

export const TAR_FLAGS = [
  "--sort=name",
  "--mtime=@0",
  "--owner=0",
  "--group=0",
  "--numeric-owner",
  "--mode=a+rX,u+w,go-w",
  "--format=gnu"
];

export function catalogEntry(meta: PackMeta, archive: Uint8Array): CatalogEntry {
  return {
    ...meta,
    bytes: archive.byteLength,
    sha256: createHash("sha256").update(archive).digest("hex"),
    archive: `archives/${meta.id}.tar`
  };
}

function archivePack(id: string): CatalogEntry {
  const meta = parsePackMeta(JSON.parse(readFileSync(join(packOutput(id), "pack.json"), "utf8")));
  if (meta === null || meta.id !== id) {
    throw new Error(`data/packs/${id}/pack.json is not a built pack; run "npm run content:build"`);
  }
  const path = join(ARCHIVES_DIR, `${id}.tar`);
  execFileSync("tar", [...TAR_FLAGS, "-cf", path, "-C", packOutput(id), "."]);
  return catalogEntry(meta, readFileSync(path));
}

function main(): void {
  mkdirSync(ARCHIVES_DIR, { recursive: true });
  const ids: unknown = JSON.parse(readFileSync(join(PACKS_DIR, "index.json"), "utf8"));
  if (!Array.isArray(ids) || !ids.every((id) => typeof id === "string")) {
    throw new Error("data/packs/index.json is not a list of pack ids");
  }
  const packs = ids.map(archivePack).sort(byShelf);
  writeFileSync(join(DATA_DIR, "catalog.json"), `${JSON.stringify({ packs }, null, 2)}\n`);
  for (const pack of packs) {
    process.stdout.write(`${pack.id.padEnd(16)} ${(pack.bytes / 1e6).toFixed(1).padStart(6)} MB  ${pack.sha256}\n`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

if (import.meta.vitest) {
  const { test, expect } = import.meta.vitest;

  const meta: PackMeta = {
    id: "n5-base",
    level: "N5",
    theme: "base",
    version: "1.0.0",
    title: "JLPT N5",
    taxonomy: 1,
    words: 184,
    kanji: 79,
    description: "description.md"
  };

  test("lists an archive by its size and hash, in a form the app accepts", () => {
    const entry = catalogEntry(meta, new TextEncoder().encode("abc"));
    expect(entry.bytes).toBe(3);
    expect(entry.sha256).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(parseCatalog({ packs: [entry] })).toEqual([entry]);
  });

  test("gives the same archive bytes the same hash, so an untouched pack never shows an update", () => {
    const bytes = new Uint8Array([1, 2, 3]);
    expect(catalogEntry(meta, bytes).sha256).toBe(catalogEntry(meta, bytes.slice()).sha256);
  });
}
