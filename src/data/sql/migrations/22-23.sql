-- Resolve the scoring faction from membership for existing installations.
DELIMITER ;;
CREATE OR REPLACE PROCEDURE RESOLVE_SESSION(
  IN p_token char(38) CHARACTER SET ascii COLLATE ascii_bin
) NOT DETERMINISTIC READS SQL DATA
BEGIN
  DECLARE v_uid INT UNSIGNED;

  SELECT uid INTO v_uid FROM Sessions WHERE token = p_token AND (
    expires > NOW() OR expires IS NULL
  ) LIMIT 1;

  IF v_uid IS NOT NULL THEN

    SELECT u.id, u.name, u.username, u.password, u.userlvl,
      IF(u.vipExpires IS NULL OR u.vipExpires > NOW(), u.vipTier, 0) AS vipTier,
      u.flags, u.lastSeen,
      u.createdAt,
      p.customFlag,
      CONCAT(a.shortId, ':', a.extension) AS avatarId,
      CONCAT(frm.shortId, ':', frm.extension) AS customRoleFlagId,
      (
        SELECT uf.fid
        FROM UserFactions uf
        WHERE uf.uid = u.id
        ORDER BY (uf.fid = fr.fid) DESC, uf.joined DESC, uf.fid DESC
        LIMIT 1
      ) AS activeFactionId,
      p.bannerPreset,
      CONCAT(b.shortId, ':', b.extension) AS bannerId,
      p.nicknameColor,
      p.avatarGlow,
      p.nicknameGradient
    FROM Users u
      LEFT JOIN Profiles p ON p.uid = u.id
      LEFT JOIN Media a ON a.id = p.avatar
      LEFT JOIN Media b ON b.id = p.banner
      LEFT JOIN FactionRoles fr ON fr.id = p.activeRole
      LEFT JOIN Media frm ON frm.id = fr.customFlag
    WHERE u.id = v_uid;

    SELECT b.expires, b.flags FROM Bans b WHERE b.id IN (
      SELECT DISTINCT b.id FROM (
        SELECT ub.bid AS id FROM UserBans ub WHERE ub.uid = v_uid
          UNION ALL
        SELECT tb.bid AS id FROM ThreePIDBans tb
          INNER JOIN ThreePIDs t ON tb.tid = t.id
        WHERE t.uid = v_uid
      ) AS b
    ) AND (b.expires > NOW() OR b.expires IS NULL);

    SELECT cid, muted FROM UserChannels WHERE uid = v_uid;
  END IF;
END;;
DELIMITER ;
