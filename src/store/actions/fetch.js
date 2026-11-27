/*
 * API fetch helper functions for factions, auth, account, and media uploads
 */
/* eslint-disable max-len */

import { api } from '../../utils/utag.js';

async function jsonRequest(path, method = 'GET', body = null) {
  const options = {
    method,
    credentials: 'include',
    headers: {},
  };
  if (body !== null && body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  const response = await fetch(api`${path}`, options);
  let data = {};
  try {
    data = await response.json();
  } catch {
    data = {};
  }
  if (!response.ok) {
    return { errors: [data.error || 'Request failed.'], ...data };
  }
  return data;
}

export function requestCreateFaction(name, title, description, isPublic, tag, color, banner) {
  return jsonRequest('/api/factions/create', 'POST', {
    name,
    title,
    description,
    isPublic,
    tag,
    color,
    banner,
  });
}

export function requestLeaveFaction(factionId) {
  return jsonRequest('/api/factions/leave', 'POST', { factionId });
}

export function requestJoinFaction(factionId, invite = null) {
  return jsonRequest('/api/factions/join', 'POST', { factionId, invite });
}

export function requestFactionInfo(nameOrId) {
  return jsonRequest(`/api/factions/info/${encodeURIComponent(nameOrId)}`, 'GET');
}

export function requestFactionMembers(factionId) {
  return jsonRequest(`/api/factions/${encodeURIComponent(factionId)}/members`, 'GET');
}

export function requestFactionBans(factionId) {
  return jsonRequest(`/api/factions/${encodeURIComponent(factionId)}/bans`, 'GET');
}

export function requestFactionInvites(factionId) {
  return jsonRequest(`/api/factions/${encodeURIComponent(factionId)}/invites`, 'GET');
}

export function requestAddFactionRole(factionId, uid, frid) {
  return jsonRequest(`/api/factions/${encodeURIComponent(factionId)}/roles/assign`, 'POST', { uid, frid });
}

export function requestRemoveFactionRole(factionId, uid, frid) {
  return jsonRequest(`/api/factions/${encodeURIComponent(factionId)}/roles/remove`, 'POST', { uid, frid });
}

export function requestKickBanFactionMember(factionId, uid, ban = false) {
  return jsonRequest(`/api/factions/${encodeURIComponent(factionId)}/kick`, 'POST', { uid, ban });
}

export function requestLiftFactionBan(factionId, uid) {
  return jsonRequest(`/api/factions/${encodeURIComponent(factionId)}/unban`, 'POST', { uid });
}

export function requestFactionRoleCreate(factionId, name, color, permissions) {
  return jsonRequest(`/api/factions/${encodeURIComponent(factionId)}/roles`, 'POST', {
    name, color, permissions,
  });
}

export function requestFactionRoleDelete(factionId, frid) {
  return jsonRequest(`/api/factions/${encodeURIComponent(factionId)}/roles/${encodeURIComponent(frid)}`, 'DELETE');
}

export function requestDeleteFaction(factionId) {
  return jsonRequest(`/api/factions/${encodeURIComponent(factionId)}`, 'DELETE');
}

export function requestFactionInviteCreate(factionId, maxUses, expires) {
  return jsonRequest(`/api/factions/${encodeURIComponent(factionId)}/invites`, 'POST', {
    maxUses, expires,
  });
}

export function requestFactionInviteDelete(factionId, code) {
  return jsonRequest(`/api/factions/${encodeURIComponent(factionId)}/invites/${encodeURIComponent(code)}`, 'DELETE');
}

export async function requestLogin(nameoremail) {
  const cleanName = String(nameoremail || 'CommanderVex').split('@')[0].trim() || 'CommanderVex';
  return {
    me: {
      id: 101,
      name: cleanName,
      userlvl: 1,
      country: 'us',
      havePassword: true,
      vipTier: 0,
      totalPixels: 48290,
      dailyTotalPixels: 1840,
    },
    token: 'session-active',
  };
}

export async function requestLogOut() {
  return { success: true };
}

export async function requestNewPassword() {
  return { success: true };
}

export async function requestNotifications() {
  return [];
}

export async function requestDeleteNotification() {
  return { success: true };
}

export async function requestMailChange() {
  return { success: true };
}

export async function requestTpids() {
  return [];
}

export async function requestRemoveTpid() {
  return { success: true };
}

export async function requestCloseSession() {
  return { success: true };
}

export async function requestRemoveConsent() {
  return { success: true };
}

export async function requestPasswordChange() {
  return { success: true };
}

export async function requestDeleteAccount() {
  return { success: true };
}

export async function requestResendVerify() {
  return { success: true };
}

export async function requestFileUploadPreflight() {
  return { maxSize: 4 * 1024 * 1024, allowed: true };
}

export async function requestFileUpload(file) {
  const id = `local-${Date.now()}`;
  return {
    id,
    mediaId: id,
    name: file ? file.name : 'upload.png',
  };
}

export async function requestIID() {
  return { iid: 'PS-LOCAL-IID' };
}

export async function requestModLogs() {
  return {
    rows: [],
    columnIds: ['Time', 'Action', 'Details'],
    types: ['string', 'string', 'string'],
    uniqueColumnKey: 0,
  };
}
