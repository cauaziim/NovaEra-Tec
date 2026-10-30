<?php
declare(strict_types=1);

namespace NovaEra\Tempic;

/**
 * Regras do inventário (o que está guardado em cada equipamento).
 *
 * Fonte única das categorias: a API valida com elas e envia a mesma tabela
 * ao painel, que usa as palavras-chave para reconhecer o item digitado
 * ("2 kg de frango" → Carnes) e sugerir a validade.
 *
 * Classe de armazenamento de um equipamento, deduzida da faixa segura:
 *  - frozen  : máxima ≤ -10 °C (freezers, câmaras de congelados)
 *  - chilled : máxima ≤ 10 °C (geladeiras, câmaras frias, baús)
 *  - ambient : acima disso
 */
final class InventoryCatalog
{
    public const UNITS = ['un', 'kg', 'g', 'L', 'mL', 'cx', 'pct'];
    public const REMOVAL_REASONS = ['consumido', 'descartado', 'transferido'];
    public const MAX_SHELVES = 6;

    /**
     * shelf_life: dias de validade sugeridos por classe de armazenamento;
     * null em uma classe = item não deve ficar ali (bloqueia sem confirmação).
     * tolerance: minutos fora da faixa até [atenção, comprometido].
     */
    private const CATEGORIES = [
        'carnes' => [
            'label' => 'Carnes e aves', 'icon' => 'fa-drumstick-bite',
            'shelf_life' => ['frozen' => 180, 'chilled' => 3, 'ambient' => null],
            'tolerance' => [15, 120],
            'keywords' => ['frango', 'carne', 'bife', 'picanha', 'alcatra', 'patinho', 'acem', 'costela', 'linguica', 'salsicha', 'bacon', 'peru', 'porco', 'lombo', 'hamburguer', 'file', 'coxa', 'asa', 'peito', 'moida'],
        ],
        'peixes' => [
            'label' => 'Peixes e frutos do mar', 'icon' => 'fa-fish',
            'shelf_life' => ['frozen' => 120, 'chilled' => 2, 'ambient' => null],
            'tolerance' => [10, 60],
            'keywords' => ['peixe', 'tilapia', 'salmao', 'atum', 'bacalhau', 'camarao', 'lula', 'polvo', 'sardinha', 'merluza', 'pescada'],
        ],
        'laticinios' => [
            'label' => 'Laticínios e ovos', 'icon' => 'fa-cheese',
            'shelf_life' => ['frozen' => 60, 'chilled' => 10, 'ambient' => null],
            'tolerance' => [30, 240],
            'keywords' => ['leite', 'queijo', 'iogurte', 'manteiga', 'requeijao', 'creme', 'nata', 'ovo', 'ovos', 'mussarela', 'ricota', 'coalhada'],
        ],
        'hortifruti' => [
            'label' => 'Frutas e verduras', 'icon' => 'fa-carrot',
            'shelf_life' => ['frozen' => 240, 'chilled' => 7, 'ambient' => 4],
            'tolerance' => [60, 480],
            'keywords' => ['alface', 'tomate', 'cenoura', 'batata', 'cebola', 'fruta', 'banana', 'maca', 'morango', 'uva', 'limao', 'laranja', 'brocolis', 'legume', 'verdura', 'polpa', 'ervilha', 'milho', 'couve', 'manga'],
        ],
        'congelados' => [
            'label' => 'Congelados e sorvetes', 'icon' => 'fa-ice-cream',
            'shelf_life' => ['frozen' => 120, 'chilled' => null, 'ambient' => null],
            'tolerance' => [15, 90],
            'keywords' => ['sorvete', 'picole', 'gelo', 'lasanha', 'pizza', 'nuggets', 'empanado', 'congelado', 'acai', 'pao de queijo'],
        ],
        'preparados' => [
            'label' => 'Refeições prontas', 'icon' => 'fa-bowl-food',
            'shelf_life' => ['frozen' => 90, 'chilled' => 3, 'ambient' => null],
            'tolerance' => [15, 120],
            'keywords' => ['marmita', 'refeicao', 'sopa', 'molho', 'feijao', 'arroz', 'massa', 'torta', 'salgado', 'bolo', 'sobremesa', 'pudim'],
        ],
        'bebidas' => [
            'label' => 'Bebidas', 'icon' => 'fa-bottle-water',
            'shelf_life' => ['frozen' => null, 'chilled' => 30, 'ambient' => 180],
            'tolerance' => [120, 1440],
            'keywords' => ['agua', 'refrigerante', 'suco', 'cerveja', 'vinho', 'cha', 'energetico', 'isotonico', 'lata', 'garrafa'],
        ],
        'saude' => [
            'label' => 'Vacinas e medicamentos', 'icon' => 'fa-syringe',
            'shelf_life' => ['frozen' => null, 'chilled' => 180, 'ambient' => null],
            'tolerance' => [1, 30],
            'keywords' => ['vacina', 'insulina', 'medicamento', 'remedio', 'ampola', 'frasco', 'soro', 'antibiotico', 'colirio'],
        ],
        'objetos' => [
            'label' => 'Objetos e insumos', 'icon' => 'fa-box',
            'shelf_life' => ['frozen' => null, 'chilled' => null, 'ambient' => null],
            'tolerance' => [1440, 100000],
            'keywords' => ['amostra', 'reagente', 'gelox', 'bolsa termica', 'pote', 'embalagem', 'caixa', 'kit', 'insumo', 'ferramenta'],
        ],
    ];

    /** Categorias cuja classe "null" é só desaconselhada, não proibida. */
    private const NO_EXPIRY_ONLY = ['objetos'];

    public static function isCategory(string $category): bool
    {
        return isset(self::CATEGORIES[$category]);
    }

    /** Tabela enviada ao painel (sem detalhes internos). */
    public static function categories(): array
    {
        $result = [];
        foreach (self::CATEGORIES as $id => $category) {
            $result[$id] = [
                'label' => $category['label'],
                'icon' => $category['icon'],
                'keywords' => $category['keywords'],
                'shelf_life' => $category['shelf_life'],
                'tolerance' => $category['tolerance'],
                // Mesma regra de compatibility(), pronta para o painel avisar antes de enviar
                'allowed' => array_map(
                    static fn (?int $days): bool => $days !== null || in_array($id, self::NO_EXPIRY_ONLY, true),
                    $category['shelf_life']
                ),
            ];
        }
        return $result;
    }

    public static function storageClass(array $sensor): string
    {
        $maximum = (float) $sensor['maximum_temperature'];
        return $maximum <= -10 ? 'frozen' : ($maximum <= 10 ? 'chilled' : 'ambient');
    }

    /**
     * Pode guardar esta categoria neste equipamento?
     * level: ok | block (exige confirmação explícita de quem guarda)
     */
    public static function compatibility(string $category, array $sensor): array
    {
        $class = self::storageClass($sensor);
        $life = self::CATEGORIES[$category]['shelf_life'][$class] ?? null;
        if ($life !== null || in_array($category, self::NO_EXPIRY_ONLY, true)) {
            return ['level' => 'ok', 'message' => ''];
        }

        $label = self::CATEGORIES[$category]['label'];
        $message = match ($class) {
            'frozen' => "{$label} não devem ser congelados neste equipamento.",
            'chilled' => "{$label} precisam de congelamento; aqui vão degradar.",
            default => "{$label} precisam de refrigeração.",
        };
        return ['level' => 'block', 'message' => $message];
    }

    /** Validade sugerida (Y-m-d) ou null quando a categoria não vence. */
    public static function suggestedExpiry(string $category, array $sensor, \DateTimeImmutable $from): ?string
    {
        $days = self::CATEGORIES[$category]['shelf_life'][self::storageClass($sensor)] ?? null;
        return $days === null ? null : $from->modify("+{$days} days")->format('Y-m-d');
    }

    /**
     * Integridade da cadeia de frio a partir dos minutos fora da faixa
     * desde que o item foi guardado: intact | exposed | compromised.
     */
    public static function integrity(string $category, float $minutesOutOfRange): string
    {
        [$attention, $compromised] = self::CATEGORIES[$category]['tolerance'] ?? [15, 120];
        if ($minutesOutOfRange >= $compromised) {
            return 'compromised';
        }
        return $minutesOutOfRange >= $attention ? 'exposed' : 'intact';
    }
}

/**
 * Persistência do inventário. Sempre filtra por workspace_id: um item só é
 * visível e alterável dentro do espaço de trabalho dono do equipamento.
 */
final class InventoryRepository
{
    /** Intervalo máximo entre leituras considerado contínuo (sem isso, horas offline viram exposição). */
    private const MAX_READING_GAP = 900;
    private const EXPIRING_DAYS = 3;

    public function __construct(private \PDO $pdo)
    {
    }

    private const SELECT = <<<'SQL'
        SELECT i.*, s.name AS sensor_name, s.type AS sensor_type, s.location AS sensor_location,
               s.minimum_temperature, s.maximum_temperature, u.name AS stored_by_name
        FROM storage_items i
        JOIN sensors s ON s.id = i.sensor_id
        LEFT JOIN users u ON u.id = i.stored_by
    SQL;

    /**
     * Itens guardados (ordem FEFO: vence primeiro, sai primeiro), cada um
     * com validade, minutos fora da faixa desde que foi guardado e
     * integridade da cadeia de frio.
     */
    public function listItems(int $workspaceId, ?int $sensorId = null, ?\DateTimeImmutable $today = null): array
    {
        $sql = self::SELECT . ' WHERE i.workspace_id = :workspace_id AND i.removed_at IS NULL';
        $parameters = ['workspace_id' => $workspaceId];
        if ($sensorId !== null) {
            $sql .= ' AND i.sensor_id = :sensor_id';
            $parameters['sensor_id'] = $sensorId;
        }
        $sql .= ' ORDER BY i.expires_at IS NULL, i.expires_at ASC, i.stored_at ASC, i.id ASC';
        $statement = $this->pdo->prepare($sql);
        $statement->execute($parameters);
        $items = $statement->fetchAll();

        $since = [];
        foreach ($items as $item) {
            $key = (int) $item['sensor_id'];
            $since[$key] = min($since[$key] ?? $item['stored_at'], $item['stored_at']);
        }
        $intervals = [];
        foreach ($since as $key => $from) {
            $intervals[$key] = $this->alertIntervals($key, $from);
        }

        $today ??= new \DateTimeImmutable('today');
        return array_map(fn (array $item): array => $this->decorate($item, $intervals[(int) $item['sensor_id']] ?? [], $today), $items);
    }

    public function findItem(int $workspaceId, int $itemId): ?array
    {
        $statement = $this->pdo->prepare(self::SELECT . ' WHERE i.workspace_id = :workspace_id AND i.id = :id AND i.removed_at IS NULL');
        $statement->execute(['workspace_id' => $workspaceId, 'id' => $itemId]);
        $item = $statement->fetch();
        if (!$item) {
            return null;
        }
        return $this->decorate($item, $this->alertIntervals((int) $item['sensor_id'], $item['stored_at']), new \DateTimeImmutable('today'));
    }

    public function addItem(int $workspaceId, int $actorId, int $sensorId, array $data, ?string $storedOffset = null): array
    {
        $statement = $this->pdo->prepare(<<<'SQL'
            INSERT INTO storage_items (workspace_id, sensor_id, name, category, quantity, unit, shelf, expires_at, notes, stored_by, stored_at)
            VALUES (:workspace_id, :sensor_id, :name, :category, :quantity, :unit, :shelf, :expires_at, :notes, :stored_by,
                    datetime('now', :offset))
        SQL);
        $statement->execute([
            'workspace_id' => $workspaceId,
            'sensor_id' => $sensorId,
            'name' => $data['name'],
            'category' => $data['category'],
            'quantity' => $data['quantity'],
            'unit' => $data['unit'],
            'shelf' => $data['shelf'],
            'expires_at' => $data['expires_at'],
            'notes' => $data['notes'] ?? '',
            'stored_by' => $actorId,
            'offset' => $storedOffset ?? '+0 seconds',
        ]);
        return $this->findItem($workspaceId, (int) $this->pdo->lastInsertId());
    }

    /** Muda de prateleira ou de equipamento (o sensor de destino precisa ser do mesmo espaço). */
    public function moveItem(int $workspaceId, int $itemId, int $sensorId, int $shelf): ?array
    {
        $statement = $this->pdo->prepare(<<<'SQL'
            UPDATE storage_items SET sensor_id = :sensor_id, shelf = :shelf
            WHERE id = :id AND workspace_id = :workspace_id AND removed_at IS NULL
              AND EXISTS (SELECT 1 FROM sensors WHERE id = :sensor_id AND user_id = :workspace_id)
        SQL);
        $statement->execute(['sensor_id' => $sensorId, 'shelf' => $shelf, 'id' => $itemId, 'workspace_id' => $workspaceId]);
        return $statement->rowCount() === 1 ? $this->findItem($workspaceId, $itemId) : null;
    }

    /**
     * Retira uma parte ou tudo. Sem quantidade (ou quantidade >= saldo) o
     * item sai do inventário com o motivo; o registro fica para auditoria.
     *
     * @return array{removed:bool, quantity:float, item:array}|null
     */
    public function withdraw(int $workspaceId, int $actorId, int $itemId, ?float $quantity, string $reason): ?array
    {
        $item = $this->findItem($workspaceId, $itemId);
        if (!$item) {
            return null;
        }

        $balance = (float) $item['quantity'];
        if ($quantity !== null && $quantity < $balance) {
            $statement = $this->pdo->prepare('UPDATE storage_items SET quantity = round(quantity - :quantity, 3) WHERE id = :id');
            $statement->execute(['quantity' => $quantity, 'id' => $itemId]);
            return ['removed' => false, 'quantity' => $quantity, 'item' => $this->findItem($workspaceId, $itemId)];
        }

        $statement = $this->pdo->prepare(<<<'SQL'
            UPDATE storage_items SET removed_at = CURRENT_TIMESTAMP, removed_by = :actor_id, removal_reason = :reason
            WHERE id = :id AND workspace_id = :workspace_id AND removed_at IS NULL
        SQL);
        $statement->execute(['actor_id' => $actorId, 'reason' => $reason, 'id' => $itemId, 'workspace_id' => $workspaceId]);
        return ['removed' => true, 'quantity' => $balance, 'item' => $item];
    }

    public function updateItem(int $workspaceId, int $itemId, array $data): ?array
    {
        $statement = $this->pdo->prepare(<<<'SQL'
            UPDATE storage_items
            SET name = :name, category = :category, quantity = :quantity, unit = :unit, expires_at = :expires_at, notes = :notes
            WHERE id = :id AND workspace_id = :workspace_id AND removed_at IS NULL
        SQL);
        $statement->execute([
            'name' => $data['name'],
            'category' => $data['category'],
            'quantity' => $data['quantity'],
            'unit' => $data['unit'],
            'expires_at' => $data['expires_at'],
            'notes' => $data['notes'] ?? '',
            'id' => $itemId,
            'workspace_id' => $workspaceId,
        ]);
        return $statement->rowCount() === 1 ? $this->findItem($workspaceId, $itemId) : null;
    }

    /** Apaga o registro (lançamento errado). Para tirar do equipamento, use withdraw(). */
    public function deleteItem(int $workspaceId, int $itemId): bool
    {
        $statement = $this->pdo->prepare('DELETE FROM storage_items WHERE id = :id AND workspace_id = :workspace_id');
        $statement->execute(['id' => $itemId, 'workspace_id' => $workspaceId]);
        return $statement->rowCount() === 1;
    }

    /** Contadores para o painel: por equipamento e no total. */
    public function summarize(array $items): array
    {
        $summary = ['total' => count($items), 'expired' => 0, 'expiring' => 0, 'at_risk' => 0, 'by_sensor' => []];
        foreach ($items as $item) {
            $key = (string) $item['sensor_id'];
            $summary['by_sensor'][$key] ??= ['total' => 0, 'expired' => 0, 'expiring' => 0, 'at_risk' => 0];
            $summary['by_sensor'][$key]['total']++;
            foreach (['expired', 'expiring'] as $status) {
                if ($item['expiry_status'] === $status) {
                    $summary[$status]++;
                    $summary['by_sensor'][$key][$status]++;
                }
            }
            if ($item['integrity'] !== 'intact') {
                $summary['at_risk']++;
                $summary['by_sensor'][$key]['at_risk']++;
            }
        }
        return $summary;
    }

    private function decorate(array $item, array $intervals, \DateTimeImmutable $today): array
    {
        $stored = (int) strtotime($item['stored_at'] . ' UTC');
        $seconds = 0;
        foreach ($intervals as [$start, $end]) {
            $seconds += max(0, $end - max($start, $stored));
        }
        $minutes = round($seconds / 60, 1);

        $days = null;
        $status = 'none';
        if ($item['expires_at']) {
            $expires = new \DateTimeImmutable($item['expires_at']);
            $days = (int) $today->diff($expires)->format('%r%a');
            $status = $days < 0 ? 'expired' : ($days <= self::EXPIRING_DAYS ? 'expiring' : 'ok');
        }

        return $item + [
            'exposure_minutes' => $minutes,
            'integrity' => InventoryCatalog::integrity($item['category'], $minutes),
            'days_to_expiry' => $days,
            'expiry_status' => $status,
        ];
    }

    /**
     * Trechos [início, fim] (unix) em que o sensor ficou em alerta desde
     * $since. Cada leitura em alerta vale até a próxima leitura, limitada a
     * MAX_READING_GAP para não contar períodos sem dados.
     */
    private function alertIntervals(int $sensorId, string $since): array
    {
        $statement = $this->pdo->prepare(<<<'SQL'
            SELECT recorded_at, next_at FROM (
                SELECT recorded_at, temperature_state,
                       LEAD(recorded_at) OVER (ORDER BY recorded_at, id) AS next_at
                FROM readings WHERE sensor_id = :sensor_id AND recorded_at >= datetime(:since, '-15 minutes')
            ) WHERE temperature_state = 'alert'
        SQL);
        $statement->execute(['sensor_id' => $sensorId, 'since' => $since]);
        $now = time();
        $intervals = [];
        foreach ($statement->fetchAll() as $row) {
            $start = (int) strtotime($row['recorded_at'] . ' UTC');
            $next = $row['next_at'] ? (int) strtotime($row['next_at'] . ' UTC') : $now;
            $intervals[] = [$start, min($next, $start + self::MAX_READING_GAP, $now)];
        }
        return $intervals;
    }
}
