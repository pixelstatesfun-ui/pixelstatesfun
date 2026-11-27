import { useEffect, useState } from 'preact/hooks';
import { t } from 'ttag';

import { USERLVL } from '../core/constants.js';
import { IoTrashOutline } from 'react-icons/io5';
import {
  requestDeleteNotification, requestNotifications,
} from '../store/actions/fetch.js';
import useLink from './hooks/link.js';

const UserNotifications = () => {
  const [notifications, setNotifications] = useState([]);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState(null);
  const [clearingAll, setClearingAll] = useState(false);
  const link = useLink();
  const notifyCountChanged = (count) => {
    window.dispatchEvent(new CustomEvent(
      'user-notifications-updated',
      { detail: count },
    ));
  };

  useEffect(() => {
    let mounted = true;
    requestNotifications().then((response) => {
      if (!mounted) {
        return;
      }
      if (response.errors) {
        setError(response.errors[0]);
        return;
      }
      setNotifications(Array.isArray(response) ? response : []);
      notifyCountChanged(Array.isArray(response) ? response.length : 0);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const deleteNotification = async (id) => {
    if (deletingId !== null || clearingAll) {
      return;
    }
    setDeletingId(String(id));
    setError('');
    const errors = await requestDeleteNotification(id);
    if (errors.length) {
      setError(errors[0]);
    } else {
      const updated = notifications.filter(
        (notification) => String(notification.id) !== String(id),
      );
      setNotifications(updated);
      notifyCountChanged(updated.length);
    }
    setDeletingId(null);
  };

  const clearAll = async () => {
    if (deletingId !== null || clearingAll) {
      return;
    }
    setClearingAll(true);
    setError('');
    const errors = await requestDeleteNotification();
    if (errors.length) {
      setError(errors[0]);
    } else {
      setNotifications([]);
      notifyCountChanged(0);
    }
    setClearingAll(false);
  };

  return (
    <div className="user-notifications">
      <h3>{t`Notifications`}</h3>
      {error && <p className="errormessage">{error}</p>}
      {!notifications.length && (
        <p>{t`You have no notifications.`}</p>
      )}
      {notifications.map((notification) => {
        const {
          id, senderUid, senderName, senderUserlvl, message, createdAt,
        } = notification;
        const senderRole = senderUserlvl >= USERLVL.ADMIN
          ? t`Admin`
          : senderUserlvl >= USERLVL.MOD
            ? t`Moderator` : t`Player`;
        const timestamp = new Date(createdAt);
        return (
          <article className="user-notification" key={id}>
            <div>
              <strong>
                {senderUid ? (
                  <span
                    role="button"
                    tabIndex={0}
                    className="modallink"
                    onClick={() => link('USER', {
                      target: 'parent',
                      args: { username: senderUid },
                    })}
                  >
                    {senderName}
                  </span>
                ) : senderName}
                {` (${senderRole})`}
              </strong>
              <time dateTime={timestamp.toISOString()}>
                {timestamp.toLocaleString()}
              </time>
              <p>{message}</p>
            </div>
            <button
              type="button"
              className="user-notification-delete"
              aria-label={t`Delete notification`}
              title={t`Delete notification`}
              disabled={deletingId !== null || clearingAll}
              onClick={() => deleteNotification(id)}
            >
              <IoTrashOutline />
            </button>
          </article>
        );
      })}
      {notifications.length > 0 && (
        <div className="user-notifications-actions">
          <button
            type="button"
            disabled={deletingId !== null || clearingAll}
            onClick={clearAll}
          >
            {clearingAll ? t`Clearing...` : t`Clear all`}
          </button>
        </div>
      )}
    </div>
  );
};

export default UserNotifications;
