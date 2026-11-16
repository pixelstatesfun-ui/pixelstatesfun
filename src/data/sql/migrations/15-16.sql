ALTER TABLE Proxies
  ADD COLUMN IF NOT EXISTS proxyVerdict varchar(12) NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS proxySources text NULL;

UPDATE Proxies SET expires = NOW();
