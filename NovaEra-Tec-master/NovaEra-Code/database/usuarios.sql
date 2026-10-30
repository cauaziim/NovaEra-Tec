-- Tabela usada por php/cadastro.php e php/login.php (MySQL 5.7+ / MariaDB 10.3+)
CREATE TABLE IF NOT EXISTS usuarios (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    nome VARCHAR(120) NOT NULL,
    email VARCHAR(254) NOT NULL,
    senha VARCHAR(255) NOT NULL COMMENT 'hash gerado por password_hash()',
    criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_usuarios_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
