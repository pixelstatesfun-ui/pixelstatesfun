/**
 */

// canvas size (width and height) MUST be 256 * 4^n to be able to stick
// to established tiling conventions.
// (basically by sticking to that, we keep ourself many options open for the
//  future)
// see OSM tiling: https://wiki.openstreetmap.org/wiki/Slippy_map_tilenames
export const MAX_SCALE = 40; // 52 in log2
export const DEFAULT_SCALE = 3;

// background color behind 2D canvses
export const BACKGROUND_CLR_HEX = '#C4C4C4';

export const DEFAULT_CANVAS_ID = '0';

export const TILE_LOADING_IMAGE = './loading.png';

// constants for 3D voxel canvas
export const THREE_CANVAS_HEIGHT = 128;
export const THREE_TILE_SIZE = 32;
// 2D tile size
export const TILE_SIZE = 256;
// how much to scale for a new tiled zoomlevel
export const TILE_ZOOM_LEVEL = 2;
export const TILE_CACHE_VERSION = '20261004-world-land';

export const SECOND = 1000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
export const MONTH = 30 * DAY;

// available public Chat Channels
// at least 'en' and 'int' have to be present,
// as they get used in core/ChatProvider
export const CHAT_CHANNELS = [
  {
    name: 'en',
  }, {
    name: 'int',
  }, {
    name: 'art',
  },
];

export const MAX_CHAT_MESSAGES = 100;

export const EVENT_USER_NAME = 'event';
export const INFO_USER_NAME = 'info';
export const APISOCKET_USER_NAME = 'apisocket';

// delay for updating coordinates (for window title, history, url, etc.)
export const VIEW_UPDATE_DELAY = 1000;

// maximum chunks to subscribe to
export const MAX_LOADED_CHUNKS = 2000;
export const MAX_CHUNK_AGE = 300000;
export const GC_INTERVAL = 300000;

// TINYINT (-128 - 127)
export const USERLVL = {
  ANONYM: 0,
  REGISTERED: 10, // sql hardcoded
  VERIFIED: 20, // sql hardcoded
  CHATMOD: 45,
  CLEANER: 50,
  JANNY: 65,
  TRIALMOD: 75,
  MOD: 80,
  ADMIN: 100, // sql hardcoded
};

export const PROXY_FLAGS = {
  PROXY: 0,
  VPN: 1,
  COMPROMISED: 2,
  SCRAPER: 3,
  TOR: 4,
  HOSTING: 5,
  ANONYMOUS: 6,
  INVALID: 7,
};

export const THREEPID_ABBR = {
  d: 'DISCORD',
  g: 'GOOGLE',
  vk: 'VK',
};

export const THREEPID_PROVIDERS = {
  EMAIL: 1, // sql hardcoded
  DISCORD: 2,
  REDDIT: 3,
  FACEBOOK: 4,
  GOOGLE: 5,
  VK: 6,
};

export const MEDIA_BAN_REASONS = {
  GORE: 1,
  CSAM: 2,
  DEGENERACY: 3,
  SCAM: 4,
  TERRORISM: 5,
  PROPAGANDA: 6,
  DOXING: 7,
};

export const CHANNEL_TYPES = {
  PUBLIC: 0,
  DM: 1, // sql hardcoded
  GROUP: 2, // sql hardcoded
  FACTION: 3, // sql hardcoded
};

export const CANVAS_TYPES = {
  DUMMY: 0,
  TWOD: 1,
  THREED: 2,
};

export const RANGEBAN_REASONS = {
  DATACENTER: 0,
  VPN: 0,
  SPAMMING: 1,
  FLOODING: 2,
  SCRAPPING: 3,
  RAIDING: 4,
  ZOGBOTS: 5,
};

export const USER_FLAGS = {
  BLOCK_DM: 0,
  PRIV: 1, // sql hardcoded
  COUNTRY_FLAG_UNLOCKED: 2,
};

export const FACTION_FLAGS = {
  // whether it is searchable
  PRIV: 0,
  // whether everybody can join withhout invite
  PUBLIC: 1, // sql hardcoded
};

export const INVITE_FLAGS = {
  ONE_TIME: 0,
};

export const USER_FACTION_FLAGS = {
  HIDDEN: 0, // sql hardcoded
};

export const FACTION_ROLE_FLAGS = {
  // can not be deleted, can not have his default flag changed
  PROTECTED: 0, // sql hardcoded
  // new members join this role per default
  DEFAULT: 1, // sql hardcoded
};

/*
 * factionlvl at which a user can do certain tasks
 */
export const FACTION_PERMISSIONS = {
  PEASANT: 0, // sql hardcoded
  MANAGE_INVITES: 49, // sql hardcoded
  KICK: 50,
  SEE_HIDDEN_USERS: 59,
  ASSIGN_ROLES: 60, // sql hardcoded
  BAN: 65,
  UNBAN: 70,
  EDIT_ROLES: 74,
  CREATE_ROLES: 75, // sql hardcoded
  EDIT_FACTION: 80,
  MANAGE_YOURSELF: 99, // sql hardcoded
  DELETE_FACTION: 100, // sql hardcoded
  SOVEREIGN: 100, // sql hardcoded
};

export function hasFactionPermission(permissions, permission) {
  if (!permissions || typeof permissions !== 'object') return false;
  const permissionName = permission === 'ACCEPT_MEMBERS'
    ? 'manageApplications' : permission;
  return permissions[permissionName] === true;
}

export const MAX_FACTIONS_PER_USER = 1; // sql hardcoded

export const MAX_INVITES_PER_FACTION = 20; // sql hardcoded

export const MAX_OWNED_FACTIONS_PER_USER = 10; // sql hardcoded

export const MAX_ROLES_PER_FACTION = 20; // sql hardcoded

// Mode for shift-painting or phone pencil, HISTORY has to be last
export const PENCIL_MODE = {
  COLOR: 0,
  OVERLAY: 1,
  HISTORY: 2,
};

// threshold at which zoomlevel overlay switches to small-pixel mode
export const OVERLAY_SP_TH = 8;

/*
 * PopUp path args
 */
export const POPUP_ARGS = {
  MODTOOLS: ['activeTab'],
  FACTION: ['name', 'activeTab'],
  USER: ['username'],
  SEARCH: ['activeTab'],
  CHAT: [['chatChannel', 'int']],
  BADGE_DISPLAY: [['id', 'int']],
  PLAYER: ['uri'],
  STATISTICS: ['activeTab'],
  I: ['inviteId'],
};

/*
 * windows that can be opened as popups
 */
export const AVAILABLE_POPUPS = [
  'HELP',
  'SETTINGS',
  'USERAREA',
  'CHAT',
  'CANVAS_SELECTION',
  'ARCHIVE',
  'PLAYER',
  'BADGE_DISPLAY',
  'STATISTICS',
  'MODTOOLS',
  'MYFACTIONS',
  'FACTION',
  'USER',
  'SEARCH',
  'CONVERTER',
  'I',
  'MODLOG',
  'FIRE',
];

/*
 * popups that need websocket
 */
export const POPUPS_NEEDING_WS = [
  'CHAT',
  'MYFACTIONS',
  'USERAREA',
];

export const DO_NOTHING = Symbol('DO_NOTHING');


export const VIDEO_EXTENSIONS = [
  'webm',
  'mp4',
];

export const IMAGE_EXTENSIONS = [
  'jpg',
  'jpeg',
  'png',
  'webp',
  'gif',
];
