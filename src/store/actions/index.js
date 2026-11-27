/*
 * Core Redux action creators
 */

export const SET_STATS = 'SET_STATS';
export const SET_PROFILE = 'SET_PROFILE';
export const SET_DARK_MODE = 'SET_DARK_MODE';
export const SET_NOTIFICATION = 'SET_NOTIFICATION';
export const OPEN_WINDOW = 'OPEN_WINDOW';
export const CLOSE_WINDOW = 'CLOSE_WINDOW';
export const SET_WINDOW_ARGS = 'SET_WINDOW_ARGS';
export const TOGGLE_OV_ENABLED = 'TOGGLE_OV_ENABLED';
export const TOGGLE_SMALL_PXLS = 'TOGGLE_SMALL_PXLS';
export const SET_OV_OPACITY = 'SET_OV_OPACITY';
export const ADD_TEMPLATE = 'ADD_TEMPLATE';
export const CHANGE_TEMPLATE = 'CHANGE_TEMPLATE';
export const DELETE_TEMPLATE = 'DELETE_TEMPLATE';
export const SET_TEMPLATES = 'SET_TEMPLATES';
export const APPLY_PATCHES = 'APPLY_PATCHES';
export const UNLOAD = 'UNLOAD';

export const SELECT_STYLE = 'SELECT_STYLE';
export const TOGGLE_GRID = 'TOGGLE_GRID';
export const TOGGLE_PIXEL_NOTIFY = 'TOGGLE_PIXEL_NOTIFY';
export const TOGGLE_ACTIVE_ZONES = 'TOGGLE_ACTIVE_ZONES';
export const TOGGLE_BRUSH_ANIMATION = 'TOGGLE_BRUSH_ANIMATION';
export const TOGGLE_MVM_CTRLS = 'TOGGLE_MVM_CTRLS';
export const TOGGLE_MUTE = 'TOGGLE_MUTE';
export const TOGGLE_AUTO_ZOOM_IN = 'TOGGLE_AUTO_ZOOM_IN';
export const TOGGLE_COMPACT_PALETTE = 'TOGGLE_COMPACT_PALETTE';
export const TOGGLE_CHAT_NOTIFY = 'TOGGLE_CHAT_NOTIFY';
export const TOGGLE_CURSOR = 'TOGGLE_CURSOR';
export const TOGGLE_POTATO_MODE = 'TOGGLE_POTATO_MODE';
export const TOGGLE_LIGHT_GRID = 'TOGGLE_LIGHT_GRID';
export const TOGGLE_HISTORICAL_VIEW = 'TOGGLE_HISTORICAL_VIEW';
export const TOGGLE_OPEN_PALETTE = 'TOGGLE_OPEN_PALETTE';
export const TOGGLE_EASTER_EGG = 'TOGGLE_EASTER_EGG';
export const SET_AUDIO_VOLUME = 'SET_AUDIO_VOLUME';
export const SET_SOUND_VOLUME = 'SET_SOUND_VOLUME';
export const SET_KEY_BINDING = 'SET_KEY_BINDING';
export const SELECT_PENCIL_MODE = 'SELECT_PENCIL_MODE';
export const SELECT_CANVAS = 'SELECT_CANVAS';
export const SET_VIEW_COORDINATES = 'SET_VIEW_COORDINATES';
export const CYCLE_BRUSH_SIZE = 'CYCLE_BRUSH_SIZE';
export const SELECT_COLOR = 'SELECT_COLOR';
export const LOGIN_USER = 'LOGIN_USER';
export const LOGOUT_USER = 'LOGOUT_USER';
export const SET_HAVE_PASSWORD = 'SET_HAVE_PASSWORD';
export const SET_USER_NAME = 'SET_USER_NAME';

export function applyPatches(patches) {
  return {
    type: APPLY_PATCHES,
    patches: patches || [],
  };
}

export function unload() {
  return {
    type: UNLOAD,
  };
}

export function setDarkMode(isDarkMode) {
  return {
    type: SET_DARK_MODE,
    isDarkMode: Boolean(isDarkMode),
  };
}

export function selectStyle(style) {
  return {
    type: SELECT_STYLE,
    style: style || 'default',
  };
}

export function toggleGrid() {
  return { type: TOGGLE_GRID };
}

export function togglePixelNotify() {
  return { type: TOGGLE_PIXEL_NOTIFY };
}

export function toggleActiveZones() {
  return { type: TOGGLE_ACTIVE_ZONES };
}

export function toggleBrushAnimation() {
  return { type: TOGGLE_BRUSH_ANIMATION };
}

export function toggleMvmCtrls() {
  return { type: TOGGLE_MVM_CTRLS };
}

export function toggleMute() {
  return { type: TOGGLE_MUTE };
}

export function toggleAutoZoomIn() {
  return { type: TOGGLE_AUTO_ZOOM_IN };
}

export function toggleCompactPalette() {
  return { type: TOGGLE_COMPACT_PALETTE };
}

export function toggleChatNotify() {
  return { type: TOGGLE_CHAT_NOTIFY };
}

export function toggleCursor() {
  return { type: TOGGLE_CURSOR };
}

export function togglePotatoMode() {
  return { type: TOGGLE_POTATO_MODE };
}

export function toggleLightGrid() {
  return { type: TOGGLE_LIGHT_GRID };
}

export function toggleHistoricalView() {
  return { type: TOGGLE_HISTORICAL_VIEW };
}

export function toggleOpenPalette() {
  return { type: TOGGLE_OPEN_PALETTE };
}

export function toggleEasterEgg() {
  return { type: TOGGLE_EASTER_EGG };
}

export function setAudioVolume(volume) {
  return { type: SET_AUDIO_VOLUME, volume: Number(volume) || 0 };
}

export function setSoundVolume(sound, volume) {
  return { type: SET_SOUND_VOLUME, sound, volume: Number(volume) || 0 };
}

export function setKeyBinding(binding, code) {
  return { type: SET_KEY_BINDING, binding, code };
}

export function selectPencilMode(pencilMode) {
  return { type: SELECT_PENCIL_MODE, pencilMode: Number(pencilMode) || 0 };
}

export function selectCanvas(canvasId) {
  return { type: SELECT_CANVAS, canvasId: Number(canvasId) || 0 };
}

export function setViewCoordinates(coords) {
  return { type: SET_VIEW_COORDINATES, coords };
}

export function cycleBrushSize(vipTier = 0) {
  return { type: CYCLE_BRUSH_SIZE, vipTier: Number(vipTier) || 0 };
}

export function selectColor(color) {
  return { type: SELECT_COLOR, color: Number(color) || 0 };
}

export function loginUser(me) {
  return { type: LOGIN_USER, me };
}

export function logoutUser() {
  return { type: LOGOUT_USER };
}

export function setHavePassword(havePassword) {
  return { type: SET_HAVE_PASSWORD, havePassword: Boolean(havePassword) };
}

export function setUserName(name) {
  return { type: SET_USER_NAME, name };
}
