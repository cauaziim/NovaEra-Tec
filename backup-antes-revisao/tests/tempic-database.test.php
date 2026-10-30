<?php
require_once __DIR__ . '/../php/tempic-database.php';

use NovaEra\Tempic\TempicDatabase;

$databasePath = tempnam(sys_get_temp_dir(), 'tempic-test-');
if ($databasePath === false) {
    throw new RuntimeException('Não foi possível criar banco temporário para o teste.');
}
unlink($databasePath);

try {
    $database = new TempicDatabase($databasePath);
    $userId = $database->createUser('Teste TempIC', 'teste@example.test', password_hash('senha-segura', PASSWORD_DEFAULT), 30);
    $otherUserId = $database->createUser('Outro usuário', 'outro@example.test', password_hash('outra-senha', PASSWORD_DEFAULT), 25);

    $sensorId = $database->createSensor($userId, [
        'name' => 'Geladeira de teste',
        'type' => 'FRIDGE',
        'location' => 'Cozinha',
        'wifi_ssid' => 'Rede local',
    ]);

    if (count($database->listSensors($userId)) !== 1 || count($database->listSensors($otherUserId)) !== 0) {
        throw new RuntimeException('Falha: sensores não estão isolados por usuário.');
    }

    $alertReading = $database->recordReading($userId, $sensorId, 9.2);
    if (!$alertReading || (float) $alertReading['temperature'] !== 9.2 || $alertReading['temperature_state'] !== 'alert') {
        throw new RuntimeException('Falha: leitura retornada não corresponde à leitura persistida.');
    }
    if (count($database->listAlerts($userId, $sensorId)) !== 1) {
        throw new RuntimeException('Falha: leitura fora dos limites não gerou alerta.');
    }

    $history = $database->history($userId, $sensorId, '7d');
    if (!$history || count($history['readings']) !== 2 || $history['maximum'] !== 9.2) {
        throw new RuntimeException('Falha: histórico ou estatísticas não refletem as leituras salvas.');
    }

    $updatedSensor = $database->updateTarget($userId, $sensorId, 3.5);
    if (!$updatedSensor || (float) $updatedSensor['target_temperature'] !== 3.5) {
        throw new RuntimeException('Falha: ajuste de temperatura alvo não foi persistido.');
    }

    if ($database->findSensor($otherUserId, $sensorId) !== null) {
        throw new RuntimeException('Falha: usuário conseguiu acessar sensor alheio.');
    }

    echo "Teste TempIC banco: OK\n";
} finally {
    $database = null;
    foreach ([$databasePath, $databasePath . '-journal', $databasePath . '-wal', $databasePath . '-shm'] as $path) {
        if (is_file($path)) {
            unlink($path);
        }
    }
}