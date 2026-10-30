<?php

$localConfigPath = __DIR__ . DIRECTORY_SEPARATOR . "config.local.php";
$localConfig = [];

if (is_file($localConfigPath)) {
    $localConfig = require $localConfigPath;

    if (!is_array($localConfig)) {
        error_log("NovaEra database configuration must return an array.");
        http_response_code(503);
        exit("Serviço temporariamente indisponível.");
    }
}

$host = getenv("NOVAERA_DB_HOST") ?: ($localConfig["host"] ?? "");
$user = getenv("NOVAERA_DB_USER") ?: ($localConfig["user"] ?? "");
$pass = getenv("NOVAERA_DB_PASSWORD");
$pass = $pass === false ? ($localConfig["password"] ?? "") : $pass;
$db = getenv("NOVAERA_DB_NAME") ?: ($localConfig["database"] ?? "");
$port = getenv("NOVAERA_DB_PORT") ?: ($localConfig["port"] ?? 3306);

if ($host === "" || $user === "" || $db === "") {
    error_log("NovaEra database configuration is incomplete.");
    http_response_code(503);
    exit("Banco de dados não configurado. Consulte a equipe responsável.");
}

mysqli_report(MYSQLI_REPORT_OFF);
$conn = new mysqli($host, $user, $pass, $db, (int) $port);

if ($conn->connect_error) {
    error_log("NovaEra database connection failed: " . $conn->connect_error);
    http_response_code(503);
    exit("Não foi possível conectar ao serviço. Tente novamente mais tarde.");
}

$conn->set_charset("utf8mb4");