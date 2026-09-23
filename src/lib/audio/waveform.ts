import { audioContext } from "kaizen-ui";

export const BAR_COUNT = 40;
const FLOOR = 0.06;

/** A level line shown while a clip decodes, or when it cannot be decoded. */
export const FLAT_PEAKS: number[] = Array.from({ length: BAR_COUNT }, () => FLOOR);

export async function decodePeaks(url: string): Promise<number[]> {
  const context = audioContext();
  if (context === null) return FLAT_PEAKS;
  try {
    const bytes = await (await fetch(url)).arrayBuffer();
    return peaksOf((await context.decodeAudioData(bytes)).getChannelData(0));
  } catch {
    return FLAT_PEAKS;
  }
}

/** RMS per bar, scaled so the loudest bar fills the height. */
export function peaksOf(samples: Float32Array, bars: number = BAR_COUNT): number[] {
  const size = Math.max(1, Math.floor(samples.length / bars));
  const peaks: number[] = [];
  for (let bar = 0; bar < bars; bar += 1) {
    let sum = 0;
    for (let i = bar * size; i < (bar + 1) * size && i < samples.length; i += 1) {
      sum += samples[i] * samples[i];
    }
    peaks.push(Math.sqrt(sum / size));
  }
  const loudest = Math.max(...peaks);
  if (loudest === 0) return peaks.map(() => FLOOR);
  return peaks.map((value) => Math.max(FLOOR, value / loudest));
}

if (import.meta.vitest) {
  const { test, expect } = import.meta.vitest;

  test("scales bars to the loudest and keeps silence visible", () => {
    const samples = new Float32Array([0, 0, 0.5, -0.5, 1, -1, 0, 0]);
    expect(peaksOf(samples, 4)).toEqual([FLOOR, 0.5, 1, FLOOR]);
    expect(peaksOf(new Float32Array(8), 4)).toEqual([FLOOR, FLOOR, FLOOR, FLOOR]);
  });
}
