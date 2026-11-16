ALTER TABLE Factions
  ADD ownerId int unsigned DEFAULT NULL AFTER avatar,
  ADD tag varchar(8) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL AFTER name,
  ADD color char(7) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT '#ffffff' AFTER description,
  ADD flagUrl varchar(255) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL AFTER color,
  ADD openJoin tinyint(1) NOT NULL DEFAULT 0 AFTER flagUrl,
  ADD coordinationIds longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL AFTER openJoin,
  ADD updatedAt datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER createdAt,
  ADD UNIQUE KEY faction_tag (tag),
  ADD KEY ownerId (ownerId),
  ADD CONSTRAINT Factions_ibfk_3 FOREIGN KEY (ownerId) REFERENCES Users (id) ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE Factions f
SET f.tag = UPPER(f.name)
WHERE f.name REGEXP '^[A-Za-z]{3,8}$'
  AND NOT EXISTS (
    SELECT 1 FROM Factions f2
    WHERE UPPER(f2.name) = UPPER(f.name) AND f2.id < f.id
  );

UPDATE Factions f
SET f.ownerId = (
  SELECT ufr.uid
  FROM FactionRoles fr
  INNER JOIN UserFactionRoles ufr ON ufr.frid = fr.id
  WHERE fr.fid = f.id AND fr.factionlvl >= 100
  ORDER BY fr.factionlvl DESC, ufr.uid
  LIMIT 1
);

ALTER TABLE UserFactions
  ADD `role` enum('member','officer','deputy','leader','owner') NOT NULL DEFAULT 'member' AFTER joined;

UPDATE Factions SET openJoin = IF((flags & (1 << 1)) != 0, 1, 0);

UPDATE UserFactions uf
LEFT JOIN (
  SELECT fr.fid, ufr.uid, MAX(fr.factionlvl) AS factionlvl
  FROM FactionRoles fr
  INNER JOIN UserFactionRoles ufr ON ufr.frid = fr.id
  GROUP BY fr.fid, ufr.uid
) memberRanks ON memberRanks.fid = uf.fid AND memberRanks.uid = uf.uid
INNER JOIN Factions faction ON faction.id = uf.fid
SET uf.`role` = CASE
  WHEN memberRanks.uid = faction.ownerId AND memberRanks.factionlvl >= 100 THEN 'owner'
  WHEN memberRanks.factionlvl >= 75 THEN 'leader'
  WHEN memberRanks.factionlvl >= 50 THEN 'deputy'
  WHEN memberRanks.factionlvl >= 25 THEN 'officer'
  ELSE 'member'
END;

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

CREATE TABLE IF NOT EXISTS FactionNaps (
  id bigint unsigned NOT NULL AUTO_INCREMENT,
  factionA bigint unsigned NOT NULL,
  factionB bigint unsigned NOT NULL,
  status enum('pending','active','broken','rejected') NOT NULL DEFAULT 'pending',
  requestedBy int unsigned NOT NULL,
  createdAt datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  decidedAt datetime DEFAULT NULL,
  PRIMARY KEY (id),
  KEY faction_a_status (factionA, status),
  KEY faction_b_status (factionB, status),
  CONSTRAINT FactionNaps_ibfk_1 FOREIGN KEY (factionA) REFERENCES Factions (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT FactionNaps_ibfk_2 FOREIGN KEY (factionB) REFERENCES Factions (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT FactionNaps_ibfk_3 FOREIGN KEY (requestedBy) REFERENCES Users (id) ON DELETE CASCADE ON UPDATE CASCADE
);

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

CREATE TABLE IF NOT EXISTS FactionTemplates (
  id bigint unsigned NOT NULL AUTO_INCREMENT,
  factionId bigint unsigned NOT NULL,
  fileName varchar(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  mimeType varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  canvasId int unsigned NOT NULL,
  x int NOT NULL,
  y int NOT NULL,
  isActive tinyint(1) NOT NULL DEFAULT 1,
  createdAt datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY faction_templates (factionId, isActive, createdAt),
  CONSTRAINT FactionTemplates_ibfk_1 FOREIGN KEY (factionId) REFERENCES Factions (id) ON DELETE CASCADE ON UPDATE CASCADE
);
