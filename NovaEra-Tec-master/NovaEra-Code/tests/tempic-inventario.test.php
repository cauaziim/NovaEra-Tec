<?php
require_once __DIR__ . '/../php/tempic-database.php';
require_once __DIR__ . '/../php/tempic-inventory.php';

use NovaEra\Tempic\InventoryCatalog;
use NovaEra\Tempic\InventoryRepository;
use NovaEra\Tempic\TempicDatabase;

function check(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException('Falha: ' . $message);
    }
}

$databasePath = tempnam(sys_get_temp_dir(), 'tempic-inventario-test-');
if ($databasePath === false) {
    throw new RuntimeException('Não foi possível criar banco temporário para o teste.');
}
unlink($databasePath);

try {
    $database = new TempicDatabase($databasePath);
    $inventory = new InventoryRepository($database->pdo());
    $userId = $database->createUser('Gestor', 'gestor@example.test', password_hash('senha-segura', PASSWORD_DEFAULT), 35);
    $otherUserId = $database->createUser('Outro', 'outro@example.test', password_hash('outra-senha', PASSWORD_DEFAULT), 30);

    $freezerId = $database->createSensor($userId, ['name' => 'Freezer', 'type' => 'FREEZER', 'location' => 'Loja', 'wifi_ssid' => 'Loja']);
    $fridgeId = $database->createSensor($userId, ['name' => 'Geladeira', 'type' => 'FRIDGE', 'location' => 'Loja', 'wifi_ssid' => 'Loja']);
    $freezer = $database->findSensor($userId, $freezerId);
    $fridge = $database->findSensor($userId, $fridgeId);

    // --- Catálogo: classe do equipamento, compatibilidade e validade sugerida ---
    check(InventoryCatalog::storageClass($freezer) === 'frozen' && InventoryCatalog::storageClass($fridge) === 'chilled', 'classe de armazenamento errada.');
    check(InventoryCatalog::compatibility('saude', $freezer)['level'] === 'block', 'vacina no freezer deveria ser bloqueada.');
    check(InventoryCatalog::compatibility('congelados', $fridge)['level'] === 'block', 'sorvete na geladeira deveria ser bloqueado.');
    check(InventoryCatalog::compatibility('carnes', $freezer)['level'] === 'ok', 'carne no freezer deveria ser aceita.');
    check(InventoryCatalog::compatibility('objetos', $freezer)['level'] === 'ok', 'objetos deveriam caber em qualquer equipamento.');
    $today = new DateTimeImmutable('2026-10-30');
    check(InventoryCatalog::suggestedExpiry('carnes', $freezer, $today) === '2027-04-28', 'validade sugerida de carne congelada deveria ser 180 dias.');
    check(InventoryCatalog::suggestedExpiry('carnes', $fridge, $today) === '2026-11-02', 'validade sugerida de carne refrigerada deveria ser 3 dias.');
    check(InventoryCatalog::suggestedExpiry('objetos', $fridge, $today) === null, 'objetos não deveriam ter validade sugerida.');

    // --- Guardar e listar em ordem FEFO ---
    $base = ['category' => 'carnes', 'unit' => 'kg', 'shelf' => 1, 'notes' => ''];
    $chicken = $inventory->addItem($userId, $userId, $freezerId, $base + ['name' => 'Frango', 'quantity' => 3, 'expires_at' => (new DateTimeImmutable('today'))->modify('+60 days')->format('Y-m-d')]);
    $beef = $inventory->addItem($userId, $userId, $freezerId, $base + ['name' => 'Carne moída', 'quantity' => 1.5, 'expires_at' => (new DateTimeImmutable('today'))->modify('+2 days')->format('Y-m-d')]);
    $tray = $inventory->addItem($userId, $userId, $freezerId, ['name' => 'Gelox', 'category' => 'objetos', 'unit' => 'un', 'shelf' => 2, 'notes' => '', 'quantity' => 4, 'expires_at' => null]);
    $milk = $inventory->addItem($userId, $userId, $fridgeId, ['name' => 'Leite', 'category' => 'laticinios', 'unit' => 'L', 'shelf' => 1, 'notes' => '', 'quantity' => 6, 'expires_at' => (new DateTimeImmutable('today'))->modify('-1 day')->format('Y-m-d')]);

    $items = $inventory->listItems($userId, $freezerId);
    check(array_column($items, 'name') === ['Carne moída', 'Frango', 'Gelox'], 'itens fora da ordem FEFO (vence primeiro, sem validade por último).');
    check($items[0]['expiry_status'] === 'expiring' && $items[0]['days_to_expiry'] === 2, 'item perto do vencimento não foi sinalizado.');
    check($inventory->findItem($userId, (int) $milk['id'])['expiry_status'] === 'expired', 'item vencido não foi sinalizado.');
    check($items[2]['expiry_status'] === 'none', 'item sem validade recebeu status de validade.');

    // --- Isolamento entre espaços ---
    check($inventory->listItems($otherUserId) === [], 'inventário vazou para outro espaço.');
    check($inventory->findItem($otherUserId, (int) $chicken['id']) === null, 'outro espaço encontrou item alheio.');
    check($inventory->withdraw($otherUserId, $otherUserId, (int) $chicken['id'], null, 'consumido') === null, 'outro espaço retirou item alheio.');
    $otherSensor = $database->createSensor($otherUserId, ['name' => 'Alheio', 'type' => 'FREEZER', 'location' => 'X', 'wifi_ssid' => 'X']);
    check($inventory->moveItem($userId, (int) $chicken['id'], $otherSensor, 1) === null, 'item foi movido para equipamento de outro espaço.');

    // --- Mover, retirada parcial e total ---
    $moved = $inventory->moveItem($userId, (int) $tray['id'], $fridgeId, 3);
    check($moved && (int) $moved['sensor_id'] === $fridgeId && (int) $moved['shelf'] === 3, 'item não foi transferido de equipamento/prateleira.');

    $partial = $inventory->withdraw($userId, $userId, (int) $chicken['id'], 1.25, 'consumido');
    check($partial && !$partial['removed'] && abs((float) $partial['item']['quantity'] - 1.75) < 0.0001, 'retirada parcial não abateu a quantidade.');
    $total = $inventory->withdraw($userId, $userId, (int) $chicken['id'], null, 'descartado');
    check($total && $total['removed'] && $inventory->findItem($userId, (int) $chicken['id']) === null, 'retirada total não tirou o item do inventário.');
    $reason = $database->pdo()->query('SELECT removal_reason FROM storage_items WHERE id = ' . (int) $chicken['id'])->fetchColumn();
    check($reason === 'descartado', 'motivo da retirada não ficou registrado.');

    // --- Exposição: só conta o tempo em alerta depois que o item foi guardado ---
    $pdo = $database->pdo();
    $pdo->exec('DELETE FROM readings');
    $insert = $pdo->prepare("INSERT INTO readings (sensor_id, temperature, temperature_state, recorded_at) VALUES (:id, :t, :s, datetime('now', :offset))");
    // 3 h atrás: alerta longo ANTES do item chegar (não pode contar)
    $insert->execute(['id' => $fridgeId, 't' => 12, 's' => 'alert', 'offset' => '-180 minutes']);
    $insert->execute(['id' => $fridgeId, 't' => 4, 's' => 'normal', 'offset' => '-170 minutes']);
    $sardine = $inventory->addItem($userId, $userId, $fridgeId, ['name' => 'Sardinha', 'category' => 'peixes', 'unit' => 'kg', 'shelf' => 1, 'notes' => '', 'quantity' => 1, 'expires_at' => null], '-60 minutes');
    // Depois do item: 20 min em alerta (duas leituras de 10 min) e volta ao normal
    $insert->execute(['id' => $fridgeId, 't' => 9.5, 's' => 'alert', 'offset' => '-40 minutes']);
    $insert->execute(['id' => $fridgeId, 't' => 9.8, 's' => 'alert', 'offset' => '-30 minutes']);
    $insert->execute(['id' => $fridgeId, 't' => 5, 's' => 'normal', 'offset' => '-20 minutes']);

    $sardine = $inventory->findItem($userId, (int) $sardine['id']);
    check(abs($sardine['exposure_minutes'] - 20) < 0.2, "exposição deveria ser 20 min, veio {$sardine['exposure_minutes']}.");
    check($sardine['integrity'] === 'exposed', 'peixe 20 min fora da faixa deveria estar "exposto".');
    check(InventoryCatalog::integrity('peixes', 61) === 'compromised' && InventoryCatalog::integrity('peixes', 2) === 'intact', 'limites de integridade incorretos.');

    // Um buraco de horas sem leitura não vira exposição (limite de 15 min por leitura)
    $insert->execute(['id' => $fridgeId, 't' => 11, 's' => 'alert', 'offset' => '-10 minutes']);
    $sardine = $inventory->findItem($userId, (int) $sardine['id']);
    check($sardine['exposure_minutes'] <= 30.2, 'leitura em alerta sem sucessora contou mais que o intervalo máximo.');

    $summary = $inventory->summarize($inventory->listItems($userId));
    check($summary['expired'] === 1 && $summary['expiring'] === 1 && $summary['at_risk'] >= 1, 'resumo do inventário não bate.');
    check(isset($summary['by_sensor'][(string) $fridgeId]), 'resumo não agrupa por equipamento.');

    // --- Remover o sensor apaga o inventário dele ---
    $database->deleteSensor($userId, $fridgeId);
    check($inventory->listItems($userId, $fridgeId) === [], 'itens ficaram órfãos após remover o sensor.');

    echo "Teste TempIC inventário: OK\n";
} finally {
    $database = null;
    $inventory = null;
    $pdo = null;
    $insert = null;
    foreach ([$databasePath, $databasePath . '-journal', $databasePath . '-wal', $databasePath . '-shm'] as $path) {
        if (is_file($path)) {
            unlink($path);
        }
    }
}
