<?php
include_once("conexao.php");

if ($_SERVER["REQUEST_METHOD"] == "POST") {

    $nome  = trim($_POST['nome'] ?? '');
    $email = trim($_POST['email'] ?? '');
    $senhaDigitada = $_POST['senha'] ?? '';

    // Verifica se os campos estão preenchidos
    if (empty($nome) || empty($email) || empty($senhaDigitada)) {
        header("Location: ../html/cadastro.html?erro=campos");
        exit();
    }

    // Verifica se o e-mail é válido
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        header("Location: ../html/cadastro.html?erro=email");
        exit();
    }

    // Verifica se o e-mail já está cadastrado
    $check = $conn->prepare(
        "SELECT id FROM usuarios WHERE email = ? LIMIT 1"
    );

    $check->bind_param("s", $email);
    $check->execute();

    $resultado = $check->get_result();

    if ($resultado->num_rows > 0) {

        header("Location: ../html/cadastro.html?erro=existente");
        exit();

    }

    // Criptografa a senha antes de salvar
    $senha = password_hash($senhaDigitada, PASSWORD_DEFAULT);

    // Cadastra o usuário
    $sql = $conn->prepare(
        "INSERT INTO usuarios (nome, email, senha)
         VALUES (?, ?, ?)"
    );

    $sql->bind_param("sss", $nome, $email, $senha);

    if ($sql->execute()) {

        // Cadastro realizado
        header("Location: ../html/login.html?sucesso=cadastro");
        exit();

    } else {

        header("Location: ../html/cadastro.html?erro=database");
        exit();
    }
}
?>