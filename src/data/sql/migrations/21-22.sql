ALTER TABLE Factions
  ADD COLUMN banner bigint unsigned DEFAULT NULL AFTER avatar,
  ADD KEY banner (banner),
  ADD CONSTRAINT Factions_ibfk_4
    FOREIGN KEY (banner) REFERENCES Media (id)
    ON DELETE SET NULL ON UPDATE CASCADE;
