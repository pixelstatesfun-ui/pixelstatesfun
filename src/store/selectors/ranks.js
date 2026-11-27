/*
 * Ranking & statistics selectors
 */

export function selectStats(state) {
  const ranks = state?.ranks || {};
  return [
    ranks.totalRanking || null,
    ranks.totalDailyRanking || null,
    ranks.factionRanking || null,
    ranks.dailyFactionRanking || null,
    ranks.dailyCRanking || [],
    ranks.prevTop || null,
    ranks.onlineStats || [],
    ranks.cHistStats || [],
    ranks.cHourlyStats || [],
    ranks.histStats || { users: [], stats: [] },
    ranks.pDailyStats || [],
    ranks.pHourlyStats || [],
  ];
}
