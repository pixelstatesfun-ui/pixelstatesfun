import { USERLVL } from '../../core/constants.js';
import logger from '../../core/logger.js';
import {
  deleteChannelMessages, deleteMessageAndGetChannel,
  deleteOwnMessageAndGetChannel,
  deletePublicUserMessages,
} from '../../data/sql/Message.js';
import socketEvents from '../../socket/socketEvents.js';
import chatProvider from '../../core/ChatProvider.js';

export default async function deleteChatMessage(req, res) {
  req.tickRateLimiter(1000);
  const { t } = req.ttag;
  const { user } = req;
  if (req.body?.deleteOwn === true) {
    if (!user?.id) {
      res.status(401).json({ errors: [t`You must be logged in`] });
      return;
    }
    const messageId = Number(req.body.messageId);
    if (!Number.isSafeInteger(messageId) || messageId <= 0) {
      res.status(400).json({ errors: [t`Invalid chat message ID`] });
      return;
    }
    const channelId = await deleteOwnMessageAndGetChannel(messageId, user.id);
    if (channelId === false) {
      res.status(500).json({ errors: [t`Could not delete chat message`] });
      return;
    }
    if (channelId === null) {
      res.status(404).json({
        errors: [t`Chat message not found or not yours`],
      });
      return;
    }
    socketEvents.broadcastMessageDeletion(channelId, [messageId]);
    res.json({ status: 'ok' });
    return;
  }

  if (!user || user.userlvl < USERLVL.CHATMOD) {
    res.status(403).json({
      errors: [t`You are not allowed to delete chat messages`],
    });
    return;
  }

  if (req.body?.userId !== undefined) {
    const userId = Number(req.body.userId);
    if (!Number.isSafeInteger(userId) || userId <= 0) {
      res.status(400).json({ errors: [t`Invalid user ID`] });
      return;
    }
    const deleted = await deletePublicUserMessages(userId);
    if (!deleted) {
      res.status(500).json({ errors: [t`Could not clear chat messages`] });
      return;
    }
    logger.info(
      `MODTOOLS>CHAT>${user.name}[${user.id}] cleared public messages`
      + ` for user ${userId}`,
    );
    socketEvents.broadcastUserPublicChatMessageDeletion(userId);
    res.json({ status: 'ok' });
    return;
  }

  if (req.body?.channelId !== undefined) {
    const channelId = Number(req.body.channelId);
    if (!Number.isSafeInteger(channelId) || channelId <= 0
      || !chatProvider.isPublicChannel(channelId)
    ) {
      res.status(400).json({ errors: [t`Invalid public chat channel`] });
      return;
    }
    const deleted = await deleteChannelMessages(channelId);
    if (!deleted) {
      res.status(500).json({ errors: [t`Could not clear chat messages`] });
      return;
    }
    logger.info(
      `MODTOOLS>CHAT>${user.name}[${user.id}] cleared channel ${channelId}`,
    );
    socketEvents.broadcastChannelMessageDeletion(channelId);
    res.json({ status: 'ok' });
    return;
  }

  const messageId = Number(req.body?.messageId);
  if (!Number.isSafeInteger(messageId) || messageId <= 0) {
    res.status(400).json({ errors: [t`Invalid chat message ID`] });
    return;
  }

  const channelId = await deleteMessageAndGetChannel(messageId);
  if (channelId === false) {
    res.status(500).json({ errors: [t`Could not delete chat message`] });
    return;
  }
  if (channelId === null) {
    res.status(404).json({ errors: [t`Chat message not found`] });
    return;
  }

  logger.info(
    `MODTOOLS>CHAT>${user.name}[${user.id}] deleted message ${messageId}`
    + ` in channel ${channelId}`,
  );
  socketEvents.broadcastMessageDeletion(channelId, [messageId]);
  res.json({ status: 'ok' });
}
