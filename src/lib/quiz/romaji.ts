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

const KANA: Record<string, string> = {};
for (const [letters, kana] of Object.entries(ROMAJI)) {
  if (!(kana in KANA)) KANA[kana] = letters;
}

function lastVowel(letters: string): string {
  for (let at = letters.length - 1; at >= 0; at -= 1) {
    if (isVowel(letters[at])) return letters[at];
  }
  return "";
}

function romajiSyllables(input: string): string[] {
  const kana = katakanaToHiragana(input.trim());
  const out: string[] = [];
  let at = 0;

  while (at < kana.length) {
    if (kana[at] === "っ") {
      const next = KANA[kana.slice(at + 1, at + 3)] ?? KANA[kana[at + 1]] ?? "";
      const doubled = next.startsWith("ch") ? "t" : next === "" || isVowel(next[0]) ? "" : next[0];
      if (doubled !== "") out.push(doubled);
      at += 1;
      continue;
    }

    if (kana[at] === "ー") {
      out.push(lastVowel(out.at(-1) ?? ""));
      at += 1;
      continue;
    }

    const pair = KANA[kana.slice(at, at + 2)];
    if (pair !== undefined) {
      out.push(pair);
      at += 2;
      continue;
    }

    out.push(KANA[kana[at]] ?? kana[at]);
    at += 1;
  }

  return out;
}

export function toRomaji(input: string): string {
  return romajiSyllables(input).join("");
}

export function toRomajiHint(input: string): string {
  return romajiSyllables(input).join("-");
}

const PARTICLES: Record<string, string> = { は: "wa", へ: "e", を: "o" };
const GREETING = /(にち|ばん)は$/;
const PUNCTUATION: Record<string, string> = { "。": ".", "、": ",", "？": "?", "！": "!" };

/**
 * Romaji of a sentence written in kana with a space between words. は, へ and
 * を standing alone are particles, read wa, e and o.
 */
export function sentenceRomaji(kana: string): string {
  const words = kana
    .replace(/([。、？！])/g, "$1 ")
    .trim()
    .split(/\s+/)
    .map((word) => {
      const bare = word.replace(/[。、？！]/g, "");
      const marks = word.slice(bare.length).replace(/./g, (mark) => PUNCTUATION[mark] ?? mark);
      const spoken = PARTICLES[bare] ?? (GREETING.test(bare) ? `${toRomaji(bare.slice(0, -1))}wa` : toRomaji(bare));
      return spoken + marks;
    })
    .join(" ")
    // A closing か asks a question, which romaji marks the English way.
    .replace(/ ka\./g, " ka?");
  return words.charAt(0).toUpperCase() + words.slice(1);
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

  describe("writing kana back as romaji", () => {
    test("spells a small ya as one sound with the consonant before it", () => {
      expect(toRomaji("しゃ")).toBe("sha");
      expect(toRomaji("りょこう")).toBe("ryokou");
      expect(toRomaji("びょういん")).toBe("byouin");
    });

    test("spells a small tsu as the consonant that follows it", () => {
      expect(toRomaji("がっこう")).toBe("gakkou");
      expect(toRomaji("まっちゃ")).toBe("matcha");
      expect(toRomaji("きって")).toBe("kitte");
    });

    test("reads a spaced sentence, its particles and its punctuation", () => {
      expect(sentenceRomaji("わたし は がっこう へ いきます。")).toBe("Watashi wa gakkou e ikimasu.");
      expect(sentenceRomaji("パン を たべます か？")).toBe("Pan o tabemasu ka?");
      expect(sentenceRomaji("こんにちは、たなかさん。")).toBe("Konnichiwa, tanakasan.");
      expect(sentenceRomaji("えき は どこ です か。")).toBe("Eki wa doko desu ka?");
    });

    test("reads katakana and its long vowel mark", () => {
      expect(toRomaji("コーヒー")).toBe("koohii");
    });

    test("comes back to the kana it was written from", () => {
      for (const reading of ["がっこう", "せんせい", "りょこう", "にほん", "ひとつ", "まっちゃ"]) {
        expect(toHiragana(toRomaji(reading))).toBe(reading);
      }
    });
  });

  describe("spelling romaji as one hyphenated sound per kana", () => {
    test("separates each kana character with a hyphen", () => {
      expect(toRomajiHint("がっこう")).toBe("ga-k-ko-u");
      expect(toRomajiHint("しゃしん")).toBe("sha-shi-n");
      expect(toRomajiHint("コーヒー")).toBe("ko-o-hi-i");
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
