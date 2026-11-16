ALTER TABLE FactionAlliances
  ADD COLUMN allianceType enum('alliance','coalition','union')
    NOT NULL DEFAULT 'alliance',
  ADD COLUMN targetFactionId bigint unsigned DEFAULT NULL,
  ADD CONSTRAINT FactionAlliances_target
    FOREIGN KEY (targetFactionId) REFERENCES Factions (id)
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS FactionAllianceRequests (
  allianceId bigint unsigned NOT NULL,
  factionId bigint unsigned NOT NULL,
  requestedBy int unsigned NOT NULL,
  createdAt datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (allianceId, factionId),
  KEY alliance_request_faction (factionId, createdAt),
  CONSTRAINT FactionAllianceRequests_alliance
    FOREIGN KEY (allianceId) REFERENCES FactionAlliances (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT FactionAllianceRequests_faction
    FOREIGN KEY (factionId) REFERENCES Factions (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT FactionAllianceRequests_user
    FOREIGN KEY (requestedBy) REFERENCES Users (id)
    ON DELETE CASCADE ON UPDATE CASCADE
);
