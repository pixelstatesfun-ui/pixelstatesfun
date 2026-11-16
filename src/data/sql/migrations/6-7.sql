ALTER TABLE Users
  ADD vipTier tinyint unsigned NOT NULL DEFAULT 0 AFTER userlvl;