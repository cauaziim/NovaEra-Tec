<?php
require_once __DIR__ . '/../php/tempic-database.php';
require_once __DIR__ . '/../php/tempic-core.php';

use NovaEra\Tempic\SensorSimulator;
use NovaEra\Tempic\TempicDatabase;

function check(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException('Falha: ' . $message);
    }
}

$databasePath = tempnam(sys_get_temp_dir(), 'tempic-controle-test-');
if ($databasePath === false) {
    throw new RuntimeException('Não foi possível criar banco temporário para o teste.');
}
unlink($databasePath);

try {
    // --- Migração: banco criado antes das colunas de controle ---
    $legacy = new PDO('sqlite:' . $databasePath);
    $legacy->exec(<<<'SQL'
        CREATE TABLE sensors (
            id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL,
            location TEXT NOT NULL, wifi_ssid TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'offline',
            source_mode TEXT NOT NULL DEFAULT 'demo', current_temperature REAL NOT NULL DEFAULT 4.2,
            minimum_temperature REAL NOT NULL DEFAULT 2, maximum_temperature REAL NOT NULL DEFAULT 8,
            target_temperature REAL NOT NULL DEFAULT 4, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    SQL);
    $legacy = null;

    $database = new TempicDatabase($databasePath);
    $userId = $database->createUser('Gestor', 'gestor@example.test', password_hash('senha-segura', PASSWORD_DEFAULT), 35);
    $otherUserId = $database->createUser('Outro', 'outro@example.test', password_hash('outra-senha', PASSWORD_DEFAULT), 30);

    // --- Faixas por tipo de sensor ---
    $freezerId = $database->createSensor($userId, ['name' => 'Freezer', 'type' => 'FREEZER', 'location' => 'Depósito', 'wifi_ssid' => 'Loja']);
    $freezer = $database->findSensor($userId, $freezerId);
    check((float) $freezer['target_temperature'] === -18.0 && (float) $freezer['maximum_temperature'] === -16.0, 'freezer não recebeu a faixa de -24 °C a -16 °C.');
    check(array_key_exists('equipment_on', $freezer) && $freezer['control_mode'] === 'auto', 'colunas de controle não foram migradas.');

    // --- Controle automático com histerese ---
    $fridgeId = $database->createSensor($userId, ['name' => 'Câmara', 'type' => 'CAMERA', 'location' => 'Loja', 'wifi_ssid' => 'Loja']);
    $database->setControlMode($userId, $fridgeId, 'auto');
    $database->setEquipment($userId, $fridgeId, false, 'automatico');
    $database->recordReading($userId, $fridgeId, 7.6);
    $sensor = $database->applyAutomaticControl($userId, $fridgeId);
    check((int) $sensor['equipment_on'] === 1, 'controle automático não ligou a refrigeração perto do limite máximo.');

    $database->recordReading($userId, $fridgeId, 5.0);
    $sensor = $database->applyAutomaticControl($userId, $fridgeId);
    check((int) $sensor['equipment_on'] === 1, 'refrigeração desligou antes de atingir o alvo (sem histerese).');

    $database->recordReading($userId, $fridgeId, 3.4);
    $sensor = $database->applyAutomaticControl($userId, $fridgeId);
    check((int) $sensor['equipment_on'] === 0, 'controle automático não desligou abaixo do alvo.');

    // --- Acionamento manual assume o controle ---
    $sensor = $database->setEquipment($userId, $fridgeId, true, 'manual');
    check($sensor['control_mode'] === 'manual' && (int) $sensor['equipment_on'] === 1, 'acionamento manual não colocou o sensor em modo manual.');
    $database->recordReading($userId, $fridgeId, 2.5);
    $sensor = $database->applyAutomaticControl($userId, $fridgeId);
    check((int) $sensor['equipment_on'] === 1, 'controle automático sobrescreveu a decisão manual.');
    check($database->setEquipment($otherUserId, $fridgeId, false) === null, 'outro usuário conseguiu acionar equipamento alheio.');

    // --- Simulação física ---
    $simulator = new SensorSimulator();
    $warming = $simulator->nextControlledReading(4.0, 4.0, false);
    $cooling = $simulator->nextControlledReading(7.5, 4.0, true);
    check($warming > 4.0 && $cooling < 7.5, 'simulação não reage ao estado do equipamento.');

    // --- Iluminação programada (janela que atravessa a meia-noite) ---
    check(TempicDatabase::isWithinSchedule('23:30', '18:00', '06:00'), '23:30 deveria estar dentro de 18:00–06:00.');
    check(!TempicDatabase::isWithinSchedule('12:00', '18:00', '06:00'), '12:00 não deveria estar dentro de 18:00–06:00.');

    $light = $database->createLight($userId, 'Estacionamento');
    $night = new DateTimeImmutable('2026-10-28 19:00');
    $day = new DateTimeImmutable('2026-10-29 07:00');

    $light = $database->updateLightSchedule($userId, (int) $light['id'], true, '18:00', '06:00', $night);
    check((int) $light['is_on'] === 1, 'programação não acendeu a iluminação dentro do horário.');

    $database->setLight($userId, (int) $light['id'], false, 'manual');
    $lights = $database->listLights($userId, $night);
    check((int) $lights[0]['is_on'] === 0, 'programação desfez o desligamento manual antes do próximo horário.');

    $lights = $database->listLights($userId, $day);
    check((int) $lights[0]['is_on'] === 0, 'iluminação não apagou no horário programado.');
    check($database->listLights($otherUserId) === [], 'iluminação não está isolada por usuário.');

    // --- Registro de acionamentos ---
    $origins = array_column($database->listEvents($userId), 'origin');
    foreach (['manual', 'automatico', 'programado'] as $origin) {
        check(in_array($origin, $origins, true), "acionamento de origem '{$origin}' não foi registrado.");
    }

    echo "Teste TempIC controle: OK\n";
} finally {
    $database = null;
    foreach ([$databasePath, $databasePath . '-journal', $databasePath . '-wal', $databasePath . '-shm'] as $path) {
        if (is_file($path)) {
            unlink($path);
        }
    }
}
