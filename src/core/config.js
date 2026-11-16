/*
 * general config that is also available from client code can be found in
 * src/core/constants.js
 */
import fs from 'fs';
import path from 'path';

if (process.env.BROWSER) {
  throw new Error(
    'Do not import `config.js` from inside the client-side code.',
  );
}

let config = {};

(() => {
  const variables = [
    ['ASSET_DIR', 'string', '/assets'],
    ['PORT', 'int', 8080],
    ['HOST', 'string', '127.0.0.1'],
    ['USE_MAILER', 'bool', false],
    ['VIP_ENABLED', 'bool', true],
    ['FACTION_NAPS_ENABLED', 'bool', true],
    ['WarEnable', 'bool', true],
    ['VIP_COOLDOWN_MULTIPLIER', 'float', 0.5],
    ['VIP_COOLDOWN_MULTIPLIER_NO_VOID', 'float', 0.95],
    ['VIP_PLUS_COOLDOWN_MULTIPLIER', 'float', 0.45],
    ['VIP_PLUS_COOLDOWN_MULTIPLIER_NO_VOID', 'float', 0.9],
    ['VIP_PLUS_PLUS_COOLDOWN_MULTIPLIER', 'float', 0.4],
    ['VIP_PLUS_PLUS_COOLDOWN_MULTIPLIER_NO_VOID', 'float', 0.8],
    ['VOID_WEBHOOK_URL', 'string', null],
    ['VOID_PING_ROLE_ID', 'string', null],
    ['MOD_AUDIT_WEBHOOK_URL', 'string', null],
    ['USER_AUDIT_WEBHOOK_URL', 'string', null],
    ['MAIL_ADDRESS', 'string', 'donotreply@example.com'],
    ['CONTACT_ADDRESS', 'string', 'admin@example.com'],
    ['TILE_FOLDER_REL', 'string', 'tiles'],
    ['MEDIA_FOLDER_REL', 'string', 'media'],
    ['USE_XREALIP', 'bool', false],
    ['BACKUP_URL', 'string', null],
    ['OUTGOING_ADDRESS', 'string', null],
    ['PUNISH_DOMINATOR', 'bool', false],
    ['USE_PROXYCHECK', 'bool', false],
    ['PROXYCHECK_KEY', 'string', null],
    ['PROXYCHECK_LOG_ONLY', 'bool', true],
    ['IPAPIIS_KEY', 'string', null],
    ['USE_IPQS_DB', 'bool', false],
    ['IPQS_READER_PATH', 'string', null],
    ['IPQS_DB_IPV4_PATH', 'string', null],
    ['IPQS_DB_IPV6_PATH', 'string', null],
    ['IPQS_PYTHON', 'string', 'python'],
    ['IPQS_DB_CACHE_MS', 'int', 900000],
    ['REDIS_URL', 'string', 'redis://localhost:6379'],
    ['IS_CLUSTER', 'bool', false],
    ['MAX_WS_CONNECTIONS', 'int', 5000],
    ['MAX_WS_CONNECTIONS_PER_IP', 'int', 50],
    ['CDN_URL', 'string', ''],
    ['NO_CDN_COUNTRIES', 'array', null],
    ['API_URLS', 'array', null],
    ['UNSHARDED_HOST', 'string', null],
    ['BASENAME', 'string', ''],
    ['CORS_HOSTS', 'array', []],
    ['MARIADB_HOST', 'string', 'localhost'],
    ['MARIADB_DATABASE', 'string', 'pixelplanet'],
    ['MARIADB_USER', 'string', 'pixelplanet'],
    ['MARIADB_PW', 'string', 'sqlpassword'],
    ['LOG_MARIADB', 'bool', false],
    ['CHAT_INVITE', 'string', 'https://www.guilded.gg/'],
    ['HOURLY_EVENT', 'bool', false],
    ['TOTAL_MEDIA_SIZE_MB', 'int', 0],
    ['MAX_FILE_SIZE_MB', 'int', 0],
    ['MAX_UPLOAD_AMOUNT', 'int', 5],
    ['MAX_USER_MEDIA_SIZE_MB', 'int', 0],
    ['APISOCKET_KEY', 'string', null],
    ['ADMIN_IDS', 'numarray', []],
    ['CAPTCHA_PROVIDER', 'string', 'turnstile'],
    ['CAPTCHA_TIME', 'int', 30],
    ['TRUSTED_TIME', 'int', 48],
    ['TURNSTILE_SITE_KEY', 'string', null],
    ['TURNSTILE_SECRET_KEY', 'string', null],
    ['TURNSTILE_HOSTNAME', 'string', null],
    ['TURNSTILE_ACTION', 'string', 'pixelplanet-captcha'],
    ['WHOIS_DURATION', 'int', 240],
    ['COOKIE_SECRET', 'string', 'dummy'],
    ['DISCORD_CLIENT_ID', 'string', null],
    ['DISCORD_CLIENT_SECRET', 'string', null],
    ['DISCORD_BOT_TOKEN', 'string', null],
    ['DISCORD_GUILD_ID', 'string', null],
    ['DISCORD_ROLE_PRINCE_VIP', 'string', '1557064508357218385'],
    ['DISCORD_ROLE_KING_VIP', 'string', '1557064583372476436'],
    ['DISCORD_ROLE_EMPEROR_VIP', 'string', '1557064830048018492'],
    ['DISCORD_ROLE_TRIAL_MOD', 'string', '1560246603900522586'],
    ['DISCORD_ROLE_MODERATOR', 'string', '1555319668212895837'],
    ['TESTER_GATE_ENABLED', 'bool', false],
    ['TESTER_DISCORD_USERNAMES', 'array', []],
    ['GOOGLE_CLIENT_ID', 'string', null],
    ['GOOGLE_CLIENT_SECRET', 'string', null],
    ['VK_CLIENT_ID', 'string', null],
    ['VK_CLIENT_SECRET', 'string', null],
    ['DISCORD_R_URI', 'string', null],
    ['GOOGLE_R_URI', 'string', null],
    ['VK_R_URI', 'string', null],
    ['BACKUP_REDIS_URL', 'string', null],
    ['BACKUP_DIR', 'string', null],
    ['BACKUP_CMD', 'string', null],
    ['BACKUP_INTERVAL', 'int', 30],
    ['RATE_LIMIT_CMD', 'string', null],
    ['TIMEBLOCKS', 'array', null],
    ['OIDC_URL', 'string', null],
  ];

  /*
   * read all config file values
   */
  const configFileValues = {};
  try {
    const configFile = path.resolve('config.ini');
    if (fs.existsSync(configFile)) {
      fs.readFileSync(path.resolve('config.ini')).toString('utf8')
        .split('\n').forEach((line) => {
          line = line.trim();
          if (line.startsWith('#')) {
            return;
          }
          const seperator = line.indexOf('=');
          // eslint-disable-next-line
          if (seperator === -1 || seperator === 0 || seperator > line.length - 2) {
            return;
          }
          const key = line.substring(0, seperator).trim();
          let value = line.substring(seperator + 1).trim();
          if ((value.startsWith('"') && value.endsWith('"'))
            || (value.startsWith('\'') && value.endsWith('\''))
          ) {
            value = value.substring(1, value.length - 1);
          }
          configFileValues[key] = value;
        });
    }
  } catch (error) {
    console.error(`Couldn't read config file ${error.message}`);
  }

  const envFileValues = {};
  const envFile = path.resolve('.env');
  if (fs.existsSync(envFile)) {
    fs.readFileSync(envFile, 'utf8')
      .replace(/^\uFEFF/, '')
      .split('\n')
      .forEach((line) => {
        line = line.trim();
        if (!line || line.startsWith('#')) {
          return;
        }
        if (line.startsWith('export ')) {
          line = line.slice(7).trim();
        }
        const separator = line.indexOf('=');
        if (separator <= 0) {
          return;
        }
        const key = line.slice(0, separator).trim();
        let value = line.slice(separator + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"'))
          || (value.startsWith('\'') && value.endsWith('\''))
        ) {
          value = value.slice(1, -1);
        }
        envFileValues[key] = value;
      });
  }

  /*
   * read all variables and assign config values, either by environment or
   * config file
   */
  for (let i = 0; i < variables.length; i += 1) {
    const [key, type, def] = variables[i];

    const userValue = process.env[key]
      || envFileValues[key]
      || (key.startsWith('DISCORD_') ? undefined : configFileValues[key]);
    let value;

    if (userValue) {
      switch (type) {
        case 'string': {
          value = userValue;
          break;
        }
        case 'int': {
          const num = parseInt(userValue, 10);
          if (Number.isNaN(num)) {
            value = def;
          } else {
            value = num;
          }
          break;
        }
        case 'float': {
          const num = Number(userValue);
          value = (Number.isFinite(num) && num > 0 && num <= 1)
            ? num : def;
          break;
        }
        case 'bool': {
          /* eslint-disable max-len */
          const boolValue = userValue.toLowerCase();
          if (boolValue === 'true' || boolValue === 'yes' || boolValue === '1') {
            value = true;
          } else if (boolValue === 'false' || boolValue === 'no' || boolValue === '0') {
            value = false;
          } else {
            value = def;
          }
          /* eslint-enable max-len */
          break;
        }
        case 'array': {
          value = userValue.split(',').map((c) => c.trim()).filter((c) => c);
          break;
        }
        case 'numarray': {
          value = userValue.split(',').map((c) => c.trim()).filter((c) => c)
            .map((c) => parseInt(c, 10));
          break;
        }
        default:
          throw new Error(
            `Can not parse config value ${userValue} for ${key}`,
          );
      }
    } else {
      value = def;
    }

    config[key] = value;
  }

  if (config.TESTER_GATE_ENABLED
    && (!config.TESTER_DISCORD_USERNAMES.length
      || !config.DISCORD_CLIENT_ID?.trim()
      || !config.DISCORD_CLIENT_SECRET?.trim()
      || !config.DISCORD_R_URI?.trim()
      || config.COOKIE_SECRET === 'dummy'
      || config.COOKIE_SECRET.length < 32)
  ) {
    throw new Error(
      'Tester gate requires an allowlist, Discord OAuth client ID, secret, '
      + 'redirect URI, and a COOKIE_SECRET of at least 32 characters.',
    );
  }

  /* postprocessed values */

  /*
   * read TIMEBLOCKS and seperate them into user and ip
   */
  config.TIMEBLOCK_USERS = null;
  config.TIMEBLOCK_IPS = null;
  if (config.TIMEBLOCKS) {
    /*
     * convert list of uidOrIP-HHmm-HHmm-message strings into Map
     */
    const timeBlockUsers = new Map();
    const timeBlockIps = new Map();
    for (let i = 0; i < config.TIMEBLOCKS.length; i += 1) {
      const [uidOrIP, start, end, message] = config.TIMEBLOCKS[i].split('-');
      const props = [`${start}-${end}`, message];
      if (uidOrIP.includes(':') || uidOrIP.includes('.')) {
        timeBlockIps.set(uidOrIP, props);
      } else {
        timeBlockUsers.set(parseInt(uidOrIP, 10), props);
      }
    }
    if (timeBlockUsers.size) {
      config.TIMEBLOCK_USERS = timeBlockUsers;
    }
    if (timeBlockIps.size) {
      config.TIMEBLOCK_IPS = timeBlockIps;
    }
  }

  /*
   * check if ALL countries are allowed to be accessed without CDN
   */
  config.NO_CDN = null;
  if (config.NO_CDN_COUNTRIES?.includes('all')) {
    config.NO_CDN_COUNTRIES.splice(config.NO_CDN_COUNTRIES.indexOf('all'), 1);
    if (!config.NO_CDN_COUNTRIES.length) {
      config.NO_CDN_COUNTRIES = null;
    }
    config.NO_CDN = true;
  }

  /*
   * make list of configured third party providers,
   * the abbriviations are used in the route routes/top.js and in the Login Form
   * components/LogInForm.js
   */
  config.AVAILABLE_TP = [];
  if (config.DISCORD_CLIENT_ID) config.AVAILABLE_TP.push('d');
  if (config.GOOGLE_CLIENT_ID) config.AVAILABLE_TP.push('g');
  if (config.VK_CLIENT_ID) config.AVAILABLE_TP.push('vk');

  /*
   * resolve TILE_FOLDER and MEDIA_FOLDER to full path
   */
  config.TILE_FOLDER = path.resolve(config.TILE_FOLDER_REL);
  config.MEDIA_FOLDER = path.resolve(config.MEDIA_FOLDER_REL);

  /*
   * proccess URL related values
   */
  if (config.CDN_URL) {
    const cdnHost = config.CDN_URL.substring(config.CDN_URL.indexOf('//') + 2);
    const endHostSlash = cdnHost.indexOf('/', 8);
    if (endHostSlash !== -1) {
      config.CDN_HOST = cdnHost.substring(0, endHostSlash);
    } else {
      config.CDN_HOST = cdnHost;
    }
  } else {
    config.CDN_HOST = '';
  }

  config.CORS_HOSTS = config.CORS_HOSTS.map(
    (c) => ((c.split('.').length !== 4 && !c.startsWith('.')) ? `.${c}` : c),
  );
})();

export const {
  ASSET_DIR,
  PORT,
  HOST,
  USE_MAILER,
  VIP_ENABLED,
  FACTION_NAPS_ENABLED,
  WarEnable,
  VIP_COOLDOWN_MULTIPLIER,
  VIP_COOLDOWN_MULTIPLIER_NO_VOID,
  VIP_PLUS_COOLDOWN_MULTIPLIER,
  VIP_PLUS_COOLDOWN_MULTIPLIER_NO_VOID,
  VIP_PLUS_PLUS_COOLDOWN_MULTIPLIER,
  VIP_PLUS_PLUS_COOLDOWN_MULTIPLIER_NO_VOID,
  VOID_WEBHOOK_URL,
  VOID_PING_ROLE_ID,
  MOD_AUDIT_WEBHOOK_URL,
  USER_AUDIT_WEBHOOK_URL,
  MAIL_ADDRESS,
  CONTACT_ADDRESS,
  USE_XREALIP,
  BACKUP_URL,
  OUTGOING_ADDRESS,
  PUNISH_DOMINATOR,
  USE_PROXYCHECK,
  PROXYCHECK_KEY,
  PROXYCHECK_LOG_ONLY,
  IPAPIIS_KEY,
  USE_IPQS_DB,
  IPQS_READER_PATH,
  IPQS_DB_IPV4_PATH,
  IPQS_DB_IPV6_PATH,
  IPQS_PYTHON,
  IPQS_DB_CACHE_MS,
  REDIS_URL,
  IS_CLUSTER,
  MAX_WS_CONNECTIONS,
  MAX_WS_CONNECTIONS_PER_IP,
  CDN_URL,
  NO_CDN_COUNTRIES,
  NO_CDN,
  API_URLS,
  UNSHARDED_HOST,
  BASENAME,
  CORS_HOSTS,
  MARIADB_HOST,
  MARIADB_DATABASE,
  MARIADB_USER,
  MARIADB_PW,
  LOG_MARIADB,
  CHAT_INVITE,
  HOURLY_EVENT,
  TOTAL_MEDIA_SIZE_MB,
  MAX_FILE_SIZE_MB,
  MAX_UPLOAD_AMOUNT,
  MAX_USER_MEDIA_SIZE_MB,
  APISOCKET_KEY,
  ADMIN_IDS,
  CAPTCHA_PROVIDER,
  CAPTCHA_TIME,
  TRUSTED_TIME,
  TURNSTILE_SITE_KEY,
  TURNSTILE_SECRET_KEY,
  TURNSTILE_HOSTNAME,
  TURNSTILE_ACTION,
  WHOIS_DURATION,
  DISCORD_CLIENT_ID,
  DISCORD_CLIENT_SECRET,
  DISCORD_BOT_TOKEN,
  DISCORD_GUILD_ID,
  DISCORD_ROLE_PRINCE_VIP,
  DISCORD_ROLE_KING_VIP,
  DISCORD_ROLE_EMPEROR_VIP,
  DISCORD_ROLE_TRIAL_MOD,
  DISCORD_ROLE_MODERATOR,
  TESTER_GATE_ENABLED,
  TESTER_DISCORD_USERNAMES,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  VK_CLIENT_ID,
  VK_CLIENT_SECRET,
  DISCORD_R_URI,
  GOOGLE_R_URI,
  VK_R_URI,
  TILE_FOLDER,
  MEDIA_FOLDER,
  CDN_HOST,
  BACKUP_REDIS_URL,
  BACKUP_DIR,
  BACKUP_CMD,
  BACKUP_INTERVAL,
  RATE_LIMIT_CMD,
  COOKIE_SECRET,
  TIMEBLOCK_IPS,
  TIMEBLOCK_USERS,
  OIDC_URL,
  AVAILABLE_TP,
} = config;

config = null;
