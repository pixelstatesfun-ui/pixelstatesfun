/*
 * Window management actions
 */

import { OPEN_WINDOW, CLOSE_WINDOW, SET_WINDOW_ARGS } from './index.js';

export function openWindow(
  windowType,
  reuse = true,
  title = '',
  args = {},
  fullscreen = false,
  cloneable = false,
  xPos = null,
  yPos = null,
  width = null,
  height = null,
) {
  return {
    type: OPEN_WINDOW,
    windowType,
    reuse,
    title,
    args: args || {},
    fullscreen,
    cloneable,
    xPos,
    yPos,
    width,
    height,
  };
}

export function setWindowArgs(args) {
  return {
    type: SET_WINDOW_ARGS,
    args: args || {},
  };
}

export function closeWindow(windowId) {
  return {
    type: CLOSE_WINDOW,
    windowId,
  };
}
