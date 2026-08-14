<?php
session_start();

include("conexao.php");

if ($_SERVER["REQUEST_METHOD"] == "POST") {

    $email = $_POST["email"];
    $senha = $_POST["password"];

    // Procura o usuário pelo e-mail
    $sql = $conn->prepare(
        "SELECT id, nome, email, senha FROM usuarios WHERE email = ?"
    );

    $sql->bind_param("s", $email);
    $sql->execute();

    $resultado = $sql->get_result();

    if ($resultado->num_rows == 1) {

        $usuario = $resultado->fetch_assoc();

        // Confere a senha digitada com a senha criptografada do banco
        if (password_verify($senha, $usuario["senha"])) {

            $_SESSION["usuario_id"] = $usuario["id"];
            $_SESSION["usuario_nome"] = $usuario["nome"];
            $_SESSION["usuario_email"] = $usuario["email"];

            header("Location: index.php");
            exit();

        } else {

            header("Location: login.php?erro=1");
            exit();
        }

    } else {

        header("Location: login.php?erro=1");
        exit();
    }
}
?>