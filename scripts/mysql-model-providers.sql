CREATE DATABASE IF NOT EXISTS mytoolbox
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE mytoolbox;

CREATE TABLE IF NOT EXISTS model_providers (
  id                  VARCHAR(191) NOT NULL,
  name                VARCHAR(255) NOT NULL,
  provider            VARCHAR(32) NOT NULL,
  api_base_url        VARCHAR(2048) NOT NULL DEFAULT '',
  model               VARCHAR(255) NOT NULL DEFAULT '',
  api_key_ciphertext  TEXT NULL,
  api_key_nonce       VARCHAR(64) NULL,
  api_key_key_version SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  created_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (id),
  KEY idx_model_providers_provider (provider),
  KEY idx_model_providers_updated_at (updated_at)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

-- API Key is encrypted by the desktop app before it is written to MySQL.
