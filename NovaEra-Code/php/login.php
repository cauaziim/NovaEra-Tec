<?php
session_start();

include("conexao.php");

if ($_SERVER["REQUEST_METHOD"] == "POST") {

    $email = trim($_POST["email"] ?? "");
    $senha = $_POST["password"] ?? "";

    // Verifica se os campos foram preenchidos
    if (empty($email) || empty($senha)) {
        header("Location: ../html/login.html?erro=1");
        exit();
    }

    // Verifica se o e-mail possui formato válido
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        header("Location: ../html/login.html?erro=1");
        exit();
    }

    // Procura o usuário pelo e-mail
    $sql = $conn->prepare(
        "SELECT id, nome, email, senha 
         FROM usuarios 
         WHERE email = ? 
         LIMIT 1"
    );

    $sql->bind_param("s", $email);
    $sql->execute();

    $resultado = $sql->get_result();

    // Se o e-mail não estiver cadastrado
    if ($resultado->num_rows !== 1) {
        header("Location: ../html/login.html?erro=1");
        exit();
    }

    $usuario = $resultado->fetch_assoc();

    // Verifica a senha
    if (!password_verify($senha, $usuario["senha"])) {
        header("Location: ../html/login.html?erro=1");
        exit();
    }

    // Login realizado com sucesso
    $_SESSION["usuario_id"] = $usuario["id"];
    $_SESSION["usuario_nome"] = $usuario["nome"];
    $_SESSION["usuario_email"] = $usuario["email"];

    header("Location: ../index.php");
    exit();
}
?>