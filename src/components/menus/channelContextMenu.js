/*
 * channel onContextmen
 */
import { t } from 'ttag';
import MdOutlineSensorDoor from '../../icons/MdOutlineSensorDoor.svg';

import { CHANNEL_TYPES, USERLVL } from '../../core/constants.js';
import {
  setHideVoidMessages, toggleChatCompact,
} from '../../store/actions/index.js';
import { setLeaveChannel, setChannelMute } from '../../store/actions/thunks.js';
import { api } from '../../utils/utag.js';

export default function channelContextMenu(store, args) {
  const { cid, type, muted } = args;

  const elements = [];

  if (type !== CHANNEL_TYPES.PUBLIC) {
    elements.push({
      id: 'mu',
      type: 'boolean',
      func: (state) => store.dispatch(setChannelMute(cid, !state)),
      state: muted,
      text: t`Mute Channel`,
    });
    if (type !== CHANNEL_TYPES.FACTION) {
      elements.push({
        id: 'cl',
        type: 'func',
        func: () => {
          store.dispatch(setLeaveChannel(cid));
        },
        symbol: MdOutlineSensorDoor,
        text: t`Close`,
      });
    }
  }
  elements.push({
    id: 'co',
    type: 'boolean',
    state: store.getState().gui.chatCompact,
    func: () => {
      store.dispatch(toggleChatCompact());
      return true;
    },
    text: t`Compact Chat`,
  });
  elements.push({
    id: 'hv',
    type: 'boolean',
    state: Boolean(store.getState().gui.hideVoidMessages),
    func: (state) => store.dispatch(setHideVoidMessages(!state)),
    text: t`Hide Void event messages`,
  });
  if (type === CHANNEL_TYPES.PUBLIC
    && store.getState().user.userlvl >= USERLVL.CHATMOD
  ) {
    elements.push({
      id: 'clearchat',
      type: 'confirm',
      func: async () => {
        const response = await fetch(api`/api/chatmoderation/delete`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channelId: cid }),
        });
        if (!response.ok) {
          const { errors } = await response.json();
          throw new Error(errors?.[0] || 'Could not clear chat messages');
        }
      },
      text: t`Clear public chat`,
    });
  }
  return elements;
}
