SET @add_active_role_column = IF(
  EXISTS (
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND LOWER(TABLE_NAME) = 'profiles'
      AND COLUMN_NAME = 'activeRole'
  ),
  'SELECT 1',
  'ALTER TABLE Profiles ADD activeRole bigint unsigned DEFAULT NULL AFTER customFlag'
);
PREPARE add_active_role_column_stmt FROM @add_active_role_column;
EXECUTE add_active_role_column_stmt;
DEALLOCATE PREPARE add_active_role_column_stmt;

SET @add_active_role_index = IF(
  EXISTS (
    SELECT 1
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND LOWER(TABLE_NAME) = 'profiles'
      AND COLUMN_NAME = 'activeRole'
  ),
  'SELECT 1',
  'ALTER TABLE Profiles ADD KEY activeRole (activeRole)'
);
PREPARE add_active_role_index_stmt FROM @add_active_role_index;
EXECUTE add_active_role_index_stmt;
DEALLOCATE PREPARE add_active_role_index_stmt;

SET @add_active_role_foreign_key = IF(
  EXISTS (
    SELECT 1
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE()
      AND LOWER(TABLE_NAME) = 'profiles'
      AND COLUMN_NAME = 'activeRole'
      AND REFERENCED_TABLE_NAME IS NOT NULL
  ),
  'SELECT 1',
  'ALTER TABLE Profiles ADD CONSTRAINT Profiles_ibfk_2 FOREIGN KEY (activeRole) REFERENCES FactionRoles (id) ON DELETE SET NULL ON UPDATE CASCADE'
);
PREPARE add_active_role_foreign_key_stmt FROM @add_active_role_foreign_key;
EXECUTE add_active_role_foreign_key_stmt;
DEALLOCATE PREPARE add_active_role_foreign_key_stmt;

ALTER TABLE Profiles
  ADD bannerPreset varchar(32) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL AFTER activeRole,
  ADD banner bigint unsigned DEFAULT NULL AFTER bannerPreset,
  ADD nicknameColor char(7) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL AFTER banner,
  ADD KEY banner (banner),
  ADD CONSTRAINT Profiles_ibfk_4 FOREIGN KEY (banner)
    REFERENCES Media (id) ON DELETE SET NULL ON UPDATE CASCADE;
