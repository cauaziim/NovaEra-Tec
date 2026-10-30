<?php
require_once __DIR__ . '/../php/tempic-core.php';

use NovaEra\Tempic\SensorSimulator;

$simulator = new SensorSimulator();
$reading = $simulator->nextReading(4.2, 2.0, 8.0);

if (!is_numeric($reading) || $reading < 1 || $reading > 12) {
    fwrite(STDERR, "Falha: leitura simulada fora do intervalo esperado\n");
    exit(1);
}

if (!$simulator->shouldAlert(1.5, 2.0, 8.0)) {
    fwrite(STDERR, "Falha: alerta não gerado para temperatura abaixo do limite\n");
    exit(1);
}

if (!$simulator->shouldAlert(9.5, 2.0, 8.0)) {
    fwrite(STDERR, "Falha: alerta não gerado para temperatura acima do limite\n");
    exit(1);
}

echo "Teste TempIC: OK\n";
