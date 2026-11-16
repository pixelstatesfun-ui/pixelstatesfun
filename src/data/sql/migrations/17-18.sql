CREATE TABLE IF NOT EXISTS FactionAlliances (
  id bigint unsigned NOT NULL AUTO_INCREMENT,
  name varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  terms longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  status enum('active','disbanded') NOT NULL DEFAULT 'active',
  createdBy int unsigned NOT NULL,
  founderFactionId bigint unsigned NOT NULL,
  createdAt datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY alliance_status_created (status, createdAt),
  CONSTRAINT FactionAlliances_ibfk_1 FOREIGN KEY (createdBy) REFERENCES Users (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT FactionAlliances_ibfk_2 FOREIGN KEY (founderFactionId) REFERENCES Factions (id) ON DELETE CASCADE ON UPDATE CASCADE
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

UPDATE Factions f SET f.rankCode = COALESCE((
  SELECT rankCode FROM FactionRankThresholds
  WHERE minimumMembers <= f.memberCount
  ORDER BY minimumMembers DESC LIMIT 1
), 'chiefdom');
