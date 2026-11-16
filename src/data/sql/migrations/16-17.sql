ALTER TABLE Factions
  ADD COLUMN IF NOT EXISTS totalPixels bigint unsigned NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dailyPixels bigint unsigned NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dailyPixelsDate date DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS rankCode varchar(24) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'chiefdom';

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

INSERT IGNORE INTO FactionMembers (
  factionId, userId, flags, joinedAt, memberRole, permissions
)
SELECT fid, uid, flags, joined, `role`, permissions
FROM UserFactions;

ALTER TABLE FactionTemplates
  ADD COLUMN IF NOT EXISTS title varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '' AFTER factionId,
  ADD COLUMN IF NOT EXISTS width int unsigned NOT NULL DEFAULT 0 AFTER y,
  ADD COLUMN IF NOT EXISTS height int unsigned NOT NULL DEFAULT 0 AFTER width,
  ADD COLUMN IF NOT EXISTS templateData longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL AFTER height,
  ADD COLUMN IF NOT EXISTS createdBy int unsigned DEFAULT NULL AFTER templateData,
  ADD COLUMN IF NOT EXISTS updatedAt datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER createdAt,
  MODIFY fileName varchar(128) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
  MODIFY mimeType varchar(64) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
  ADD CONSTRAINT FactionTemplates_ibfk_2 FOREIGN KEY (createdBy) REFERENCES Users (id) ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE FactionTemplates
SET title = LEFT(COALESCE(fileName, ''), 64)
WHERE title = '';

ALTER TABLE FactionNaps
  ADD COLUMN IF NOT EXISTS templateId bigint unsigned DEFAULT NULL AFTER requestedBy,
  ADD COLUMN IF NOT EXISTS terms longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL AFTER templateId,
  ADD COLUMN IF NOT EXISTS approvedByA int unsigned DEFAULT NULL AFTER terms,
  ADD COLUMN IF NOT EXISTS approvedAtA datetime DEFAULT NULL AFTER approvedByA,
  ADD COLUMN IF NOT EXISTS approvedByB int unsigned DEFAULT NULL AFTER approvedAtA,
  ADD COLUMN IF NOT EXISTS approvedAtB datetime DEFAULT NULL AFTER approvedByB,
  ADD CONSTRAINT FactionNaps_ibfk_4 FOREIGN KEY (approvedByA) REFERENCES Users (id) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT FactionNaps_ibfk_5 FOREIGN KEY (approvedByB) REFERENCES Users (id) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT FactionNaps_ibfk_6 FOREIGN KEY (templateId) REFERENCES FactionTemplates (id) ON DELETE SET NULL ON UPDATE CASCADE;

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
