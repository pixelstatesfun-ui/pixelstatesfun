/*
 * {country: factor, ...}
 */
const countries = {};

export function getAllCountryCooldownFactors() {
  return countries;
}

export function resetAllCountryCooldownFactors() {
  for (const country of Object.keys(countries)) {
    delete countries[country];
  }
}

export function resetCountryCooldownFactor(country) {
  delete countries[country];
}

export function setCountryCooldownFactor(country, factor) {
  if (factor === 1.0) {
    delete countries[country];
  } else {
    countries[country] = factor;
  }
}

export function getCooldownFactor(country) {
  return countries[country] ?? 1.0;
}
