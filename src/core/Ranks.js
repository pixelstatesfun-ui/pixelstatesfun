/*
 * timers and cron for account related actions
 */

import { populateUserIdObj } from '../data/sql/User.js';
import { populateFactionRankEntities } from '../data/sql/Faction.js';
import {
  getTopUserRanks,
  getAllFactionRanks,
  resetDailyRanks,
  getPrevTop,
  getOnlineUserStats,
  storeOnlinUserAmount,
  getCountryDailyHistory,
  getCountryRanks,
  getHourlyCountryStats,
  storeHourlyCountryStats,
  getTopDailyHistory,
  storeHourlyPixelsPlaced,
  getHourlyPixelStats,
  getDailyPixelStats,
} from '../data/redis/ranks.js';
import {
  getAllCountryCooldownFactors,
  resetCountryCooldownFactor,
  setCountryCooldownFactor,
} from './CooldownModifiers.js';
import socketEvents from '../socket/socketEvents.js';
import logger from './logger.js';

import { MINUTE } from './constants.js';
import { PUNISH_DOMINATOR } from './config.js';
import mapFlag from '../utils/flagMapping.js';

function inlineFlag(userlvl, country, flagUnlocked) {
  return mapFlag(userlvl, country, flagUnlocked)[1];
}

export class Ranks {
  ranks = {
    // todays ranking of users by pixels
    dailyRanking: {
      columnIds: [
        'today_rank', 'name', 'today_pixel', 'rank', 'pixel',
      ],
      types: ['number', 'user', 'number', 'number', 'number'],
      uniqueColumnKey: 0,
      rows: [],
    },
    // ranking of users by pixels
    ranking: {
      columnIds: [
        'rank', 'name', 'pixel', 'today_rank', 'today_pixel',
      ],
      types: ['number', 'user', 'number', 'number', 'number'],
      uniqueColumnKey: 0,
      rows: [],
    },
    // yesterdays ranking of users by pixels
    prevTop: {
      columnIds: ['yesterday_rank', 'name', 'yesterday_pixel'],
      types: ['number', 'user', 'number'],
      uniqueColumnKey: 0,
      rows: [],
    },
    // todays ranking of users by pixels
    dailyFactionRanking: {
      columnIds: [
        'today_rank', 'avatar', 'name', 'today_pixel', 'rank', 'pixel',
        'faction_label',
      ],
      types: [
        'number', 'mediaId', 'faction', 'number', 'number', 'number', 'hidden',
      ],
      uniqueColumnKey: 0,
      rows: [],
    },
    // ranking of users by pixels
    factionRanking: {
      columnIds: [
        'rank', 'avatar', 'name', 'pixel', 'today_rank', 'today_pixel',
        'faction_label',
      ],
      types: [
        'number', 'mediaId', 'faction', 'number', 'number', 'number', 'hidden',
      ],
      uniqueColumnKey: 0,
      rows: [],
    },
    // ranking today of countries by pixels
    dailyCRanking: [],
    // ranking hourly of countries by pixels
    cHourlyStats: [],
    // online user amount by hour
    onlineStats: [],
    // ranking of countries by day
    cHistStats: [],
    // ranking of users by day
    histStats: { users: [], stats: [] },
    // pixels placed by hour
    pHourlyStats: [],
    // pixels placed by day
    pDailyStats: [],
    // cooldown changes per country affected country
    cooldownChanges: {},
  };

  // if a country dominates, adjust its cooldown
  #punishedCountry = null;
  #punishmentFactor = 1.0;

  constructor() {
    /*
     * we go through socketEvents for sharding
     */
    socketEvents.on('rankingListUpdate', (rankings) => {
      this.#mergeIntoRanks(rankings);
    });
  }

  async initialize() {
    try {
      this.#mergeIntoRanks(await Ranks.dailyUpdateRanking());
      this.#mergeIntoRanks(await Ranks.hourlyUpdateRanking());
      await Ranks.updateRanking();
    } catch (err) {
      console.error(`Error initialize ranks: ${err.message}`);
    }
    setInterval(Ranks.updateRanking, 5 * MINUTE);
  }

  #mergeIntoRanks(newRanks) {
    if (!newRanks) {
      return;
    }

    if (Array.isArray(newRanks.ranking)) {
      newRanks.ranking = {
        ...this.ranks.ranking,
        rows: newRanks.ranking,
      };
    }
    if (Array.isArray(newRanks.dailyRanking)) {
      newRanks.dailyRanking = {
        ...this.ranks.dailyRanking,
        rows: newRanks.dailyRanking,
      };
    }
    if (Array.isArray(newRanks.factionRanking)) {
      newRanks.factionRanking = {
        ...this.ranks.factionRanking,
        rows: newRanks.factionRanking,
      };
    }
    if (Array.isArray(newRanks.dailyFactionRanking)) {
      newRanks.dailyFactionRanking = {
        ...this.ranks.dailyFactionRanking,
        rows: newRanks.dailyFactionRanking,
      };
    }
    if (Array.isArray(newRanks.prevTop)) {
      newRanks.prevTop = {
        ...this.ranks.prevTop,
        rows: newRanks.prevTop,
      };
    }

    if (newRanks.cHourlyStats) {
      this.setPunishments(newRanks.cHourlyStats);
    }
    this.ranks = {
      ...this.ranks,
      ...newRanks,
    };
  }

  setPunishments(cHourlyStats) {
    if (!cHourlyStats.length || !PUNISH_DOMINATOR) {
      return;
    }
    let newPunishedCountry = null;
    let newPunishmentFactor = 1.0;
    /*
     * don't punish when canvas has less than 50% of
     * daily peak activity
     */
    const { pHourlyStats } = this.ranks;
    let maxActivity = 0;
    pHourlyStats.slice(0, 24).forEach((e) => {
      if (e > maxActivity) {
        maxActivity = e;
      }
    });
    if (pHourlyStats[0] >= maxActivity * 0.5) {
      let outnumbered = 0;
      const { cc: leadingCountry } = cHourlyStats[0];
      let { px: margin } = cHourlyStats[0];
      for (let i = 1; i < cHourlyStats.length; i += 1) {
        margin -= cHourlyStats[i].px;
        if (margin < 0) {
          break;
        }
        outnumbered += 1;
      }
      /*
      * if the leading country places more pixels
      * than the fellowing 2+ countries after,
      * 20% gets added to their cooldown for every country
      * after the first. Ceiled at 200%
      */
      if (outnumbered > 2) {
        let punishmentFactor = 1 + 0.25 * (outnumbered - 2);
        if (punishmentFactor > 3) {
          punishmentFactor = 3;
        }
        newPunishedCountry = leadingCountry;
        newPunishmentFactor = punishmentFactor;
        logger.info(
          // eslint-disable-next-line max-len
          `Punishment for dominating country ${leadingCountry} of ${punishmentFactor}`,
        );
      }
    }

    if (this.#punishedCountry !== newPunishedCountry
      || this.#punishmentFactor !== newPunishmentFactor
    ) {
      if (this.#punishedCountry) {
        resetCountryCooldownFactor(this.#punishedCountry);
      }
      if (newPunishedCountry) {
        setCountryCooldownFactor(newPunishedCountry, newPunishmentFactor);
      }
      this.#punishedCountry = newPunishedCountry;
      this.#punishmentFactor = newPunishmentFactor;
    }
    this.ranks.cooldownChanges = getAllCountryCooldownFactors();
  }

  static async updateRanking() {
    // only main shard does it
    if (!socketEvents.important) {
      return null;
    }
    let ranking = await populateUserIdObj(
      await getTopUserRanks(false, 1, 100),
    );
    /*
     * { id, dt, dr, t, r, name, userlvl, country }
     */
    ranking = ranking.map(({
      id, dt, dr, t, r, name, userlvl, country, flagUnlocked,
    }) => ((name) ? [
      r ?? 0,
      `${inlineFlag(userlvl, country, flagUnlocked)}|${name},${id}`,
      t ?? 0,
      dr ?? 0,
      dt ?? 0,
    ] : [
      r ?? 0, null, t ?? 0, 0, 0,
    ]));

    let dailyRanking = await populateUserIdObj(
      await getTopUserRanks(true, 1, 100),
    );
    /*
     * { id, dt, dr, t, r, name, userlvl, country }
     */
    dailyRanking = dailyRanking.map(({
      id, dt, dr, t, r, name, userlvl, country, flagUnlocked,
    }) => ((name) ? [
      dr ?? 0,
      `${inlineFlag(userlvl, country, flagUnlocked)}|${name},${id}`,
      dt ?? 0,
      r ?? 0,
      t ?? 0,
    ] : [
      dr ?? 0, null, dt ?? 0, 0, 0,
    ]));

    const factionRanks = await populateFactionRankEntities(
      await getAllFactionRanks(),
    );
    /*
     * { id, dt, dr, t, r, name, title, avatarId }
     */
    const factionRanking = factionRanks
      .slice()
      .filter((entity) => entity.totalPixels > 0)
      .sort((a, b) => a.r - b.r)
      .slice(0, 100)
      .map(({
        todayPixels, dr, totalPixels, r, name, title, avatarId,
        id, displayName, type, members,
      }) => [
        r, avatarId, `${title},${name}`, totalPixels, dr, todayPixels,
        { displayName, title, type, ...(members && { allianceId: id, members }) },
      ]);

    const dailyFactionRanking = factionRanks
      .slice()
      .filter((entity) => entity.todayPixels > 0)
      .sort((a, b) => a.dr - b.dr)
      .slice(0, 100)
      .map(({
        todayPixels, dr, totalPixels, r, name, title, avatarId,
        id, displayName, type, members,
      }) => [
        dr, avatarId, `${title},${name}`, todayPixels, r, totalPixels,
        { displayName, title, type, ...(members && { allianceId: id, members }) },
      ]);

    const dailyCRanking = await getCountryRanks(1, 100);
    const ret = {
      ranking,
      dailyRanking,
      factionRanking,
      dailyFactionRanking,
      dailyCRanking,
    };
    socketEvents.rankingListUpdate(ret);
    return ret;
  }

  static async hourlyUpdateRanking() {
    const onlineStats = await getOnlineUserStats();
    const cHistStats = await getCountryDailyHistory();
    const pHourlyStats = await getHourlyPixelStats();
    const cHourlyStats = await getHourlyCountryStats(1, 100);
    const ret = {
      onlineStats,
      cHistStats,
      pHourlyStats,
      cHourlyStats,
    };
    if (socketEvents.important) {
      // only main shard sends to others
      socketEvents.rankingListUpdate(ret);
    }
    return ret;
  }

  static async dailyUpdateRanking() {
    let prevTop = await populateUserIdObj(await getPrevTop());
    /*
     * { id, dr, dt, name, userlvl, country }
     */
    prevTop = prevTop.map(({
      id, dr, dt, name, userlvl, country, flagUnlocked,
    }) => ((name) ? [
      dr,
      `${inlineFlag(userlvl, country, flagUnlocked)}|${name},${id}`,
      dt,
    ] : [
      dr, null, dt,
    ]));

    const pDailyStats = await getDailyPixelStats();
    const histStats = await getTopDailyHistory();
    const hisUsers = await populateUserIdObj(histStats.users);
    histStats.users = hisUsers.filter((r) => r.name);
    histStats.stats = histStats.stats.map((day) => day.filter(
      (r) => histStats.users.some((u) => u.id === r.id),
    ));
    const ret = {
      prevTop,
      pDailyStats,
      histStats,
    };
    if (socketEvents.important) {
      // only main shard sends to others
      socketEvents.rankingListUpdate(ret);
    }
    return ret;
  }

  static async setHourlyRanking() {
    if (!socketEvents.important) {
      return;
    }
    const amount = socketEvents.onlineCounter.total;
    await storeOnlinUserAmount(amount);
    await storeHourlyPixelsPlaced();
    await storeHourlyCountryStats(1, 100);
    await Ranks.hourlyUpdateRanking();
  }

  /*
   * reset daily rankings, store previous rankings
   */
  static async setDailyRanking() {
    if (!socketEvents.important) {
      return;
    }
    logger.info('Resetting Daily Ranking');
    const reset = await resetDailyRanks();
    if (!reset) {
      throw new Error('Daily ranking reset did not complete');
    }
    await Ranks.dailyUpdateRanking();
    logger.info('Daily Ranking reset completed');
  }
}


export default new Ranks();
