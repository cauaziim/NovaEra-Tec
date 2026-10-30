<?php
declare(strict_types=1);

require_once __DIR__ . '/sessao.php';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    novaeraRedirect('../html/cadastro.html');
}

$nome = trim((string) ($_POST['nome'] ?? ''));
$email = trim((string) ($_POST['email'] ?? ''));
$senhaDigitada = (string) ($_POST['senha'] ?? '');

if ($nome === '' || $email === '' || $senhaDigitada === '') {
    novaeraRedirect('../html/cadastro.html?erro=campos');
}

$tamanhoNome = mb_strlen($nome);
if ($tamanhoNome < 2 || $tamanhoNome > 120) {
    novaeraRedirect('../html/cadastro.html?erro=nome');
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 254) {
    novaeraRedirect('../html/cadastro.html?erro=email');
}

// bcrypt considera só os primeiros 72 bytes da senha
$tamanhoSenha = strlen($senhaDigitada);
if ($tamanhoSenha < 8 || $tamanhoSenha > 72) {
    novaeraRedirect('../html/cadastro.html?erro=senha');
}

if (($_POST['privacidade'] ?? '') !== '1') {
    novaeraRedirect('../html/cadastro.html?erro=privacidade');
}

require_once __DIR__ . '/conexao.php';

$check = $conn->prepare('SELECT id FROM usuarios WHERE email = ? LIMIT 1');
$check->bind_param('s', $email);
$check->execute();

if ($check->get_result()->num_rows > 0) {
    novaeraRedirect('../html/cadastro.html?erro=existente');
}

$senha = password_hash($senhaDigitada, PASSWORD_DEFAULT);

$sql = $conn->prepare('INSERT INTO usuarios (nome, email, senha) VALUES (?, ?, ?)');
$sql->bind_param('sss', $nome, $email, $senha);

if (!$sql->execute()) {
    error_log('NovaEra cadastro: ' . $sql->error);
    novaeraRedirect('../html/cadastro.html?erro=database');
}

novaeraRedirect('../html/login.html?sucesso=cadastro');
