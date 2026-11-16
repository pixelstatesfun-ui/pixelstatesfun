/*
 *
 * Database layout for Chat Messages
 *
 */
import pool from './mariadb.js';
import {
  CHANNEL_TYPES, USER_FLAGS, USER_FACTION_FLAGS,
} from '../../core/constants.js';
import mapFlag from '../../utils/flagMapping.js';
import parseAttachmentsFromMd from '../../utils/markdown/attachmentParser.js';
import { getMediaFromLinks } from '../../utils/media/serverUtils.js';
import { VIP_ENABLED } from '../../core/config.js';


/**
 * store message, may throw an Error
 * @param message
 * @param cid channel id
 * @param uid user id
 * @return message id or null
 */
export async function storeMessage(message, cid, uid) {
  if (message.length > 200) {
    throw new Error('too_long');
  }
  const media = getMediaFromLinks(parseAttachmentsFromMd(message));
  if (media.length > 3) {
    throw new Error('too_many_files');
  }

  let models;
  let retries = 3;
  while (!models && retries) {
    retries -= 1;
    try {
      // eslint-disable-next-line no-await-in-loop
      models = await pool.query(
        'CALL STORE_CHAT_MESSAGE(?, ?, ?, ?)', [
          cid, uid, message,
          (media.length) ? JSON.stringify(media) : null,
        ],
      );
    } catch (error) {
      /*
       * message storing can deadlock
       */
      if (error.code !== 'ER_LOCK_DEADLOCK') {
        console.error(
          `SQL Error on storeMessage ${cid} | ${uid}: ${error.message}`,
        );
        throw new Error('store_error');
      }
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => { setTimeout(resolve, 500); });
    }
  }

  if (!models) {
    console.error(
      // eslint-disable-next-line max-len
      `SQL Error on storeMessage ${cid} | ${uid}: Could not aquire lock within three tries`,
    );
    throw new Error('store_error');
  }
  const [[{ result, id }]] = models;
  if (result === 1) {
    throw new Error('no_such_channel');
  }
  if (result !== 0) {
    throw new Error('store_error');
  }
  /*
    * if second result set exists, media got attached
    */
  const attachments = [];
  if (models[1]) {
    [, models] = models;
    for (let i = 0; i < models.length; i += 1) {
      const {
        mediaId, mediaType, mediaSize, mediaWidth, mediaHeight, mediaAvgColor,
      } = models[i];
      attachments.push([
        mediaId, mediaType, mediaSize, mediaWidth, mediaHeight, mediaAvgColor,
      ]);
    }
  }

  return [id, attachments];
}

/**
 * delete all messages of a user written in public channels
 * @param uid user id
 * @return success
 */
export async function deletePublicUserMessages(uid) {
  if (!uid) {
    return false;
  }
  try {
    await pool.query(
      `DELETE m FROM Messages m
  INNER JOIN Channels c ON m.cid = c.id
WHERE m.uid = ? AND c.type = ?`,
      [uid, CHANNEL_TYPES.PUBLIC],
    );
    return true;
  } catch (error) {
    console.error(`SQL Error on deleteUserMessages: ${error.message}`);
  }
  return false;
}

/**
 * delete all messages of a user written in public channels
 * @param uid user id
 * @return success
 */
export async function deleteUserChannelMessages(uid, cid) {
  try {
    await pool.query(
      'DELETE FROM Messages WHERE uid = ? AND cid = ?', [uid, cid],
    );
    return true;
  } catch (error) {
    console.error(`SQL Error on deleteUserChannelMessages: ${error.message}`);
  }
  return false;
}

/**
 * Delete every message from one channel.
 * @param cid channel id
 * @return success
 */
export async function deleteChannelMessages(cid) {
  if (!Number.isSafeInteger(cid) || cid <= 0) {
    return false;
  }
  try {
    await pool.query('DELETE FROM Messages WHERE cid = ?', [cid]);
    return true;
  } catch (error) {
    console.error(`SQL Error on deleteChannelMessages: ${error.message}`);
  }
  return false;
}

/**
 * delete messages by ids
 * @param ids ids of messages
 * @return success
 */
export async function deleteMessagesByIds(ids) {
  if (!ids) {
    return false;
  }
  if (!Array.isArray(ids)) {
    ids = [ids];
  }
  if (!ids.length) {
    return false;
  }
  try {
    await pool.query(
      `DELETE m FROM Messages m WHERE id in (${
        ids.map(() => '?').join(', ')
      })`,
      ids,
    );
    return true;
  } catch (error) {
    console.error(`SQL Error on deleteMessagesByIds: ${error.message}`);
  }
  return false;
}

/**
 * delete speciic message
 * @param mid message id
 * @return success
 */
export async function deleteMessage(mid) {
  if (!mid) {
    return false;
  }
  try {
    await pool.query('DELETE FROM Messages WHERE id = ?', [mid]);
    return true;
  } catch (error) {
    console.error(`SQL Error on deleteUserMessages: ${error.message}`);
  }
  return false;
}

/**
 * delete one message and return its channel id
 * @param mid message id
 * @return channel id, null if missing, false if the deletion failed
 */
export async function deleteMessageAndGetChannel(mid) {
  if (!mid) {
    return null;
  }
  let conn;
  try {
    conn = await pool.getConnection();
    const [message] = await conn.query(
      'SELECT cid FROM Messages WHERE id = ?',
      [mid],
    );
    if (!message) {
      return null;
    }
    const result = await conn.query(
      'DELETE FROM Messages WHERE id = ?',
      [mid],
    );
    return result.affectedRows ? message.cid : null;
  } catch (error) {
    console.error(`SQL Error on deleteMessageAndGetChannel: ${error.message}`);
    return false;
  } finally {
    if (conn) conn.release();
  }
}

/**
 * Delete one message only if it belongs to the requesting user.
 * @param mid message id
 * @param userId message owner id
 * @return channel id, null if missing or not owned, false if deletion failed
 */
export async function deleteOwnMessageAndGetChannel(mid, userId) {
  if (!mid || !userId) {
    return null;
  }
  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();
    const [message] = await conn.query(
      'SELECT cid FROM Messages WHERE id = ? AND uid = ? FOR UPDATE',
      [mid, userId],
    );
    if (!message) {
      await conn.rollback();
      return null;
    }
    const result = await conn.query(
      'DELETE FROM Messages WHERE id = ? AND uid = ?',
      [mid, userId],
    );
    if (!result.affectedRows) {
      await conn.rollback();
      return null;
    }
    await conn.commit();
    return message.cid;
  } catch (error) {
    if (conn) {
      await conn.rollback();
    }
    console.error(
      `SQL Error on deleteOwnMessageAndGetChannel: ${error.message}`,
    );
    return false;
  } finally {
    if (conn) {
      conn.release();
    }
  }
}

/**
 * get recent history of channel
 * @param cid channel id
 * @param limit amount of last messages to get
 * @return rows with name, message, flag, user id, timestamp, avatar,
 *   VIP tier, and optional nickname color
 */
export async function getMessagesForChannel(cid, limit) {
  try {
    const models = await pool.query(
      /* eslint-disable max-len */
      `SELECT DISTINCT m.createdAt, m.id AS msgId, m.message, m.uid AS userId,
UNIX_TIMESTAMP(m.createdAt) AS 'ts',
CONCAT(IF(faction.tag IS NULL, '', CONCAT('[', faction.tag, '] ')), u.name) AS name,
u.userlvl,
IF(? AND (u.vipExpires IS NULL OR u.vipExpires > NOW()), u.vipTier, 0) AS vipTier,
IF(? AND u.vipTier >= 3 AND (u.vipExpires IS NULL OR u.vipExpires > NOW()),
  p.nicknameColor, NULL) AS nicknameColor,
IF(? AND u.vipTier >= 3 AND (u.vipExpires IS NULL OR u.vipExpires > NOW()),
  p.nicknameGradient, NULL) AS nicknameGradient,
IF(? AND u.vipTier >= 1 AND (u.vipExpires IS NULL OR u.vipExpires > NOW()),
  COALESCE(p.avatarGlow, 'gold'), NULL) AS avatarGlow,
u.flags,
COALESCE((SELECT s.country FROM Sessions s WHERE s.uid = u.id ORDER BY s.id DESC LIMIT 1), 'xx') AS country,
CONCAT(b.shortId, ':', b.extension) AS mediaId, b.type AS mediaType, b.size AS mediaSize, b.width AS mediaWidth, b.height AS mediaHeight, b.avgColor AS mediaAvgColor,
CONCAT(a.shortId, ':', a.extension) AS avatarId FROM Messages m
  INNER JOIN Users u ON u.id = m.uid
  LEFT JOIN Profiles p ON p.uid = u.id
  LEFT JOIN Factions faction ON faction.id = (
    SELECT visibleFaction.fid FROM UserFactions visibleFaction
    WHERE visibleFaction.uid = u.id
      AND (visibleFaction.flags & ${0x01 << USER_FACTION_FLAGS.HIDDEN}) = 0
    ORDER BY visibleFaction.joined DESC LIMIT 1
  )
  LEFT JOIN Media a ON a.id = p.avatar
  LEFT JOIN MessageMedia mm ON mm.sid = m.id
  LEFT JOIN Media b ON b.id = mm.mid
WHERE m.cid = ? ORDER BY m.id DESC LIMIT ?`,
      /* eslint-enable max-len */
      [VIP_ENABLED, VIP_ENABLED, VIP_ENABLED, VIP_ENABLED, cid, limit],
    );
    const rows = [];
    const mediaReferences = new Map();

    let i = models.length;
    while (i > 0) {
      i -= 1;
      const model = models[i];
      const { name, message, userId, ts, msgId, avatarId, mediaId } = model;
      const flagUnlocked = (
        model.flags & (0x01 << USER_FLAGS.COUNTRY_FLAG_UNLOCKED)
      ) !== 0;
      const [flagLegit, flag] = mapFlag(
        model.userlvl, model.country, flagUnlocked,
      );
      if (mediaId) {
        let attachments = mediaReferences.get(msgId);
        if (!attachments) {
          attachments = [];
          rows.push(
            [
              name, message, flag, userId, ts, msgId, flagLegit, avatarId,
              attachments, 0, model.vipTier,
              model.nicknameColor, model.nicknameGradient, model.avatarGlow,
            ],
          );
          mediaReferences.set(msgId, attachments);
        }
        const {
          mediaType, mediaSize, mediaWidth, mediaHeight, mediaAvgColor,
        } = model;
        attachments.push([
          mediaId, mediaType, mediaSize, mediaWidth, mediaHeight, mediaAvgColor,
        ]);
      } else {
        rows.push(
          [
            name, message, flag, userId, ts, msgId, flagLegit, avatarId, [],
            0, model.vipTier,
            model.nicknameColor, model.nicknameGradient, model.avatarGlow,
          ],
        );
      }
    }
    return rows;
  } catch (error) {
    console.error(`SQL Error on getMessagesForChannel: ${error.message}`);
  }
  return [];
}
