let protectedTerritories = [];

export function setProtectedTerritories(territories) {
  protectedTerritories = Array.isArray(territories) ? territories : [];
}

export function getProtectedTerritory(canvasId, x, y) {
  if (x === undefined || y === undefined || x === null || y === null) return null;
  return protectedTerritories.find((territory) => (
    Number(territory.canvasId) === Number(canvasId)
    && x >= territory.x1 && x <= territory.x2
    && y >= territory.y1 && y <= territory.y2
  )) || null;
}
