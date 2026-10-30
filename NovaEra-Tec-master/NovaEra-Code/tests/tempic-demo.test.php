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

$databasePath = tempnam(sys_get_temp_dir(), 'tempic-demo-test-');
if ($databasePath === false) {
    throw new RuntimeException('Não foi possível criar banco temporário para o teste.');
}
unlink($databasePath);

try {
    $database = new TempicDatabase($databasePath);
    $userId = $database->createUser('Gestor', 'gestor@example.test', password_hash('senha-segura', PASSWORD_DEFAULT), 35);
    $otherUserId = $database->createUser('Outro', 'outro@example.test', password_hash('outra-senha', PASSWORD_DEFAULT), 30);

    // --- Histórico inicial da demonstração ---
    $sensorId = $database->createSensor($userId, ['name' => 'Câmara', 'type' => 'CAMERA', 'location' => 'Depósito', 'wifi_ssid' => 'Loja']);
    $seeded = $database->seedHistory($userId, $sensorId, 24, 10);
    check($seeded === 144, "histórico de 24 h a cada 10 min deveria ter 144 leituras, teve {$seeded}.");
    check($database->seedHistory($userId, $sensorId) === 0, 'histórico foi semeado duas vezes no mesmo sensor.');
    check($database->seedHistory($otherUserId, $sensorId) === 0, 'outro usuário conseguiu semear histórico em sensor alheio.');

    $full = $database->history($userId, $sensorId, '24h');
    check(count($full['readings']) >= 144 && $full['total'] === count($full['readings']), 'histórico completo não trouxe todas as leituras.');

    // --- Redução de pontos para o gráfico ---
    $reduced = $database->history($userId, $sensorId, '24h', 40);
    check(count($reduced['readings']) <= 40, 'histórico reduzido passou do limite de pontos.');
    check($reduced['total'] === $full['total'], 'total de leituras mudou com a redução.');
    check($reduced['minimum'] === $full['minimum'] && $reduced['maximum'] === $full['maximum'], 'mínima/máxima devem considerar todas as leituras, não só os pontos reduzidos.');
    $times = array_column($reduced['readings'], 'recorded_at');
    $sorted = $times;
    sort($sorted);
    check($times === $sorted, 'pontos reduzidos não estão em ordem cronológica.');

    // --- Exclusão isolada por usuário ---
    $lightId = (int) $database->createLight($userId, 'Doca')['id'];
    check(!$database->deleteSensor($otherUserId, $sensorId), 'outro usuário conseguiu excluir sensor alheio.');
    check(!$database->deleteLight($otherUserId, $lightId), 'outro usuário conseguiu excluir iluminação alheia.');
    check($database->deleteSensor($userId, $sensorId) && $database->findSensor($userId, $sensorId) === null, 'sensor não foi excluído.');
    check($database->history($userId, $sensorId, '24h') === null, 'histórico de sensor excluído continua acessível.');
    check($database->deleteLight($userId, $lightId) && $database->listLights($userId) === [], 'iluminação não foi excluída.');

    // --- Cenário "porta aberta" ---
    $simulator = new SensorSimulator();
    for ($i = 0; $i < 50; $i++) {
        $spike = $simulator->doorOpeningSpike();
        check($spike >= 1.2 && $spike <= 2.4, "pico da porta aberta fora da faixa: {$spike}.");
    }

    echo "Teste Tempic demonstração: OK\n";
} finally {
    $database = null;
    foreach ([$databasePath, $databasePath . '-journal', $databasePath . '-wal', $databasePath . '-shm'] as $path) {
        if (is_file($path)) {
            unlink($path);
        }
    }
}
