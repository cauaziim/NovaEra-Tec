<?php
require_once __DIR__ . '/../php/tempic-database.php';
require_once __DIR__ . '/../php/tempic-access.php';

use NovaEra\Tempic\TempicAccess;
use NovaEra\Tempic\TempicDatabase;
use NovaEra\Tempic\WorkspaceRepository;

function check(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException('Falha: ' . $message);
    }
}

$databasePath = tempnam(sys_get_temp_dir(), 'tempic-equipe-test-');
if ($databasePath === false) {
    throw new RuntimeException('Não foi possível criar banco temporário para o teste.');
}
unlink($databasePath);

try {
    // --- Matriz de permissões ---
    check(TempicAccess::can('admin', 'team.manage') && TempicAccess::can('admin', 'equipment.control'), 'administrador sem permissão total.');
    check(TempicAccess::can('member', 'alerts.receive') && TempicAccess::can('member', 'inventory.write'), 'membro não recebe alertas ou não guarda itens.');
    foreach (['sensors.manage', 'equipment.control', 'lights.manage', 'simulation.run', 'team.manage', 'audit.view', 'inventory.manage'] as $permission) {
        check(!TempicAccess::can('member', $permission), "membro não deveria ter '{$permission}'.");
    }
    check(!TempicAccess::can('visitante', 'monitor.view'), 'papel desconhecido recebeu permissão.');

    $database = new TempicDatabase($databasePath);
    $team = new WorkspaceRepository($database->pdo());
    $ownerId = $database->createUser('Dona', 'dona@example.test', password_hash('senha-segura', PASSWORD_DEFAULT), 40);
    $strangerId = $database->createUser('Estranho', 'estranho@example.test', password_hash('senha-segura', PASSWORD_DEFAULT), 30);

    // --- Conta sem convite é dona (e administradora) do próprio espaço ---
    $context = $team->contextOf($ownerId);
    check($context['workspace_id'] === $ownerId && $context['role'] === 'admin' && $context['is_owner'], 'conta nova não é dona do próprio espaço.');

    // --- Convite: código legível, uso único ---
    $invite = $team->createInvite($ownerId, $ownerId, 'member', 7);
    check((bool) preg_match('/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/', $invite['code']), 'código de convite fora do formato XXXX-XXXX.');
    check(WorkspaceRepository::normalizeCode(strtolower(str_replace('-', ' ', $invite['code']))) === $invite['code'], 'código digitado sem hífen/minúsculo não foi reconhecido.');

    $memberId = $database->createUser('Membro', 'membro@example.test', password_hash('senha-segura', PASSWORD_DEFAULT), 22);
    $usable = $team->findUsableInvite($invite['code']);
    check($usable !== null && $team->acceptInvite($usable, $memberId), 'convite válido não foi aceito.');
    check(!$team->acceptInvite($usable, $strangerId), 'o mesmo convite foi usado duas vezes.');
    check($team->findUsableInvite($invite['code']) === null, 'convite usado continua disponível.');

    $context = $team->contextOf($memberId);
    check($context['workspace_id'] === $ownerId && $context['role'] === 'member', 'membro não entrou no espaço da dona.');

    // --- Membro enxerga os sensores do espaço (o painel consulta pelo workspace) ---
    $sensorId = $database->createSensor($ownerId, ['name' => 'Freezer', 'type' => 'FREEZER', 'location' => 'Loja', 'wifi_ssid' => 'Loja']);
    check($database->findSensor($context['workspace_id'], $sensorId) !== null, 'membro não vê os sensores do espaço.');
    check($database->findSensor($team->contextOf($strangerId)['workspace_id'], $sensorId) === null, 'conta de fora enxergou o sensor.');

    // --- Convite revogado e expirado ---
    $revoked = $team->createInvite($ownerId, $ownerId, 'admin', 7);
    check($team->revokeInvite($ownerId, (int) $revoked['id']), 'convite não foi revogado.');
    check($team->findUsableInvite($revoked['code']) === null, 'convite revogado ainda é aceito.');
    check(!$team->revokeInvite($strangerId, (int) $invite['id']), 'outro espaço revogou convite alheio.');

    $expired = $team->createInvite($ownerId, $ownerId, 'member', 1);
    $database->pdo()->exec("UPDATE invites SET expires_at = datetime('now', '-1 minute') WHERE id = " . (int) $expired['id']);
    check($team->findUsableInvite($expired['code']) === null, 'convite expirado ainda é aceito.');
    check(count($team->listInvites($ownerId)) === 0, 'lista de convites mostra convites usados, revogados ou expirados.');

    // --- Papéis: promover, rebaixar, remover; dono é intocável ---
    check($team->setRole($ownerId, $memberId, 'admin') && $team->contextOf($memberId)['role'] === 'admin', 'promoção não teve efeito imediato.');
    check(!$team->setRole($ownerId, $memberId, 'superusuario'), 'papel inexistente foi aceito.');
    check(!$team->setRole($ownerId, $ownerId, 'member'), 'dono do espaço foi rebaixado.');
    check(!$team->removeMember($ownerId, $ownerId), 'dono do espaço foi removido.');
    check(!$team->setRole($strangerId, $memberId, 'member'), 'outro espaço alterou o papel do membro.');

    $members = $team->listMembers($ownerId);
    check(count($members) === 2 && (int) $members[0]['is_owner'] === 1, 'lista da equipe não traz dono primeiro + membro.');

    check($team->removeMember($ownerId, $memberId), 'membro não foi removido.');
    $context = $team->contextOf($memberId);
    check($context['workspace_id'] === $memberId && $database->findSensor($context['workspace_id'], $sensorId) === null, 'membro removido continuou vendo o espaço.');

    // --- Auditoria e "ciente" ---
    $team->audit($ownerId, $ownerId, 'sensor.target', 'Alterou o alvo.');
    $entries = $team->listAudit($ownerId);
    check(count($entries) === 1 && $entries[0]['actor_name'] === 'Dona', 'auditoria não registrou o autor.');
    check($team->listAudit($strangerId) === [], 'auditoria vazou para outro espaço.');

    $database->recordReading($ownerId, $sensorId, -10.0);
    $alert = $database->listAlerts($ownerId)[0];
    check(!$database->acknowledgeAlert($strangerId, (int) $alert['id'], $strangerId), 'outro espaço marcou ciente em alerta alheio.');
    check($database->acknowledgeAlert($ownerId, (int) $alert['id'], $ownerId), 'alerta não foi marcado como ciente.');
    check(!$database->acknowledgeAlert($ownerId, (int) $alert['id'], $ownerId), 'ciente foi registrado duas vezes.');
    check($database->listAlerts($ownerId)[0]['acknowledged_by_name'] === 'Dona', 'alerta não mostra quem ficou ciente.');

    echo "Teste TempIC equipe: OK\n";
} finally {
    $database = null;
    $team = null;
    foreach ([$databasePath, $databasePath . '-journal', $databasePath . '-wal', $databasePath . '-shm'] as $path) {
        if (is_file($path)) {
            unlink($path);
        }
    }
}
