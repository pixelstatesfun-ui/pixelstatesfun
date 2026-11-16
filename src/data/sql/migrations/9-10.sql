ALTER TABLE Profiles
  ADD avatarGlow varchar(16) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL AFTER nicknameColor,
  ADD nicknameGradient char(15) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL AFTER avatarGlow;
