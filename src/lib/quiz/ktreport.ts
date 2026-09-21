import { t } from "../i18n.svelte";
import { parseReport, type Report } from "./report";

export const FILE_EXTENSION = "kj-report";
export const FILE_VERSION = 1;

const MAGIC = "KJREPORT";
const HEADER_BYTES = 24;

export class ReportFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReportFileError";
  }
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export function encodeReportFile(reports: readonly Report[]): Uint8Array {
  const encoder = new TextEncoder();
  const records = reports.map((report) => encoder.encode(JSON.stringify(report)));
  const payloadBytes = records.reduce((sum, record) => sum + 4 + record.length, 0);

  const buffer = new ArrayBuffer(HEADER_BYTES + payloadBytes);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  for (let index = 0; index < MAGIC.length; index += 1) {
    view.setUint8(index, MAGIC.charCodeAt(index));
  }
  view.setUint8(8, FILE_VERSION);
  view.setUint8(9, 0);
  view.setUint16(10, 0, true);
  view.setUint32(12, records.length, true);
  view.setUint32(16, payloadBytes, true);

  let offset = HEADER_BYTES;
  for (const record of records) {
    view.setUint32(offset, record.length, true);
    bytes.set(record, offset + 4);
    offset += 4 + record.length;
  }

  view.setUint32(20, crc32(bytes.subarray(HEADER_BYTES)), true);
  return bytes;
}

export function decodeReportFile(bytes: Uint8Array): Report[] {
  if (bytes.length < HEADER_BYTES) {
    throw new ReportFileError(t("common.file.tooShort"));
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let index = 0; index < MAGIC.length; index += 1) {
    if (view.getUint8(index) !== MAGIC.charCodeAt(index)) {
      throw new ReportFileError(t("common.file.notReport"));
    }
  }

  const version = view.getUint8(8);
  if (version > FILE_VERSION) {
    throw new ReportFileError(t("common.file.newer", { version }));
  }

  const count = view.getUint32(12, true);
  const payloadBytes = view.getUint32(16, true);
  const checksum = view.getUint32(20, true);
  if (bytes.length !== HEADER_BYTES + payloadBytes) {
    throw new ReportFileError(t("common.file.incomplete"));
  }

  const payload = bytes.subarray(HEADER_BYTES);
  if (crc32(payload) !== checksum) {
    throw new ReportFileError(t("common.file.damaged"));
  }

  const decoder = new TextDecoder();
  const reports: Report[] = [];
  let offset = 0;
  for (let index = 0; index < count; index += 1) {
    if (offset + 4 > payload.length) {
      throw new ReportFileError(t("common.file.incomplete"));
    }
    const length = new DataView(payload.buffer, payload.byteOffset + offset, 4).getUint32(0, true);
    offset += 4;
    if (offset + length > payload.length) {
      throw new ReportFileError(t("common.file.incomplete"));
    }
    let value: unknown;
    try {
      value = JSON.parse(decoder.decode(payload.subarray(offset, offset + length)));
    } catch {
      throw new ReportFileError(t("common.file.badRun"));
    }
    const report = parseReport(value);
    if (report === null) {
      throw new ReportFileError(t("common.file.badRun"));
    }
    reports.push(report);
    offset += length;
  }

  return reports;
}

if (import.meta.vitest) {
  const { describe, test, expect } = import.meta.vitest;
  const { DEFAULT_SETTINGS } = await import("./settings");

  function report(id: string, createdAt: string): Report {
    return {
      id,
      createdAt,
      durationMs: 42_000,
      settings: { ...DEFAULT_SETTINGS, sets: ["numbers"] },
      answers: [
        { wordId: "一|いち", correct: true, elapsedMs: 900, given: "いち" },
        { wordId: "二|に", correct: false, elapsedMs: 5000, given: "ふた" }
      ]
    };
  }

  const runs = [report("aaa-1", "2026-08-20T10:00:00.000Z"), report("bbb-2", "2026-08-21T10:00:00.000Z")];

  describe("kj-report files", () => {
    test("round trips a batch of runs", () => {
      expect(decodeReportFile(encodeReportFile(runs))).toEqual(runs);
    });

    test("round trips an empty file", () => {
      expect(decodeReportFile(encodeReportFile([]))).toEqual([]);
    });

    test("survives characters outside ascii", () => {
      const run = report("ccc-3", "2026-08-21T11:00:00.000Z");
      run.answers[0]!.given = "きゃ";
      expect(decodeReportFile(encodeReportFile([run]))[0]!.answers[0]!.given).toBe("きゃ");
    });

    test("writes the magic, version and run count into the header", () => {
      const bytes = encodeReportFile(runs);
      const view = new DataView(bytes.buffer);
      expect(String.fromCharCode(...bytes.subarray(0, 8))).toBe("KJREPORT");
      expect(view.getUint8(8)).toBe(FILE_VERSION);
      expect(view.getUint32(12, true)).toBe(2);
    });

    test("accepts a file written by an older but still known version", () => {
      const bytes = encodeReportFile(runs);
      expect(() => decodeReportFile(bytes)).not.toThrow();
    });

    test("rejects a file that is not one of ours", () => {
      const bytes = new TextEncoder().encode('{"id":"aaa-1","answers":[]}');
      expect(() => decodeReportFile(bytes)).toThrow(ReportFileError);
    });

    test("rejects a file shorter than a header", () => {
      expect(() => decodeReportFile(new Uint8Array(8))).toThrow(ReportFileError);
    });

    test("rejects a newer format version", () => {
      const bytes = encodeReportFile(runs);
      bytes[8] = FILE_VERSION + 1;
      expect(() => decodeReportFile(bytes)).toThrow(ReportFileError);
    });

    test("rejects a file with a flipped byte", () => {
      const bytes = encodeReportFile(runs);
      bytes[bytes.length - 5] ^= 0xff;
      expect(() => decodeReportFile(bytes)).toThrow(ReportFileError);
    });

    test("rejects a truncated file", () => {
      const bytes = encodeReportFile(runs);
      expect(() => decodeReportFile(bytes.subarray(0, bytes.length - 10))).toThrow(ReportFileError);
    });

    test("rejects a record that is not a run", () => {
      const bogus = [{ id: "aaa-1", nope: true }] as unknown as Report[];
      expect(() => decodeReportFile(encodeReportFile(bogus))).toThrow(ReportFileError);
    });
  });
}
