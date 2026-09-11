<?php
include_once("conexao.php");

if ($_SERVER["REQUEST_METHOD"] == "POST") {

<<<<<<< HEAD
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

=======
    $nome  = $_POST['nome'];
    $email = $_POST['email'];
    $senha = password_hash($_POST['senha'], PASSWORD_DEFAULT);

    // VERIFICA EMAIL
    $check = $conn->prepare("SELECT id FROM usuarios WHERE email = ?");
>>>>>>> ccd4c4396dc63f26a1b5c6b6d55aeda5b1bb709c
    $check->bind_param("s", $email);
    $check->execute();

    $resultado = $check->get_result();

    if ($resultado->num_rows > 0) {

<<<<<<< HEAD
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
=======
        echo "E-mail já cadastrado!";

    } else {

        $sql = $conn->prepare("
            INSERT INTO usuarios(nome, email, senha)
            VALUES (?, ?, ?)
        ");

        $sql->bind_param("sss", $nome, $email, $senha);

        if ($sql->execute()) {
        header("Location: ../html/login.html");
        } else {
            echo "Erro!";
        }
>>>>>>> ccd4c4396dc63f26a1b5c6b6d55aeda5b1bb709c
    }
}
?>