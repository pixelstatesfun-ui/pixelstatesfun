import { t } from 'ttag';

export const PIXEL_RANKS = [
  ['Recruit', 0],
  ['Private', 1_000],
  ['Corporal', 2_000],
  ['Sergeant', 10_000],
  ['Sergeant Major', 50_000],
  ['Lieutenant', 100_000],
  ['Captain', 200_000],
  ['Major', 500_000],
  ['Colonel', 800_000],
  ['Brigadier', 1_000_000],
  ['Brigade Commander', 1_200_000],
  ['Division Commander', 1_400_000],
  ['Corps Commander', 1_600_000],
  ['Army Commander', 1_800_000],
  ['General', 2_000_000],
  ['Marshal', 2_500_000],
  ['Legate', 3_000_000],
  ['Tribune', 3_500_000],
  ['Consul', 4_000_000],
  ['Praetor', 5_000_000],
  ['Guardian', 7_000_000],
  ['Keeper', 10_000_000],
  ['Overlord', 13_000_000],
  ['Emperor', 16_000_000],
  ['Legend', 20_000_000],
];

const RANK_NAMES = [
  t`Recruit`,
  t`Private (military rank)`,
  t`Corporal`,
  t`Sergeant`,
  t`Sergeant Major`,
  t`Lieutenant`,
  t`Captain`,
  t`Major`,
  t`Colonel`,
  t`Brigadier`,
  t`Brigade Commander`,
  t`Division Commander`,
  t`Corps Commander`,
  t`Army Commander`,
  t`General`,
  t`Marshal`,
  t`Legate`,
  t`Tribune`,
  t`Consul`,
  t`Praetor`,
  t`Guardian`,
  t`Keeper`,
  t`Overlord`,
  t`Emperor`,
  t`Legend`,
];

const METALS = [
  t`Bronze`,
  t`Silver`,
  t`Gold`,
  t`Turquoise`,
  t`Amethyst`,
];
const METAL_KEYS = ['Bronze', 'Silver', 'Gold', 'Turquoise', 'Amethyst'];

export function getPixelRank(totalPixels = 0) {
  const pixels = Math.max(0, Number(totalPixels) || 0);
  let index = 0;
  while (index + 1 < PIXEL_RANKS.length
    && pixels >= PIXEL_RANKS[index + 1][1]) {
    index += 1;
  }

  const [, threshold] = PIXEL_RANKS[index];
  const next = PIXEL_RANKS[index + 1];
  const nextThreshold = next?.[1] ?? threshold;
  const previousThreshold = threshold;
  return {
    id: index + 1,
    name: RANK_NAMES[index],
    metal: METALS[Math.floor(index / 5)],
    metalKey: METAL_KEYS[Math.floor(index / 5)],
    pixels,
    threshold,
    nextThreshold,
    nextName: next ? RANK_NAMES[index + 1] : null,
    progress: next
      ? Math.min(1, (pixels - previousThreshold)
      / (nextThreshold - previousThreshold))
      : 1,
  };
}

export function getPixelRankById(rankId) {
  const index = Number(rankId) - 1;
  if (!Number.isInteger(index) || index < 0 || index >= PIXEL_RANKS.length) {
    return null;
  }
  return getPixelRank(PIXEL_RANKS[index][1]);
}
