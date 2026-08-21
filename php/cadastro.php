<?php
include_once("conexao.php");

if ($_SERVER["REQUEST_METHOD"] == "POST") {

    $nome  = $_POST['nome'];
    $email = $_POST['email'];
    $senha = password_hash($_POST['senha'], PASSWORD_DEFAULT);

    // VERIFICA EMAIL
    $check = $conn->prepare("SELECT id FROM usuarios WHERE email = ?");
    $check->bind_param("s", $email);
    $check->execute();

    $resultado = $check->get_result();

    if ($resultado->num_rows > 0) {

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
    }
}
?>