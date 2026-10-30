<?php
declare(strict_types=1);

namespace NovaEra\Tempic;

use PDO;
use RuntimeException;

/**
 * Falha ao abrir ou gravar o arquivo do banco (pasta sem permissão,
 * PDO_SQLite desabilitado). A mensagem pode ser mostrada ao usuário.
 */
final class TempicStorageException extends RuntimeException
{
}

final class TempicDatabase
{
    private PDO $pdo;

    public function __construct(?string $databasePath = null)
    {
        $usingInternalPath = $databasePath === null;
        $databasePath = $databasePath ?: self::resolvePath();
        $directory = dirname($databasePath);
        $isNew = !is_file($databasePath);

        if (!extension_loaded('pdo_sqlite')) {
            throw new TempicStorageException('O PHP deste servidor está sem a extensão PDO_SQLite. No XAMPP, habilite "extension=pdo_sqlite" no php.ini e reinicie o Apache.');
        }
        if (!is_dir($directory) && !mkdir($directory, 0775, true) && !is_dir($directory)) {
            throw new TempicStorageException('Não foi possível criar a pasta do banco do Tempic (data/). Verifique a permissão de escrita.');
        }
        if (!is_writable($directory)) {
            throw new TempicStorageException('A pasta do banco do Tempic (data/) está sem permissão de escrita.');
        }

        // Primeira execução com o banco interno: traz o banco antigo da pasta temporária
        if ($usingInternalPath && $isNew) {
            self::copyNewestLegacyDatabase($databasePath);
        }

        $this->pdo = new PDO('sqlite:' . $databasePath, null, null, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
        $this->pdo->exec('PRAGMA foreign_keys = ON');
        // Vários usuários ao mesmo tempo: espera o arquivo liberar em vez de falhar
        $this->pdo->exec('PRAGMA busy_timeout = 5000');
        $this->createSchema();
        $this->migrateSchema();

        if ($usingInternalPath && $isNew) {
            $this->importLegacyAccounts($databasePath);
        }

        if ($isNew && is_file($databasePath)) {
            @chmod($databasePath, 0660);
        }
    }

    /**
     * Onde fica o banco: TEMPIC_DATABASE_PATH (ambiente) > "tempic_database"
     * em php/config.local.php > data/tempic.sqlite dentro do projeto.
     *
     * O banco interno vale para qualquer usuário do Windows e acompanha o
     * projeto se a pasta for copiada. Para várias pessoas usarem as mesmas
     * contas, todas devem acessar o mesmo servidor (ver TEMPIC_SETUP.md).
     */
    public static function resolvePath(): string
    {
        $fromEnvironment = getenv('TEMPIC_DATABASE_PATH');
        if ($fromEnvironment) {
            return $fromEnvironment;
        }

        $configFile = __DIR__ . '/config.local.php';
        if (is_file($configFile)) {
            $config = require $configFile;
            if (is_array($config) && !empty($config['tempic_database'])) {
                return (string) $config['tempic_database'];
            }
        }

        return dirname(__DIR__) . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'tempic.sqlite';
    }

    /**
     * Bancos das versões antigas, gravados na pasta temporária do usuário
     * do Windows (um por pasta do projeto). Mais recente primeiro.
     *
     * @return list<string>
     */
    private static function legacyDatabases(): array
    {
        $files = glob(sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'tempic-*.sqlite') ?: [];
        $files = array_filter($files, static fn (string $file): bool => (bool) preg_match('/tempic-[0-9a-f]{16}\.sqlite$/', $file));
        usort($files, static fn (string $a, string $b): int => filemtime($b) <=> filemtime($a));
        return array_values($files);
    }

    private static function copyNewestLegacyDatabase(string $target): void
    {
        $newest = self::legacyDatabases()[0] ?? null;
        if ($newest !== null) {
            @copy($newest, $target);
        }
    }

    /**
     * Contas que só existem nos outros bancos antigos (sensores não vêm junto).
     */
    private function importLegacyAccounts(string $databasePath): void
    {
        $insert = $this->pdo->prepare(
            'INSERT OR IGNORE INTO users (name, email, password_hash, age, created_at)
             VALUES (:name, :email, :password_hash, :age, :created_at)'
        );

        foreach (self::legacyDatabases() as $legacy) {
            if (realpath($legacy) === realpath($databasePath)) {
                continue;
            }
            try {
                $source = new PDO('sqlite:' . $legacy, null, null, [
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                ]);
                $users = $source->query('SELECT name, email, password_hash, age, created_at FROM users')->fetchAll();
            } catch (\PDOException $error) {
                continue; // arquivo antigo corrompido ou de outro formato
            }
            foreach ($users as $user) {
                $insert->execute($user);
            }
        }
    }

    public function pdo(): PDO
    {
        return $this->pdo;
    }

    private function createSchema(): void
    {
        $this->pdo->exec(<<<'SQL'
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT NOT NULL COLLATE NOCASE UNIQUE,
                password_hash TEXT NOT NULL,
                age INTEGER NOT NULL CHECK (age BETWEEN 1 AND 120),
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS sensors (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                type TEXT NOT NULL,
                location TEXT NOT NULL,
                wifi_ssid TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'offline' CHECK (status IN ('online', 'offline')),
                source_mode TEXT NOT NULL DEFAULT 'demo' CHECK (source_mode IN ('demo', 'real')),
                current_temperature REAL NOT NULL DEFAULT 4.2,
                minimum_temperature REAL NOT NULL DEFAULT 2,
                maximum_temperature REAL NOT NULL DEFAULT 8,
                target_temperature REAL NOT NULL DEFAULT 4,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS readings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sensor_id INTEGER NOT NULL REFERENCES sensors(id) ON DELETE CASCADE,
                temperature REAL NOT NULL,
                temperature_state TEXT NOT NULL CHECK (temperature_state IN ('normal', 'attention', 'alert')),
                recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_readings_sensor_date ON readings(sensor_id, recorded_at);

            CREATE TABLE IF NOT EXISTS alerts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sensor_id INTEGER NOT NULL REFERENCES sensors(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                alert_type TEXT NOT NULL,
                message TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                resolved_at TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_alerts_user_date ON alerts(user_id, created_at);

            CREATE TABLE IF NOT EXISTS sensor_adjustments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sensor_id INTEGER NOT NULL REFERENCES sensors(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                previous_target REAL NOT NULL,
                new_target REAL NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            -- RF03: iluminação do estacionamento (controle manual e programado)
            CREATE TABLE IF NOT EXISTS lights (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                is_on INTEGER NOT NULL DEFAULT 0 CHECK (is_on IN (0, 1)),
                schedule_enabled INTEGER NOT NULL DEFAULT 0 CHECK (schedule_enabled IN (0, 1)),
                on_time TEXT NOT NULL DEFAULT '18:00',
                off_time TEXT NOT NULL DEFAULT '06:00',
                schedule_last_state INTEGER,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            -- Registro de todos os acionamentos (manual, automático ou programado)
            CREATE TABLE IF NOT EXISTS device_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                sensor_id INTEGER REFERENCES sensors(id) ON DELETE CASCADE,
                light_id INTEGER REFERENCES lights(id) ON DELETE CASCADE,
                device TEXT NOT NULL,
                action TEXT NOT NULL,
                origin TEXT NOT NULL CHECK (origin IN ('manual', 'automatico', 'programado')),
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_device_events_user_date ON device_events(user_id, created_at);

            -- Espaço de trabalho: o dono (users.id) é o administrador implícito.
            -- Quem entra por convite ganha uma linha aqui com o papel recebido.
            CREATE TABLE IF NOT EXISTS memberships (
                user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                workspace_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                role TEXT NOT NULL CHECK (role IN ('admin', 'member')),
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_memberships_workspace ON memberships(workspace_id);

            CREATE TABLE IF NOT EXISTS invites (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                workspace_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                code TEXT NOT NULL UNIQUE,
                role TEXT NOT NULL CHECK (role IN ('admin', 'member')),
                created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
                expires_at TEXT NOT NULL,
                used_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
                used_at TEXT,
                revoked_at TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            -- Inventário: o que está guardado em cada equipamento monitorado
            CREATE TABLE IF NOT EXISTS storage_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                workspace_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                sensor_id INTEGER NOT NULL REFERENCES sensors(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                category TEXT NOT NULL,
                quantity REAL NOT NULL CHECK (quantity > 0),
                unit TEXT NOT NULL,
                shelf INTEGER NOT NULL DEFAULT 1 CHECK (shelf BETWEEN 1 AND 6),
                expires_at TEXT,
                notes TEXT NOT NULL DEFAULT '',
                stored_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                stored_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
                removed_at TEXT,
                removed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
                removal_reason TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_storage_items_sensor ON storage_items(sensor_id, removed_at);
            CREATE INDEX IF NOT EXISTS idx_storage_items_workspace ON storage_items(workspace_id, removed_at);

            -- Auditoria: quem fez o quê (alterações de configuração, equipe e inventário)
            CREATE TABLE IF NOT EXISTS audit_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                workspace_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                action TEXT NOT NULL,
                summary TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_audit_workspace_date ON audit_log(workspace_id, created_at);
        SQL);
    }

    /**
     * Adiciona as colunas de controle de equipamento em bancos criados
     * antes desta versão (RF02 e controle automático).
     */
    private function migrateSchema(): void
    {
        $columns = array_column($this->pdo->query('PRAGMA table_info(sensors)')->fetchAll(), 'name');
        if (!in_array('equipment_on', $columns, true)) {
            $this->pdo->exec('ALTER TABLE sensors ADD COLUMN equipment_on INTEGER NOT NULL DEFAULT 1');
        }
        if (!in_array('control_mode', $columns, true)) {
            $this->pdo->exec("ALTER TABLE sensors ADD COLUMN control_mode TEXT NOT NULL DEFAULT 'auto'");
        }

        // Papéis: "ciente" nos alertas e último acesso dos membros
        $columns = array_column($this->pdo->query('PRAGMA table_info(alerts)')->fetchAll(), 'name');
        if (!in_array('acknowledged_at', $columns, true)) {
            $this->pdo->exec('ALTER TABLE alerts ADD COLUMN acknowledged_at TEXT');
            $this->pdo->exec('ALTER TABLE alerts ADD COLUMN acknowledged_by INTEGER REFERENCES users(id) ON DELETE SET NULL');
        }
        $columns = array_column($this->pdo->query('PRAGMA table_info(users)')->fetchAll(), 'name');
        if (!in_array('last_seen_at', $columns, true)) {
            $this->pdo->exec('ALTER TABLE users ADD COLUMN last_seen_at TEXT');
        }
    }

    /**
     * Faixa segura e alvo padrão de cada tipo de sensor, em °C.
     */
    public static function typeDefaults(string $type): array
    {
        return match ($type) {
            'FREEZER' => ['minimum' => -24.0, 'maximum' => -16.0, 'target' => -18.0],
            'ENVIRONMENT' => ['minimum' => 18.0, 'maximum' => 26.0, 'target' => 22.0],
            'VEHICLE' => ['minimum' => 0.0, 'maximum' => 8.0, 'target' => 4.0],
            default => ['minimum' => 2.0, 'maximum' => 8.0, 'target' => 4.0],
        };
    }

    public function findUserByEmail(string $email): ?array
    {
        $statement = $this->pdo->prepare('SELECT id, name, email, password_hash, age FROM users WHERE email = :email');
        $statement->execute(['email' => $email]);
        $user = $statement->fetch();
        return $user ?: null;
    }

    public function createUser(string $name, string $email, string $passwordHash, int $age): int
    {
        $statement = $this->pdo->prepare(
            'INSERT INTO users (name, email, password_hash, age) VALUES (:name, :email, :password_hash, :age)'
        );
        $statement->execute([
            'name' => $name,
            'email' => $email,
            'password_hash' => $passwordHash,
            'age' => $age,
        ]);
        return (int) $this->pdo->lastInsertId();
    }

    public function listSensors(int $userId): array
    {
        $statement = $this->pdo->prepare(
            'SELECT * FROM sensors WHERE user_id = :user_id ORDER BY created_at DESC, id DESC'
        );
        $statement->execute(['user_id' => $userId]);
        return $statement->fetchAll();
    }

    public function findSensor(int $userId, int $sensorId): ?array
    {
        $statement = $this->pdo->prepare('SELECT * FROM sensors WHERE user_id = :user_id AND id = :id');
        $statement->execute(['user_id' => $userId, 'id' => $sensorId]);
        $sensor = $statement->fetch();
        return $sensor ?: null;
    }

    public function createSensor(int $userId, array $data): int
    {
        $defaults = self::typeDefaults($data['type']);
        $statement = $this->pdo->prepare(<<<'SQL'
            INSERT INTO sensors (user_id, name, type, location, wifi_ssid, current_temperature,
                minimum_temperature, maximum_temperature, target_temperature, source_mode)
            VALUES (:user_id, :name, :type, :location, :wifi_ssid, :current,
                :minimum, :maximum, :target, 'demo')
        SQL);
        $statement->execute([
            'user_id' => $userId,
            'name' => $data['name'],
            'type' => $data['type'],
            'location' => $data['location'],
            'wifi_ssid' => $data['wifi_ssid'],
            'current' => $defaults['target'],
            'minimum' => $defaults['minimum'],
            'maximum' => $defaults['maximum'],
            'target' => $defaults['target'],
        ]);

        $sensorId = (int) $this->pdo->lastInsertId();
        $this->recordReading($userId, $sensorId, $defaults['target']);
        return $sensorId;
    }

    public function recordReading(int $userId, int $sensorId, float $temperature): ?array
    {
        $sensor = $this->findSensor($userId, $sensorId);
        if (!$sensor) {
            return null;
        }

        $minimum = (float) $sensor['minimum_temperature'];
        $maximum = (float) $sensor['maximum_temperature'];
        $margin = ($maximum - $minimum) * 0.1;
        $state = $temperature < $minimum || $temperature > $maximum
            ? 'alert'
            : (($temperature < $minimum + $margin || $temperature > $maximum - $margin) ? 'attention' : 'normal');

        $this->pdo->beginTransaction();
        try {
            $statement = $this->pdo->prepare(
                'INSERT INTO readings (sensor_id, temperature, temperature_state) VALUES (:sensor_id, :temperature, :state)'
            );
            $statement->execute(['sensor_id' => $sensorId, 'temperature' => $temperature, 'state' => $state]);
            $readingId = (int) $this->pdo->lastInsertId();

            $statement = $this->pdo->prepare(<<<'SQL'
                UPDATE sensors
                SET current_temperature = :temperature, status = 'online', updated_at = CURRENT_TIMESTAMP
                WHERE id = :sensor_id AND user_id = :user_id
            SQL);
            $statement->execute([
                'temperature' => $temperature,
                'sensor_id' => $sensorId,
                'user_id' => $userId,
            ]);

            if ($state === 'alert') {
                $alertType = $temperature < $minimum ? 'below_minimum' : 'above_maximum';
                $message = $temperature < $minimum
                    ? 'Temperatura abaixo do limite recomendado.'
                    : 'Temperatura acima do limite recomendado.';
                $statement = $this->pdo->prepare(<<<'SQL'
                    INSERT INTO alerts (sensor_id, user_id, alert_type, message)
                    SELECT :sensor_id, :user_id, :alert_type, :message
                    WHERE NOT EXISTS (
                        SELECT 1 FROM alerts
                        WHERE sensor_id = :sensor_id AND resolved_at IS NULL AND alert_type = :alert_type
                    )
                SQL);
                $statement->execute([
                    'sensor_id' => $sensorId,
                    'user_id' => $userId,
                    'alert_type' => $alertType,
                    'message' => $message,
                ]);
            } else {
                $statement = $this->pdo->prepare(
                    'UPDATE alerts SET resolved_at = CURRENT_TIMESTAMP WHERE sensor_id = :sensor_id AND resolved_at IS NULL'
                );
                $statement->execute(['sensor_id' => $sensorId]);
            }

            $this->pdo->commit();
        } catch (\Throwable $error) {
            $this->pdo->rollBack();
            throw $error;
        }

        $statement = $this->pdo->prepare(
            'SELECT id, temperature, temperature_state, recorded_at FROM readings WHERE id = :id'
        );
        $statement->execute(['id' => $readingId]);
        $reading = $statement->fetch();
        return $reading ?: null;
    }

    public function updateTarget(int $userId, int $sensorId, float $target): ?array
    {
        $sensor = $this->findSensor($userId, $sensorId);
        if (!$sensor) {
            return null;
        }

        $this->pdo->beginTransaction();
        try {
            $statement = $this->pdo->prepare(<<<'SQL'
                UPDATE sensors SET target_temperature = :target, updated_at = CURRENT_TIMESTAMP
                WHERE id = :sensor_id AND user_id = :user_id
            SQL);
            $statement->execute(['target' => $target, 'sensor_id' => $sensorId, 'user_id' => $userId]);

            $statement = $this->pdo->prepare(<<<'SQL'
                INSERT INTO sensor_adjustments (sensor_id, user_id, previous_target, new_target)
                VALUES (:sensor_id, :user_id, :previous_target, :new_target)
            SQL);
            $statement->execute([
                'sensor_id' => $sensorId,
                'user_id' => $userId,
                'previous_target' => (float) $sensor['target_temperature'],
                'new_target' => $target,
            ]);
            $this->pdo->commit();
        } catch (\Throwable $error) {
            $this->pdo->rollBack();
            throw $error;
        }

        return $this->findSensor($userId, $sensorId);
    }

    /**
     * Leituras do período. Com $maxPoints, a série é reduzida por blocos
     * (média de cada bloco, preservando o pior estado) para o gráfico não
     * receber milhares de pontos; mínima, máxima e média usam todas as leituras.
     */
    public function history(int $userId, int $sensorId, string $range, ?int $maxPoints = null): ?array
    {
        if (!$this->findSensor($userId, $sensorId)) {
            return null;
        }

        $hours = ['1h' => 1, '24h' => 24, '7d' => 168, '30d' => 720][$range] ?? 168;
        $statement = $this->pdo->prepare(<<<'SQL'
            SELECT id, temperature, temperature_state, recorded_at
            FROM readings
            WHERE sensor_id = :sensor_id AND recorded_at >= datetime('now', :range)
            ORDER BY recorded_at ASC, id ASC
        SQL);
        $statement->execute(['sensor_id' => $sensorId, 'range' => '-' . $hours . ' hours']);
        $readings = $statement->fetchAll();
        $temperatures = array_map(static fn (array $reading): float => (float) $reading['temperature'], $readings);
        $total = count($readings);

        if ($maxPoints !== null && $maxPoints >= 2 && $total > $maxPoints) {
            $severity = ['normal' => 0, 'attention' => 1, 'alert' => 2];
            $size = (int) ceil($total / $maxPoints);
            $reduced = [];
            foreach (array_chunk($readings, $size) as $chunk) {
                $worst = 'normal';
                foreach ($chunk as $reading) {
                    if ($severity[$reading['temperature_state']] > $severity[$worst]) {
                        $worst = $reading['temperature_state'];
                    }
                }
                $last = $chunk[count($chunk) - 1];
                $reduced[] = [
                    'id' => $last['id'],
                    'temperature' => round(array_sum(array_column($chunk, 'temperature')) / count($chunk), 2),
                    'temperature_state' => $worst,
                    'recorded_at' => $last['recorded_at'],
                ];
            }
            $readings = $reduced;
        }

        return [
            'readings' => $readings,
            'total' => $total,
            'minimum' => $temperatures ? min($temperatures) : null,
            'maximum' => $temperatures ? max($temperatures) : null,
            'average' => $temperatures ? array_sum($temperatures) / count($temperatures) : null,
        ];
    }

    /**
     * Preenche as últimas horas de um sensor recém-criado com leituras
     * simuladas, para a demonstração já abrir com gráfico. Só age em
     * sensores de demonstração com poucas leituras.
     */
    public function seedHistory(int $userId, int $sensorId, int $hours = 24, int $stepMinutes = 10): int
    {
        $sensor = $this->findSensor($userId, $sensorId);
        if (!$sensor || $sensor['source_mode'] !== 'demo') {
            return 0;
        }

        $count = $this->pdo->prepare('SELECT COUNT(*) FROM readings WHERE sensor_id = :sensor_id');
        $count->execute(['sensor_id' => $sensorId]);
        if ((int) $count->fetchColumn() > 5) {
            return 0;
        }

        $minimum = (float) $sensor['minimum_temperature'];
        $maximum = (float) $sensor['maximum_temperature'];
        $target = (float) $sensor['target_temperature'];
        $span = $maximum - $minimum;
        $margin = $span * 0.1;
        $value = $target;
        $phase = mt_rand(0, 628) / 100;
        $steps = intdiv($hours * 60, $stepMinutes);

        $insert = $this->pdo->prepare(<<<'SQL'
            INSERT INTO readings (sensor_id, temperature, temperature_state, recorded_at)
            VALUES (:sensor_id, :temperature, :state, datetime('now', :offset))
        SQL);

        $this->pdo->beginTransaction();
        try {
            for ($step = $steps; $step >= 1; $step--) {
                // Ciclo do compressor + ruído; de vez em quando uma porta aberta
                $cycle = sin($step / 9 + $phase) * $span * 0.12;
                $noise = (mt_rand(-100, 100) / 100) * $span * 0.03;
                $value += ($target + $cycle - $value) * 0.35 + $noise;
                if (mt_rand(1, 60) === 1) {
                    $value += $span * 0.35;
                }
                $temperature = round($value, 1);
                $state = $temperature < $minimum || $temperature > $maximum
                    ? 'alert'
                    : (($temperature < $minimum + $margin || $temperature > $maximum - $margin) ? 'attention' : 'normal');
                $insert->execute([
                    'sensor_id' => $sensorId,
                    'temperature' => $temperature,
                    'state' => $state,
                    'offset' => '-' . ($step * $stepMinutes) . ' minutes',
                ]);
            }
            $this->pdo->commit();
        } catch (\Throwable $error) {
            $this->pdo->rollBack();
            throw $error;
        }

        return $steps;
    }

    public function deleteSensor(int $userId, int $sensorId): bool
    {
        $statement = $this->pdo->prepare('DELETE FROM sensors WHERE id = :id AND user_id = :user_id');
        $statement->execute(['id' => $sensorId, 'user_id' => $userId]);
        return $statement->rowCount() === 1;
    }

    public function deleteLight(int $userId, int $lightId): bool
    {
        $statement = $this->pdo->prepare('DELETE FROM lights WHERE id = :id AND user_id = :user_id');
        $statement->execute(['id' => $lightId, 'user_id' => $userId]);
        return $statement->rowCount() === 1;
    }

    public function listAlerts(int $userId, ?int $sensorId = null): array
    {
        $sql = 'SELECT a.*, u.name AS acknowledged_by_name FROM alerts a JOIN sensors s ON s.id = a.sensor_id
                LEFT JOIN users u ON u.id = a.acknowledged_by WHERE a.user_id = :user_id';
        $parameters = ['user_id' => $userId];
        if ($sensorId !== null) {
            $sql .= ' AND a.sensor_id = :sensor_id AND s.user_id = :user_id';
            $parameters['sensor_id'] = $sensorId;
        }
        $sql .= ' ORDER BY a.created_at DESC';
        $statement = $this->pdo->prepare($sql);
        $statement->execute($parameters);
        return $statement->fetchAll();
    }

    /**
     * "Ciente": quem viu o alerta assume o acompanhamento. Ele continua
     * aberto até a temperatura voltar à faixa segura.
     */
    public function acknowledgeAlert(int $userId, int $alertId, int $actorId): bool
    {
        $statement = $this->pdo->prepare(<<<'SQL'
            UPDATE alerts SET acknowledged_at = CURRENT_TIMESTAMP, acknowledged_by = :actor_id
            WHERE id = :id AND user_id = :user_id AND acknowledged_at IS NULL
        SQL);
        $statement->execute(['actor_id' => $actorId, 'id' => $alertId, 'user_id' => $userId]);
        return $statement->rowCount() === 1;
    }

    public function markStaleSensorsOffline(int $userId): void
    {
        $statement = $this->pdo->prepare(<<<'SQL'
            UPDATE sensors SET status = 'offline'
            WHERE user_id = :user_id AND updated_at < datetime('now', '-60 seconds')
        SQL);
        $statement->execute(['user_id' => $userId]);
    }

    // ------------------------------------------------------------------
    // RF02 — Acionamento remoto de geladeiras, freezers e câmaras
    // ------------------------------------------------------------------

    /**
     * Liga ou desliga o equipamento ligado ao sensor e registra a ação.
     * Um acionamento manual coloca o sensor em modo manual, para que o
     * controle automático não desfaça a decisão do gestor.
     */
    public function setEquipment(int $userId, int $sensorId, bool $on, string $origin = 'manual'): ?array
    {
        $sensor = $this->findSensor($userId, $sensorId);
        if (!$sensor) {
            return null;
        }

        $changed = (bool) $sensor['equipment_on'] !== $on;
        $statement = $this->pdo->prepare(<<<'SQL'
            UPDATE sensors
            SET equipment_on = :on, control_mode = CASE WHEN :origin = 'manual' THEN 'manual' ELSE control_mode END
            WHERE id = :sensor_id AND user_id = :user_id
        SQL);
        $statement->execute(['on' => $on ? 1 : 0, 'origin' => $origin, 'sensor_id' => $sensorId, 'user_id' => $userId]);

        if ($changed) {
            $this->logEvent($userId, 'refrigeracao', $on ? 'ligada' : 'desligada', $origin, $sensorId, null);
        }

        return $this->findSensor($userId, $sensorId);
    }

    public function setControlMode(int $userId, int $sensorId, string $mode): ?array
    {
        if (!in_array($mode, ['auto', 'manual'], true) || !$this->findSensor($userId, $sensorId)) {
            return null;
        }

        $statement = $this->pdo->prepare('UPDATE sensors SET control_mode = :mode WHERE id = :sensor_id AND user_id = :user_id');
        $statement->execute(['mode' => $mode, 'sensor_id' => $sensorId, 'user_id' => $userId]);
        $this->logEvent($userId, 'refrigeracao', $mode === 'auto' ? 'modo automático' : 'modo manual', 'manual', $sensorId, null);

        return $this->applyAutomaticControl($userId, $sensorId);
    }

    /**
     * Controle automático com histerese: liga a refrigeração quando a
     * temperatura se aproxima do limite máximo e desliga quando fica
     * abaixo do alvo, evitando liga/desliga a cada leitura.
     */
    public function applyAutomaticControl(int $userId, int $sensorId): ?array
    {
        $sensor = $this->findSensor($userId, $sensorId);
        if (!$sensor || $sensor['control_mode'] !== 'auto') {
            return $sensor;
        }

        $temperature = (float) $sensor['current_temperature'];
        $maximum = (float) $sensor['maximum_temperature'];
        $minimum = (float) $sensor['minimum_temperature'];
        $target = (float) $sensor['target_temperature'];
        $margin = ($maximum - $minimum) * 0.1;
        $on = (bool) $sensor['equipment_on'];

        if (!$on && $temperature >= $maximum - $margin) {
            return $this->setEquipment($userId, $sensorId, true, 'automatico');
        }
        if ($on && $temperature <= $target - 0.5) {
            return $this->setEquipment($userId, $sensorId, false, 'automatico');
        }

        return $sensor;
    }

    // ------------------------------------------------------------------
    // RF03 — Iluminação do estacionamento (manual e programada)
    // ------------------------------------------------------------------

    public function createLight(int $userId, string $name): array
    {
        $statement = $this->pdo->prepare('INSERT INTO lights (user_id, name) VALUES (:user_id, :name)');
        $statement->execute(['user_id' => $userId, 'name' => $name]);
        return $this->findLight($userId, (int) $this->pdo->lastInsertId());
    }

    public function findLight(int $userId, int $lightId): ?array
    {
        $statement = $this->pdo->prepare('SELECT * FROM lights WHERE user_id = :user_id AND id = :id');
        $statement->execute(['user_id' => $userId, 'id' => $lightId]);
        $light = $statement->fetch();
        return $light ?: null;
    }

    public function listLights(int $userId, ?\DateTimeInterface $now = null): array
    {
        $this->applyLightSchedules($userId, $now ?? new \DateTimeImmutable());
        $statement = $this->pdo->prepare('SELECT * FROM lights WHERE user_id = :user_id ORDER BY id ASC');
        $statement->execute(['user_id' => $userId]);
        return $statement->fetchAll();
    }

    public function setLight(int $userId, int $lightId, bool $on, string $origin = 'manual'): ?array
    {
        $light = $this->findLight($userId, $lightId);
        if (!$light) {
            return null;
        }

        if ((bool) $light['is_on'] !== $on) {
            $statement = $this->pdo->prepare(
                'UPDATE lights SET is_on = :on, updated_at = CURRENT_TIMESTAMP WHERE id = :id AND user_id = :user_id'
            );
            $statement->execute(['on' => $on ? 1 : 0, 'id' => $lightId, 'user_id' => $userId]);
            $this->logEvent($userId, 'iluminacao', $on ? 'acesa' : 'apagada', $origin, null, $lightId);
        }

        return $this->findLight($userId, $lightId);
    }

    public function updateLightSchedule(int $userId, int $lightId, bool $enabled, string $onTime, string $offTime, ?\DateTimeInterface $now = null): ?array
    {
        if (!$this->findLight($userId, $lightId)) {
            return null;
        }

        // schedule_last_state volta a NULL para que o horário seja aplicado já na próxima verificação
        $statement = $this->pdo->prepare(<<<'SQL'
            UPDATE lights
            SET schedule_enabled = :enabled, on_time = :on_time, off_time = :off_time,
                schedule_last_state = NULL, updated_at = CURRENT_TIMESTAMP
            WHERE id = :id AND user_id = :user_id
        SQL);
        $statement->execute([
            'enabled' => $enabled ? 1 : 0,
            'on_time' => $onTime,
            'off_time' => $offTime,
            'id' => $lightId,
            'user_id' => $userId,
        ]);

        $this->applyLightSchedules($userId, $now ?? new \DateTimeImmutable());
        return $this->findLight($userId, $lightId);
    }

    /**
     * Indica se o horário informado está dentro da janela de funcionamento,
     * aceitando janelas que atravessam a meia-noite (ex.: 18:00 às 06:00).
     */
    public static function isWithinSchedule(string $time, string $onTime, string $offTime): bool
    {
        if ($onTime === $offTime) {
            return false;
        }
        return $onTime < $offTime
            ? $time >= $onTime && $time < $offTime
            : $time >= $onTime || $time < $offTime;
    }

    /**
     * Aplica a programação apenas nas transições do horário: um acionamento
     * manual continua valendo até o próximo horário programado.
     */
    private function applyLightSchedules(int $userId, \DateTimeInterface $now): void
    {
        $statement = $this->pdo->prepare('SELECT * FROM lights WHERE user_id = :user_id AND schedule_enabled = 1');
        $statement->execute(['user_id' => $userId]);
        $time = $now->format('H:i');

        foreach ($statement->fetchAll() as $light) {
            $desired = self::isWithinSchedule($time, $light['on_time'], $light['off_time']) ? 1 : 0;
            if ($light['schedule_last_state'] !== null && (int) $light['schedule_last_state'] === $desired) {
                continue;
            }

            $this->setLight($userId, (int) $light['id'], (bool) $desired, 'programado');
            $update = $this->pdo->prepare('UPDATE lights SET schedule_last_state = :state WHERE id = :id');
            $update->execute(['state' => $desired, 'id' => $light['id']]);
        }
    }

    // ------------------------------------------------------------------
    // Registro de acionamentos
    // ------------------------------------------------------------------

    private function logEvent(int $userId, string $device, string $action, string $origin, ?int $sensorId, ?int $lightId): void
    {
        $statement = $this->pdo->prepare(<<<'SQL'
            INSERT INTO device_events (user_id, sensor_id, light_id, device, action, origin)
            VALUES (:user_id, :sensor_id, :light_id, :device, :action, :origin)
        SQL);
        $statement->execute([
            'user_id' => $userId,
            'sensor_id' => $sensorId,
            'light_id' => $lightId,
            'device' => $device,
            'action' => $action,
            'origin' => $origin,
        ]);
    }

    public function listEvents(int $userId, ?int $sensorId = null, int $limit = 50): array
    {
        $sql = <<<'SQL'
            SELECT e.*, s.name AS sensor_name, l.name AS light_name
            FROM device_events e
            LEFT JOIN sensors s ON s.id = e.sensor_id
            LEFT JOIN lights l ON l.id = e.light_id
            WHERE e.user_id = :user_id
        SQL;
        $parameters = ['user_id' => $userId];
        if ($sensorId !== null) {
            $sql .= ' AND e.sensor_id = :sensor_id';
            $parameters['sensor_id'] = $sensorId;
        }
        $sql .= ' ORDER BY e.created_at DESC, e.id DESC LIMIT ' . max(1, min(200, $limit));
        $statement = $this->pdo->prepare($sql);
        $statement->execute($parameters);
        return $statement->fetchAll();
    }
}