const ROMAJI: Record<string, string> = {
  a: "あ", i: "い", u: "う", e: "え", o: "お",
  ka: "か", ki: "き", ku: "く", ke: "け", ko: "こ",
  ga: "が", gi: "ぎ", gu: "ぐ", ge: "げ", go: "ご",
  sa: "さ", shi: "し", si: "し", su: "す", se: "せ", so: "そ",
  za: "ざ", ji: "じ", zi: "じ", zu: "ず", ze: "ぜ", zo: "ぞ",
  ta: "た", chi: "ち", ti: "ち", tsu: "つ", tu: "つ", te: "て", to: "と",
  da: "だ", di: "ぢ", du: "づ", de: "で", do: "ど",
  na: "な", ni: "に", nu: "ぬ", ne: "ね", no: "の",
  ha: "は", hi: "ひ", fu: "ふ", hu: "ふ", he: "へ", ho: "ほ",
  ba: "ば", bi: "び", bu: "ぶ", be: "べ", bo: "ぼ",
  pa: "ぱ", pi: "ぴ", pu: "ぷ", pe: "ぺ", po: "ぽ",
  ma: "ま", mi: "み", mu: "む", me: "め", mo: "も",
  ya: "や", yu: "ゆ", yo: "よ",
  ra: "ら", ri: "り", ru: "る", re: "れ", ro: "ろ",
  wa: "わ", wo: "を", n: "ん",
  kya: "きゃ", kyu: "きゅ", kyo: "きょ",
  gya: "ぎゃ", gyu: "ぎゅ", gyo: "ぎょ",
  sha: "しゃ", shu: "しゅ", sho: "しょ",
  sya: "しゃ", syu: "しゅ", syo: "しょ",
  ja: "じゃ", ju: "じゅ", jo: "じょ",
  jya: "じゃ", jyu: "じゅ", jyo: "じょ",
  zya: "じゃ", zyu: "じゅ", zyo: "じょ",
  cha: "ちゃ", chu: "ちゅ", cho: "ちょ",
  tya: "ちゃ", tyu: "ちゅ", tyo: "ちょ",
  nya: "にゃ", nyu: "にゅ", nyo: "にょ",
  hya: "ひゃ", hyu: "ひゅ", hyo: "ひょ",
  bya: "びゃ", byu: "びゅ", byo: "びょ",
  pya: "ぴゃ", pyu: "ぴゅ", pyo: "ぴょ",
  mya: "みゃ", myu: "みゅ", myo: "みょ",
  rya: "りゃ", ryu: "りゅ", ryo: "りょ"
};

const VOWELS = "aiueo";
const KATAKANA = /[ァ-ヶ]/g;

function isVowel(letter: string | undefined): boolean {
  return letter !== undefined && VOWELS.includes(letter);
}

function startsSokuon(letters: string): boolean {
  const first = letters[0];
  if (first === undefined || first === "n" || isVowel(first)) return false;
  return first === letters[1] || (first === "t" && letters.slice(1, 3) === "ch");
}

export function katakanaToHiragana(input: string): string {
  return input.replace(KATAKANA, (glyph) =>
    String.fromCodePoint((glyph.codePointAt(0) ?? 0) - 0x60)
  );
}

export function toHiragana(input: string): string {
  const letters = input.trim().toLowerCase();
  let out = "";
  let at = 0;

  while (at < letters.length) {
    const rest = letters.slice(at);

    if (startsSokuon(rest)) {
      out += "っ";
      at += 1;
      continue;
    }

    if (rest[0] === "n" && !isVowel(rest[1]) && rest[1] !== "y") {
      out += "ん";
      at += rest[1] === "n" || rest[1] === "'" ? 2 : 1;
      continue;
    }

    const match = [3, 2, 1]
      .map((length) => rest.slice(0, length))
      .find((candidate) => candidate in ROMAJI);

    if (match === undefined) {
      out += rest[0];
      at += 1;
      continue;
    }

    out += ROMAJI[match];
    at += match.length;
  }

  return out;
}

export function normalizeReading(input: string): string {
  const trimmed = katakanaToHiragana(input.trim());
  return /^[a-zA-Z'\- ]+$/.test(trimmed) ? toHiragana(trimmed) : trimmed;
}

if (import.meta.vitest) {
  const { describe, test, expect } = import.meta.vitest;

  describe("turning typed romaji into hiragana", () => {
    test("writes a small ya as one sound with the consonant before it", () => {
      expect(toHiragana("sha")).toBe("しゃ");
      expect(toHiragana("sya")).toBe("しゃ");
      expect(toHiragana("ryokou")).toBe("りょこう");
      expect(toHiragana("byouin")).toBe("びょういん");
    });

    test("writes a doubled consonant as a small tsu", () => {
      expect(toHiragana("kitte")).toBe("きって");
      expect(toHiragana("gakkou")).toBe("がっこう");
      expect(toHiragana("matcha")).toBe("まっちゃ");
      expect(toHiragana("issho")).toBe("いっしょ");
    });

    test("tells n before a vowel from the standalone n", () => {
      expect(toHiragana("na")).toBe("な");
      expect(toHiragana("kin'en")).toBe("きんえん");
      expect(toHiragana("kinnen")).toBe("きんえん");
      expect(toHiragana("hon")).toBe("ほん");
      expect(toHiragana("nihon")).toBe("にほん");
      expect(toHiragana("nyuugaku")).toBe("にゅうがく");
    });

    test("writes a long vowel with the letters that were typed", () => {
      expect(toHiragana("toukyou")).toBe("とうきょう");
      expect(toHiragana("ookii")).toBe("おおきい");
      expect(toHiragana("obaasan")).toBe("おばあさん");
      expect(toHiragana("yuubinkyoku")).toBe("ゆうびんきょく");
    });
  });

  describe("normalising whatever the learner typed", () => {
    test("leaves kana from an input method alone", () => {
      expect(normalizeReading(" がっこう ")).toBe("がっこう");
      expect(normalizeReading("せんせい")).toBe("せんせい");
    });

    test("reads katakana as the hiragana it sounds like", () => {
      expect(normalizeReading("ガッコウ")).toBe("がっこう");
    });

    test("converts romaji", () => {
      expect(normalizeReading("Gakkou")).toBe("がっこう");
    });
  });
}
