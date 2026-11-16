ALTER TABLE FactionAlliances
  ADD COLUMN avatarFileName varchar(128) CHARACTER SET ascii COLLATE ascii_bin
    DEFAULT NULL,
  ADD COLUMN bannerFileName varchar(128) CHARACTER SET ascii COLLATE ascii_bin
    DEFAULT NULL;

ALTER TABLE FactionCoordinationMarks
  ADD COLUMN opacity tinyint unsigned NOT NULL DEFAULT 100 AFTER width;
