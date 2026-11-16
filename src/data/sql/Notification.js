import pool from './mariadb.js';

const IID_PATTERN = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;

export async function findNotificationTarget(target) {
  if (typeof target !== 'string' || !target.trim()) {
    return null;
  }
  const value = target.trim();

  let model;
  if (IID_PATTERN.test(value)) {
    [model] = await pool.query(
      `SELECT u.id, u.name FROM Users u
INNER JOIN UserIPs ui ON ui.uid = u.id
INNER JOIN IPs i ON i.ip = ui.ip
WHERE BIN_TO_UUID(i.uuid) = LOWER(?)
ORDER BY ui.lastSeen DESC LIMIT 1`,
      [value],
    );
  } else if (/^\d+$/.test(value)) {
    if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) {
      return null;
    }
    [model] = await pool.query(
      'SELECT id, name FROM Users WHERE id = ? LIMIT 1',
      [Number(value)],
    );
  } else {
    if (value.length > 32) {
      return null;
    }
    [model] = await pool.query(
      `SELECT id, name FROM Users
WHERE name = ? OR username = CONVERT(? USING ascii)
ORDER BY (name = ?) DESC LIMIT 1`,
      [value, value.toLowerCase(), value],
    );
  }
  return model || null;
}

export async function createUserNotification(
  uid, senderUid, senderName, senderUserlvl, message,
) {
  const { insertId } = await pool.query(
    `INSERT INTO UserNotifications
  (uid, senderUid, senderName, senderUserlvl, message)
VALUES (?, ?, ?, ?, ?)`,
    [uid, senderUid, senderName, senderUserlvl, message],
  );
  return insertId;
}

export async function getUserNotifications(uid) {
  return pool.query(
    `SELECT CAST(id AS CHAR) AS id, senderUid, senderName, senderUserlvl,
  message, createdAt
FROM UserNotifications
WHERE uid = ?
ORDER BY createdAt DESC, id DESC LIMIT 100`,
    [uid],
  );
}

export async function deleteUserNotification(uid, notificationId = null) {
  if (!Number.isSafeInteger(uid) || uid <= 0) {
    return false;
  }
  try {
    if (notificationId === null) {
      await pool.query(
        'DELETE FROM UserNotifications WHERE uid = ?',
        [uid],
      );
    } else {
      await pool.query(
        'DELETE FROM UserNotifications WHERE uid = ? AND id = ?',
        [uid, notificationId],
      );
    }
    return true;
  } catch (error) {
    console.error(`SQL Error on deleteUserNotification: ${error.message}`);
  }
  return false;
}
