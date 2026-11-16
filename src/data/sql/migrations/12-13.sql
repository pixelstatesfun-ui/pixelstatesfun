ALTER TABLE UserFactions
  ADD COLUMN IF NOT EXISTS permissions longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL AFTER `role`;
