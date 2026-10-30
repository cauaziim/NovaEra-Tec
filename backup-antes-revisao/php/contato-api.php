<?php
declare(strict_types=1);

use NovaEra\Contato\ContactInbox;

require_once __DIR__ . '/contato-database.php';

ini_set('session.use_strict_mode', '1');
session_name('NOVAERASESSID');
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
    'httponly' => true,
    'samesite' => 'Lax',
]);
session_start();

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, private');
header('X-Content-Type-Options: nosniff');

const CONTACT_COOLDOWN_SECONDS = 30;

function contactRespond(array $payload, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    header('Allow: POST');
    contactRespond(['error' => 'Método não permitido.'], 405);
}

$input = json_decode(file_get_contents('php://input') ?: '', true);
if (!is_array($input)) {
    contactRespond(['error' => 'Requisição inválida.'], 400);
}

// Campo "armadilha" invisível para pessoas: se vier preenchido, é robô.
// Respondemos como sucesso para não dar pistas, mas nada é salvo.
if (trim((string) ($input['website'] ?? '')) !== '') {
    contactRespond(['ok' => true, 'message' => 'Mensagem recebida! Nossa equipe responderá em breve.'], 201);
}

$errors = ContactInbox::validate($input);
if ($errors) {
    contactRespond(['error' => 'Revise os campos destacados.', 'fields' => $errors], 422);
}

$lastSent = (int) ($_SESSION['contact_last_sent'] ?? 0);
$wait = CONTACT_COOLDOWN_SECONDS - (time() - $lastSent);
if ($wait > 0) {
    header('Retry-After: ' . $wait);
    contactRespond(['error' => "Você acabou de enviar uma mensagem. Aguarde {$wait} segundos para enviar outra."], 429);
}

try {
    $inbox = new ContactInbox();
    $id = $inbox->save($input);
    $_SESSION['contact_last_sent'] = time();
    contactRespond([
        'ok' => true,
        'id' => $id,
        'message' => 'Mensagem recebida! Nossa equipe responderá no e-mail informado.',
    ], 201);
} catch (Throwable $exception) {
    error_log('NovaEra contato: ' . $exception->getMessage());
    contactRespond(['error' => 'Não foi possível registrar sua mensagem agora.'], 503);
}
