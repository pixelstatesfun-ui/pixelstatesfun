import { patchState } from '../index.js';
import { USERLVL } from '../../core/constants.js';

const initialState = {
  id: null,
  name: null,
  username: null,
  wait: null,
  coolDown: null, // ms
  lastCoolDownEnd: null,
  userlvl: USERLVL.ANONYM,
  vipTier: 0,
  vipEnabled: true,
  vipCooldownMultiplier: 0.9,
  vipPlusCooldownMultiplier: 0.45,
  vipPlusPlusCooldownMultiplier: 0.4,
  vipBaseCooldownMultiplier: 0.9,
  vipPlusBaseCooldownMultiplier: 0.45,
  vipPlusPlusBaseCooldownMultiplier: 0.4,
  voidActive: false,
  // messages are sent by api/me, like not_verified status
  messages: [],
  /*
   * whether or not the user has a password set (third party login might not
   * have one)
   */
  havePassword: false,
  // blocking all Dms
  blockDm: false,
  // profile is private
  priv: false,
  // if user is using touchscreen
  isOnMobile: false,
  // small notifications for received cooldown
  notification: null,
  chaosEvent: null,
};

export default function user(
  state = initialState,
  action,
) {
  switch (action.type) {
    case 'COOLDOWN_SET': {
      const { coolDown } = action;
      return {
        ...state,
        coolDown: coolDown || null,
      };
    }

    case 'COOLDOWN_END': {
      return {
        ...state,
        coolDown: null,
        lastCoolDownEnd: Date.now(),
        wait: null,
      };
    }

    case 'REC_SET_PXLS': {
      const {
        wait: duration,
      } = action;
      return {
        ...state,
        wait: (duration) ? Date.now() + duration : state.wait,
      };
    }

    case 'REC_COOLDOWN': {
      const { wait: duration } = action;
      const wait = duration
        ? Date.now() + duration
        : null;
      return {
        ...state,
        wait,
        coolDown: null,
      };
    }

    case 's/PATCH_STATE': {
      if (action.state === 'user') {
        return patchState(state, action.patch)[0];
      }
      return state;
    }

    case 'SET_MOBILE': {
      const { mobile: isOnMobile } = action;
      return {
        ...state,
        isOnMobile,
      };
    }

    case 's/REC_ME':
    case 's/LOGIN': {
      const {
        id,
        name,
        username,
        havePassword,
        discordLinked,
        blockDm,
        priv,
        userlvl,
        vipTier,
        vipEnabled,
        voidActive,
        vipCooldownMultiplier,
        vipPlusCooldownMultiplier,
        vipBaseCooldownMultiplier,
        vipPlusBaseCooldownMultiplier,
        vipPlusPlusBaseCooldownMultiplier,
      } = action;
      const messages = (action.messages) ? action.messages : [];
      return {
        ...state,
        id,
        name,
        username,
        messages,
        havePassword,
        discordLinked: !!discordLinked,
        blockDm,
        priv,
        userlvl,
        vipTier: vipTier || 0,
        vipEnabled: vipEnabled !== false,
        voidActive: !!voidActive,
        vipCooldownMultiplier: vipCooldownMultiplier ?? 0.9,
        vipPlusCooldownMultiplier: vipPlusCooldownMultiplier ?? 0.45,
        vipPlusPlusCooldownMultiplier:
          action.vipPlusPlusCooldownMultiplier ?? 0.4,
        vipBaseCooldownMultiplier:
          vipBaseCooldownMultiplier ?? vipCooldownMultiplier ?? 0.9,
        vipPlusBaseCooldownMultiplier:
          vipPlusBaseCooldownMultiplier
          ?? vipPlusCooldownMultiplier ?? 0.45,
        vipPlusPlusBaseCooldownMultiplier:
          vipPlusPlusBaseCooldownMultiplier
          ?? action.vipPlusPlusCooldownMultiplier ?? 0.4,
        chaosEvent: action.chaosEvent || null,
      };
    }

    case 's/LOGOUT': {
      return {
        ...state,
        id: null,
        name: null,
        username: null,
        messages: [],
        havePassword: false,
        blockDm: false,
        priv: false,
        userlvl: USERLVL.ANONYM,
        vipTier: 0,
        vipEnabled: true,
        vipCooldownMultiplier: 0.9,
        vipPlusCooldownMultiplier: 0.45,
        vipPlusPlusCooldownMultiplier: 0.4,
        vipBaseCooldownMultiplier: 0.9,
        vipPlusBaseCooldownMultiplier: 0.45,
        vipPlusPlusBaseCooldownMultiplier: 0.4,
        voidActive: false,
      };
    }

    case 'SET_NOTIFICATION': {
      return {
        ...state,
        notification: action.notification,
      };
    }

    case 'UNSET_NOTIFICATION': {
      return {
        ...state,
        notification: null,
      };
    }

    case 's/REC_COOLDOWN_UPDATE': {
      const {
        vipCooldownMultiplier,
        vipPlusCooldownMultiplier,
        vipPlusPlusCooldownMultiplier,
        vipBaseCooldownMultiplier,
        vipPlusBaseCooldownMultiplier,
        vipPlusPlusBaseCooldownMultiplier,
        chaosEvent,
        voidActive,
      } = action;
      const cooldownMultiplierUpdates = [
        ['vipCooldownMultiplier', vipCooldownMultiplier],
        ['vipPlusCooldownMultiplier', vipPlusCooldownMultiplier],
        ['vipPlusPlusCooldownMultiplier', vipPlusPlusCooldownMultiplier],
        ['vipBaseCooldownMultiplier', vipBaseCooldownMultiplier],
        ['vipPlusBaseCooldownMultiplier', vipPlusBaseCooldownMultiplier],
        ['vipPlusPlusBaseCooldownMultiplier',
          vipPlusPlusBaseCooldownMultiplier],
      ].reduce((updates, [key, value]) => {
        if (value !== null && value !== undefined) {
          updates[key] = value;
        }
        return updates;
      }, {});
      return {
        ...state,
        ...cooldownMultiplierUpdates,
        ...(chaosEvent !== undefined ? { chaosEvent } : {}),
        ...(voidActive !== undefined ? { voidActive } : {}),
      };
    }

    case 's/REM_FROM_MESSAGES': {
      const { message } = action;
      const messages = [...state.messages];
      const index = messages.indexOf(message);
      if (index > -1) {
        messages.splice(index);
      }
      return {
        ...state,
        messages,
      };
    }

    case 's/SET_HAVE_PASSWORD': {
      const { havePassword } = action;
      return {
        ...state,
        havePassword,
      };
    }

    default:
      return state;
  }
}
