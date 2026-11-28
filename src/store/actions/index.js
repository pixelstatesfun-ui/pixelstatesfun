import { t } from 'ttag';

export function pAlert(
  title,
  message,
  alertType,
  btn = t`OK`,
) {
  return {
    type: 'ALERT',
    title,
    message,
    alertType,
    btn,
  };
}

export function pRefresh() {
  return pAlert(t`Change Happened`, t`Please refresh the website`, 'refresh');
}

export function closeAlert() {
  return {
    type: 'CLOSE_ALERT',
  };
}

export function toggleHistoricalView() {
  return {
    type: 's/TGL_HISTORICAL_VIEW',
  };
}

export function toggleEasterEgg() {
  return {
    type: 's/TGL_EASTER_EGG',
  };
}

export function toggleGrid() {
  return {
    type: 's/TGL_GRID',
  };
}

export function togglePixelNotify() {
  return {
    type: 's/TGL_PXL_NOTIFY',
  };
}

export function toggleActiveZones() {
  return {
    type: 's/TGL_ACTIVE_ZONES',
  };
}

export function toggleBrushAnimation() {
  return {
    type: 's/TGL_BRUSH_ANIMATION',
  };
}

export function toggleMvmCtrls() {
  return {
    type: 's/TGL_MVM_CTRLS',
  };
}

export function toggleAutoZoomIn() {
  return {
    type: 's/TGL_AUTO_ZOOM_IN',
  };
}

export function toggleOnlineCanvas() {
  return {
    type: 's/TGL_ONLINE_CANVAS',
  };
}

export function toggleDailyPxls() {
  return {
    type: 's/TGL_DAILY_PXLS',
  };
}

export function toggleNoRound() {
  return {
    type: 's/TGL_NO_ROUND',
  };
}

export function toggleMute() {
  return {
    type: 's/TGL_MUTE',
  };
}

export function setAudioVolume(volume) {
  return {
    type: 's/SET_AUDIO_VOLUME',
    volume,
  };
}

export function setSoundVolume(sound, volume) {
  return {
    type: 's/SET_SOUND_VOLUME',
    sound,
    volume,
  };
}

export function setPlacementVolume(volume) {
  return {
    type: 's/SET_PLACEMENT_VOLUME',
    volume,
  };
}

export function setAlertVolume(volume) {
  return {
    type: 's/SET_ALERT_VOLUME',
    volume,
  };
}

export function setStackVolume(volume) {
  return {
    type: 's/SET_STACK_VOLUME',
    volume,
  };
}

export function setChatVolume(volume) {
  return {
    type: 's/SET_CHAT_VOLUME',
    volume,
  };
}

export function setKeyBinding(binding, code) {
  return {
    type: 's/SET_KEY_BINDING',
    binding,
    code,
  };
}

export function toggleCompactPalette() {
  return {
    type: 's/TGL_COMPACT_PALETTE',
  };
}

export function toggleChatNotify() {
  return {
    type: 's/TGL_CHAT_NOTIFY',
  };
}

export function toggleChatCompact() {
  return {
    type: 's/TGL_CHAT_COMPACT',
  };
}

export function setHideVoidMessages(value) {
  return {
    type: 's/SET_HIDE_VOID_MESSAGES',
    value,
  };
}

export function togglePotatoMode() {
  return {
    type: 's/TGL_POTATO_MODE',
  };
}

export function toggleLightGrid() {
  return {
    type: 's/TGL_LIGHT_GRID',
  };
}

export function toggleOpenPalette() {
  return {
    type: 's/TGL_OPEN_PALETTE',
  };
}

export function toggleCursor() {
  return {
    type: 's/TGL_CURSOR',
  };
}

export function setHoldPaint(value, immediate) {
  return {
    type: 's/SET_HOLD_PAINT',
    value,
    immediate,
  };
}

export function selectPencilMode(value) {
  return {
    type: 's/SELECT_PENCIL_MODE',
    value,
  };
}

export function cycleBrushSize(vipTier = 0) {
  return {
    type: 's/CYCLE_BRUSH_SIZE',
    vipTier,
  };
}

export function selectHoverColor() {
  return {
    type: 'SELECT_HOVER_COLOR',
  };
}

export function selectStyle(style) {
  return {
    type: 's/SELECT_STYLE',
    style,
  };
}

export function setHover(hover) {
  return {
    type: 'SET_HOVER',
    hover,
  };
}

export function unsetHover() {
  return {
    type: 'UNSET_HOVER',
  };
}

export function setMobile(mobile) {
  return {
    type: 'SET_MOBILE',
    mobile,
  };
}

export function windowResize() {
  return {
    type: 'WIN_RESIZE',
  };
}

export function selectColor(color) {
  return {
    type: 'SELECT_COLOR',
    color,
  };
}

export function selectCanvas(canvasId) {
  // key in javascript objects is always a string
  const canvasIdString = String(canvasId);
  return (dispatch, getState) => {
    if (canvasIdString !== getState().canvas.canvasId) {
      dispatch({
        type: 's/SELECT_CANVAS',
        canvasId: canvasIdString,
      });
    }
  };
}

export function updateView(view) {
  return {
    type: 'UPDATE_VIEW',
    view,
  };
}

export function setViewCoordinates(view) {
  return {
    type: 'SET_VIEW_COORDINATES',
    view,
  };
}

export function setScale(scale, zoompoint) {
  return {
    type: 'SET_SCALE',
    scale,
    zoompoint,
  };
}

export function setMoveU(value) {
  return {
    type: 's/SET_MOVE_U',
    value,
  };
}

export function setMoveV(value) {
  return {
    type: 's/SET_MOVE_V',
    value,
  };
}

export function setMoveW(value) {
  return {
    type: 's/SET_MOVE_W',
    value,
  };
}

export function cancelMove(value) {
  return {
    type: 's/CANCEL_MOVE',
    value,
  };
}

export function requestBigChunk(center) {
  return {
    type: 'REQ_BIG_CHUNK',
    center,
  };
}

export function removeChunks(chunks) {
  return {
    type: 'REMOVE_CHUNKS',
    chunks,
  };
}

export function preLoadedBigChunk(center) {
  return {
    type: 'PRE_LOADED_BIG_CHUNK',
    center,
  };
}

export function receiveBigChunk(chunk) {
  return {
    type: 'REC_BIG_CHUNK',
    chunk,
  };
}

export function receiveBigChunkFailure(chunk, error) {
  return {
    type: 'REC_BIG_CHUNK_FAILURE',
    chunk,
    error,
  };
}

export function patchState(state, op, path, value) {
  return {
    type: 's/PATCH_STATE',
    state,
    patch: { op, path, value },
  };
}

export function applyPatches(patches) {
  return patches.map(
    ([state, { op, path, value }]) => patchState(state, op, path, value),
  );
}

export function parseCanvases() {
  /*
   * can only do this once and requires window.ssv
   */
  const { canvases, defaultCanvas } = window.ssv;
  delete window.ssv.canvases;
  delete window.ssv.defaultCanvas;
  return {
    type: 's/REC_CANVASES',
    canvases,
    defaultCanvas,
  };
}

export function receiveMe(me) {
  return {
    type: 's/REC_ME',
    ...me,
  };
}

export function receiveStats(rankings) {
  rankings.totalRanking = rankings.ranking;
  rankings.totalDailyRanking = rankings.dailyRanking;
  delete rankings.ranking;
  delete rankings.dailyRanking;
  const cHourlyStats = {};
  for (const { cc, px } of rankings.cHourlyStats) {
    cHourlyStats[cc] = px;
  }
  rankings.cHourlyStats = cHourlyStats;
  rankings.cooldownChanges = Object.entries(rankings.cooldownChanges);
  return {
    type: 'REC_STATS',
    rankings,
  };
}

export function sendChatMessage(
  text,
  channel,
) {
  return {
    type: 's/REQ_CHAT_MESSAGE',
    text,
    channel,
  };
}

export function sendChatTyping(
  channel,
  isTyping,
) {
  return {
    type: 's/CHAT_TYPING',
    channel,
    isTyping,
  };
}

export function logoutUser(
) {
  return {
    type: 's/LOGOUT',
  };
}

export function loginUser(
  me,
) {
  return {
    type: 's/LOGIN',
    ...me,
  };
}

export function setHavePassword(
  havePassword,
) {
  return {
    type: 's/SET_HAVE_PASSWORD',
    havePassword,
  };
}

export function remFromMessages(
  message,
) {
  return {
    type: 's/REM_FROM_MESSAGES',
    message,
  };
}

export function markChannelAsRead(cid) {
  return {
    type: 's/MARK_CHANNEL_AS_READ', cid,
  };
}

export function refCountChatChannel(cidAdditions) {
  return {
    type: 's/REF_CHAT_CHAN', cidAdditions,
  };
}

export function blockUser(userId, userName) {
  return {
    type: 's/BLOCK_USER',
    userId,
    userName,
  };
}

export function unblockUser(userId, userName) {
  return {
    type: 's/UNBLOCK_USER',
    userId,
    userName,
  };
}

export function selectHistoricalTime(date, time) {
  return {
    type: 'SET_HISTORICAL_TIME',
    date,
    time,
  };
}

export function urlChange() {
  return {
    type: 'RELOAD_URL',
  };
}

export function unload() {
  return {
    type: 't/UNLOAD',
  };
}

export function load() {
  return {
    type: 't/LOAD',
  };
}

export function propagateMe(state) {
  const {
    id,
    name,
    username,
    havePassword,
    blockDm,
    userlvl,
  } = state.user;
  const {
    blocked,
    channels,
  } = state.chat;
  const {
    ranking,
    dailyRanking,
    totalPixels,
    dailyTotalPixels,
  } = state.ranks;
  return {
    type: 's/REC_ME',
    blockDm,
    blocked,
    channels,
    dailyRanking,
    dailyTotalPixels,
    id,
    havePassword,
    name,
    username,
    ranking,
    totalPixels,
    userlvl,
  };
}
