<?php
namespace NovaEra\Tempic;

class SensorSimulator
{
    public function nextReading(float $current, float $min, float $max): float
    {
        $variation = (mt_rand(0, 200) - 100) / 100;
        $next = $current + ($variation * 0.4);
        $next = max($min - 0.8, min($max + 0.8, $next));
        return round($next, 1);
    }

    /**
     * Leitura que reage ao estado do equipamento: com a refrigeração ligada
     * a temperatura converge para o alvo; desligada, o ambiente aquece.
     */
    public function nextControlledReading(float $current, float $target, bool $equipmentOn): float
    {
        $noise = (mt_rand(0, 200) - 100) / 100 * 0.12;
        $next = $equipmentOn
            ? $current + ($target - 0.8 - $current) * 0.3 + $noise
            : $current + 0.35 + mt_rand(0, 35) / 100 + $noise;
        return round($next, 1);
    }

    /**
     * Aquecimento extra de uma porta aberta (cenário da demonstração),
     * entre 1,2 °C e 2,4 °C somados à próxima leitura.
     */
    public function doorOpeningSpike(): float
    {
        return mt_rand(120, 240) / 100;
    }

    public function shouldAlert(float $temperature, float $min, float $max): bool
    {
        return $temperature < $min || $temperature > $max;
    }
}

interface TemperatureProvider
{
    public function read(array $sensor): float;
}

final class DemoTemperatureProvider implements TemperatureProvider
{
    private SensorSimulator $simulator;

    public function __construct(?SensorSimulator $simulator = null)
    {
        $this->simulator = $simulator ?? new SensorSimulator();
    }

    public function read(array $sensor): float
    {
        if (isset($sensor['equipment_on'], $sensor['target_temperature'])) {
            return $this->simulator->nextControlledReading(
                (float) $sensor['current_temperature'],
                (float) $sensor['target_temperature'],
                (bool) $sensor['equipment_on']
            );
        }

        return $this->simulator->nextReading(
            (float) $sensor['current_temperature'],
            (float) $sensor['minimum_temperature'],
            (float) $sensor['maximum_temperature']
        );
    }
}

class TempicStore
{
    public function __construct(private string $storagePath = __DIR__ . '/../data/tempic.json')
    {
        if (!is_dir(dirname($this->storagePath))) {
            mkdir(dirname($this->storagePath), 0777, true);
        }
        if (!file_exists($this->storagePath)) {
            file_put_contents($this->storagePath, json_encode([
                'users' => [],
                'sensors' => [],
                'alerts' => [],
            ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
        }
    }

    public function read(): array
    {
        $content = file_get_contents($this->storagePath);
        return json_decode($content ?: '[]', true) ?: [];
    }

    public function save(array $data): void
    {
        file_put_contents($this->storagePath, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    }
}

// ============================================
// FUTURA INTEGRAÇÃO IoT
// ============================================
// Atualmente os dados vêm do SensorSimulator.
//
// FUTURAMENTE:
// Substituir este provider pela comunicação
// com ESP32 utilizando MQTT/API/Wi‑Fi.
//
// NÃO REMOVER A INTERFACE SensorService.
// ============================================
