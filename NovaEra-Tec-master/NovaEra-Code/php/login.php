<?php
declare(strict_types=1);

require_once __DIR__ . '/sessao.php';

const LOGIN_MAX_FAILURES = 5;
const LOGIN_WINDOW_SECONDS = 600;

// Tentativas por IP gravadas no diretório temporário: valem mesmo se o
// visitante descartar o cookie de sessão.
function loginAttemptsFile(): string
{
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'desconhecido';
    return sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'novaera-login-' . hash('sha256', $ip) . '.json';
}

function loginRecentFailures(): array
{
    $file = loginAttemptsFile();
    $attempts = is_file($file) ? json_decode((string) file_get_contents($file), true) : [];
    $limit = time() - LOGIN_WINDOW_SECONDS;
    return array_values(array_filter(is_array($attempts) ? $attempts : [], fn ($time) => is_int($time) && $time > $limit));
}

function loginFail(array $failures): never
{
    $failures[] = time();
    file_put_contents(loginAttemptsFile(), json_encode($failures), LOCK_EX);
    novaeraRedirect('../html/login.html?erro=1');
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    novaeraRedirect('../html/login.html');
}

novaeraStartSession();

$failures = loginRecentFailures();
if (count($failures) >= LOGIN_MAX_FAILURES) {
    novaeraRedirect('../html/login.html?erro=limite');
}

$email = trim((string) ($_POST['email'] ?? ''));
$senha = (string) ($_POST['password'] ?? '');

if ($email === '' || $senha === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    loginFail($failures);
}

require_once __DIR__ . '/conexao.php';

$sql = $conn->prepare('SELECT id, nome, email, senha FROM usuarios WHERE email = ? LIMIT 1');
$sql->bind_param('s', $email);
$sql->execute();
$usuario = $sql->get_result()->fetch_assoc();

// Mesmo sem usuário, roda password_verify para o tempo de resposta não
// revelar quais e-mails estão cadastrados.
$hash = $usuario['senha'] ?? '$2y$12$fxInfSWJhllnaIkHSjAc6uN5QfOtHdk8Z.EqeoXZvLD/yuSiXHNHm';
if (!password_verify($senha, $hash) || !$usuario) {
    loginFail($failures);
}

if (password_needs_rehash($usuario['senha'], PASSWORD_DEFAULT)) {
    $novoHash = password_hash($senha, PASSWORD_DEFAULT);
    $update = $conn->prepare('UPDATE usuarios SET senha = ? WHERE id = ?');
    $update->bind_param('si', $novoHash, $usuario['id']);
    $update->execute();
}

@unlink(loginAttemptsFile());

// Novo ID de sessão a cada login evita fixação de sessão
session_regenerate_id(true);
$_SESSION['usuario_id'] = (int) $usuario['id'];
$_SESSION['usuario_nome'] = $usuario['nome'];
$_SESSION['usuario_email'] = $usuario['email'];

novaeraRedirect('area-cliente.php');
