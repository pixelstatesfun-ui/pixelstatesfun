import {
  DISCORD_BOT_TOKEN,
  DISCORD_GUILD_ID,
  DISCORD_ROLE_PRINCE_VIP,
  DISCORD_ROLE_KING_VIP,
  DISCORD_ROLE_EMPEROR_VIP,
  DISCORD_ROLE_TRIAL_MOD,
  DISCORD_ROLE_MODERATOR,
} from './config.js';
import { THREEPID_PROVIDERS, USERLVL } from './constants.js';
import { getTpid } from '../data/sql/ThreePID.js';

const VIP_ROLE_IDS = [
  DISCORD_ROLE_PRINCE_VIP,
  DISCORD_ROLE_KING_VIP,
  DISCORD_ROLE_EMPEROR_VIP,
];
const MODERATOR_ROLE_IDS = [
  DISCORD_ROLE_TRIAL_MOD,
  DISCORD_ROLE_MODERATOR,
];

function isConfigured(roleIds) {
  return !!(
    DISCORD_BOT_TOKEN
    && DISCORD_GUILD_ID
    && roleIds.every((roleId) => roleId)
    && typeof fetch === 'function'
  );
}

async function discordRequest(method, path) {
  const response = await fetch(`https://discord.com/api/v10${path}`, {
    method,
    headers: {
      Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
      'User-Agent': 'PixelPlanet (Discord role sync)',
    },
  });
  if (!response.ok) {
    throw new Error(`Discord API returned HTTP ${response.status}`);
  }
  return response.status === 204 ? null : response.json();
}

async function syncRoles(uid, roleIds, selectedRoleId) {
  if (!isConfigured(roleIds)) {
    return {
      success: false,
      reason: 'Discord bot role sync is not fully configured',
    };
  }
  try {
    const discordId = await getTpid(uid, THREEPID_PROVIDERS.DISCORD);
    if (!discordId) {
      return {
        success: false,
        reason: 'the account has no linked Discord account',
      };
    }
    const memberPath = `/guilds/${DISCORD_GUILD_ID}/members/${discordId}`;
    const member = await discordRequest('GET', memberPath);
    const roles = new Set(member.roles);
    await Promise.all(roleIds.map((roleId) => {
      const hasRole = roles.has(roleId);
      const shouldHaveRole = roleId === selectedRoleId;
      if (shouldHaveRole && !hasRole) {
        return discordRequest('PUT', `${memberPath}/roles/${roleId}`);
      }
      if (!shouldHaveRole && hasRole) {
        return discordRequest('DELETE', `${memberPath}/roles/${roleId}`);
      }
      return null;
    }));
    return { success: true };
  } catch (error) {
    console.error(
      `Discord role sync failed for user ${uid}: ${error.message}`,
    );
    return { success: false, reason: 'Discord API request failed' };
  }
}

export function syncVipRole(uid, vipTier) {
  return syncRoles(uid, VIP_ROLE_IDS, VIP_ROLE_IDS[vipTier - 1] || null);
}

export function syncModeratorRole(uid, userlvl) {
  let roleId = null;
  if (userlvl === USERLVL.TRIALMOD) {
    [roleId] = MODERATOR_ROLE_IDS;
  } else if (userlvl === USERLVL.MOD) {
    [, roleId] = MODERATOR_ROLE_IDS;
  }
  return syncRoles(uid, MODERATOR_ROLE_IDS, roleId);
}
