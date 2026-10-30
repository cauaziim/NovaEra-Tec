<?php
declare(strict_types=1);

use NovaEra\Tempic\SensorSimulator;
use NovaEra\Tempic\DemoTemperatureProvider;
use NovaEra\Tempic\TempicDatabase;

require_once __DIR__ . '/tempic-database.php';
require_once __DIR__ . '/tempic-core.php';

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

// A programação da iluminação usa o horário local do estabelecimento
date_default_timezone_set(getenv('TEMPIC_TIMEZONE') ?: 'America/Sao_Paulo');

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, private');
header('X-Content-Type-Options: nosniff');

function tempicRespond(array $payload, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

function tempicInput(): array
{
    $input = json_decode(file_get_contents('php://input') ?: '', true);
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

function tempicValidateEmail(string $email): bool
{
    return strlen($email) <= 254 && filter_var($email, FILTER_VALIDATE_EMAIL) !== false;
}

try {
    $database = new TempicDatabase();
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    $action = (string) ($_GET['action'] ?? '');

    if ($action === 'bootstrap' && $method === 'GET') {
        $_SESSION['tempic_csrf'] ??= bin2hex(random_bytes(32));
        $userId = (int) ($_SESSION['tempic_user_id'] ?? 0);
        $sensors = [];
        if ($userId > 0) {
            $database->markStaleSensorsOffline($userId);
            $sensors = $database->listSensors($userId);
        }
        tempicRespond([
            'authenticated' => $userId > 0,
            'user' => $userId > 0 ? tempicUserPayload() : null,
            'sensors' => $sensors,
            'csrfToken' => $_SESSION['tempic_csrf'],
            'mode' => 'demo',
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

            try {
                $userId = $database->createUser($name, $email, password_hash($password, PASSWORD_DEFAULT), $age);
            } catch (PDOException $error) {
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
            tempicRespond(['message' => 'Conta criada com sucesso!', 'user' => tempicUserPayload(), 'csrfToken' => $_SESSION['tempic_csrf']], 201);
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
        tempicRespond(['message' => 'Login realizado.', 'user' => tempicUserPayload(), 'csrfToken' => $_SESSION['tempic_csrf']]);
    }

    if ($method !== 'GET' && $method !== 'POST') {
        tempicRespond(['error' => 'Método não permitido.'], 405);
    }

    $userId = tempicRequireUser();
    if ($method === 'POST') {
        tempicRequireCsrf();
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
        $database->markStaleSensorsOffline($userId);
        tempicRespond(['sensors' => $database->listSensors($userId)]);
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
        $sensorId = $database->createSensor($userId, [
            'name' => $name,
            'type' => $type,
            'location' => $location,
            'wifi_ssid' => $wifiSsid,
        ]);
        if (filter_var($input['seed_history'] ?? false, FILTER_VALIDATE_BOOL)) {
            $database->seedHistory($userId, $sensorId);
        }
        tempicRespond(['sensor' => $database->findSensor($userId, $sensorId), 'message' => 'Sensor salvo no modo demonstração.'], 201);
    }

    if ($action === 'reading' && $method === 'POST') {
        $sensorId = filter_var(tempicInput()['sensor_id'] ?? null, FILTER_VALIDATE_INT);
        if (!$sensorId || !$database->findSensor($userId, $sensorId)) {
            tempicRespond(['error' => 'Sensor não encontrado.'], 404);
        }

        $sensor = $database->findSensor($userId, $sensorId);
        if ($sensor['source_mode'] !== 'demo') {
            tempicRespond(['error' => 'Este sensor não está usando o provider de demonstração.'], 409);
        }

        // TODO: INTEGRAÇÃO IoT REAL / MQTT: selecionar aqui um provider de telemetria autenticada.
        // TODO: RECEBER DADOS DO ESP32 por uma API do sensor em vez de usar o simulador.
        $provider = new DemoTemperatureProvider(new SensorSimulator());
        $temperature = $provider->read($sensor);
        $reading = $database->recordReading($userId, $sensorId, $temperature);
        $sensor = $database->applyAutomaticControl($userId, $sensorId);
        tempicRespond(['reading' => $reading, 'sensor' => $sensor]);
    }

    // Um ciclo de leitura para todos os sensores de demonstração do usuário
    // (substitui N chamadas a "reading"). Aceita um cenário para um sensor:
    // "door" simula a porta aberta e soma um pico de calor à leitura.
    if ($action === 'tick' && $method === 'POST') {
        $input = tempicInput();
        $scenarioSensor = filter_var($input['sensor_id'] ?? null, FILTER_VALIDATE_INT) ?: null;
        $scenario = (string) ($input['scenario'] ?? '');
        if ($scenario !== '' && $scenario !== 'door') {
            tempicRespond(['error' => 'Cenário de simulação desconhecido.'], 422);
        }

        $simulator = new SensorSimulator();
        $provider = new DemoTemperatureProvider($simulator);
        $readings = [];
        foreach ($database->listSensors($userId) as $sensor) {
            if ($sensor['source_mode'] !== 'demo') {
                continue;
            }
            $sensorId = (int) $sensor['id'];
            // TODO: INTEGRAÇÃO IoT REAL / MQTT: sensores "real" recebem leituras do ESP32, não daqui.
            $temperature = $provider->read($sensor);
            if ($scenario === 'door' && $sensorId === $scenarioSensor) {
                $temperature = round($temperature + $simulator->doorOpeningSpike(), 1);
            }
            $readings[$sensorId] = $database->recordReading($userId, $sensorId, $temperature);
            $database->applyAutomaticControl($userId, $sensorId);
        }

        $openAlerts = array_filter($database->listAlerts($userId), static fn (array $alert): bool => $alert['resolved_at'] === null);
        tempicRespond([
            'sensors' => $database->listSensors($userId),
            'readings' => $readings,
            'openAlerts' => count($openAlerts),
            'serverTime' => gmdate('Y-m-d H:i:s'),
        ]);
    }

    // Cria um ambiente completo de demonstração (só para contas sem sensores)
    if ($action === 'seed-demo' && $method === 'POST') {
        if ($database->listSensors($userId)) {
            tempicRespond(['error' => 'Sua conta já tem sensores cadastrados.'], 409);
        }
        $demo = [
            ['name' => 'Câmara fria principal', 'type' => 'CAMERA', 'location' => 'Depósito'],
            ['name' => 'Freezer de congelados', 'type' => 'FREEZER', 'location' => 'Loja · corredor 3'],
            ['name' => 'Baú refrigerado 02', 'type' => 'VEHICLE', 'location' => 'Rota Mococa–Campinas'],
            ['name' => 'Geladeira de bebidas', 'type' => 'FRIDGE', 'location' => 'Loja · caixa'],
        ];
        foreach ($demo as $sensor) {
            $sensorId = $database->createSensor($userId, $sensor + ['wifi_ssid' => 'Loja-IoT']);
            $database->seedHistory($userId, $sensorId);
        }
        if (!$database->listLights($userId)) {
            $light = $database->createLight($userId, 'Estacionamento frontal');
            $database->updateLightSchedule($userId, (int) $light['id'], true, '18:00', '06:00');
            $database->createLight($userId, 'Doca de carga');
        }
        tempicRespond([
            'sensors' => $database->listSensors($userId),
            'lights' => $database->listLights($userId),
            'message' => 'Ambiente de demonstração criado.',
        ], 201);
    }

    if ($action === 'sensor-delete' && $method === 'POST') {
        $sensorId = filter_var(tempicInput()['sensor_id'] ?? null, FILTER_VALIDATE_INT);
        if (!$sensorId || !$database->deleteSensor($userId, $sensorId)) {
            tempicRespond(['error' => 'Sensor não encontrado.'], 404);
        }
        tempicRespond(['message' => 'Sensor removido.']);
    }

    if ($action === 'light-delete' && $method === 'POST') {
        $lightId = filter_var(tempicInput()['light_id'] ?? null, FILTER_VALIDATE_INT);
        if (!$lightId || !$database->deleteLight($userId, $lightId)) {
            tempicRespond(['error' => 'Circuito de iluminação não encontrado.'], 404);
        }
        tempicRespond(['message' => 'Circuito removido.']);
    }

    // Linha do tempo da conta: alertas e acionamentos de todos os dispositivos
    if ($action === 'activity' && $method === 'GET') {
        tempicRespond([
            'alerts' => $database->listAlerts($userId),
            'events' => $database->listEvents($userId, null, 150),
        ]);
    }

    if ($action === 'target' && $method === 'POST') {
        $input = tempicInput();
        $sensorId = filter_var($input['sensor_id'] ?? null, FILTER_VALIDATE_INT);
        $target = filter_var($input['target_temperature'] ?? null, FILTER_VALIDATE_FLOAT);
        $current = $sensorId ? $database->findSensor($userId, $sensorId) : null;
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
        $sensor = $database->updateTarget($userId, $sensorId, round((float) $target, 1));
        if (!$sensor) {
            tempicRespond(['error' => 'Sensor não encontrado.'], 404);
        }
        tempicRespond(['sensor' => $sensor, 'message' => 'Temperatura alvo atualizada.']);
    }

    if ($action === 'history' && $method === 'GET') {
        $sensorId = filter_var($_GET['sensor_id'] ?? null, FILTER_VALIDATE_INT);
        $range = (string) ($_GET['range'] ?? '7d');
        if (!$sensorId || !in_array($range, ['1h', '24h', '7d', '30d'], true)) {
            tempicRespond(['error' => 'Sensor ou período inválido.'], 422);
        }
        $points = filter_var($_GET['points'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 2, 'max_range' => 2000]]);
        $history = $database->history($userId, $sensorId, $range, $points ?: null);
        if (!$history) {
            tempicRespond(['error' => 'Sensor não encontrado.'], 404);
        }
        tempicRespond($history);
    }

    if ($action === 'alerts' && $method === 'GET') {
        $sensorId = isset($_GET['sensor_id']) ? filter_var($_GET['sensor_id'], FILTER_VALIDATE_INT) : null;
        tempicRespond(['alerts' => $database->listAlerts($userId, $sensorId ?: null)]);
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
        $sensor = $database->setEquipment($userId, $sensorId, $on, 'manual');
        if (!$sensor) {
            tempicRespond(['error' => 'Sensor não encontrado.'], 404);
        }
        tempicRespond(['sensor' => $sensor, 'message' => $on ? 'Refrigeração ligada.' : 'Refrigeração desligada.']);
    }

    // Controle automático (objetivo geral do TCC) ou manual
    if ($action === 'control-mode' && $method === 'POST') {
        $input = tempicInput();
        $sensorId = filter_var($input['sensor_id'] ?? null, FILTER_VALIDATE_INT);
        $mode = (string) ($input['mode'] ?? '');
        $sensor = $sensorId ? $database->setControlMode($userId, $sensorId, $mode) : null;
        if (!$sensor) {
            tempicRespond(['error' => 'Sensor ou modo de controle inválido.'], 422);
        }
        tempicRespond(['sensor' => $sensor, 'message' => $mode === 'auto' ? 'Controle automático ativado.' : 'Controle manual ativado.']);
    }

    // RF03 — iluminação do estacionamento
    if ($action === 'lights' && $method === 'GET') {
        tempicRespond(['lights' => $database->listLights($userId)]);
    }

    if ($action === 'light' && $method === 'POST') {
        $name = trim((string) (tempicInput()['name'] ?? ''));
        if (mb_strlen($name) < 2 || mb_strlen($name) > 80) {
            tempicRespond(['error' => 'Dê um nome ao circuito de iluminação (2 a 80 caracteres).'], 422);
        }
        tempicRespond(['light' => $database->createLight($userId, $name), 'message' => 'Iluminação adicionada.'], 201);
    }

    if ($action === 'light-toggle' && $method === 'POST') {
        $input = tempicInput();
        $lightId = filter_var($input['light_id'] ?? null, FILTER_VALIDATE_INT);
        $on = filter_var($input['on'] ?? null, FILTER_VALIDATE_BOOL, FILTER_NULL_ON_FAILURE);
        $light = ($lightId && $on !== null) ? $database->setLight($userId, $lightId, $on, 'manual') : null;
        if (!$light) {
            tempicRespond(['error' => 'Circuito de iluminação não encontrado.'], 404);
        }
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
        $light = $database->updateLightSchedule($userId, $lightId, $enabled, $onTime, $offTime);
        if (!$light) {
            tempicRespond(['error' => 'Circuito de iluminação não encontrado.'], 404);
        }
        tempicRespond(['light' => $light, 'message' => $enabled ? 'Programação salva.' : 'Programação desativada.']);
    }

    // Registro de acionamentos (manual, automático e programado)
    if ($action === 'events' && $method === 'GET') {
        $sensorId = isset($_GET['sensor_id']) ? filter_var($_GET['sensor_id'], FILTER_VALIDATE_INT) : null;
        tempicRespond(['events' => $database->listEvents($userId, $sensorId ?: null)]);
    }

    tempicRespond(['error' => 'Ação não encontrada.'], 404);
} catch (Throwable $error) {
    error_log('TempIC API: ' . $error->getMessage());
    tempicRespond(['error' => 'Não foi possível concluir a solicitação. Verifique a configuração do armazenamento TempIC.'], 500);
}