<?php
declare(strict_types=1);

use NovaEra\Tempic\SensorSimulator;
use NovaEra\Tempic\DemoTemperatureProvider;
use NovaEra\Tempic\InventoryCatalog;
use NovaEra\Tempic\InventoryRepository;
use NovaEra\Tempic\TempicAccess;
use NovaEra\Tempic\TempicDatabase;
use NovaEra\Tempic\TempicStorageException;
use NovaEra\Tempic\WorkspaceRepository;

require_once __DIR__ . '/tempic-database.php';
require_once __DIR__ . '/tempic-core.php';
require_once __DIR__ . '/tempic-access.php';
require_once __DIR__ . '/tempic-inventory.php';

ini_set('session.use_strict_mode', '1');
session_name('TEMPICSESSID');
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
    'httponly' => true,
    'samesite' => 'Lax',
]);
session_start();

// A programação da iluminação e as validades usam o horário local do estabelecimento
date_default_timezone_set(getenv('TEMPIC_TIMEZONE') ?: 'America/Sao_Paulo');

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, private');
header('X-Content-Type-Options: nosniff');

/**
 * Permissão exigida por ação (ver TempicAccess). Ações autenticadas que não
 * estão aqui exigem apenas "monitor.view". O papel é lido do banco a cada
 * requisição: promover ou remover alguém vale na hora, sem novo login.
 */
const TEMPIC_ACTION_PERMISSIONS = [
    'sensor' => 'sensors.manage',
    'sensor-delete' => 'sensors.manage',
    'seed-demo' => 'sensors.manage',
    'target' => 'sensors.manage',
    'equipment' => 'equipment.control',
    'control-mode' => 'equipment.control',
    'light' => 'lights.manage',
    'light-delete' => 'lights.manage',
    'light-toggle' => 'lights.manage',
    'light-schedule' => 'lights.manage',
    'alert-ack' => 'alerts.acknowledge',
    'item' => 'inventory.write',
    'item-move' => 'inventory.write',
    'item-withdraw' => 'inventory.write',
    'item-update' => 'inventory.manage',
    'item-delete' => 'inventory.manage',
    'team' => 'team.manage',
    'invite' => 'team.manage',
    'invite-revoke' => 'team.manage',
    'member-role' => 'team.manage',
    'member-remove' => 'team.manage',
    'audit' => 'audit.view',
];

function tempicRespond(array $payload, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

function tempicInput(): array
{
    static $input = null;
    $input ??= json_decode(file_get_contents('php://input') ?: '', true);
    return is_array($input) ? $input : [];
}

function tempicRequireCsrf(): void
{
    $token = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    if (!$token || !hash_equals($_SESSION['tempic_csrf'] ?? '', $token)) {
        tempicRespond(['error' => 'Sessão expirada. Atualize a página e tente novamente.'], 419);
    }
}

function tempicRequireUser(): int
{
    $userId = (int) ($_SESSION['tempic_user_id'] ?? 0);
    if ($userId < 1) {
        tempicRespond(['error' => 'Entre na sua conta para continuar.'], 401);
    }
    return $userId;
}

function tempicUserPayload(): array
{
    return [
        'id' => (int) $_SESSION['tempic_user_id'],
        'name' => (string) $_SESSION['tempic_user_name'],
        'email' => (string) $_SESSION['tempic_user_email'],
    ];
}

/** Papel, permissões e espaço de trabalho de quem está logado. */
function tempicAccessPayload(WorkspaceRepository $workspaces, array $context): array
{
    return [
        'role' => $context['role'],
        'roleLabel' => TempicAccess::ROLE_LABELS[$context['role']],
        'permissions' => TempicAccess::permissionsOf($context['role']),
        'rolePermissions' => array_map([TempicAccess::class, 'permissionsOf'], array_combine(array_keys(TempicAccess::ROLE_LABELS), array_keys(TempicAccess::ROLE_LABELS))),
        'workspace' => [
            'id' => $context['workspace_id'],
            'name' => $workspaces->workspaceName($context['workspace_id']),
            'isOwner' => $context['is_owner'],
        ],
    ];
}

function tempicCatalogPayload(): array
{
    return [
        'categories' => InventoryCatalog::categories(),
        'units' => InventoryCatalog::UNITS,
        'reasons' => InventoryCatalog::REMOVAL_REASONS,
        'shelves' => InventoryCatalog::MAX_SHELVES,
    ];
}

function tempicValidateEmail(string $email): bool
{
    return strlen($email) <= 254 && filter_var($email, FILTER_VALIDATE_EMAIL) !== false;
}

/** Campos de um item do inventário, validados. Responde 422 se algo estiver errado. */
function tempicItemInput(array $input): array
{
    $name = trim((string) ($input['name'] ?? ''));
    $category = (string) ($input['category'] ?? '');
    $unit = (string) ($input['unit'] ?? '');
    $quantity = filter_var($input['quantity'] ?? null, FILTER_VALIDATE_FLOAT);
    $notes = trim((string) ($input['notes'] ?? ''));
    $expires = $input['expires_at'] ?? null;

    if (mb_strlen($name) < 1 || mb_strlen($name) > 100) {
        tempicRespond(['error' => 'Dê um nome ao item (até 100 caracteres).'], 422);
    }
    if (!InventoryCatalog::isCategory($category) || !in_array($unit, InventoryCatalog::UNITS, true)) {
        tempicRespond(['error' => 'Escolha uma categoria e uma unidade válidas.'], 422);
    }
    if ($quantity === false || $quantity <= 0 || $quantity > 100000) {
        tempicRespond(['error' => 'Informe uma quantidade maior que zero.'], 422);
    }
    if ($expires !== null && $expires !== '') {
        $date = DateTimeImmutable::createFromFormat('!Y-m-d', (string) $expires);
        if (!$date || $date->format('Y-m-d') !== $expires) {
            tempicRespond(['error' => 'Data de validade inválida.'], 422);
        }
    }

    return [
        'name' => $name,
        'category' => $category,
        'unit' => $unit,
        'quantity' => round((float) $quantity, 3),
        'notes' => mb_substr($notes, 0, 300),
        'expires_at' => $expires ?: null,
    ];
}

function tempicQuantityLabel(float $quantity, string $unit): string
{
    return str_replace('.', ',', rtrim(rtrim(number_format($quantity, 3, '.', ''), '0'), '.')) . ' ' . $unit;
}

try {
    $database = new TempicDatabase();
    $workspaces = new WorkspaceRepository($database->pdo());
    $inventory = new InventoryRepository($database->pdo());
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    $action = (string) ($_GET['action'] ?? '');

    if ($action === 'bootstrap' && $method === 'GET') {
        $_SESSION['tempic_csrf'] ??= bin2hex(random_bytes(32));
        $actorId = (int) ($_SESSION['tempic_user_id'] ?? 0);
        $payload = [
            'authenticated' => $actorId > 0,
            'user' => null,
            'sensors' => [],
            'csrfToken' => $_SESSION['tempic_csrf'],
            'mode' => 'demo',
            'catalog' => tempicCatalogPayload(),
        ];
        if ($actorId > 0) {
            $context = $workspaces->contextOf($actorId);
            $workspaces->touch($actorId);
            $database->markStaleSensorsOffline($context['workspace_id']);
            $payload['user'] = tempicUserPayload();
            $payload['sensors'] = $database->listSensors($context['workspace_id']);
            $payload += tempicAccessPayload($workspaces, $context);
        }
        tempicRespond($payload);
    }

    // Prévia do convite na tela de cadastro: diz em qual espaço e com qual papel a pessoa vai entrar
    if ($action === 'invite-check' && $method === 'GET') {
        $invite = $workspaces->findUsableInvite((string) ($_GET['code'] ?? ''));
        if (!$invite) {
            tempicRespond(['error' => 'Código de convite inválido ou expirado.'], 404);
        }
        tempicRespond([
            'workspace' => $workspaces->workspaceName((int) $invite['workspace_id']),
            'role' => $invite['role'],
            'roleLabel' => TempicAccess::ROLE_LABELS[$invite['role']],
        ]);
    }

    if ($method === 'POST' && in_array($action, ['register', 'login'], true)) {
        tempicRequireCsrf();
        $input = tempicInput();
        $email = strtolower(trim((string) ($input['email'] ?? '')));
        $password = (string) ($input['password'] ?? '');

        if (!tempicValidateEmail($email) || $password === '') {
            tempicRespond(['error' => 'Informe um e-mail válido e a senha.'], 422);
        }

        if ($action === 'register') {
            $name = trim((string) ($input['name'] ?? ''));
            $age = filter_var($input['age'] ?? null, FILTER_VALIDATE_INT);
            if (mb_strlen($name) < 2 || mb_strlen($name) > 120 || $age === false || $age < 1 || $age > 120) {
                tempicRespond(['error' => 'Informe nome completo e idade entre 1 e 120 anos.'], 422);
            }
            if (strlen($password) < 8 || !hash_equals($password, (string) ($input['password_confirmation'] ?? ''))) {
                tempicRespond(['error' => 'A senha deve ter pelo menos 8 caracteres e coincidir com a confirmação.'], 422);
            }
            if ($database->findUserByEmail($email)) {
                tempicRespond(['error' => 'Este e-mail já está cadastrado.'], 409);
            }
            $inviteCode = trim((string) ($input['invite_code'] ?? ''));
            $invite = $inviteCode !== '' ? $workspaces->findUsableInvite($inviteCode) : null;
            if ($inviteCode !== '' && !$invite) {
                tempicRespond(['error' => 'Código de convite inválido ou expirado. Peça um novo ao administrador.'], 422);
            }

            // Conta e convite na mesma transação: ou a pessoa entra na equipe, ou nada é criado
            $pdo = $database->pdo();
            $pdo->beginTransaction();
            try {
                $userId = $database->createUser($name, $email, password_hash($password, PASSWORD_DEFAULT), $age);
                if ($invite) {
                    if (!$workspaces->acceptInvite($invite, $userId)) {
                        $pdo->rollBack();
                        tempicRespond(['error' => 'Este convite acabou de ser usado. Peça um novo ao administrador.'], 409);
                    }
                    $workspaces->audit((int) $invite['workspace_id'], $userId, 'team.join', "{$name} entrou na equipe como " . TempicAccess::ROLE_LABELS[$invite['role']] . '.');
                }
                $pdo->commit();
            } catch (PDOException $error) {
                if ($pdo->inTransaction()) {
                    $pdo->rollBack();
                }
                if ((string) $error->getCode() === '23000' || str_contains($error->getMessage(), 'UNIQUE')) {
                    tempicRespond(['error' => 'Este e-mail já está cadastrado.'], 409);
                }
                throw $error;
            }

            session_regenerate_id(true);
            $_SESSION['tempic_user_id'] = $userId;
            $_SESSION['tempic_user_name'] = $name;
            $_SESSION['tempic_user_email'] = $email;
            $_SESSION['tempic_csrf'] = bin2hex(random_bytes(32));
            $context = $workspaces->contextOf($userId);
            tempicRespond(['message' => 'Conta criada com sucesso!', 'user' => tempicUserPayload(), 'csrfToken' => $_SESSION['tempic_csrf']]
                + tempicAccessPayload($workspaces, $context), 201);
        }

        // Mesma resposta (e mesmo custo de verificação) para e-mail inexistente
        // ou senha errada: a API não revela quais e-mails têm conta.
        $user = $database->findUserByEmail($email);
        $hash = $user['password_hash'] ?? '$2y$12$fxInfSWJhllnaIkHSjAc6uN5QfOtHdk8Z.EqeoXZvLD/yuSiXHNHm';
        if (!password_verify($password, $hash) || !$user) {
            tempicRespond(['error' => 'E-mail ou senha incorretos.'], 401);
        }

        session_regenerate_id(true);
        $_SESSION['tempic_user_id'] = (int) $user['id'];
        $_SESSION['tempic_user_name'] = $user['name'];
        $_SESSION['tempic_user_email'] = $user['email'];
        $_SESSION['tempic_csrf'] = bin2hex(random_bytes(32));
        $context = $workspaces->contextOf((int) $user['id']);
        $workspaces->touch((int) $user['id']);
        tempicRespond(['message' => 'Login realizado.', 'user' => tempicUserPayload(), 'csrfToken' => $_SESSION['tempic_csrf']]
            + tempicAccessPayload($workspaces, $context));
    }

    if ($method !== 'GET' && $method !== 'POST') {
        tempicRespond(['error' => 'Método não permitido.'], 405);
    }

    // A partir daqui: $actorId é quem está agindo; $workspaceId é o dono dos dados
    $actorId = tempicRequireUser();
    if ($method === 'POST') {
        tempicRequireCsrf();
    }
    $context = $workspaces->contextOf($actorId);
    $workspaceId = $context['workspace_id'];
    $role = $context['role'];
    $audit = static fn (string $event, string $summary) => $workspaces->audit($workspaceId, $actorId, $event, $summary);

    $required = TEMPIC_ACTION_PERMISSIONS[$action] ?? 'monitor.view';
    if (!TempicAccess::can($role, $required)) {
        tempicRespond([
            'error' => 'Somente o administrador pode fazer isso. Peça a ele, ou peça para ser promovido.',
            'code' => 'forbidden',
            'permission' => $required,
        ], 403);
    }

    if ($action === 'logout' && $method === 'POST') {
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $params = session_get_cookie_params();
            setcookie(session_name(), '', time() - 42000, $params['path'], $params['domain'], $params['secure'], $params['httponly']);
        }
        session_destroy();
        tempicRespond(['message' => 'Sessão encerrada.']);
    }

    if ($action === 'sensors' && $method === 'GET') {
        $database->markStaleSensorsOffline($workspaceId);
        tempicRespond(['sensors' => $database->listSensors($workspaceId)]);
    }

    if ($action === 'sensor' && $method === 'POST') {
        $input = tempicInput();
        $name = trim((string) ($input['name'] ?? ''));
        $location = trim((string) ($input['location'] ?? ''));
        $wifiSsid = trim((string) ($input['wifi_ssid'] ?? ''));
        $type = (string) ($input['type'] ?? '');
        $types = ['CAMERA', 'FRIDGE', 'FREEZER', 'VEHICLE', 'ENVIRONMENT', 'OTHER'];
        if (mb_strlen($name) < 2 || mb_strlen($name) > 100 || mb_strlen($location) < 2 || mb_strlen($location) > 120
            || mb_strlen($wifiSsid) < 1 || mb_strlen($wifiSsid) > 120 || !in_array($type, $types, true)) {
            tempicRespond(['error' => 'Confira o nome, local, rede Wi-Fi e tipo do sensor.'], 422);
        }
        $sensorId = $database->createSensor($workspaceId, [
            'name' => $name,
            'type' => $type,
            'location' => $location,
            'wifi_ssid' => $wifiSsid,
        ]);
        if (filter_var($input['seed_history'] ?? false, FILTER_VALIDATE_BOOL)) {
            $database->seedHistory($workspaceId, $sensorId);
        }
        $audit('sensor.create', "Adicionou o sensor {$name} ({$location}).");
        tempicRespond(['sensor' => $database->findSensor($workspaceId, $sensorId), 'message' => 'Sensor salvo no modo demonstração.'], 201);
    }

    if ($action === 'reading' && $method === 'POST') {
        $sensorId = filter_var(tempicInput()['sensor_id'] ?? null, FILTER_VALIDATE_INT);
        $sensor = $sensorId ? $database->findSensor($workspaceId, $sensorId) : null;
        if (!$sensor) {
            tempicRespond(['error' => 'Sensor não encontrado.'], 404);
        }
        if ($sensor['source_mode'] !== 'demo') {
            tempicRespond(['error' => 'Este sensor não está usando o provider de demonstração.'], 409);
        }

        // TODO: INTEGRAÇÃO IoT REAL / MQTT: selecionar aqui um provider de telemetria autenticada.
        // TODO: RECEBER DADOS DO ESP32 por uma API do sensor em vez de usar o simulador.
        $provider = new DemoTemperatureProvider(new SensorSimulator());
        $temperature = $provider->read($sensor);
        $reading = $database->recordReading($workspaceId, $sensorId, $temperature);
        $sensor = $database->applyAutomaticControl($workspaceId, $sensorId);
        tempicRespond(['reading' => $reading, 'sensor' => $sensor]);
    }

    // Um ciclo de leitura para todos os sensores de demonstração do espaço
    // (substitui N chamadas a "reading"). Aceita um cenário para um sensor:
    // "door" simula a porta aberta e soma um pico de calor à leitura.
    if ($action === 'tick' && $method === 'POST') {
        $input = tempicInput();
        $scenarioSensor = filter_var($input['sensor_id'] ?? null, FILTER_VALIDATE_INT) ?: null;
        $scenario = (string) ($input['scenario'] ?? '');
        if ($scenario !== '' && $scenario !== 'door') {
            tempicRespond(['error' => 'Cenário de simulação desconhecido.'], 422);
        }
        if ($scenario !== '' && !TempicAccess::can($role, 'simulation.run')) {
            tempicRespond(['error' => 'Somente o administrador pode usar o laboratório de falhas.', 'code' => 'forbidden'], 403);
        }

        $workspaces->touch($actorId);
        $simulator = new SensorSimulator();
        $provider = new DemoTemperatureProvider($simulator);
        $readings = [];
        foreach ($database->listSensors($workspaceId) as $sensor) {
            $sensorId = (int) $sensor['id'];
            $forced = $scenario === 'door' && $sensorId === $scenarioSensor;
            // Com várias pessoas com o painel aberto, cada sensor gera no máximo uma leitura a cada 4 s
            $fresh = strtotime($sensor['updated_at'] . ' UTC') > time() - 4;
            if ($sensor['source_mode'] !== 'demo' || ($fresh && !$forced)) {
                continue;
            }
            // TODO: INTEGRAÇÃO IoT REAL / MQTT: sensores "real" recebem leituras do ESP32, não daqui.
            $temperature = $provider->read($sensor);
            if ($forced) {
                $temperature = round($temperature + $simulator->doorOpeningSpike(), 1);
                $audit('simulation.door', "Simulou porta aberta em {$sensor['name']}.");
            }
            $readings[$sensorId] = $database->recordReading($workspaceId, $sensorId, $temperature);
            $database->applyAutomaticControl($workspaceId, $sensorId);
        }

        $openAlerts = array_filter($database->listAlerts($workspaceId), static fn (array $alert): bool => $alert['resolved_at'] === null);
        tempicRespond([
            'sensors' => $database->listSensors($workspaceId),
            'readings' => $readings,
            'openAlerts' => count($openAlerts),
            'serverTime' => gmdate('Y-m-d H:i:s'),
            // O painel compara com o que tem: se o admin mudou o papel, ele se atualiza sozinho
            'access' => ['role' => $role, 'workspaceId' => $workspaceId],
        ]);
    }

    // Cria um ambiente completo de demonstração (só para espaços sem sensores)
    if ($action === 'seed-demo' && $method === 'POST') {
        if ($database->listSensors($workspaceId)) {
            tempicRespond(['error' => 'Sua conta já tem sensores cadastrados.'], 409);
        }
        $demo = [
            'CAMERA' => ['name' => 'Câmara fria principal', 'location' => 'Depósito'],
            'FREEZER' => ['name' => 'Freezer de congelados', 'location' => 'Loja · corredor 3'],
            'VEHICLE' => ['name' => 'Baú refrigerado 02', 'location' => 'Rota Mococa–Campinas'],
            'FRIDGE' => ['name' => 'Geladeira de bebidas', 'location' => 'Loja · caixa'],
        ];
        $ids = [];
        foreach ($demo as $type => $sensor) {
            $ids[$type] = $database->createSensor($workspaceId, $sensor + ['type' => $type, 'wifi_ssid' => 'Loja-IoT']);
            $database->seedHistory($workspaceId, $ids[$type]);
        }

        // Inventário de exemplo: [sensor, nome, categoria, qtd, unidade, prateleira, validade em dias, guardado há (horas)]
        $items = [
            ['FREEZER', 'Peito de frango', 'carnes', 6, 'kg', 1, 150, 20],
            ['FREEZER', 'Sorvete de creme', 'congelados', 12, 'un', 2, 2, 18],
            ['FREEZER', 'Polpa de morango', 'hortifruti', 20, 'pct', 2, 200, 22],
            ['FREEZER', 'Tilápia em filé', 'peixes', 4, 'kg', 3, 90, 6],
            ['CAMERA', 'Queijo mussarela', 'laticinios', 8, 'kg', 1, 9, 23],
            ['CAMERA', 'Iogurte natural', 'laticinios', 24, 'un', 1, -1, 23],
            ['CAMERA', 'Alface crespa', 'hortifruti', 15, 'un', 2, 3, 12],
            ['CAMERA', 'Vacina antirrábica', 'saude', 2, 'cx', 3, 120, 10],
            ['VEHICLE', 'Carga de laticínios — pedido 4471', 'laticinios', 3, 'cx', 1, 8, 4],
            ['FRIDGE', 'Refrigerante lata', 'bebidas', 48, 'un', 1, 60, 21],
            ['FRIDGE', 'Água mineral', 'bebidas', 36, 'un', 2, 120, 21],
            ['FRIDGE', 'Marmitas do dia', 'preparados', 10, 'un', 3, 1, 5],
        ];
        $today = new DateTimeImmutable('today');
        foreach ($items as [$type, $name, $category, $quantity, $unit, $shelf, $days, $hoursAgo]) {
            $inventory->addItem($workspaceId, $actorId, $ids[$type], [
                'name' => $name, 'category' => $category, 'quantity' => $quantity, 'unit' => $unit, 'shelf' => $shelf,
                'expires_at' => $today->modify("{$days} days")->format('Y-m-d'), 'notes' => '',
            ], "-{$hoursAgo} hours");
        }

        if (!$database->listLights($workspaceId)) {
            $light = $database->createLight($workspaceId, 'Estacionamento frontal');
            $database->updateLightSchedule($workspaceId, (int) $light['id'], true, '18:00', '06:00');
            $database->createLight($workspaceId, 'Doca de carga');
        }
        $audit('sensor.seed', 'Criou o ambiente de demonstração (4 sensores, 12 itens, 2 circuitos).');
        tempicRespond([
            'sensors' => $database->listSensors($workspaceId),
            'lights' => $database->listLights($workspaceId),
            'message' => 'Ambiente de demonstração criado.',
        ], 201);
    }

    if ($action === 'sensor-delete' && $method === 'POST') {
        $sensorId = filter_var(tempicInput()['sensor_id'] ?? null, FILTER_VALIDATE_INT);
        $sensor = $sensorId ? $database->findSensor($workspaceId, $sensorId) : null;
        if (!$sensor || !$database->deleteSensor($workspaceId, $sensorId)) {
            tempicRespond(['error' => 'Sensor não encontrado.'], 404);
        }
        $audit('sensor.delete', "Removeu o sensor {$sensor['name']} e o inventário dele.");
        tempicRespond(['message' => 'Sensor removido.']);
    }

    if ($action === 'light-delete' && $method === 'POST') {
        $lightId = filter_var(tempicInput()['light_id'] ?? null, FILTER_VALIDATE_INT);
        $light = $lightId ? $database->findLight($workspaceId, $lightId) : null;
        if (!$light || !$database->deleteLight($workspaceId, $lightId)) {
            tempicRespond(['error' => 'Circuito de iluminação não encontrado.'], 404);
        }
        $audit('light.delete', "Removeu o circuito {$light['name']}.");
        tempicRespond(['message' => 'Circuito removido.']);
    }

    // Linha do tempo do espaço: alertas e acionamentos de todos os dispositivos
    if ($action === 'activity' && $method === 'GET') {
        tempicRespond([
            'alerts' => $database->listAlerts($workspaceId),
            'events' => $database->listEvents($workspaceId, null, 150),
        ]);
    }

    if ($action === 'target' && $method === 'POST') {
        $input = tempicInput();
        $sensorId = filter_var($input['sensor_id'] ?? null, FILTER_VALIDATE_INT);
        $target = filter_var($input['target_temperature'] ?? null, FILTER_VALIDATE_FLOAT);
        $current = $sensorId ? $database->findSensor($workspaceId, $sensorId) : null;
        if (!$current) {
            tempicRespond(['error' => 'Sensor não encontrado.'], 404);
        }
        // O alvo precisa estar dentro da faixa segura do próprio sensor (ex.: freezer -24 °C a -16 °C)
        $minimum = (float) $current['minimum_temperature'];
        $maximum = (float) $current['maximum_temperature'];
        if ($target === false || $target < $minimum || $target > $maximum) {
            $range = str_replace('.', ',', sprintf('%g °C a %g °C', $minimum, $maximum));
            tempicRespond(['error' => "A temperatura alvo deve ficar entre {$range}."], 422);
        }
        $sensor = $database->updateTarget($workspaceId, $sensorId, round((float) $target, 1));
        if (!$sensor) {
            tempicRespond(['error' => 'Sensor não encontrado.'], 404);
        }
        $audit('sensor.target', sprintf('Alterou o alvo de %s de %s °C para %s °C.', $current['name'],
            str_replace('.', ',', (string) (float) $current['target_temperature']), str_replace('.', ',', (string) round((float) $target, 1))));
        tempicRespond(['sensor' => $sensor, 'message' => 'Temperatura alvo atualizada.']);
    }

    if ($action === 'history' && $method === 'GET') {
        $sensorId = filter_var($_GET['sensor_id'] ?? null, FILTER_VALIDATE_INT);
        $range = (string) ($_GET['range'] ?? '7d');
        if (!$sensorId || !in_array($range, ['1h', '24h', '7d', '30d'], true)) {
            tempicRespond(['error' => 'Sensor ou período inválido.'], 422);
        }
        $points = filter_var($_GET['points'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 2, 'max_range' => 2000]]);
        $history = $database->history($workspaceId, $sensorId, $range, $points ?: null);
        if (!$history) {
            tempicRespond(['error' => 'Sensor não encontrado.'], 404);
        }
        tempicRespond($history);
    }

    if ($action === 'alerts' && $method === 'GET') {
        $sensorId = isset($_GET['sensor_id']) ? filter_var($_GET['sensor_id'], FILTER_VALIDATE_INT) : null;
        tempicRespond(['alerts' => $database->listAlerts($workspaceId, $sensorId ?: null)]);
    }

    if ($action === 'alert-ack' && $method === 'POST') {
        $alertId = filter_var(tempicInput()['alert_id'] ?? null, FILTER_VALIDATE_INT);
        if (!$alertId || !$database->acknowledgeAlert($workspaceId, $alertId, $actorId)) {
            tempicRespond(['error' => 'Alerta não encontrado ou já marcado como ciente.'], 404);
        }
        $audit('alert.ack', "Ficou ciente do alerta #{$alertId}.");
        tempicRespond(['message' => 'Você está acompanhando este alerta.']);
    }

    // RF02 — liga/desliga a refrigeração do equipamento monitorado
    if ($action === 'equipment' && $method === 'POST') {
        $input = tempicInput();
        $sensorId = filter_var($input['sensor_id'] ?? null, FILTER_VALIDATE_INT);
        $on = filter_var($input['on'] ?? null, FILTER_VALIDATE_BOOL, FILTER_NULL_ON_FAILURE);
        if (!$sensorId || $on === null) {
            tempicRespond(['error' => 'Informe o sensor e o estado do equipamento.'], 422);
        }
        // TODO: INTEGRAÇÃO IoT REAL: publicar o comando no tópico MQTT do relé do ESP32.
        $sensor = $database->setEquipment($workspaceId, $sensorId, $on, 'manual');
        if (!$sensor) {
            tempicRespond(['error' => 'Sensor não encontrado.'], 404);
        }
        $audit('equipment.toggle', ($on ? 'Ligou' : 'Desligou') . " a refrigeração de {$sensor['name']}.");
        tempicRespond(['sensor' => $sensor, 'message' => $on ? 'Refrigeração ligada.' : 'Refrigeração desligada.']);
    }

    // Controle automático (objetivo geral do TCC) ou manual
    if ($action === 'control-mode' && $method === 'POST') {
        $input = tempicInput();
        $sensorId = filter_var($input['sensor_id'] ?? null, FILTER_VALIDATE_INT);
        $mode = (string) ($input['mode'] ?? '');
        $sensor = $sensorId ? $database->setControlMode($workspaceId, $sensorId, $mode) : null;
        if (!$sensor) {
            tempicRespond(['error' => 'Sensor ou modo de controle inválido.'], 422);
        }
        $audit('equipment.mode', "Colocou {$sensor['name']} em controle " . ($mode === 'auto' ? 'automático.' : 'manual.'));
        tempicRespond(['sensor' => $sensor, 'message' => $mode === 'auto' ? 'Controle automático ativado.' : 'Controle manual ativado.']);
    }

    // RF03 — iluminação do estacionamento
    if ($action === 'lights' && $method === 'GET') {
        tempicRespond(['lights' => $database->listLights($workspaceId)]);
    }

    if ($action === 'light' && $method === 'POST') {
        $name = trim((string) (tempicInput()['name'] ?? ''));
        if (mb_strlen($name) < 2 || mb_strlen($name) > 80) {
            tempicRespond(['error' => 'Dê um nome ao circuito de iluminação (2 a 80 caracteres).'], 422);
        }
        $light = $database->createLight($workspaceId, $name);
        $audit('light.create', "Adicionou o circuito {$name}.");
        tempicRespond(['light' => $light, 'message' => 'Iluminação adicionada.'], 201);
    }

    if ($action === 'light-toggle' && $method === 'POST') {
        $input = tempicInput();
        $lightId = filter_var($input['light_id'] ?? null, FILTER_VALIDATE_INT);
        $on = filter_var($input['on'] ?? null, FILTER_VALIDATE_BOOL, FILTER_NULL_ON_FAILURE);
        $light = ($lightId && $on !== null) ? $database->setLight($workspaceId, $lightId, $on, 'manual') : null;
        if (!$light) {
            tempicRespond(['error' => 'Circuito de iluminação não encontrado.'], 404);
        }
        $audit('light.toggle', ($on ? 'Acendeu ' : 'Apagou ') . $light['name'] . '.');
        tempicRespond(['light' => $light]);
    }

    if ($action === 'light-schedule' && $method === 'POST') {
        $input = tempicInput();
        $lightId = filter_var($input['light_id'] ?? null, FILTER_VALIDATE_INT);
        $enabled = filter_var($input['enabled'] ?? null, FILTER_VALIDATE_BOOL, FILTER_NULL_ON_FAILURE);
        $onTime = (string) ($input['on_time'] ?? '');
        $offTime = (string) ($input['off_time'] ?? '');
        $validTime = static fn (string $time): bool => (bool) preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $time);
        if (!$lightId || $enabled === null || !$validTime($onTime) || !$validTime($offTime) || $onTime === $offTime) {
            tempicRespond(['error' => 'Informe horários válidos e diferentes para acender e apagar.'], 422);
        }
        $light = $database->updateLightSchedule($workspaceId, $lightId, $enabled, $onTime, $offTime);
        if (!$light) {
            tempicRespond(['error' => 'Circuito de iluminação não encontrado.'], 404);
        }
        $audit('light.schedule', $enabled ? "Programou {$light['name']} das {$onTime} às {$offTime}." : "Desativou a programação de {$light['name']}.");
        tempicRespond(['light' => $light, 'message' => $enabled ? 'Programação salva.' : 'Programação desativada.']);
    }

    // Registro de acionamentos (manual, automático e programado)
    if ($action === 'events' && $method === 'GET') {
        $sensorId = isset($_GET['sensor_id']) ? filter_var($_GET['sensor_id'], FILTER_VALIDATE_INT) : null;
        tempicRespond(['events' => $database->listEvents($workspaceId, $sensorId ?: null)]);
    }

    // ------------------------------------------------------------------
    // Inventário: o que está guardado em cada equipamento
    // ------------------------------------------------------------------

    if ($action === 'items' && $method === 'GET') {
        $sensorId = isset($_GET['sensor_id']) ? filter_var($_GET['sensor_id'], FILTER_VALIDATE_INT) : null;
        $items = $inventory->listItems($workspaceId, $sensorId ?: null);
        tempicRespond(['items' => $items, 'summary' => $inventory->summarize($items)]);
    }

    if ($action === 'item' && $method === 'POST') {
        $input = tempicInput();
        $sensorId = filter_var($input['sensor_id'] ?? null, FILTER_VALIDATE_INT);
        $sensor = $sensorId ? $database->findSensor($workspaceId, $sensorId) : null;
        if (!$sensor) {
            tempicRespond(['error' => 'Escolha em qual equipamento o item foi guardado.'], 422);
        }
        // Sem validade informada, usa a sugerida para a categoria neste tipo de equipamento
        if (!array_key_exists('expires_at', $input)) {
            $input['expires_at'] = InventoryCatalog::suggestedExpiry((string) ($input['category'] ?? ''), $sensor, new DateTimeImmutable('today'));
        }
        $data = tempicItemInput($input);
        $shelf = filter_var($input['shelf'] ?? 1, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => InventoryCatalog::MAX_SHELVES]]);
        if ($shelf === false) {
            tempicRespond(['error' => 'Prateleira inválida.'], 422);
        }

        // Categoria incompatível com o equipamento (ex.: vacina no freezer) exige confirmação explícita
        $compatibility = InventoryCatalog::compatibility($data['category'], $sensor);
        $acknowledged = filter_var($input['acknowledge_risk'] ?? false, FILTER_VALIDATE_BOOL);
        if ($compatibility['level'] === 'block' && !$acknowledged) {
            tempicRespond(['error' => $compatibility['message'], 'code' => 'incompatible'], 409);
        }

        $item = $inventory->addItem($workspaceId, $actorId, $sensorId, $data + ['shelf' => $shelf]);
        $audit('item.store', sprintf('Guardou %s de %s em %s (prateleira %d)%s.', tempicQuantityLabel($data['quantity'], $data['unit']),
            $data['name'], $sensor['name'], $shelf, $compatibility['level'] === 'block' ? ' apesar do aviso de incompatibilidade' : ''));
        tempicRespond(['item' => $item, 'message' => "{$data['name']} guardado em {$sensor['name']}."], 201);
    }

    if ($action === 'item-move' && $method === 'POST') {
        $input = tempicInput();
        $itemId = filter_var($input['item_id'] ?? null, FILTER_VALIDATE_INT);
        $sensorId = filter_var($input['sensor_id'] ?? null, FILTER_VALIDATE_INT);
        $shelf = filter_var($input['shelf'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => InventoryCatalog::MAX_SHELVES]]);
        $before = $itemId ? $inventory->findItem($workspaceId, $itemId) : null;
        $target = $sensorId ? $database->findSensor($workspaceId, $sensorId) : null;
        if (!$before || !$target || $shelf === false) {
            tempicRespond(['error' => 'Item, equipamento ou prateleira inválidos.'], 422);
        }
        $compatibility = InventoryCatalog::compatibility($before['category'], $target);
        if ((int) $before['sensor_id'] !== $sensorId && $compatibility['level'] === 'block'
            && !filter_var($input['acknowledge_risk'] ?? false, FILTER_VALIDATE_BOOL)) {
            tempicRespond(['error' => $compatibility['message'], 'code' => 'incompatible'], 409);
        }
        $item = $inventory->moveItem($workspaceId, $itemId, $sensorId, $shelf);
        $audit('item.move', (int) $before['sensor_id'] === $sensorId
            ? "Moveu {$before['name']} para a prateleira {$shelf}."
            : "Transferiu {$before['name']} de {$before['sensor_name']} para {$target['name']}.");
        tempicRespond(['item' => $item, 'message' => 'Item movido.']);
    }

    if ($action === 'item-withdraw' && $method === 'POST') {
        $input = tempicInput();
        $itemId = filter_var($input['item_id'] ?? null, FILTER_VALIDATE_INT);
        $reason = (string) ($input['reason'] ?? 'consumido');
        $quantity = isset($input['quantity']) && $input['quantity'] !== null ? filter_var($input['quantity'], FILTER_VALIDATE_FLOAT) : null;
        if (!$itemId || !in_array($reason, InventoryCatalog::REMOVAL_REASONS, true) || $quantity === false || ($quantity !== null && $quantity <= 0)) {
            tempicRespond(['error' => 'Informe o item, a quantidade e o motivo da retirada.'], 422);
        }
        $result = $inventory->withdraw($workspaceId, $actorId, $itemId, $quantity, $reason);
        if (!$result) {
            tempicRespond(['error' => 'Item não encontrado.'], 404);
        }
        $item = $result['item'];
        $audit('item.withdraw', sprintf('Retirou %s de %s de %s (%s).', tempicQuantityLabel($result['quantity'], $item['unit']), $item['name'], $item['sensor_name'], $reason));
        tempicRespond($result + ['message' => $result['removed'] ? "{$item['name']} saiu do inventário." : 'Retirada registrada.']);
    }

    if ($action === 'item-update' && $method === 'POST') {
        $input = tempicInput();
        $itemId = filter_var($input['item_id'] ?? null, FILTER_VALIDATE_INT);
        $item = $itemId ? $inventory->updateItem($workspaceId, $itemId, tempicItemInput($input)) : null;
        if (!$item) {
            tempicRespond(['error' => 'Item não encontrado.'], 404);
        }
        $audit('item.update', "Editou o registro de {$item['name']} em {$item['sensor_name']}.");
        tempicRespond(['item' => $item, 'message' => 'Item atualizado.']);
    }

    if ($action === 'item-delete' && $method === 'POST') {
        $itemId = filter_var(tempicInput()['item_id'] ?? null, FILTER_VALIDATE_INT);
        $item = $itemId ? $inventory->findItem($workspaceId, $itemId) : null;
        if (!$item || !$inventory->deleteItem($workspaceId, $itemId)) {
            tempicRespond(['error' => 'Item não encontrado.'], 404);
        }
        $audit('item.delete', "Apagou o registro de {$item['name']} ({$item['sensor_name']}).");
        tempicRespond(['message' => 'Registro apagado.']);
    }

    // ------------------------------------------------------------------
    // Administração: equipe, convites e auditoria
    // ------------------------------------------------------------------

    if ($action === 'team' && $method === 'GET') {
        tempicRespond([
            'members' => $workspaces->listMembers($workspaceId),
            'invites' => $workspaces->listInvites($workspaceId),
            'roles' => TempicAccess::ROLE_LABELS,
            'permissions' => TempicAccess::PERMISSIONS,
            'matrix' => TempicAccess::matrix(),
        ]);
    }

    if ($action === 'invite' && $method === 'POST') {
        $input = tempicInput();
        $inviteRole = (string) ($input['role'] ?? TempicAccess::ROLE_MEMBER);
        $days = filter_var($input['days'] ?? 7, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 30]]);
        if (!TempicAccess::isRole($inviteRole) || $days === false) {
            tempicRespond(['error' => 'Escolha o papel e a validade do convite (1 a 30 dias).'], 422);
        }
        $invite = $workspaces->createInvite($workspaceId, $actorId, $inviteRole, $days);
        $audit('team.invite', "Gerou o convite {$invite['code']} para " . TempicAccess::ROLE_LABELS[$inviteRole] . " (válido por {$days} " . ($days === 1 ? 'dia' : 'dias') . ').');
        tempicRespond(['invite' => $invite, 'message' => 'Convite criado.'], 201);
    }

    if ($action === 'invite-revoke' && $method === 'POST') {
        $inviteId = filter_var(tempicInput()['invite_id'] ?? null, FILTER_VALIDATE_INT);
        if (!$inviteId || !$workspaces->revokeInvite($workspaceId, $inviteId)) {
            tempicRespond(['error' => 'Convite não encontrado.'], 404);
        }
        $audit('team.revoke', "Revogou o convite #{$inviteId}.");
        tempicRespond(['message' => 'Convite revogado.']);
    }

    if (in_array($action, ['member-role', 'member-remove'], true) && $method === 'POST') {
        $input = tempicInput();
        $memberId = filter_var($input['user_id'] ?? null, FILTER_VALIDATE_INT);
        if ($memberId === $actorId) {
            tempicRespond(['error' => 'Você não pode alterar o seu próprio acesso.'], 422);
        }
        $member = null;
        foreach ($workspaces->listMembers($workspaceId) as $candidate) {
            if ((int) $candidate['id'] === $memberId) {
                $member = $candidate;
            }
        }
        if (!$member || (int) $member['is_owner'] === 1) {
            tempicRespond(['error' => 'O dono do espaço não pode ser alterado nem removido.'], 422);
        }

        if ($action === 'member-role') {
            $newRole = (string) ($input['role'] ?? '');
            if (!$workspaces->setRole($workspaceId, $memberId, $newRole)) {
                tempicRespond(['error' => 'Papel inválido.'], 422);
            }
            $audit('team.role', "Mudou {$member['name']} para " . TempicAccess::ROLE_LABELS[$newRole] . '.');
            tempicRespond(['message' => "{$member['name']} agora é " . TempicAccess::ROLE_LABELS[$newRole] . '.']);
        }

        $workspaces->removeMember($workspaceId, $memberId);
        $audit('team.remove', "Removeu {$member['name']} da equipe.");
        tempicRespond(['message' => "{$member['name']} saiu da equipe."]);
    }

    if ($action === 'audit' && $method === 'GET') {
        tempicRespond(['entries' => $workspaces->listAudit($workspaceId, 200)]);
    }

    tempicRespond(['error' => 'Ação não encontrada.'], 404);
} catch (TempicStorageException $error) {
    error_log('TempIC API: ' . $error->getMessage());
    tempicRespond(['error' => $error->getMessage()], 503);
} catch (Throwable $error) {
    error_log('TempIC API: ' . $error->getMessage());
    tempicRespond(['error' => 'Não foi possível concluir a solicitação. Verifique a configuração do armazenamento TempIC.'], 500);
}
