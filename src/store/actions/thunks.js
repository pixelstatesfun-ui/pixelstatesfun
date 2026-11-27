/*
 * Async Redux thunks for rankings, profile, notifications, and faction edits
 */

import { api } from '../../utils/utag.js';
import {
  SET_STATS,
  SET_PROFILE,
  SET_NOTIFICATION,
  SET_USER_NAME,
} from './index.js';

export function notify(message) {
  return (dispatch) => {
    dispatch({
      type: SET_NOTIFICATION,
      message: String(message || ''),
    });
    setTimeout(() => {
      dispatch({
        type: SET_NOTIFICATION,
        message: null,
      });
    }, 2400);
  };
}

export function fetchStats() {
  return async (dispatch) => {
    try {
      const response = await fetch(api`/api/ranking`, {
        credentials: 'include',
      });
      if (!response.ok) return null;
      const data = await response.json();
      dispatch({
        type: SET_STATS,
        stats: data,
      });
      return data;
    } catch {
      return null;
    }
  };
}

export function fetchProfile() {
  return async (dispatch) => {
    try {
      const response = await fetch(api`/api/profile`, {
        credentials: 'include',
      });
      if (!response.ok) return null;
      const data = await response.json();
      dispatch({
        type: SET_PROFILE,
        profile: data,
      });
      return data;
    } catch {
      return null;
    }
  };
}

export function changeProfile(updates) {
  return async (dispatch) => {
    try {
      const response = await fetch(api`/api/profile`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates || {}),
      });
      const data = await response.json();
      if (response.ok) {
        dispatch({
          type: SET_PROFILE,
          profile: data,
        });
      }
      return data;
    } catch {
      return { errors: ['Failed to update profile.'] };
    }
  };
}

export function changeUser(updates) {
  return async (dispatch) => {
    if (updates?.name) {
      dispatch({ type: SET_USER_NAME, name: updates.name });
    }
    return { success: true };
  };
}

export function setUserBlock() {
  return async () => ({ success: true });
}

export function changeFaction(factionId, updates) {
  return async () => {
    try {
      const response = await fetch(
        api`/api/factions/${encodeURIComponent(factionId)}`,
        {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates || {}),
        },
      );
      return await response.json();
    } catch {
      return { errors: ['Failed to update faction.'] };
    }
  };
}

export function changeFactionRole(factionId, frid, updates) {
  return async () => {
    try {
      const response = await fetch(
        api`/api/factions/${encodeURIComponent(factionId)}/roles/${encodeURIComponent(frid)}`,
        {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates || {}),
        },
      );
      return await response.json();
    } catch {
      return { errors: ['Failed to update faction role.'] };
    }
  };
}
