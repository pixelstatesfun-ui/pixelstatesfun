/*
 * Country flag and staff icon mapping helpers
 */

import { USERLVL } from '../core/constants.js';

export function getStaffIconName(flagCode) {
  if (!flagCode) return null;
  const code = String(flagCode).toLowerCase();
  if (code === 'admin') return 'admin';
  if (code === 'mod') return 'mod';
  if (code === 'vip') return 'vip';
  return null;
}

export default function mapFlag(userlvl, country, flagUnlocked = false) {
  const safeCountry = (country && typeof country === 'string')
    ? country.toLowerCase()
    : 'xx';
  if (userlvl >= USERLVL.ADMIN && !flagUnlocked) {
    return ['admin', 'admin'];
  }
  if (userlvl >= USERLVL.MOD && !flagUnlocked) {
    return ['mod', 'mod'];
  }
  return [safeCountry, safeCountry];
}
