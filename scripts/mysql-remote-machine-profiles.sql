CREATE DATABASE IF NOT EXISTS mytoolbox
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE mytoolbox;

CREATE TABLE IF NOT EXISTS remote_machine_profiles (
  id                   VARCHAR(191) NOT NULL,
  label                VARCHAR(255) NOT NULL,
  host                 VARCHAR(255) NOT NULL,
  ssh_port             SMALLINT UNSIGNED NOT NULL DEFAULT 22,
  rdp_port             SMALLINT UNSIGNED NOT NULL DEFAULT 3389,
  username             VARCHAR(255) NOT NULL,
  password_ciphertext  TEXT NULL,
  password_nonce       VARCHAR(64) NULL,
  last_connected_at    DATETIME(3) NULL,
  updated_at           DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (id),
  UNIQUE KEY uk_remote_machine_identity (host, ssh_port, username),
  KEY idx_remote_machine_last_connected_at (last_connected_at),
  KEY idx_remote_machine_host (host)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS hyperv_vm_credentials (
  id                   VARCHAR(191) NOT NULL,
  label                VARCHAR(255) NOT NULL,
  host                 VARCHAR(255) NOT NULL DEFAULT '',
  ssh_port             SMALLINT UNSIGNED NOT NULL DEFAULT 22,
  username             VARCHAR(255) NOT NULL,
  password_ciphertext  TEXT NULL,
  password_nonce       VARCHAR(64) NULL,
  parent_profile_id    VARCHAR(191) NOT NULL,
  vm_id                VARCHAR(191) NOT NULL,
  vm_name              VARCHAR(255) NOT NULL DEFAULT '',
  last_connected_at    DATETIME(3) NULL,
  updated_at           DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (id),
  UNIQUE KEY uk_hyperv_vm_credential_identity (parent_profile_id, vm_id),
  KEY idx_hyperv_vm_credentials_parent (parent_profile_id),
  KEY idx_hyperv_vm_credentials_last_connected_at (last_connected_at)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- 建议后续创建低权限账号，不要长期在桌面客户端使用 root。
-- CREATE USER IF NOT EXISTS 'mytoolbox_app'@'192.168.51.%'
--   IDENTIFIED BY 'REPLACE_WITH_STRONG_PASSWORD';
-- GRANT SELECT, INSERT, UPDATE, DELETE ON mytoolbox.* TO 'mytoolbox_app'@'192.168.51.%';
-- FLUSH PRIVILEGES;