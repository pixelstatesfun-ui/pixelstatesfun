ALTER TABLE FactionNaps
  ADD COLUMN IF NOT EXISTS breakAApproved tinyint(1) NOT NULL DEFAULT 0 AFTER territory,
  ADD COLUMN IF NOT EXISTS breakBApproved tinyint(1) NOT NULL DEFAULT 0 AFTER breakAApproved;
