-- MySQL schema for Knowledge Units storage.
-- Run against the mytoolbox database or it will be auto-created by the app.
--
-- Usage:
--   mysql -u root -p < scripts/mysql-knowledge-units.sql

CREATE DATABASE IF NOT EXISTS mytoolbox
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE mytoolbox;

CREATE TABLE IF NOT EXISTS knowledge_units (
  id              VARCHAR(191) NOT NULL,
  raw_text        MEDIUMTEXT NOT NULL,
  text            MEDIUMTEXT NOT NULL,
  embedding       LONGBLOB NULL,
  summary         TEXT NOT NULL DEFAULT '',
  entities_json   JSON NULL,
  tags_json       JSON NULL,
  media_json      JSON NULL,
  source          VARCHAR(2048) NOT NULL DEFAULT '',
  chunk_index     INT UNSIGNED NOT NULL DEFAULT 0,
  quality_score   FLOAT NOT NULL DEFAULT 1.0,
  char_offset     INT UNSIGNED NOT NULL DEFAULT 0,
  char_length     INT UNSIGNED NOT NULL DEFAULT 0,
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (id),
  KEY idx_ku_source (source(191)),
  KEY idx_ku_created (created_at),
  KEY idx_ku_quality (quality_score),
  FULLTEXT idx_ku_fulltext (text, summary)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
