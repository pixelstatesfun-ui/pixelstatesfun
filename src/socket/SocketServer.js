/*
 * main websocket server
 */
import WebSocket from 'ws';

import canvases from '../core/canvases.js';
import Counter from '../utils/Counter.js';
import {
  REG_CANVAS_OP,
  PIXEL_UPDATE_OP,
  PIXEL_BRUSH_OP,
  PIXEL_BRUSH_BATCH_OP,
  PIXEL_TEMPLATE_BRUSH_BATCH_OP,
  REG_CHUNK_OP,
  REG_MCHUNKS_OP,
  DEREG_CHUNK_OP,
  DEREG_MCHUNKS_OP,
} from './packets/op.js';
import {
  hydrateRegCanvas,
  hydrateRegChunk,
  hydrateDeRegChunk,
  hydrateRegMChunks,
  hydrateDeRegMChunks,
  hydratePixelUpdate,
  hydratePixelBrush,
  hydratePixelBrushBatch,
  hydratePixelTemplateBrushBatch,
  dehydrateChangeMe,
  dehydrateRefresh,
  dehydrateOnlineCounter,
  dehydrateCoolDown,
  dehydratePixelReturn,
  dehydrateCaptchaReturn,
} from './packets/server.js';
import socketEvents from './socketEvents.js';
import chatProvider from '../core/ChatProvider.js';
import authenticateClient from './authenticateClient.js';
import drawByOffsets, {
  drawBrushBatchByOffsets,
  drawBrushByOffsets,
  drawTemplateBrushBatchByOffsets,
} from '../core/draw.js';
import { getCoolDown } from '../data/redis/cooldown.js';
import { markChannelsRead } from '../data/sql/Channel.js';
import { checkVerificationSolutions } from '../data/sql/Captcha.js';
import {
  CAPTCHA_PROVIDER, MAX_WS_CONNECTIONS, MAX_WS_CONNECTIONS_PER_IP,
} from '../core/config.js';
import { isCORSAllowed } from '../middleware/cors.js';
import { parseIP } from '../middleware/ip.js';
import evaluateMalware from '../core/malwareEvaluation.js';


const ipCounter = new Counter();
const pendingIpCounter = new Counter();
let pendingConnectionCount = 0;

class SocketServer {
  // WebSocket.Server
  wss;
  // Map<number, Array>
  CHUNK_CLIENTS;

  constructor() {
    this.CHUNK_CLIENTS = new Map();

    this.broadcastPixelBuffer = this.broadcastPixelBuffer.bind(this);
    this.reloadUser = this.reloadUser.bind(this);
    this.reloadIP = this.reloadIP.bind(this);
    this.patchUserState = this.patchUserState.bind(this);
    this.getOnlineUsers = this.getOnlineUsers.bind(this);
    this.checkHealth = this.checkHealth.bind(this);
  }

  initialize() {
    console.info('Starting websocket server');

    const wss = new WebSocket.Server({
      perMessageDeflate: false,
      clientTracking: true,
      maxPayload: 65536,
      noServer: true,
    });
    this.wss = wss;

    wss.on('error', (e) => {
      console.error(`WebSocket Server Error ${e.message}`);
    });

    wss.on('connection', (ws, req) => {
      ws.timeLastMsg = Date.now();
      ws.connectedTs = ws.timeLastMsg;
      ws.canvasId = null;
      ws.chunkCnt = 0;
      ws.openChatChannels = new Set();
      ws.lastChatTypingAt = 0;
      ws.chatTypingChannel = null;
      /* populate data from request */
      const {
        user, ip, lang, ttag, device,
      } = req;
      ws.user = user;
      ws.ip = ip;
      ws.browserHash = device.browserHash;
      ws.lang = lang;
      ws.ttag = ttag;
      ipCounter.add(ip.ipString);

      ws.send(dehydrateOnlineCounter(socketEvents.onlineCounter));

      ws.on('error', (e) => {
        // eslint-disable-next-line max-len
        console.error(`WebSocket Client Error for ${ws.user?.data.name}: ${e.message}`);
      });

      ws.on('close', () => {
        ipCounter.delete(ip.ipString);
        this.deleteAllChunks(ws);
      });

      ws.on('message', (data, isBinary) => {
        ws.timeLastMsg = Date.now();
        if (isBinary) {
          this.onBinaryMessage(data, ws);
        } else {
          const message = data.toString();
          SocketServer.onTextMessage(message, ws);
        }
      });
    });

    socketEvents.on('pixelUpdate', this.broadcastPixelBuffer);
    socketEvents.on('reloadUser', this.reloadUser);
    socketEvents.on('vipNotification', (userId, message) => {
      const text = `vn,${JSON.stringify(message)}`;
      this.findAllWsByUerId(userId).forEach((ws) => ws.send(text));
    });
    socketEvents.on('reloadIP', this.reloadIP);
    socketEvents.on('patchState', this.patchUserState);

    socketEvents.on('resetAllCaptchas', () => {
      this.wss.clients.forEach((ws) => {
        ws.ip.verificationRecheckTs = 0;
      });
    });

    socketEvents.on('onlineCounter', (online) => {
      this.broadcast(dehydrateOnlineCounter(online));
    });

    socketEvents.on('announcement', (text) => {
      this.broadcast(`an,${JSON.stringify(text)}`);
    });

    socketEvents.on('factionNotice', (userIds, notice) => {
      const text = `fcn,${JSON.stringify(notice)}`;
      userIds.forEach((userId) => {
        this.findAllWsByUerId(userId).forEach((ws) => ws.send(text));
      });
    });

    socketEvents.on('cooldownUpdate', (info) => {
      this.broadcast(`cd,${JSON.stringify(info)}`);
    });

    socketEvents.on('suChatMessage', (
      userId,
      name,
      message,
      channelId,
      id,
      country,
    ) => {
      const ts = Math.floor(Date.now() / 1000);
      const text = `ck,${JSON.stringify(
        [channelId, false, name, message, country, id, ts,
          ts, false, null, []],
      )}`;
      this.findAllWsByUerId(userId).forEach((ws) => {
        ws.send(text);
      });
    });

    socketEvents.on('chatMessage', (
      name,
      message,
      channelId,
      userId,
      flag,
      ts,
      msgId,
      flagLegit,
      avatarId,
      attachments,
      registrationRank,
      vipTier,
      sendapi,
      nicknameColor,
      nicknameGradient,
      avatarGlow,
      pixelRankId,
      factionBannerUrl,
    ) => {
      const isPublicChannel = chatProvider.isPublicChannel(channelId);
      // ws objects
      const viewingClientArray = [];
      const viewingClientArrayNotify = [];
      // user ids
      const readMarkingArray = [];

      this.wss.clients.forEach((ws) => {
        const hasChannelOpen = ws.openChatChannels.has(channelId);

        if (isPublicChannel) {
          if (hasChannelOpen) {
            viewingClientArray.push(ws);
          }
          return;
        }
        if (ws.user?.hasChannel(channelId)) {
          if (ws.user?.hasChannelMuted(channelId) || hasChannelOpen) {
            viewingClientArray.push(ws);
          } else {
            viewingClientArrayNotify.push(ws);
          }
          if (hasChannelOpen) {
            readMarkingArray.push(ws.user.id);
          }
        }
      });

      if (viewingClientArray.length) {
        const text = `ck,${JSON.stringify(
          [channelId, false, name, message, flag, userId, ts,
            msgId, flagLegit, avatarId, attachments, registrationRank,
            vipTier, nicknameColor, nicknameGradient, avatarGlow, pixelRankId,
            factionBannerUrl],
        )}`;
        SocketServer.broadcastSelected(viewingClientArray, text);
      }

      if (viewingClientArrayNotify.length) {
        const text = `ck,${JSON.stringify(
          [channelId, true, name, message, flag, userId, ts,
            msgId, flagLegit, avatarId, attachments, registrationRank,
            vipTier, nicknameColor, nicknameGradient, avatarGlow, pixelRankId,
            factionBannerUrl],
        )}`;
        SocketServer.broadcastSelected(viewingClientArrayNotify, text);
      }

      if (readMarkingArray.length) {
        markChannelsRead(channelId, readMarkingArray);
      }
    });

    socketEvents.on('chatTyping', (
      userId,
      name,
      channelId,
      isTyping,
    ) => {
      const isPublicChannel = chatProvider.isPublicChannel(channelId);
      const clients = [];
      this.wss.clients.forEach((ws) => {
        if (ws.user?.id === userId
          || !ws.openChatChannels.has(channelId)
          || (!isPublicChannel && !ws.user?.hasChannel(channelId))
        ) {
          return;
        }
        clients.push(ws);
      });
      SocketServer.broadcastSelected(
        clients,
        `ct,${JSON.stringify([channelId, userId, name, isTyping])}`,
      );
    });

    socketEvents.on('deletePublicUserMessages', (userId) => {
      this.broadcast(`dpum,${JSON.stringify(userId)}`);
    });

    socketEvents.on('deleteUserChannelMessages', (userId, channelId) => {
      const text = `dmc,${JSON.stringify([userId, channelId])}`;
      const clientArray = [];
      const isPublicChannel = chatProvider.isPublicChannel(channelId);
      this.wss.clients.forEach((ws) => {
        const hasChannelOpen = ws.openChatChannels.has(channelId);
        if (hasChannelOpen && (
          isPublicChannel || ws.user?.hasChannel(channelId)
        )) {
          clientArray.push(ws);
        }
      });
      SocketServer.broadcastSelected(clientArray, text);
    });

    socketEvents.on('deleteMessages', (channelId, messageIds) => {
      const text = `dmm,${JSON.stringify([channelId, messageIds])}`;
      const clientArray = [];
      const isPublicChannel = chatProvider.isPublicChannel(channelId);
      this.wss.clients.forEach((ws) => {
        const hasChannelOpen = ws.openChatChannels.has(channelId);
        if (hasChannelOpen && (
          isPublicChannel || ws.user?.hasChannel(channelId)
        )) {
          clientArray.push(ws);
        }
      });
      SocketServer.broadcastSelected(clientArray, text);
    });

    socketEvents.on('deleteChannelMessages', (channelId) => {
      const text = `dcc,${JSON.stringify(channelId)}`;
      const clientArray = [];
      const isPublicChannel = chatProvider.isPublicChannel(channelId);
      this.wss.clients.forEach((ws) => {
        if (ws.openChatChannels.has(channelId) && (
          isPublicChannel || ws.user?.hasChannel(channelId)
        )) {
          clientArray.push(ws);
        }
      });
      SocketServer.broadcastSelected(clientArray, text);
    });

    // when changing interval, remember that online counter gets used as ping
    // for binary sharded channels in MessageBroker.js
    setInterval(this.getOnlineUsers, 20 * 1000);
    setInterval(this.checkHealth, 15 * 1000);
  }

  async handleUpgrade(request, socket, head) {
    const ipParseError = await new Promise((resolve) => {
      parseIP(request, null, resolve);
    });
    if (ipParseError) {
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
      socket.destroy();
      return;
    }
    const { ip: { ipString } } = request;
    if (!isCORSAllowed(request)) {
      // eslint-disable-next-line max-len
      console.info(`Rejected CORS request on websocket from ${ipString} via ${request.headers.origin}, expected ${request.ip.getHost(false, true)}`);
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }

    const ipConnections = ipCounter.get(ipString)
      + pendingIpCounter.get(ipString);
    if (ipConnections >= MAX_WS_CONNECTIONS_PER_IP) {
      socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n');
      socket.destroy();
      return;
    }

    const currentConnections = this.wss.clients.size + pendingConnectionCount;
    if (currentConnections >= MAX_WS_CONNECTIONS) {
      const online = socketEvents.onlineCounter.total || 0;
      console.warn(
        `Rejecting WebSocket: ${currentConnections} active/pending, `
        + `${online} online, limit ${MAX_WS_CONNECTIONS}.`,
      );
      socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');
      socket.destroy();
      return;
    }

    pendingIpCounter.add(ipString);
    pendingConnectionCount += 1;
    try {
      const authenticationError = await authenticateClient(request);
      if (authenticationError) {
        socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
        socket.destroy();
        return;
      }
      this.wss.handleUpgrade(request, socket, head, (ws) => {
        this.wss.emit('connection', ws, request);
      });
    } finally {
      pendingIpCounter.delete(ipString);
      pendingConnectionCount -= 1;
    }
  }

  /**
   * https://github.com/websockets/ws/issues/617
   * @param data
   */
  static broadcastSelected(clients, data) {
    let frames;

    if (typeof data === 'string') {
      frames = WebSocket.Sender.frame(Buffer.from(data), {
        readOnly: false,
        mask: false,
        rsv1: false,
        opcode: 1,
        fin: true,
      });
    } else {
      frames = WebSocket.Sender.frame(data, {
        readOnly: false,
        mask: false,
        rsv1: false,
        opcode: 2,
        fin: true,
      });
    }

    return clients.map((ws) => new Promise((resolve) => {
      if (ws.readyState === WebSocket.OPEN) {
        // eslint-disable-next-line no-underscore-dangle
        ws._sender.sendFrame(frames, (err) => {
          if (err) {
            console.error(

              `WebSocket broadcast error on ${ws.ip.ipString} : ${err.message}`,
            );
          }
        });
      }
      resolve();
    }));
  }

  broadcast(data) {
    const clientArray = [];
    this.wss.clients.forEach((ws) => {
      clientArray.push(ws);
    });
    SocketServer.broadcastSelected(clientArray, data);
  }

  findAllWsByUerId(userId) {
    const clients = [];
    const it = this.wss.clients.keys();
    let client = it.next();
    while (!client.done) {
      const ws = client.value;
      if (ws.readyState === WebSocket.OPEN
        && ws.user?.id === userId
      ) {
        clients.push(ws);
      }
      client = it.next();
    }
    return clients;
  }

  killAllWsByUerIp(ip) {
    let amount = ipCounter.get(ip);
    if (!amount) {
      return 0;
    }
    for (const [chunkid, clients] of this.CHUNK_CLIENTS.entries()) {
      const newClients = clients.filter((ws) => ws.ip.ipString !== ip);
      if (clients.length !== newClients.length) {
        this.CHUNK_CLIENTS.set(chunkid, newClients);
      }
    }

    const it = this.wss.clients.keys();
    amount = 0;
    let client = it.next();
    while (!client.done) {
      const ws = client.value;
      if (ws.readyState === WebSocket.OPEN
        && ws.ip.ipString === ip
      ) {
        /*
         * we deleted all registered chunks above
         * have to reset it to avoid onClose to
         * do it again.
         */
        ws.chunkCnt = 0;
        ws.terminate();
        amount += 1;
      }
      client = it.next();
    }
    return amount;
  }

  broadcastPixelBuffer(canvasId, chunkid, data) {
    if (this.CHUNK_CLIENTS.has(chunkid)) {
      const clients = this.CHUNK_CLIENTS.get(chunkid)
        .filter((ws) => ws.canvasId === canvasId);
      SocketServer.broadcastSelected(clients, data);
    }
  }

  reloadUser(userId, local) {
    const buffer = dehydrateChangeMe();
    this.wss.clients.forEach(async (ws) => {
      if (ws.readyState === WebSocket.OPEN
        && ws.user?.id === userId
      ) {
        const { loggedOut } = await ws.user.refresh();
        if (loggedOut) {
          delete ws.user;
        }
        if (!local) {
          ws.send(buffer);
        }
      }
    });
  }

  reloadIP(ipString, local) {
    const buffer = dehydrateChangeMe();
    this.wss.clients.forEach(async (ws) => {
      if (ws.readyState === WebSocket.OPEN
        && ws.ip.ipString === ipString
      ) {
        await ws.ip.refresh();
        if (!local) {
          ws.send(buffer);
        }
      }
    });
  }

  patchUserState(userIds, state, patch) {
    const text = `ps,${JSON.stringify([
      state, patch.op, patch.path, patch.value,
    ])}`;

    const clientArray = [];
    if (Array.isArray(userIds)) {
      this.wss.clients.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN
          && ws.user && userIds.includes(ws.user.id)
        ) {
          ws.user.patchUserState(state, patch);
          clientArray.push(ws);
        }
      });
    } else {
      this.wss.clients.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN
          && ws.user?.id === userIds
        ) {
          ws.user.patchUserState(state, patch);
          clientArray.push(ws);
        }
      });
    }

    SocketServer.broadcastSelected(clientArray, text);
  }

  checkHealth() {
    const ts = Date.now() - 120 * 1000;
    const promises = [];
    this.wss.clients.forEach((ws) => {
      promises.push(new Promise((resolve) => {
        if (
          ws.readyState === WebSocket.OPEN
          && ts > ws.timeLastMsg
        ) {
          console.info(`Killing dead websocket from ${ws.ip.ipString}`);
          ws.terminate();
          resolve();
        }
      }),
      );
    });
    return promises;
  }

  /*
   * Create object with informations of online users and give it
   * to socketEvents.
   * Is run periodically to update online counters. We have to send lists of
   * IPs around to filter out duplicates.
   */
  getOnlineUsers() {
    try {
      /*
       * {
       *   canvasId: [127.0.0.1, 127.0.0.2, ...],
       *   ...
       * }
       */
      const online = {};
      const ipUsers = {};
      const it = this.wss.clients.keys();
      let client = it.next();
      while (!client.done) {
        const ws = client.value;
        if (
          ws.readyState === WebSocket.OPEN
          && ws.canvasId !== null
          && ws.user?.id
        ) {
          const { canvasId, ip: { ipString }, user } = ws;
          // ip to user mapping, not logged in = 0
          const uid = user?.id || 0;
          if (!ipUsers[ipString]) {
            ipUsers[ipString] = [uid];
          } else if (!ipUsers[ipString].includes(uid)) {
            ipUsers[ipString].push(uid);
          }
          // only count unique IPs per canvas
          if (!online[canvasId]) {
            online[canvasId] = [ipString];
          } else if (!online[canvasId].includes(ipString)) {
            online[canvasId].push(ipString);
          }
        }
        client = it.next();
      }
      socketEvents.setOnlineUsers(online, ipUsers);
    } catch (err) {
      console.error(`WebSocket online broadcast error: ${err.message}`);
    }
  }

  static async onTextMessage(text, ws) {
    const { ipString } = ws.ip;
    try {
      const comma = text.indexOf(',');
      if (comma === -1) {
        throw new Error('No comma');
      }
      const key = text.slice(0, comma);
      const val = JSON.parse(text.slice(comma + 1));
      const { user } = ws;
      switch (key) {
        case 'ck': {
          // chat message
          const message = val[0].trim();
          if (!user || !message) {
            return;
          }
          socketEvents.recvChatMessage(
            user, ws.ip, message, val[1], ws.lang, ws.ttag,
          );
          break;
        }
        case 'ct': {
          const [channelId, isTyping] = val;
          if (!user || !Number.isSafeInteger(channelId)
            || typeof isTyping !== 'boolean'
            || !ws.openChatChannels.has(channelId)
            || (!chatProvider.isPublicChannel(channelId)
              && !user.hasChannel(channelId))
          ) {
            return;
          }
          if (isTyping) {
            const now = Date.now();
            if (now - ws.lastChatTypingAt < 1500) {
              return;
            }
            ws.lastChatTypingAt = now;
            ws.chatTypingChannel = channelId;
          } else {
            if (ws.chatTypingChannel !== channelId) {
              return;
            }
            ws.chatTypingChannel = null;
          }
          socketEvents.broadcastChatTyping(
            user.id,
            user.data.name,
            channelId,
            isTyping,
          );
          break;
        }
        case 'cv': {
          ws.openChatChannels = new Set(val[1].slice(0, 50));
          markChannelsRead(
            chatProvider.filterPublicChannels([...ws.openChatChannels]),
            ws.user?.id,
          );
          break;
        }
        case 'cs': {
          if (CAPTCHA_PROVIDER !== 'ppfun') {
            ws.send(dehydrateCaptchaReturn(3));
            break;
          }
          const [solution, captchaid, challengeSolution] = val;
          const ret = await checkVerificationSolutions(
            captchaid, solution, challengeSolution,
            ws.browserHash, ipString, user?.id, false,
          );
          ws.send(dehydrateCaptchaReturn(ret));
          break;
        }
        case 'mr': {
          // malware evaluation
          await evaluateMalware(user, ws.ip, ...val);
          break;
        }
        case 'cm': {
          /*
           * TODO only temporary for update notifications
           */
          ws.send(dehydrateRefresh());
          break;
        }
        default:
          throw new Error('Unknown key');
      }
    } catch (err) {
      // eslint-disable-next-line max-len
      console.error(`Got invalid ws text message ${text} from ${ipString}, with error: ${err.message}`);
    }
  }

  async onBinaryMessage(buffer, ws) {
    try {
      const { ipString } = ws.ip;
      const opcode = buffer[0];

      switch (opcode) {
        case PIXEL_UPDATE_OP: {
          const { canvasId, connectedTs } = ws;

          if (canvasId === null) {
            console.info(`Closing websocket without canvas from ${ipString}`);
            ws.close();
            return;
          }

          const {
            i, j, pixels,
          } = hydratePixelUpdate(buffer);
          const {
            wait,
            coolDown,
            pxlCnt,
            rankedPxlCnt,
            retCode,
          } = await drawByOffsets(
            ws.user,
            ws.ip,
            canvasId,
            i, j,
            pixels,
            connectedTs,
          );



          ws.send(dehydratePixelReturn(
            retCode,
            wait,
            coolDown,
            pxlCnt,
            rankedPxlCnt,
          ));
          break;
        }
        case PIXEL_BRUSH_OP: {
          const { canvasId, connectedTs } = ws;
          if (canvasId === null) {
            console.info(`Closing websocket without canvas from ${ipString}`);
            ws.close();
            return;
          }

          const {
            i, j, offset, size, color,
          } = hydratePixelBrush(buffer);
          const {
            wait,
            coolDown,
            pxlCnt,
            rankedPxlCnt,
            retCode,
          } = await drawBrushByOffsets(
            ws.user,
            ws.ip,
            canvasId,
            i,
            j,
            offset,
            size,
            color,
            connectedTs,
          );

          ws.send(dehydratePixelReturn(
            retCode,
            wait,
            coolDown,
            pxlCnt,
            rankedPxlCnt,
          ));
          break;
        }
        case PIXEL_BRUSH_BATCH_OP: {
          const { canvasId, connectedTs } = ws;
          if (canvasId === null) {
            console.info(`Closing websocket without canvas from ${ipString}`);
            ws.close();
            return;
          }

          const stamps = hydratePixelBrushBatch(buffer);
          const {
            wait,
            coolDown,
            pxlCnt,
            rankedPxlCnt,
            retCode,
          } = await drawBrushBatchByOffsets(
            ws.user,
            ws.ip,
            canvasId,
            stamps,
            connectedTs,
          );

          ws.send(dehydratePixelReturn(
            retCode,
            wait,
            coolDown,
            pxlCnt,
            rankedPxlCnt,
          ));
          break;
        }
        case PIXEL_TEMPLATE_BRUSH_BATCH_OP: {
          const { canvasId, connectedTs } = ws;
          if (canvasId === null) {
            console.info(`Closing websocket without canvas from ${ipString}`);
            ws.close();
            return;
          }

          const stamps = hydratePixelTemplateBrushBatch(buffer);
          const {
            wait,
            coolDown,
            pxlCnt,
            rankedPxlCnt,
            retCode,
          } = await drawTemplateBrushBatchByOffsets(
            ws.user,
            ws.ip,
            canvasId,
            stamps,
            connectedTs,
          );

          ws.send(dehydratePixelReturn(
            retCode,
            wait,
            coolDown,
            pxlCnt,
            rankedPxlCnt,
          ));
          break;
        }
        case REG_CANVAS_OP: {
          const canvasId = hydrateRegCanvas(buffer);
          if (!canvases[canvasId]) return;
          if (ws.canvasId !== canvasId) {
            this.deleteAllChunks(ws);
          }
          ws.canvasId = canvasId;
          if (canvases[canvasId].ed) return;
          const wait = await getCoolDown(ipString, ws.user?.id, canvasId);
          ws.send(dehydrateCoolDown(wait));
          break;
        }
        case REG_CHUNK_OP: {
          const chunkid = hydrateRegChunk(buffer);
          this.pushChunk(chunkid, ws);
          break;
        }
        case REG_MCHUNKS_OP: {
          this.deleteAllChunks(ws);
          hydrateRegMChunks(buffer, (chunkid) => {
            this.pushChunk(chunkid, ws);
          });
          break;
        }
        case DEREG_CHUNK_OP: {
          const chunkid = hydrateDeRegChunk(buffer);
          this.deleteChunk(chunkid, ws);
          break;
        }
        case DEREG_MCHUNKS_OP: {
          hydrateDeRegMChunks(buffer, (chunkid) => {
            this.deleteChunk(chunkid, ws);
          });
          break;
        }
        default:
          break;
      }
    } catch (e) {
      console.error(`WebSocket Client Binary Message Error: ${e.message}`);
    }
  }

  pushChunk(chunkid, ws) {
    let clients = this.CHUNK_CLIENTS.get(chunkid);
    if (clients?.includes(ws)) {
      return;
    }
    if (ws.chunkCnt >= 20000) {
      return;
    }
    ws.chunkCnt += 1;
    if (!clients) {
      clients = [];
      this.CHUNK_CLIENTS.set(chunkid, clients);
    }
    clients.push(ws);
  }

  deleteChunk(chunkid, ws) {
    const clients = this.CHUNK_CLIENTS.get(chunkid);
    if (!clients) {
      return;
    }
    const pos = clients.indexOf(ws);
    if (pos === -1) {
      return;
    }
    ws.chunkCnt -= 1;
    clients.splice(pos, 1);
  }

  deleteAllChunks(ws) {
    if (!ws.chunkCnt) {
      return;
    }
    for (const client of this.CHUNK_CLIENTS.values()) {
      const pos = client.indexOf(ws);
      if (pos !== -1) {
        client.splice(pos, 1);
        ws.chunkCnt -= 1;
        if (!ws.chunkCnt) {
          return;
        }
      }
    }
  }
}

export default SocketServer;
