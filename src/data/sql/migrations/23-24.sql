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
