import {
  deleteUserNotification, getUserNotifications,
} from '../../data/sql/Notification.js';

export async function listNotifications(req, res) {
  const notifications = await getUserNotifications(req.user.id);
  res.json(notifications);
}

export async function deleteNotification(req, res) {
  req.tickRateLimiter(1000);
  const { notificationId, clearAll } = req.body || {};
  let id = null;
  if (clearAll !== true) {
    if (typeof notificationId !== 'string'
      || !/^[1-9]\d{0,19}$/.test(notificationId)
    ) {
      res.status(400).json({ errors: ['Invalid notification ID'] });
      return;
    }
    id = notificationId;
  }
  const success = await deleteUserNotification(req.user.id, id);
  if (!success) {
    res.status(500).json({ errors: ['Could not delete notifications'] });
    return;
  }
  res.json({ status: 'ok' });
}
