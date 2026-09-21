import type { FanfareGrade } from "kaizen-ui";
import { t } from "../i18n.svelte";

const emoji: Record<FanfareGrade, string> = {
  perfect: "🏆",
  great: "🎉",
  good: "👏",
  fair: "💪",
  poor: "📚"
};

export function scoreTier(accuracy: number, total = 1): FanfareGrade {
  if (total === 0) return "poor";
  if (accuracy >= 1) return "perfect";
  if (accuracy >= 0.9) return "great";
  if (accuracy >= 0.75) return "good";
  if (accuracy >= 0.5) return "fair";
  return "poor";
}

export function tierHeadline(tier: FanfareGrade): string {
  return t(`result.tier.${tier}`);
}

export function tierEmoji(tier: FanfareGrade): string {
  return emoji[tier];
}

export function tierBlurb(tier: FanfareGrade): string {
  return t(`result.blurb.${tier}`);
}
