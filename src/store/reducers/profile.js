import { patchState } from '../index.js';

const initialState = {
  badges: [],
  /*
   * [{
   *     name,
   *     title,
   *     description,
   *     isPrivate,
   *     isPublic,
   *     isHidden,
   *     memberCount,
   *     avatarId,
   *     roles: [{
   *       frid,
   *       name,
   *       customFlagId,
   *       factionlvl,
   *       isMember,
   *     }, ...],
   *   }, ...],
   */
  factions: [],
  activeFactionRole: null,
  flag: null,
  flagLegit: true,
  /*
   * media id of user avtar
   */
  avatarId: null,
  bannerPreset: null,
  bannerId: null,
  nicknameColor: null,
  avatarGlow: null,
  nicknameGradient: null,
  /*
   * whether or not profile is fetched
   */
  fetched: false,
};

export default function profile(state = initialState, action) {
  switch (action.type) {
    case 's/REC_PROFILE':
      return {
        ...state,
        ...action.profile,
        fetched: true,
      };

    case 's/PATCH_STATE': {
      if (action.state === 'profile') {
        return patchState(state, action.patch)[0];
      }
      return state;
    }

    case 's/REC_ME':
    case 's/LOGIN':
    case 's/LOGOUT':
      // reset profile if user changes
      return { ...initialState };

    default:
      return state;
  }
}
