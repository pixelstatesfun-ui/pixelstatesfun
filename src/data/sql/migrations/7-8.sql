ALTER TABLE Users
  ADD vipExpires datetime DEFAULT NULL AFTER vipTier,
  ADD KEY vipExpires (vipExpires);

CREATE TABLE IF NOT EXISTS UserNotifications (
  id bigint unsigned NOT NULL AUTO_INCREMENT,
  uid int unsigned NOT NULL,
  senderUid int unsigned DEFAULT NULL,
  senderName varchar(32) NOT NULL,
  senderUserlvl tinyint unsigned NOT NULL,
  message varchar(500) NOT NULL,
  createdAt datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY uid_createdAt (uid, createdAt),
  CONSTRAINT UserNotifications_ibfk_1 FOREIGN KEY (uid)
    REFERENCES Users (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT UserNotifications_ibfk_2 FOREIGN KEY (senderUid)
    REFERENCES Users (id) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
