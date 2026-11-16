ALTER TABLE Media
  MODIFY type varchar(128) CHARACTER SET ascii COLLATE ascii_bin
    GENERATED ALWAYS AS (
      SUBSTR(mimeType, 1, INSTR(mimeType, '/') - 1)
    ) VIRTUAL;
