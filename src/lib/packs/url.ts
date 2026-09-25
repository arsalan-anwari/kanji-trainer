type Media = { set: string; subcategory: string; file: string };

let root = "/packs";

export function setPackRoot(url: string): void {
  root = url.replace(/\/+$/, "");
}

export function packUrl(pack: string, path: string): string {
  return `${root}/${pack}/${path}`;
}

export function imagePath(word: Media): string {
  return `images/${word.set}/${word.subcategory}/${word.file}.webp`;
}

export function audioPath(word: Media): string {
  return `audio/${word.set}/${word.subcategory}/${word.file}.mp3`;
}

if (import.meta.vitest) {
  const { test, expect, afterEach } = import.meta.vitest;

  afterEach(() => setPackRoot("/packs"));

  test("serves a pack from the dev server's packs folder by default", () => {
    expect(packUrl("n5-base", "content.json")).toBe("/packs/n5-base/content.json");
  });

  test("serves a pack from wherever the app installed it", () => {
    setPackRoot("asset://localhost/%2Fdata%2Fpacks/");
    expect(packUrl("n5-base", "audio/a.mp3")).toBe("asset://localhost/%2Fdata%2Fpacks/n5-base/audio/a.mp3");
  });
}
