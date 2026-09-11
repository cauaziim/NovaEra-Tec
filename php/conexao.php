<?php

<<<<<<< HEAD
$host = "10.140.169.16";
=======
$host = "10.140.169.7";
>>>>>>> ccd4c4396dc63f26a1b5c6b6d55aeda5b1bb709c
$user = "root";
$pass = "123456";
$db   = "novaeracode";
$port = "3306";

// CONEXAO
$conn = new mysqli($host, $user, $pass, $db, $port);

// TESTA CONEXAO
if ($conn->connect_error) {
    die("Erro na conexao: " . $conn->connect_error);
}

$conn->set_charset("utf8");
?>