<?php

$host = "10.140.170.119";
$user = "root";
$pass = "123456";
$db   = "novaera";
$port = "3307";

// CONEXAO
$conn = new mysqli($host, $user, $pass, $db, $port);

// TESTA CONEXAO
if ($conn->connect_error) {
    die("Erro na conexao: " . $conn->connect_error);
}

$conn->set_charset("utf8");

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
            echo "Cadastro realizado!";
        } else {
            echo "Erro!";
        }
    }
}
?>