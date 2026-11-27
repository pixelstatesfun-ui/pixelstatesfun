/*
 * GUI state selectors
 */

export function selectIsDarkMode(state) {
  return Boolean(state?.gui?.isDarkMode);
}
