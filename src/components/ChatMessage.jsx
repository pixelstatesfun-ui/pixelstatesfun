import { memo } from 'preact/compat';
import { useSelector } from '../store/react-redux/index.js';

import MdParagraph from './markdown/MdParagraph.jsx';
import Avatar from './Avatar.jsx';
import {
  colorFromText, setBrightness, getDateTimeString,
} from '../core/utils.js';
import { selectIsDarkMode } from '../store/selectors/gui.js';
import { getUrlFromMediaIdAndName } from '../utils/media/utils.js';
import { cdn } from '../utils/utag.js';
import { getPixelRankById } from '../core/pixelRanks.js';
import { getStaffIconName } from '../utils/flagMapping.js';
import PixelRankBadge from './PixelRankBadge.jsx';

// ID 573 is the 100th registered account in the current user list.
const FIRST_100_MAX_ID = 573;


function ChatMessage({
  name,
  uid,
  msgId,
  channelId,
  registrationRank,
  vipTier = 0,
  nicknameColor,
  nicknameGradient,
  avatarGlow,
  pixelRankId,
  factionBannerUrl,
  flag,
  msg,
  ts,
  flagLegit,
  avatarId,
  attachments,
  openCm,
  scrollRef,
  compact,
}) {
  const isDarkMode = useSelector(selectIsDarkMode);
  const pixelRank = getPixelRankById(pixelRankId);
  const rankColor = registrationRank <= 25
    ? '#50d7ff'
    : registrationRank <= 50
      ? '#ffd45c'
      : registrationRank <= 100
        ? '#cd7f32'
        : registrationRank <= 200
          ? '#59ca72'
          : '#a0a0a0';

  const isInfo = (name === 'info');
  const isEvent = (name === 'event');
  const taggedName = /^\[([A-Za-z0-9]{1,8})\]\s*(.+)$/.exec(name);
  const factionTag = taggedName?.[1] || null;
  const displayName = taggedName?.[2] || name;
  const factionBanner = typeof factionBannerUrl === 'string'
    && (/^\/userdata\/factionflags\/[A-Za-z0-9._-]+$/.test(factionBannerUrl)
      || /^[A-Za-z0-9_-]+:[A-Za-z0-9]+$/.test(factionBannerUrl))
    ? (factionBannerUrl.startsWith('/userdata/')
        ? factionBannerUrl
        : cdn`${getUrlFromMediaIdAndName(factionBannerUrl, 'flag')}`)
    : null;
  const factionBackground = factionBanner ? {
    backgroundImage: [
      isDarkMode
        ? 'linear-gradient(90deg, rgba(12, 16, 24, .93), rgba(12, 16, 24, .74))'
        : 'linear-gradient(90deg, rgba(255, 250, 242, .58), '
          + 'rgba(255, 250, 242, .24))',
      `url("${factionBanner}")`,
    ].join(', '),
    backgroundPosition: 'center',
    backgroundSize: 'cover',
    backgroundColor: isDarkMode ? '#111827' : '#fffaf2',
  } : undefined;

  let className = 'msg';
  if (isInfo) {
    className += ' info';
  } else if (isEvent) {
    className += ' event';
  } else if (msg.charAt(0) === '>') {
    className += ' greentext';
  } else if (msg.charAt(0) === '<') {
    className += ' redtext';
  }
  if (vipTier >= 2) {
    className += ' premium';
  } else if (vipTier === 1) {
    className += ' vip';
  }
  if (vipTier >= 3) {
    className += ' emperor';
  }

  let flagClass = 'chatflag';
  if (!flagLegit) {
    flagClass += ' illegit';
  }
  const staffIconName = getStaffIconName(flag);
  const staffIcon = Boolean(staffIconName);
  if (staffIcon) {
    flagClass += ' staff-icon';
  }

  if (isInfo || isEvent) {
    return (
      <li className="chatmsg">
        <div className="msgcontent">
          <MdParagraph text={msg} className={className} />
        </div>
      </li>
    );
  }

  const msgUser = (
    <span
      key="name"
      role="button"
      tabIndex={-1}
      className="msguser"
      style={{
        cursor: 'pointer',
      }}
      onClick={(event) => {
        openCm(event.clientX, event.clientY, displayName, uid, msgId, channelId);
      }}
    >
      <img
        className={flagClass}
        alt=""
        title={flag}
        src={staffIcon
          ? cdn`/cf/${staffIconName}.png`
          : (flag.length === 2
              ? cdn`/cf/${flag}.gif`
              : cdn`${getUrlFromMediaIdAndName(flag, 'flag')}`)}
      />
      {uid > 0 && uid <= FIRST_100_MAX_ID && (
        <img
          className="first100badge"
          src={cdn`/first100.png`}
          alt=""
          title="First 100 player"
          style={{
            width: '14px',
            height: '17px',
            verticalAlign: '-4px',
            marginRight: '3px',
          }}
        />
      )}
      <span
        className="chatname"
        title={name}
      >
        {registrationRank > 0 && (
          <span
            className="chatrank"
            style={{
              color: rankColor,
              fontWeight: 700,
              marginRight: '4px',
              textShadow: registrationRank <= 50 ? '0 0 4px ' + rankColor : 'none',
            }}
          >
            #{registrationRank}
          </span>
        )}
        {factionTag && (
          <span className="chat-faction-tag">[{factionTag}]</span>
        )}
        {pixelRank && <PixelRankBadge rank={pixelRank} size={15} />}
        <span
          className="chatname-text"
          style={nicknameGradient ? {
            backgroundImage: `linear-gradient(90deg, ${
              nicknameGradient.split(',').join(', ')
            })`,
            backgroundClip: 'text',
            color: 'transparent',
            WebkitTextFillColor: 'transparent',
          } : {
            color: nicknameColor
              || setBrightness(colorFromText(displayName), isDarkMode),
          }}
        >{displayName}</span>
        {vipTier > 0 && (
          <span
            className={`vip-chat-badge${vipTier > 1 ? ' premium' : ''}${
              vipTier >= 3 ? ' emperor' : ''
            }`}
          >
            {vipTier >= 3 ? 'Emperor' : vipTier > 1 ? 'King' : 'Prince'}
          </span>
        )}
      </span>
      {': '}
    </span>
  );

  if (compact) {
    return (
      <li className="chatmsg compact" style={factionBackground}>
        {msgUser}
        <MdParagraph
          text={msg}
          className={className}
          attachmentInfo={attachments}
          scrollRef={scrollRef}
          compact
        />
      </li>
    );
  }

  return (
    <li className="chatmsg full" style={factionBackground}>
      <Avatar
        uid={uid}
        isDarkMode={isDarkMode}
        avatarId={avatarId}
        vipTier={vipTier}
        avatarGlow={avatarGlow}
      />
      <div className="msgcontent">
        <div className="msgheader">
          {msgUser}
          <span className="chatts">
            {getDateTimeString(ts)}
          </span>
        </div>
        <MdParagraph
          text={msg}
          className={className}
          attachmentInfo={attachments}
          scrollRef={scrollRef}
        />
      </div>
    </li>
  );
}

export default memo(ChatMessage);
