/*
 * user context menu
 */
import { t } from 'ttag';

import { startDm, setUserBlock } from '../../store/actions/thunks.js';
import { deleteMessages } from '../../store/actions/socket.js';
import { USERLVL } from '../../core/constants.js';
import { api } from '../../utils/utag.js';
import { escapeMd } from '../../core/utils.js';

export default function userContextMenu(store, args) {
  const {
    name, uid, setChannel, addToInput, msgId, channelId,
  } = args;

  const items = [{
    id: 'pi',
    type: 'func',
    func: () => {
      const ping = `@[${escapeMd(name)}](${uid})`;
      addToInput(ping);
    },
    text: t`Ping`,
  }, {
    id: 'pr',
    type: 'link',
    link: 'USER',
    /*
     * this is currently supported since we expose uid and use it a lot
     */
    args: { username: uid },
    text: t`Profile`,

  }, {
    id: 'dm',
    type: 'func',
    func: () => {
      /*
       * if dm channel already exists,
       * just switch
       */
      const { chat: { channels } } = store.getState();
      const cids = Object.keys(channels);
      for (let i = 0; i < cids.length; i += 1) {
        const cid = cids[i];
        if (channels[cid].length === 4 && channels[cid][3] === uid) {
          setChannel(cid);
          return;
        }
      }
      store.dispatch(startDm({ userId: uid }, setChannel));
    },
    text: t`DM`,
  }, {
    id: 'bl',
    type: 'func',
    func: () => {
      store.dispatch(setUserBlock(uid, name, true));
    },
    text: t`Block`,
  }];

  if (msgId && channelId && Number(uid) === store.getState().user.id) {
    items.push({
      id: 'deleteownmsg',
      type: 'confirm',
      func: async () => {
        const response = await fetch(api`/api/chatmoderation/delete`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messageId: msgId, deleteOwn: true }),
        });
        if (!response.ok) {
          const { errors } = await response.json();
          throw new Error(errors?.[0] || 'Could not delete chat message');
        }
        store.dispatch(deleteMessages(channelId, [msgId]));
      },
      text: t`Delete my chat message`,
    });
  }

  if (msgId && channelId
    && store.getState().user.userlvl >= USERLVL.CHATMOD
  ) {
    items.push({
      id: 'dmmsg',
      type: 'confirm',
      func: async () => {
        const response = await fetch(api`/api/chatmoderation/delete`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messageId: msgId }),
        });
        if (!response.ok) {
          const { errors } = await response.json();
          throw new Error(errors?.[0] || 'Could not delete chat message');
        }
        store.dispatch(deleteMessages(channelId, [msgId]));
      },
      text: t`Delete chat message`,
    });
  }
  if (uid > 0 && store.getState().user.userlvl >= USERLVL.CHATMOD) {
    items.push({
      id: 'clearuserchat',
      type: 'confirm',
      func: async () => {
        const response = await fetch(api`/api/chatmoderation/delete`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: uid }),
        });
        if (!response.ok) {
          const { errors } = await response.json();
          throw new Error(errors?.[0] || 'Could not clear chat messages');
        }
      },
      text: t`Clear user's public chat messages`,
    });
  }
  return items;
}
