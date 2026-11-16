-- Factions

CREATE TABLE IF NOT EXISTS Factions (
  id bigint unsigned NOT NULL AUTO_INCREMENT,
  cid int unsigned,
  avatar bigint unsigned,
  banner bigint unsigned,
  ownerId int unsigned DEFAULT NULL,

  name varchar(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  tag varchar(8) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
  title varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  description varchar(1000) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  color char(7) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT '#ffffff',
  flagUrl varchar(255) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
  openJoin tinyint(1) NOT NULL DEFAULT 0,
  coordinationIds longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  flags tinyint unsigned NOT NULL DEFAULT 0,
  memberCount int unsigned NOT NULL DEFAULT 0,
  totalPixels bigint unsigned NOT NULL DEFAULT 0,
  dailyPixels bigint unsigned NOT NULL DEFAULT 0,
  dailyPixelsDate date DEFAULT NULL,
  rankCode varchar(24) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'chiefdom',

  createdAt datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY name (name),
  UNIQUE KEY faction_tag (tag),
  KEY cid (cid),
  KEY ownerId (ownerId),
  KEY avatar (avatar),
  KEY banner (banner),
  KEY faction_title (title),
  CONSTRAINT Factions_ibfk_1 FOREIGN KEY (cid) REFERENCES Channels (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT Factions_ibfk_2 FOREIGN KEY (avatar) REFERENCES Media (id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT Factions_ibfk_3 FOREIGN KEY (ownerId) REFERENCES Users (id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT Factions_ibfk_4 FOREIGN KEY (banner) REFERENCES Media (id) ON DELETE SET NULL ON UPDATE CASCADE
);

-- Faction Roles

CREATE TABLE IF NOT EXISTS FactionRoles (
  id bigint unsigned NOT NULL AUTO_INCREMENT,
  fid bigint unsigned NOT NULL,
  -- if null, users with this role active will show geo or their own flag
  customFlag bigint unsigned,

  uuid binary(16) NOT NULL,
  name varchar(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  -- from lowest to highest bit:
  --   0: protected, ca not delete
  --   1: assign to new members per default
  flags tinyint unsigned NOT NULL DEFAULT 0,
  factionlvl tinyint(4) NOT NULL DEFAULT 0,
  memberCount int unsigned NOT NULL DEFAULT 0,

  PRIMARY KEY (id),
  UNIQUE KEY uuid (uuid),
  KEY customFlag (customFlag),
  KEY role_fid (fid),
  CONSTRAINT FactionRoles_ibfk_1 FOREIGN KEY (fid) REFERENCES Factions (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT FactionRoles_ibfk_2 FOREIGN KEY (customFlag) REFERENCES Media (id) ON DELETE SET NULL ON UPDATE CASCADE
);

-- Faction Invites

CREATE TABLE IF NOT EXISTS FactionInvites (
  id bigint unsigned NOT NULL AUTO_INCREMENT,
  fid bigint unsigned NOT NULL,

  -- short identifier for invate, will be 10 chars usually
  midId varchar(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  -- from lowest to highst bit:
  --   0: is one-time-invite
  flags tinyint unsigned NOT NULL DEFAULT 0,
  -- time to expire, NULL if infinite
  expires datetime,
  -- how many times invite got used
  used int unsigned DEFAULT 0,

  createdAt datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY midId (midId),
  KEY fid (fid),
  CONSTRAINT FactionInvites_ibfk_1 FOREIGN KEY (fid) REFERENCES Factions (id) ON DELETE CASCADE ON UPDATE CASCADE
);

-- Faction Bans

CREATE TABLE IF NOT EXISTS FactionBans (
  id bigint unsigned NOT NULL AUTO_INCREMENT,
  fid bigint unsigned NOT NULL,
  reason varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  expires datetime,
  uuid binary(16) NOT NULL,
  muid int unsigned,

  createdAt datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY ban_fid (fid),
  KEY FactionBans_muid_foreign_idx (muid),
  CONSTRAINT FactionBans_ibfk_1 FOREIGN KEY (fid) REFERENCES Factions (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT FactionBans_muid_foreign_idx FOREIGN KEY (muid) REFERENCES Users (id) ON DELETE SET NULL ON UPDATE CASCADE
);

-- User-Faction Association

CREATE TABLE IF NOT EXISTS UserFactions (
  flags tinyint unsigned NOT NULL DEFAULT 0,
  joined datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `role` enum('member','officer','deputy','leader','owner') NOT NULL DEFAULT 'member',
  permissions longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  fid bigint unsigned NOT NULL,
  uid int unsigned NOT NULL,

  PRIMARY KEY (fid,uid),
  KEY uid (uid),
  CONSTRAINT UserFactions_ibfk_1 FOREIGN KEY (fid) REFERENCES Factions (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT UserFactions_ibfk_2 FOREIGN KEY (uid) REFERENCES Users (id) ON DELETE CASCADE ON UPDATE CASCADE
);

-- Membership and per-member faction contribution counters.
CREATE TABLE IF NOT EXISTS FactionMembers (
  factionId bigint unsigned NOT NULL,
  userId int unsigned NOT NULL,
  flags tinyint unsigned NOT NULL DEFAULT 0,
  joinedAt datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  memberRole enum('member','officer','deputy','leader','owner') NOT NULL DEFAULT 'member',
  permissions longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  totalPixels bigint unsigned NOT NULL DEFAULT 0,
  dailyPixels bigint unsigned NOT NULL DEFAULT 0,
  dailyPixelsDate date DEFAULT NULL,

  PRIMARY KEY (factionId, userId),
  KEY faction_member_user (userId, factionId),
  CONSTRAINT FactionMembers_ibfk_1 FOREIGN KEY (factionId) REFERENCES Factions (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT FactionMembers_ibfk_2 FOREIGN KEY (userId) REFERENCES Users (id) ON DELETE CASCADE ON UPDATE CASCADE
);

-- User-FactionRole Association

CREATE TABLE IF NOT EXISTS UserFactionRoles (
  frid bigint unsigned NOT NULL,
  uid int unsigned NOT NULL,

  PRIMARY KEY (frid,uid),
  KEY uid (uid),
  CONSTRAINT UserFactionRoles_ibfk_1 FOREIGN KEY (frid) REFERENCES FactionRoles (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT UserFactionRoles_ibfk_2 FOREIGN KEY (uid) REFERENCES Users (id) ON DELETE CASCADE ON UPDATE CASCADE
);

-- User-FactionBan Association

CREATE TABLE IF NOT EXISTS UserFactionBans (
  bid bigint unsigned NOT NULL,
  uid int unsigned NOT NULL,

  PRIMARY KEY (bid,uid),
  KEY uid (uid),
  CONSTRAINT UserFactionBans_ibfk_1 FOREIGN KEY (bid) REFERENCES FactionBans (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT UserFactionBans_ibfk_2 FOREIGN KEY (uid) REFERENCES Users (id) ON DELETE CASCADE ON UPDATE CASCADE
);

-- IP-FactionBans Association

CREATE TABLE IF NOT EXISTS IPFactionBans (
  bid bigint unsigned NOT NULL,
  ip varbinary(8) NOT NULL,

  PRIMARY KEY (bid,ip),
  KEY ip (ip),
  CONSTRAINT IPFactionBans_ibfk_1 FOREIGN KEY (bid) REFERENCES FactionBans (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT IPFactionBans_ibfk_2 FOREIGN KEY (ip) REFERENCES IPs (ip) ON DELETE CASCADE ON UPDATE CASCADE
);

-- Заявки на вступление в фракцию
CREATE TABLE IF NOT EXISTS FactionApplications (
  id bigint unsigned NOT NULL AUTO_INCREMENT,
  factionId bigint unsigned NOT NULL,
  userId int unsigned NOT NULL,
  message varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  status enum('pending','accepted','rejected') NOT NULL DEFAULT 'pending',
  createdAt datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  decidedAt datetime DEFAULT NULL,
  decidedBy int unsigned DEFAULT NULL,
  PRIMARY KEY (id),
  KEY faction_status_created (factionId, status, createdAt),
  KEY application_user (userId, status),
  CONSTRAINT FactionApplications_ibfk_1 FOREIGN KEY (factionId) REFERENCES Factions (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT FactionApplications_ibfk_2 FOREIGN KEY (userId) REFERENCES Users (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT FactionApplications_ibfk_3 FOREIGN KEY (decidedBy) REFERENCES Users (id) ON DELETE SET NULL ON UPDATE CASCADE
);

-- Адресные приглашения в фракции
CREATE TABLE IF NOT EXISTS FactionUserInvites (
  id bigint unsigned NOT NULL AUTO_INCREMENT,
  factionId bigint unsigned NOT NULL,
  userId int unsigned NOT NULL,
  invitedBy int unsigned NOT NULL,
  createdAt datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY faction_invited_user (factionId, userId),
  KEY invited_user (userId),
  CONSTRAINT FactionUserInvites_ibfk_1 FOREIGN KEY (factionId) REFERENCES Factions (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT FactionUserInvites_ibfk_2 FOREIGN KEY (userId) REFERENCES Users (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT FactionUserInvites_ibfk_3 FOREIGN KEY (invitedBy) REFERENCES Users (id) ON DELETE CASCADE ON UPDATE CASCADE
);

-- Пакты о ненападении
CREATE TABLE IF NOT EXISTS FactionTemplates (
  id bigint unsigned NOT NULL AUTO_INCREMENT,
  factionId bigint unsigned NOT NULL,
  title varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  fileName varchar(128) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
  mimeType varchar(64) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
  canvasId int unsigned NOT NULL,
  x int NOT NULL,
  y int NOT NULL,
  width int unsigned NOT NULL DEFAULT 0,
  height int unsigned NOT NULL DEFAULT 0,
  templateData longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  createdBy int unsigned DEFAULT NULL,
  isActive tinyint(1) NOT NULL DEFAULT 1,
  createdAt datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY faction_templates (factionId, isActive, createdAt),
  CONSTRAINT FactionTemplates_ibfk_1 FOREIGN KEY (factionId) REFERENCES Factions (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT FactionTemplates_ibfk_2 FOREIGN KEY (createdBy) REFERENCES Users (id) ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS FactionNaps (
  id bigint unsigned NOT NULL AUTO_INCREMENT,
  factionA bigint unsigned NOT NULL,
  factionB bigint unsigned NOT NULL,
  status enum('pending','active','broken','rejected') NOT NULL DEFAULT 'pending',
  requestedBy int unsigned NOT NULL,
  templateId bigint unsigned DEFAULT NULL,
  terms longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  approvedByA int unsigned DEFAULT NULL,
  approvedAtA datetime DEFAULT NULL,
  approvedByB int unsigned DEFAULT NULL,
  approvedAtB datetime DEFAULT NULL,
  startDate datetime DEFAULT NULL,
  endDate datetime DEFAULT NULL,
  territory longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  breakAApproved tinyint(1) NOT NULL DEFAULT 0,
  breakBApproved tinyint(1) NOT NULL DEFAULT 0,
  createdAt datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  decidedAt datetime DEFAULT NULL,
  PRIMARY KEY (id),
  KEY faction_a_status (factionA, status),
  KEY faction_b_status (factionB, status),
  CONSTRAINT FactionNaps_ibfk_1 FOREIGN KEY (factionA) REFERENCES Factions (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT FactionNaps_ibfk_2 FOREIGN KEY (factionB) REFERENCES Factions (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT FactionNaps_ibfk_3 FOREIGN KEY (requestedBy) REFERENCES Users (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT FactionNaps_ibfk_4 FOREIGN KEY (approvedByA) REFERENCES Users (id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT FactionNaps_ibfk_5 FOREIGN KEY (approvedByB) REFERENCES Users (id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT FactionNaps_ibfk_6 FOREIGN KEY (templateId) REFERENCES FactionTemplates (id) ON DELETE SET NULL ON UPDATE CASCADE
);

-- Аудит действий
CREATE TABLE IF NOT EXISTS FactionAuditLogs (
  id bigint unsigned NOT NULL AUTO_INCREMENT,
  factionId bigint unsigned NOT NULL,
  actorId int unsigned DEFAULT NULL,
  action varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  targetId bigint unsigned DEFAULT NULL,
  meta longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  createdAt datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY faction_log (factionId, createdAt),
  KEY actor_log (actorId, createdAt),
  CONSTRAINT FactionAuditLogs_ibfk_2 FOREIGN KEY (actorId) REFERENCES Users (id) ON DELETE SET NULL ON UPDATE CASCADE
);

-- Активный общий конфиг и история шаблонов фракции
CREATE TABLE IF NOT EXISTS FactionConfigs (
  id bigint unsigned NOT NULL AUTO_INCREMENT,
  factionId bigint unsigned NOT NULL,
  templateUrl varchar(255) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
  canvasId int unsigned NOT NULL,
  x int NOT NULL,
  y int NOT NULL,
  color char(7) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT '#ffffff',
  extra longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  isActive tinyint(1) NOT NULL DEFAULT 1,
  createdAt datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY faction_active_config (factionId, isActive),
  CONSTRAINT FactionConfigs_ibfk_1 FOREIGN KEY (factionId) REFERENCES Factions (id) ON DELETE CASCADE ON UPDATE CASCADE
);

-- Configurable member-count tiers; exact thresholds are deployment policy.
CREATE TABLE IF NOT EXISTS FactionRankThresholds (
  rankCode varchar(24) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  title varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  minimumMembers int unsigned NOT NULL,
  rankOrder tinyint unsigned NOT NULL,
  updatedAt datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (rankCode),
  UNIQUE KEY faction_rank_minimum_members (minimumMembers),
  UNIQUE KEY faction_rank_order (rankOrder)
);

INSERT INTO FactionRankThresholds (rankCode, title, minimumMembers, rankOrder) VALUES
  ('chiefdom', 'Chiefdom', 1, 1),
  ('tribe', 'Tribe', 5, 2),
  ('baronship', 'Baronship', 10, 3),
  ('princedom', 'Princedom', 25, 4),
  ('horde', 'Horde', 50, 5),
  ('kingdom', 'Kingdom', 100, 6),
  ('great-kingdom', 'Great Kingdom', 250, 7),
  ('empire', 'Empire', 500, 8)
ON DUPLICATE KEY UPDATE
  title = VALUES(title),
  minimumMembers = VALUES(minimumMembers),
  rankOrder = VALUES(rankOrder);

CREATE TABLE IF NOT EXISTS FactionAlliances (
  id bigint unsigned NOT NULL AUTO_INCREMENT,
  name varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  terms longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  allianceType enum('alliance','coalition','union') NOT NULL DEFAULT 'alliance',
  targetFactionId bigint unsigned DEFAULT NULL,
  avatarFileName varchar(128) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
  bannerFileName varchar(128) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
  status enum('active','disbanded') NOT NULL DEFAULT 'active',
  createdBy int unsigned NOT NULL,
  founderFactionId bigint unsigned NOT NULL,
  createdAt datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY alliance_status_created (status, createdAt),
  CONSTRAINT FactionAlliances_ibfk_1 FOREIGN KEY (createdBy) REFERENCES Users (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT FactionAlliances_ibfk_2 FOREIGN KEY (founderFactionId) REFERENCES Factions (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT FactionAlliances_target FOREIGN KEY (targetFactionId) REFERENCES Factions (id) ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS FactionAllianceMembers (
  allianceId bigint unsigned NOT NULL,
  factionId bigint unsigned NOT NULL,
  joinedBy int unsigned NOT NULL,
  joinedAt datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (allianceId, factionId),
  UNIQUE KEY alliance_faction_membership (factionId),
  CONSTRAINT FactionAllianceMembers_ibfk_1 FOREIGN KEY (allianceId) REFERENCES FactionAlliances (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT FactionAllianceMembers_ibfk_2 FOREIGN KEY (factionId) REFERENCES Factions (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT FactionAllianceMembers_ibfk_3 FOREIGN KEY (joinedBy) REFERENCES Users (id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS FactionAllianceRequests (
  allianceId bigint unsigned NOT NULL,
  factionId bigint unsigned NOT NULL,
  requestedBy int unsigned NOT NULL,
  createdAt datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (allianceId, factionId),
  KEY alliance_request_faction (factionId, createdAt),
  CONSTRAINT FactionAllianceRequests_alliance FOREIGN KEY (allianceId) REFERENCES FactionAlliances (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT FactionAllianceRequests_faction FOREIGN KEY (factionId) REFERENCES Factions (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT FactionAllianceRequests_user FOREIGN KEY (requestedBy) REFERENCES Users (id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS FactionAllianceInvites (
  allianceId bigint unsigned NOT NULL,
  factionId bigint unsigned NOT NULL,
  invitedBy int unsigned NOT NULL,
  createdAt datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (allianceId, factionId),
  KEY alliance_invite_faction (factionId, createdAt),
  CONSTRAINT FactionAllianceInvites_alliance FOREIGN KEY (allianceId) REFERENCES FactionAlliances (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT FactionAllianceInvites_faction FOREIGN KEY (factionId) REFERENCES Factions (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT FactionAllianceInvites_user FOREIGN KEY (invitedBy) REFERENCES Users (id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS FactionCoordinationMarks (
  id bigint unsigned NOT NULL AUTO_INCREMENT,
  factionId bigint unsigned NOT NULL,
  canvasId int unsigned NOT NULL,
  authorId int unsigned NOT NULL,
  tool enum('brush','arrow') NOT NULL,
  color char(7) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  width tinyint unsigned NOT NULL,
  opacity tinyint unsigned NOT NULL DEFAULT 100,
  points longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  createdAt datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY FactionCoordinationMarks_canvas (factionId, canvasId, id),
  CONSTRAINT FactionCoordinationMarks_faction FOREIGN KEY (factionId)
    REFERENCES Factions (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT FactionCoordinationMarks_author FOREIGN KEY (authorId)
    REFERENCES Users (id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS FactionDiplomacyLogs (
  id bigint unsigned NOT NULL AUTO_INCREMENT,
  factionA bigint unsigned NOT NULL,
  factionB bigint unsigned NOT NULL,
  allianceId bigint unsigned DEFAULT NULL,
  napId bigint unsigned DEFAULT NULL,
  actorId int unsigned DEFAULT NULL,
  eventType varchar(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  terms longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  createdAt datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY diplomacy_faction_a (factionA, createdAt),
  KEY diplomacy_faction_b (factionB, createdAt),
  KEY diplomacy_alliance (allianceId, createdAt),
  CONSTRAINT FactionDiplomacyLogs_ibfk_1 FOREIGN KEY (factionA) REFERENCES Factions (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT FactionDiplomacyLogs_ibfk_2 FOREIGN KEY (factionB) REFERENCES Factions (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT FactionDiplomacyLogs_ibfk_3 FOREIGN KEY (allianceId) REFERENCES FactionAlliances (id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT FactionDiplomacyLogs_ibfk_4 FOREIGN KEY (napId) REFERENCES FactionNaps (id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT FactionDiplomacyLogs_ibfk_5 FOREIGN KEY (actorId) REFERENCES Users (id) ON DELETE SET NULL ON UPDATE CASCADE
);

DELIMITER ;;
DROP TRIGGER IF EXISTS Factions_rank_before_insert;;
CREATE TRIGGER Factions_rank_before_insert BEFORE INSERT ON Factions
FOR EACH ROW
BEGIN
  DECLARE v_rankCode varchar(24);
  SELECT rankCode INTO v_rankCode
  FROM FactionRankThresholds
  WHERE minimumMembers <= NEW.memberCount
  ORDER BY minimumMembers DESC
  LIMIT 1;
  SET NEW.rankCode = COALESCE(v_rankCode, 'chiefdom');
END;;

DROP TRIGGER IF EXISTS Factions_rank_before_update;;
CREATE TRIGGER Factions_rank_before_update BEFORE UPDATE ON Factions
FOR EACH ROW
BEGIN
  DECLARE v_rankCode varchar(24);
  SELECT rankCode INTO v_rankCode
  FROM FactionRankThresholds
  WHERE minimumMembers <= NEW.memberCount
  ORDER BY minimumMembers DESC
  LIMIT 1;
  SET NEW.rankCode = COALESCE(v_rankCode, 'chiefdom');
END;;

DROP TRIGGER IF EXISTS UserFactions_member_after_insert;;
CREATE TRIGGER UserFactions_member_after_insert AFTER INSERT ON UserFactions
FOR EACH ROW
BEGIN
  INSERT INTO FactionMembers (
    factionId, userId, flags, joinedAt, memberRole, permissions
  ) VALUES (
    NEW.fid, NEW.uid, NEW.flags, NEW.joined, NEW.`role`, NEW.permissions
  )
  ON DUPLICATE KEY UPDATE
    flags = VALUES(flags),
    joinedAt = VALUES(joinedAt),
    memberRole = VALUES(memberRole),
    permissions = VALUES(permissions);
END;;

DROP TRIGGER IF EXISTS UserFactions_member_after_update;;
CREATE TRIGGER UserFactions_member_after_update AFTER UPDATE ON UserFactions
FOR EACH ROW
BEGIN
  INSERT INTO FactionMembers (
    factionId, userId, flags, joinedAt, memberRole, permissions
  ) VALUES (
    NEW.fid, NEW.uid, NEW.flags, NEW.joined, NEW.`role`, NEW.permissions
  )
  ON DUPLICATE KEY UPDATE
    flags = VALUES(flags),
    joinedAt = VALUES(joinedAt),
    memberRole = VALUES(memberRole),
    permissions = VALUES(permissions);
END;;

DROP TRIGGER IF EXISTS UserFactions_member_after_delete;;
CREATE TRIGGER UserFactions_member_after_delete AFTER DELETE ON UserFactions
FOR EACH ROW
BEGIN
  DELETE FROM FactionMembers WHERE factionId = OLD.fid AND userId = OLD.uid;
END;;
DELIMITER ;
