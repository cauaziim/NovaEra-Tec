<?php
declare(strict_types=1);

require_once __DIR__ . '/sessao.php';

// Só aceita POST: um link externo não consegue deslogar o usuário.
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    novaeraRedirect('area-cliente.php');
}

novaeraStartSession();
$_SESSION = [];

$params = session_get_cookie_params();
setcookie(session_name(), '', [
    'expires' => time() - 3600,
    'path' => $params['path'],
    'secure' => $params['secure'],
    'httponly' => $params['httponly'],
    'samesite' => $params['samesite'] ?: 'Lax',
]);
session_destroy();

novaeraRedirect('../html/login.html?sucesso=saida');
