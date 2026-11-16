export function shouldRefreshRankings(
  lastStatsFetch,
  now = Date.now(),
  refreshIntervalMs = 300000,
) {
  return now - lastStatsFetch >= refreshIntervalMs;
}
