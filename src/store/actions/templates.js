/*
 * Overlay template actions
 */

import {
  TOGGLE_OV_ENABLED,
  TOGGLE_SMALL_PXLS,
  SET_OV_OPACITY,
  ADD_TEMPLATE,
  CHANGE_TEMPLATE,
  DELETE_TEMPLATE,
  SET_TEMPLATES,
} from './index.js';

export function toggleOVEnabled(enabled) {
  return {
    type: TOGGLE_OV_ENABLED,
    enabled,
  };
}

export function toggleSmallPxls() {
  return {
    type: TOGGLE_SMALL_PXLS,
  };
}

export function setOvOpacity(opacity) {
  const num = Number(opacity);
  return {
    type: SET_OV_OPACITY,
    opacity: Number.isFinite(num) ? Math.max(10, Math.min(100, num)) : 75,
  };
}

export function addTemplate(template) {
  return {
    type: ADD_TEMPLATE,
    template,
  };
}

export function changeTemplate(title, updates) {
  return {
    type: CHANGE_TEMPLATE,
    title,
    updates,
  };
}

export function deleteTemplate(title) {
  return {
    type: DELETE_TEMPLATE,
    title,
  };
}

export function setTemplates(list) {
  return {
    type: SET_TEMPLATES,
    list: Array.isArray(list) ? list : [],
  };
}
