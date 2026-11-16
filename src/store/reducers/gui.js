const initialState = {
  showGrid: false,
  showPixelNotify: false,
  showActiveZones: true,
  animateBrush: false,
  showMvmCtrls: false,
  autoZoomIn: false,
  isPotato: false,
  isLightGrid: false,
  compactPalette: false,
  paletteOpen: true,
  mute: false,
  chatNotify: true,
  audioVolume: 100,
  soundVolumes: null,
  placementVolume: 100,
  alertVolume: 100,
  stackVolume: 100,
  chatVolume: 100,
  keyBindings: {
    grid: 'KeyG',
    pixelNotify: 'KeyX',
    historicalView: 'KeyH',
    mute: 'KeyM',
    copyCoordinates: 'KeyR',
    overlay: 'KeyT',
    easterEgg: 'KeyL',
    pencilMode: 'KeyB',
  },
  chatCompact: false,
  hideVoidMessages: false,
  cursor: true,
  // popups that are set to show fullscreen
  fsPopUps: [],
  // show online users per canvas instead of total
  onlineCanvas: false,
  // show daily pixels instead o total pixels
  dailyPxls: false,
  // show full pixel number, instead of rounded
  noRound: false,
  // selected theme
  style: 'default',
  // properties that aren't saved
  holdPaint: false,
  easterEgg: false,
  moveU: 0,
  moveV: 0,
  moveW: 0,
};


export default function gui(
  state = initialState,
  action,
) {
  switch (action.type) {
    case 's/TGL_GRID': {
      return {
        ...state,
        showGrid: !state.showGrid,
      };
    }

    case 's/TGL_PXL_NOTIFY': {
      return {
        ...state,
        showPixelNotify: !state.showPixelNotify,
      };
    }

    case 's/TGL_ACTIVE_ZONES': {
      return {
        ...state,
        showActiveZones: !state.showActiveZones,
      };
    }

    case 's/TGL_BRUSH_ANIMATION': {
      return {
        ...state,
        animateBrush: !state.animateBrush,
      };
    }

    case 's/TGL_MVM_CTRLS': {
      return {
        ...state,
        showMvmCtrls: !state.showMvmCtrls,
      };
    }

    case 's/TGL_AUTO_ZOOM_IN': {
      return {
        ...state,
        autoZoomIn: !state.autoZoomIn,
      };
    }

    case 's/TGL_ONLINE_CANVAS': {
      return {
        ...state,
        onlineCanvas: !state.onlineCanvas,
      };
    }

    case 's/TGL_DAILY_PXLS': {
      return {
        ...state,
        dailyPxls: !state.dailyPxls,
      };
    }

    case 's/TGL_NO_ROUND': {
      return {
        ...state,
        noRound: !state.noRound,
      };
    }

    case 's/TGL_POTATO_MODE': {
      return {
        ...state,
        isPotato: !state.isPotato,
      };
    }

    case 's/TGL_LIGHT_GRID': {
      return {
        ...state,
        isLightGrid: !state.isLightGrid,
      };
    }

    case 's/TGL_COMPACT_PALETTE': {
      return {
        ...state,
        compactPalette: !state.compactPalette,
      };
    }

    case 's/TGL_OPEN_PALETTE': {
      return {
        ...state,
        paletteOpen: !state.paletteOpen,
      };
    }

    case 's/TGL_MUTE':
      return {
        ...state,
        mute: !state.mute,
      };

    case 's/TGL_CHAT_NOTIFY':
      return {
        ...state,
        chatNotify: !state.chatNotify,
      };

    case 's/SET_AUDIO_VOLUME':
      return {
        ...state,
        audioVolume: Math.max(0, Math.min(100, Number(action.volume) || 0)),
      };

    case 's/SET_SOUND_VOLUME': {
      const { sound, volume } = action;
      if (typeof sound !== 'string' || !sound) {
        return state;
      }
      return {
        ...state,
        soundVolumes: {
          ...state.soundVolumes,
          [sound]: Math.max(0, Math.min(100, Number(volume) || 0)),
        },
      };
    }

    case 's/SET_PLACEMENT_VOLUME':
      return {
        ...state,
        placementVolume: Math.max(0, Math.min(100, Number(action.volume) || 0)),
      };

    case 's/SET_ALERT_VOLUME':
      return {
        ...state,
        alertVolume: Math.max(0, Math.min(100, Number(action.volume) || 0)),
      };

    case 's/SET_STACK_VOLUME':
      return {
        ...state,
        stackVolume: Math.max(0, Math.min(100, Number(action.volume) || 0)),
      };

    case 's/SET_CHAT_VOLUME':
      return {
        ...state,
        chatVolume: Math.max(0, Math.min(100, Number(action.volume) || 0)),
      };

    case 's/SET_KEY_BINDING':
      if (!action.binding || !action.code) {
        return state;
      }
      return {
        ...state,
        keyBindings: {
          ...initialState.keyBindings,
          ...state.keyBindings,
          [action.binding]: action.code,
        },
      };

    case 's/TGL_CHAT_COMPACT':
      return {
        ...state,
        chatCompact: !state.chatCompact,
      };

    case 's/SET_HIDE_VOID_MESSAGES':
      return {
        ...state,
        hideVoidMessages: Boolean(action.value),
      };

    case 's/TGL_EASTER_EGG': {
      return {
        ...state,
        easterEgg: !state.easterEgg,
      };
    }

    case 's/TGL_CURSOR': {
      return {
        ...state,
        cursor: !state.cursor,
      };
    }

    case 's/SET_HOLD_PAINT': {
      return {
        ...state,
        holdPaint: action.value,
      };
    }

    case 's/SELECT_STYLE': {
      const { style } = action;
      return {
        ...state,
        style,
      };
    }

    case 'TOGGLE_POPUP_FS': {
      const { windowType } = action;
      const fsPopUps = [...state.fsPopUps];
      const pos = fsPopUps.indexOf(windowType);
      if (pos !== -1) {
        fsPopUps.splice(pos, 1);
      } else {
        fsPopUps.push(windowType);
      }
      return {
        ...state,
        fsPopUps,
      };
    }

    case 'SELECT_COLOR': {
      const {
        compactPalette,
      } = state;
      let {
        paletteOpen,
      } = state;
      if (compactPalette || window.innerWidth < 300) {
        paletteOpen = false;
      }
      return {
        ...state,
        paletteOpen,
      };
    }

    case 's/SELECT_CANVAS': {
      if (!state.holdPaint) {
        return state;
      }
      return {
        ...state,
        holdPaint: false,
      };
    }

    case 's/SET_MOVE_U': {
      const { value } = action;
      const moveU = value;
      return {
        ...state,
        moveU,
      };
    }

    case 's/SET_MOVE_V': {
      const { value } = action;
      const moveV = value;
      return {
        ...state,
        moveV,
      };
    }

    case 's/SET_MOVE_W': {
      const { value } = action;
      const moveW = value;
      return {
        ...state,
        moveW,
      };
    }

    case 's/CANCEL_MOVE': {
      return {
        ...state,
        moveU: 0,
        moveV: 0,
        moveW: 0,
      };
    }

    case 'persist/REHYDRATE': {
      const persisted = action.payload || state;
      return {
        ...state,
        showActiveZones: state.showActiveZones ?? true,
        animateBrush: state.animateBrush ?? false,
        audioVolume: state.audioVolume ?? 100,
        soundVolumes: {
          colorSelect: persisted.placementVolume ?? 100,
          pixelPlacement: persisted.placementVolume ?? 100,
          notification: persisted.alertVolume ?? 100,
          captchaAlert: persisted.alertVolume ?? 100,
          infoAlert: persisted.alertVolume ?? 100,
          errorAlert: persisted.placementVolume ?? 100,
          stackFull: persisted.stackVolume ?? 100,
          cooldownEnd: persisted.alertVolume ?? 100,
          chatMessage: persisted.chatVolume ?? 100,
          ...persisted.soundVolumes,
        },
        placementVolume: state.placementVolume ?? 100,
        alertVolume: state.alertVolume ?? 100,
        stackVolume: state.stackVolume ?? 100,
        chatVolume: state.chatVolume ?? 100,
        easterEgg: false,
        holdPaint: false,
        moveU: 0,
        moveV: 0,
        moveW: 0,
      };
    }

    default:
      return state;
  }
}
