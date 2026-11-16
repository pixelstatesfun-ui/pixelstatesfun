/**
 *
 */

import {
  useRef,
  useLayoutEffect,
  useState,
  useEffect,
  useCallback,
  useContext,
  useMemo,
} from 'preact/hooks';
import { Fragment } from 'preact';
import { useSelector, useDispatch } from '../../store/react-redux/index.js';
import { t } from 'ttag';
import { api } from '../../utils/utag.js';

import WindowContext from '../context/window.js';
import MenuContext from '../context/menu.js';
import useLink from '../hooks/link.js';
import useStayScrolled from '../hooks/stayScrolled.js';
import ChatMessage from '../ChatMessage.jsx';
import FileUpload from '../FileUpload.jsx';
import ChannelDropDown from '../ChannelDropDown.jsx';
import {
  CHANNEL_TYPES, EVENT_USER_NAME, USERLVL,
} from '../../core/constants.js';
import { escapeMd } from '../../core/utils.js';

import {
  markChannelAsRead, sendChatMessage, sendChatTyping, refCountChatChannel,
} from '../../store/actions/index.js';
import { receiveChatMessage } from '../../store/actions/socket.js';
import { receiveChatHistory } from '../../store/actions/thunks.js';
import { requestChatMessages } from '../../store/actions/fetch.js';


const Chat = () => {
  const listRef = useRef();
  const targetRef = useRef();
  const inputRef = useRef();
  const uploadRef = useRef();
  const scrollRef = useRef();
  const waitingForUploadRef = useRef();
  const historyFetchRef = useRef();
  const typingStateRef = useRef({
    channel: null,
    lastSentAt: 0,
    stopTimeout: null,
  });
  const typingTimersRef = useRef(new Map());

  const [btnSize, setBtnSize] = useState(20);
  const [typingUsers, setTypingUsers] = useState({});
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [emojiCategory, setEmojiCategory] = useState('unsorted');
  const [emojis, setEmojis] = useState([]);
  const [emojiError, setEmojiError] = useState('');
  const [emojiFile, setEmojiFile] = useState(null);
  const [emojiUploading, setEmojiUploading] = useState(false);
  const [selectedEmojiFilenames, setSelectedEmojiFilenames] = useState([]);
  const [emojiMoveCategory, setEmojiMoveCategory] = useState('unsorted');
  const [emojiMoving, setEmojiMoving] = useState(false);

  const dispatch = useDispatch();

  const [ownName, currentUserId, userlvl] = useSelector((state) => [
    state.user.name,
    state.user.id,
    state.user.userlvl,
  ]);
  const [chatCompact, hideVoidMessages] = useSelector((state) => [
    state.gui.chatCompact,
    state.gui.hideVoidMessages,
  ]);
  const {
    channels, messages, blocked, channelViews,
  } = useSelector((state) => state.chat);

  const { args, setArgs, setTitle } = useContext(WindowContext);
  const { openMenu } = useContext(MenuContext);

  const chatChannel = args.chatChannel || 0;
  const previousChatChannelRef = useRef();

  const stopTyping = useCallback(() => {
    const typing = typingStateRef.current;
    if (typing.stopTimeout) {
      clearTimeout(typing.stopTimeout);
    }
    if (typing.channel !== null) {
      dispatch(sendChatTyping(typing.channel, false));
    }
    typingStateRef.current = {
      channel: null,
      lastSentAt: 0,
      stopTimeout: null,
    };
  }, [dispatch]);

  const handleTypingInput = useCallback(() => {
    let typing = typingStateRef.current;
    if (typing.channel !== null && typing.channel !== chatChannel) {
      stopTyping();
      typing = typingStateRef.current;
    }
    const now = Date.now();
    if (typing.channel === null || now - typing.lastSentAt >= 1800) {
      dispatch(sendChatTyping(chatChannel, true));
      typing.channel = chatChannel;
      typing.lastSentAt = now;
    }
    if (typing.stopTimeout) {
      clearTimeout(typing.stopTimeout);
    }
    typing.stopTimeout = setTimeout(stopTyping, 3500);
  }, [chatChannel, dispatch, stopTyping]);

  useEffect(() => {
    const typingTimers = typingTimersRef.current;
    const onChatTyping = (event) => {
      const [channelId, userId, name, isTyping] = event.detail;
      if (channelId !== chatChannel
        || Number(userId) === Number(currentUserId)
      ) {
        return;
      }
      const oldTimeout = typingTimers.get(userId);
      if (oldTimeout) {
        clearTimeout(oldTimeout);
        typingTimers.delete(userId);
      }
      if (!isTyping) {
        setTypingUsers((users) => {
          const updated = { ...users };
          delete updated[userId];
          return updated;
        });
        return;
      }
      setTypingUsers((users) => ({ ...users, [userId]: name }));
      typingTimers.set(userId, setTimeout(() => {
        typingTimers.delete(userId);
        setTypingUsers((users) => {
          const updated = { ...users };
          delete updated[userId];
          return updated;
        });
      }, 4500));
    };
    setTypingUsers({});
    window.addEventListener('chat-typing', onChatTyping);
    return () => {
      window.removeEventListener('chat-typing', onChatTyping);
      typingTimers.forEach((timeout) => clearTimeout(timeout));
      typingTimers.clear();
    };
  }, [chatChannel, currentUserId]);

  useEffect(() => () => stopTyping(), [chatChannel, stopTyping]);

  const setChannel = useCallback((cid) => {
    setArgs({ chatChannel: Number(cid) });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const previousChatChannel = previousChatChannelRef.current;
    if (!previousChatChannel && !chatChannel) {
      return;
    }
    previousChatChannelRef.current = chatChannel;
    const cidRefCountAdditions = {};
    if (previousChatChannel) {
      cidRefCountAdditions[previousChatChannel] = -1;
    }
    if (chatChannel) {
      cidRefCountAdditions[chatChannel] = 1;
      dispatch(markChannelAsRead(chatChannel));
    }
    dispatch(refCountChatChannel(cidRefCountAdditions));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatChannel]);

  useEffect(() => () => {
    if (previousChatChannelRef.current) {
      dispatch(refCountChatChannel({
        [previousChatChannelRef.current]: -1,
      }));
    }
  },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  []);

  const [
    channelName, channelType, channelMuted, channelAvatarId,
  ] = useMemo(() => {
    let retValue;
    const types = Object.keys(channels);
    for (let i = 0; i < types.length; i += 1) {
      const typeChannels = channels[types[i]];
      for (let u = 0; u < typeChannels.length; u += 1) {
        const typeChannel = typeChannels[u];
        if (typeChannel[0] === chatChannel) {
          retValue = [
            typeChannel[1], Number(types[i]), typeChannel[4], typeChannel[5],
          ];
          break;
        }
      }
    }
    if (retValue) {
      return retValue;
    }
    return ['', CHANNEL_TYPES.PUBLIC, true, null];
  }, [chatChannel, channels]);

  const blockedIds = useMemo(() => blocked.map(([id]) => id), [blocked]);

  useEffect(() => {
    if (channelName) {
      setTitle(`${t`Channel`}: ${channelName}`);
    } else {
      /*
       * set channel if not exists
       */
      let replacementChannel = channels[CHANNEL_TYPES.PUBLIC]?.[0];
      if (!replacementChannel) {
        replacementChannel = channels[CHANNEL_TYPES.FACTION]?.[0];
      }
      if (replacementChannel) {
        setChannel(replacementChannel[0]);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelName, channels[CHANNEL_TYPES.PUBLIC]?.length]);

  const link = useLink();

  const printWarnings = useCallback((warnings) => {
    warnings.forEach((warning) => {
      dispatch(receiveChatMessage(
        // eslint-disable-next-line max-len
        chatChannel, false, 'info', warning, 'xx', 0, Math.floor(Date.now() / 1000), 0, false, null, [],
      ));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatChannel]);

  const addToInput = useCallback((msg) => {
    const inputElem = inputRef.current;
    if (!inputElem) {
      return;
    }
    let newInputMessage = inputElem.value;
    if (newInputMessage.slice(-1) !== ' ') {
      newInputMessage += ' ';
    }
    newInputMessage += `${msg} `;
    inputElem.value = newInputMessage;
    inputRef.current.focus();
  }, []);

  const emojiCategories = [
    ['flags', t`Flags`],
    ['unsorted', t`Unsorted`],
    ['animated', t`Animated`],
    ['best-flags', t`Best flags`],
    ['hedge', 'hedge'],
    ['pepe', 'pepe'],
    ['wojak', 'wojak'],
  ];

  const openEmojiPicker = useCallback(async () => {
    setEmojiOpen((isOpen) => !isOpen);
    if (!emojis.length) {
      try {
        const response = await fetch(api`/api/emojis`, {
          credentials: 'include',
        });
        if (!response.ok) {
          throw new Error('Could not load chat emojis');
        }
        const data = await response.json();
        setEmojis(data.emojis);
        setEmojiError('');
      } catch (error) {
        setEmojiError(error.message);
      }
    }
  }, [emojis.length]);

  const uploadEmoji = useCallback(async (event) => {
    event.preventDefault();
    if (!emojiFile || emojiUploading) {
      return;
    }
    const formElement = event.currentTarget;
    setEmojiUploading(true);
    try {
      const formData = new FormData();
      formData.append('category', emojiCategory);
      formData.append('file', emojiFile);
      const response = await fetch(api`/api/emojis`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.errors?.[0] || 'Could not upload chat emoji');
      }
      setEmojis((oldEmojis) => [...oldEmojis, data.emoji]);
      window.dispatchEvent(new Event('emoji-catalog-updated'));
      setEmojiCategory(data.emoji.category);
      setEmojiFile(null);
      formElement.reset();
      setEmojiError('');
    } catch (error) {
      setEmojiError(error.message);
    } finally {
      setEmojiUploading(false);
    }
  }, [emojiCategory, emojiFile, emojiUploading]);

  const moveSelectedEmojis = useCallback(async () => {
    if (!selectedEmojiFilenames.length || emojiMoving) {
      return;
    }
    setEmojiMoving(true);
    try {
      const response = await fetch(api`/api/emojis/move`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filenames: selectedEmojiFilenames,
          category: emojiMoveCategory,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.errors?.[0] || 'Could not move selected emojis');
      }
      setEmojis((oldEmojis) => oldEmojis.map((emoji) => (
        selectedEmojiFilenames.includes(emoji.filename)
          ? { ...emoji, category: emojiMoveCategory } : emoji
      )));
      setSelectedEmojiFilenames([]);
      setEmojiError('');
      window.dispatchEvent(new Event('emoji-catalog-updated'));
    } catch (error) {
      setEmojiError(error.message);
    } finally {
      setEmojiMoving(false);
    }
  }, [emojiMoveCategory, emojiMoving, selectedEmojiFilenames]);

  const openUserCm = useCallback((x, y, userName, uid, msgId, channelId) => {
    openMenu(
      'USER', x, y, {
        name: userName, uid, setChannel, addToInput, msgId, channelId,
      },
    );
  }, [setChannel, addToInput, openMenu]);

  const { stayScrolled } = useStayScrolled(listRef, {
    initialScroll: Infinity,
    inaccuracy: 20,
  });

  const channelMessages = messages[chatChannel];

  useEffect(() => {
    if (messages[chatChannel] || !channelViews[chatChannel] || !channelName) {
      return;
    }

    if (historyFetchRef.current) {
      const { controller, cid } = historyFetchRef.current;
      if (cid === chatChannel) {
        return;
      }
      if (!controller.signal.aborted) {
        controller.abort();
      }
    }

    const fetchHistory = async () => {
      const controller = new AbortController();
      historyFetchRef.current = { controller, cid: chatChannel };
      const history = await requestChatMessages(chatChannel, controller);
      if (history) {
        dispatch(receiveChatHistory(chatChannel, history));
        historyFetchRef.current = null;
      } else if (!controller.signal.aborted) {
        setTimeout(fetchHistory, 5000);
      }
    };
    fetchHistory();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatChannel, messages, channelName, channelViews]);

  useEffect(() => () => {
    // cancel history fetches
    if (historyFetchRef.current) {
      const { controller } = historyFetchRef.current;
      if (!controller.signal.aborted) {
        controller.abort();
      }
    }
  }, []);

  useLayoutEffect(() => {
    stayScrolled();
  }, [channelMessages, stayScrolled]);

  useEffect(() => {
    scrollRef.current = stayScrolled;
  }, [stayScrolled]);

  useEffect(() => {
    setTimeout(() => {
      const fontSize = Math.round(targetRef.current.offsetHeight / 10);
      setBtnSize(Math.min(28, fontSize));
    }, 330);
  }, [targetRef]);

  async function handleSubmit(evt) {
    evt.preventDefault();
    stopTyping();
    if (waitingForUploadRef.current) {
      return;
    }
    waitingForUploadRef.current = true;

    try {
      let inptMsg = inputRef.current.value.trim();
      // if there are files to upload, do that and add links to them
      const files = await uploadRef.current?.();
      if (files.length) {
        const attachments = files.map(

          (i) => `$[${escapeMd(i.name)}](${i.shortId}:${i.extension})`,
        ).join(' ');
        if (attachments) {
          inptMsg = `${inptMsg} ${attachments}`;
        }
      }
      if (!inptMsg) {
        return;
      }
      // send message via websocket
      dispatch(sendChatMessage(inptMsg, chatChannel));
      inputRef.current.value = '';
    } finally {
      waitingForUploadRef.current = false;
    }
  }

  return (
    <div
      ref={targetRef}
      className="chat-container"
    >
      <ul
        className="chatarea"
        ref={listRef}
        style={{ flexGrow: 1 }}
        role="presentation"
      >
        {(channelMessages?.length === 0) && (
          <ChatMessage
            key="initm"
            uid={0}
            name="info"
            flag="xx"
            msg={t`Start chatting here`}
          />
        )}
        {
          channelMessages?.map((message) => (
            (!blockedIds.includes(message[3])
              && !(hideVoidMessages && message[0] === EVENT_USER_NAME)) && (
              <ChatMessage
                name={message[0]}
                msg={message[1]}
                flag={message[2]}
                uid={message[3]}
                ts={message[4]}
                msgId={message[5]}
                channelId={chatChannel}
                flagLegit={message[6]}
                avatarId={message[7]}
                attachments={message[8]}
                registrationRank={message[9]}
                vipTier={message[10]}
                nicknameColor={message[11]}
                nicknameGradient={message[12]}
                avatarGlow={message[13]}
                pixelRankId={message[14]}
                factionBannerUrl={message[15]}
                key={message[5]}
                openCm={openUserCm}
                scrollRef={scrollRef}
                compact={chatCompact}
              />
            )))
        }
      </ul>
      <div
        className="chatinput"
        key="iptfl"
        style={{
          display: 'flex',
          position: 'relative',
        }}
      >
        {(ownName) ? (
          <Fragment key="iptfr">
            <div style={{ position: 'relative', flex: '0 0 auto' }}>
              <button
                type="button"
                className="sendbtn"
                title={t`Emojis and GIFs`}
                aria-label={t`Emojis and GIFs`}
                aria-expanded={emojiOpen}
                onClick={openEmojiPicker}
                style={{ width: 34, height: 30 }}
              >
                ☺
              </button>
              {emojiOpen && (
                <div
                  className="emoji-picker"
                  style={{
                    position: 'absolute',
                    zIndex: 10,
                    bottom: '100%',
                    left: 0,
                    width: 300,
                    maxWidth: '85vw',
                    padding: 10,
                    maxHeight: 320,
                    overflowY: 'auto',
                  }}
                >
                  {userlvl >= USERLVL.ADMIN && selectedEmojiFilenames.length > 0 && (
                    <div className="emoji-picker-movebar">
                      <span>
                        {t`Selected`}: {selectedEmojiFilenames.length}
                      </span>
                      <select
                        value={emojiMoveCategory}
                        onChange={(event) => setEmojiMoveCategory(
                          event.currentTarget.value,
                        )}
                        aria-label={t`Move selected emojis to category`}
                      >
                        {emojiCategories.map(([category, label]) => (
                          <option key={category} value={category}>
                            {label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={moveSelectedEmojis}
                        disabled={emojiMoving}
                      >
                        {emojiMoving ? t`Moving...` : t`Move`}
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedEmojiFilenames([])}
                        disabled={emojiMoving}
                      >
                        {t`Cancel`}
                      </button>
                    </div>
                  )}
                  {emojiCategories.map(([category, label]) => {
                    const categoryEmojis = emojis.filter(
                      (emoji) => emoji.category === category,
                    );
                    return (
                      <section key={category} className="emoji-picker-category">
                        <h4
                          className="emoji-picker-category-title"
                        >
                          <span>{label}</span>
                          <span>{categoryEmojis.length}</span>
                        </h4>
                        <div
                          className="emoji-picker-grid"
                        >
                          {categoryEmojis.map(({ filename, name, code }) => (
                            <button
                              type="button"
                              key={filename}
                              title={`${name} (:${code}:)`}
                              aria-label={`${name} :${code}:`}
                              aria-pressed={selectedEmojiFilenames.includes(filename)}
                              className={`emoji-picker-item${selectedEmojiFilenames.includes(filename) ? ' selected' : ''}`}
                              onContextMenu={(event) => {
                                if (userlvl < USERLVL.ADMIN) {
                                  return;
                                }
                                event.preventDefault();
                                setSelectedEmojiFilenames((selected) => (
                                  selected.includes(filename)
                                    ? selected.filter((item) => item !== filename)
                                    : [...selected, filename]
                                ));
                              }}
                              onClick={() => {
                                if (userlvl >= USERLVL.ADMIN
                                  && selectedEmojiFilenames.length) {
                                  setSelectedEmojiFilenames((selected) => (
                                    selected.includes(filename)
                                      ? selected.filter((item) => item !== filename)
                                      : [...selected, filename]
                                  ));
                                } else {
                                  addToInput(`:${code}:`);
                                }
                              }}
                            >
                              <img
                                src={api`/api/emojis/file/${filename}`}
                                alt=""
                                loading="lazy"
                                className="emoji-picker-image"
                              />
                            </button>
                          ))}
                        </div>
                        {!categoryEmojis.length && (
                          <p className="emoji-picker-empty">
                            {t`No emojis in this category yet`}
                          </p>
                        )}
                      </section>
                    );
                  })}
                  {emojiError && <p role="alert">{emojiError}</p>}
                  {userlvl >= USERLVL.ADMIN && (
                    <form onSubmit={uploadEmoji} className="emoji-picker-upload">
                      <select
                        value={emojiCategory}
                        onChange={(event) => setEmojiCategory(
                          event.currentTarget.value,
                        )}
                        aria-label={t`Emoji category for uploaded image`}
                      >
                        {emojiCategories.map(([category, label]) => (
                          <option key={category} value={category}>
                            {label}
                          </option>
                        ))}
                      </select>
                      <input
                        type="file"
                        accept="image/gif,image/webp,image/png"
                        onChange={(event) => setEmojiFile(
                          event.currentTarget.files[0],
                        )}
                        aria-label={t`Choose an emoji image`}
                        required
                      />
                      <button
                        type="submit"
                        disabled={!emojiFile || emojiUploading}
                      >
                        {emojiUploading ? t`Uploading...` : t`Add emoji`}
                      </button>
                    </form>
                  )}
                </div>
              )}
            </div>
            <input
              key="iptre"
              name="chat-input"
              style={{
                flexGrow: 1,
                minWidth: 40,
              }}
              ref={inputRef}
              onInput={handleTypingInput}
              onBlur={stopTyping}
              onKeyDown={(evt) => {
                if (evt.key === 'Enter') {
                  handleSubmit(evt);
                }
              }}
              autoComplete="off"
              maxLength="200"
              type="text"
              className="chtipt"
              placeholder={t`Chat here`}
            />
            <FileUpload
              key="fui"
              maxFiles={3}
              uploadRef={uploadRef}
              printErrors={printWarnings}
            />
            <button
              className="sendbtn"
              style={{ flexGrow: 0, width: 32 }}
              type="button"
              onClick={handleSubmit}
            >
              ‣
            </button>
          </Fragment>
        ) : (
          <div
            className="modallink"
            key="nlipt"
            onClick={(evt) => {
              evt.stopPropagation();
              link('USERAREA', { target: 'parent' });
            }}
            style={{
              textAlign: 'center',
              fontSize: 13,
              flexGrow: 1,
            }}
            role="button"
            tabIndex={0}
          >
            {t`You must be logged in to chat`}
          </div>
        )}
        <ChannelDropDown
          key="cdd"
          setChatChannel={setChannel}
          chatChannel={chatChannel}
          channelName={channelName}
          channelType={channelType}
          channelAvatarId={channelAvatarId}
        />
      </div>
      {Object.values(typingUsers).length > 0 && (
        <div className="chat-typing-indicator" aria-live="polite">
          {Object.entries(typingUsers).map(([userId, name]) => (
            <span key={userId}>{name} - {t`is typing...`}</span>
          ))}
        </div>
      )}
      <div
        className="chatlink"
        style={{
          fontSize: btnSize,
        }}
      >
        <span
          onClick={(evt) => {
            openMenu(
              'CHANNEL', evt.clientX, evt.clientY, {
                cid: chatChannel, type: channelType, muted: channelMuted,
              }, 'tr',
            );
          }}
          role="button"
          title={t`Channel settings`}
          tabIndex={-1}
        >⚙</span>
      </div>
    </div>
  );
};

export default Chat;
