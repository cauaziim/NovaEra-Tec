<?php
declare(strict_types=1);

// Sessão da área do cliente: mesmo nome e parâmetros de cookie usados em contato-api.php.
function novaeraStartSession(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }

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
}

function novaeraCurrentUser(): ?array
{
    novaeraStartSession();

    if (empty($_SESSION['usuario_id'])) {
        return null;
    }

    return [
        'id' => (int) $_SESSION['usuario_id'],
        'nome' => (string) ($_SESSION['usuario_nome'] ?? ''),
        'email' => (string) ($_SESSION['usuario_email'] ?? ''),
    ];
}

function novaeraRedirect(string $location): never
{
    header('Location: ' . $location);
    exit();
}
