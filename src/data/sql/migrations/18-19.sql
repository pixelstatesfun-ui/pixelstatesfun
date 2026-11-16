CREATE TABLE IF NOT EXISTS FactionCoordinationMarks (
  id bigint unsigned NOT NULL AUTO_INCREMENT,
  factionId bigint unsigned NOT NULL,
  canvasId int unsigned NOT NULL,
  authorId int unsigned NOT NULL,
  tool enum('brush','arrow') NOT NULL,
  color char(7) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  width tinyint unsigned NOT NULL,
  points longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  createdAt datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY FactionCoordinationMarks_canvas (factionId, canvasId, id),
  CONSTRAINT FactionCoordinationMarks_faction FOREIGN KEY (factionId)
    REFERENCES Factions (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT FactionCoordinationMarks_author FOREIGN KEY (authorId)
    REFERENCES Users (id) ON DELETE CASCADE ON UPDATE CASCADE
);
