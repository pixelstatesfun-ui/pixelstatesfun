/*
 * map flags of user
 */
import { USERLVL } from '../core/constants.js';

export function getStaffIconName(flag) {
  if (flag === 'z1') return 'mod_icon';
  if (flag === 'zz') return 'staff_icon';
  return null;
}

export default function mapFlag(userlvl, country, flagUnlocked = false) {
  if (userlvl >= USERLVL.CLEANER) {
    let staffFlag;
    switch (userlvl) {
      case USERLVL.CLEANER:
        staffFlag = 'z3';
        break;
      case USERLVL.JANNY:
        staffFlag = 'z2';
        break;
      case USERLVL.MOD:
      case USERLVL.TRIALMOD:
        staffFlag = 'z1';
        break;
      default:
        staffFlag = 'zz';
    }
    return [true, staffFlag];
  }
  if (!flagUnlocked) {
    return [false, 'xx'];
  }
  return [true, country || 'xx'];
}
