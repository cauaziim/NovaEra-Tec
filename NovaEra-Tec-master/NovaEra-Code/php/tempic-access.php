<?php
declare(strict_types=1);

namespace NovaEra\Tempic;

/**
 * Papéis e permissões do Tempic.
 *
 * Toda autorização passa por aqui: a API consulta can() antes de cada ação
 * e o painel recebe a mesma lista para bloquear os controles. Para criar um
 * papel novo basta incluir uma linha em MATRIX — nenhuma regra fica espalhada
 * em ifs pelo código.
 */
final class TempicAccess
{
    public const ROLE_ADMIN = 'admin';
    public const ROLE_MEMBER = 'member';

    /** Descrição de cada permissão, exibida no painel do administrador. */
    public const PERMISSIONS = [
        'monitor.view' => 'Ver sensores, gráficos e histórico',
        'alerts.receive' => 'Receber alertas e notificações',
        'alerts.acknowledge' => 'Marcar alertas como “ciente”',
        'inventory.write' => 'Guardar, mover e retirar itens',
        'inventory.manage' => 'Editar e apagar registros do inventário',
        'sensors.manage' => 'Adicionar, remover e configurar sensores',
        'equipment.control' => 'Ligar/desligar refrigeração e trocar o modo',
        'lights.manage' => 'Controlar e programar a iluminação',
        'simulation.run' => 'Usar o laboratório de falhas',
        'team.manage' => 'Convidar, promover e remover membros',
        'audit.view' => 'Ver a auditoria de quem fez o quê',
    ];

    private const MATRIX = [
        self::ROLE_ADMIN => ['*'],
        self::ROLE_MEMBER => ['monitor.view', 'alerts.receive', 'alerts.acknowledge', 'inventory.write'],
    ];

    public const ROLE_LABELS = [
        self::ROLE_ADMIN => 'Administrador',
        self::ROLE_MEMBER => 'Membro',
    ];

    public static function isRole(string $role): bool
    {
        return isset(self::MATRIX[$role]);
    }

    public static function can(string $role, string $permission): bool
    {
        $granted = self::MATRIX[$role] ?? [];
        return in_array('*', $granted, true) || in_array($permission, $granted, true);
    }

    /** @return list<string> */
    public static function permissionsOf(string $role): array
    {
        return array_values(array_filter(
            array_keys(self::PERMISSIONS),
            static fn (string $permission): bool => self::can($role, $permission)
        ));
    }

    /** Matriz completa (papel → permissão → bool) para a tela de equipe. */
    public static function matrix(): array
    {
        $matrix = [];
        foreach (array_keys(self::MATRIX) as $role) {
            foreach (array_keys(self::PERMISSIONS) as $permission) {
                $matrix[$role][$permission] = self::can($role, $permission);
            }
        }
        return $matrix;
    }
}

/**
 * Equipe do espaço de trabalho: membros, convites e auditoria.
 *
 * O id do espaço é o id do dono. Contas sem linha em memberships são donas
 * do próprio espaço (compatível com as contas criadas antes dos papéis).
 */
final class WorkspaceRepository
{
    // Sem 0/O, 1/I/L: o código é lido em voz alta e digitado no celular
    private const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

    public function __construct(private \PDO $pdo)
    {
    }

    /** @return array{workspace_id:int, role:string, is_owner:bool} */
    public function contextOf(int $userId): array
    {
        $statement = $this->pdo->prepare('SELECT workspace_id, role FROM memberships WHERE user_id = :user_id');
        $statement->execute(['user_id' => $userId]);
        $membership = $statement->fetch();
        if (!$membership) {
            return ['workspace_id' => $userId, 'role' => TempicAccess::ROLE_ADMIN, 'is_owner' => true];
        }
        return ['workspace_id' => (int) $membership['workspace_id'], 'role' => $membership['role'], 'is_owner' => false];
    }

    public function workspaceName(int $workspaceId): string
    {
        $statement = $this->pdo->prepare('SELECT name FROM users WHERE id = :id');
        $statement->execute(['id' => $workspaceId]);
        $owner = (string) ($statement->fetchColumn() ?: '');
        return $owner === '' ? 'Espaço Tempic' : 'Operação de ' . explode(' ', $owner)[0];
    }

    /** Grava o último acesso no máximo uma vez por minuto (evita escrita a cada leitura). */
    public function touch(int $userId): void
    {
        $statement = $this->pdo->prepare(<<<'SQL'
            UPDATE users SET last_seen_at = CURRENT_TIMESTAMP
            WHERE id = :id AND (last_seen_at IS NULL OR last_seen_at < datetime('now', '-60 seconds'))
        SQL);
        $statement->execute(['id' => $userId]);
    }

    // ------------------------------------------------------------------
    // Convites
    // ------------------------------------------------------------------

    public static function generateCode(): string
    {
        $code = '';
        for ($i = 0; $i < 8; $i++) {
            $code .= self::CODE_ALPHABET[random_int(0, strlen(self::CODE_ALPHABET) - 1)];
        }
        return substr($code, 0, 4) . '-' . substr($code, 4);
    }

    public static function normalizeCode(string $code): string
    {
        $clean = preg_replace('/[^A-Z0-9]/', '', strtoupper($code)) ?? '';
        return strlen($clean) === 8 ? substr($clean, 0, 4) . '-' . substr($clean, 4) : '';
    }

    public function createInvite(int $workspaceId, int $createdBy, string $role, int $days = 7): array
    {
        $statement = $this->pdo->prepare(<<<'SQL'
            INSERT INTO invites (workspace_id, code, role, created_by, expires_at)
            VALUES (:workspace_id, :code, :role, :created_by, datetime('now', :ttl))
        SQL);
        // Colisão é improvável (31^8), mas o UNIQUE garante; tenta de novo se ocorrer
        for ($attempt = 0; ; $attempt++) {
            try {
                $statement->execute([
                    'workspace_id' => $workspaceId,
                    'code' => self::generateCode(),
                    'role' => $role,
                    'created_by' => $createdBy,
                    'ttl' => '+' . max(1, min(30, $days)) . ' days',
                ]);
                break;
            } catch (\PDOException $error) {
                if ($attempt >= 3 || !str_contains($error->getMessage(), 'UNIQUE')) {
                    throw $error;
                }
            }
        }
        return $this->findInvite($workspaceId, (int) $this->pdo->lastInsertId());
    }

    private function findInvite(int $workspaceId, int $inviteId): ?array
    {
        $statement = $this->pdo->prepare('SELECT id, code, role, expires_at, created_at FROM invites WHERE id = :id AND workspace_id = :workspace_id');
        $statement->execute(['id' => $inviteId, 'workspace_id' => $workspaceId]);
        return $statement->fetch() ?: null;
    }

    public function listInvites(int $workspaceId): array
    {
        $statement = $this->pdo->prepare(<<<'SQL'
            SELECT i.id, i.code, i.role, i.expires_at, i.created_at, u.name AS created_by_name
            FROM invites i LEFT JOIN users u ON u.id = i.created_by
            WHERE i.workspace_id = :workspace_id AND i.used_at IS NULL AND i.revoked_at IS NULL
              AND i.expires_at > CURRENT_TIMESTAMP
            ORDER BY i.created_at DESC, i.id DESC
        SQL);
        $statement->execute(['workspace_id' => $workspaceId]);
        return $statement->fetchAll();
    }

    public function revokeInvite(int $workspaceId, int $inviteId): bool
    {
        $statement = $this->pdo->prepare(<<<'SQL'
            UPDATE invites SET revoked_at = CURRENT_TIMESTAMP
            WHERE id = :id AND workspace_id = :workspace_id AND used_at IS NULL AND revoked_at IS NULL
        SQL);
        $statement->execute(['id' => $inviteId, 'workspace_id' => $workspaceId]);
        return $statement->rowCount() === 1;
    }

    /** Convite válido (não usado, não revogado, no prazo) ou null. */
    public function findUsableInvite(string $code): ?array
    {
        $code = self::normalizeCode($code);
        if ($code === '') {
            return null;
        }
        $statement = $this->pdo->prepare(<<<'SQL'
            SELECT * FROM invites
            WHERE code = :code AND used_at IS NULL AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP
        SQL);
        $statement->execute(['code' => $code]);
        return $statement->fetch() ?: null;
    }

    /**
     * Consome o convite e coloca o usuário no espaço. O UPDATE condicional
     * garante que dois cadastros simultâneos não usem o mesmo código.
     */
    public function acceptInvite(array $invite, int $userId): bool
    {
        $claim = $this->pdo->prepare(<<<'SQL'
            UPDATE invites SET used_at = CURRENT_TIMESTAMP, used_by = :user_id
            WHERE id = :id AND used_at IS NULL AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP
        SQL);
        $claim->execute(['user_id' => $userId, 'id' => $invite['id']]);
        if ($claim->rowCount() !== 1) {
            return false;
        }
        $statement = $this->pdo->prepare('INSERT INTO memberships (user_id, workspace_id, role) VALUES (:user_id, :workspace_id, :role)');
        $statement->execute(['user_id' => $userId, 'workspace_id' => $invite['workspace_id'], 'role' => $invite['role']]);
        return true;
    }

    // ------------------------------------------------------------------
    // Membros
    // ------------------------------------------------------------------

    public function listMembers(int $workspaceId): array
    {
        $statement = $this->pdo->prepare(<<<'SQL'
            SELECT u.id, u.name, u.email, 'admin' AS role, 1 AS is_owner, u.created_at AS joined_at, u.last_seen_at
            FROM users u WHERE u.id = :workspace_id
            UNION ALL
            SELECT u.id, u.name, u.email, m.role, 0 AS is_owner, m.created_at AS joined_at, u.last_seen_at
            FROM memberships m JOIN users u ON u.id = m.user_id
            WHERE m.workspace_id = :workspace_id
            ORDER BY is_owner DESC, joined_at ASC
        SQL);
        $statement->execute(['workspace_id' => $workspaceId]);
        return $statement->fetchAll();
    }

    /** O dono não pode ser rebaixado nem removido: o espaço sempre tem um administrador. */
    public function setRole(int $workspaceId, int $memberId, string $role): bool
    {
        if (!TempicAccess::isRole($role)) {
            return false;
        }
        $statement = $this->pdo->prepare('UPDATE memberships SET role = :role WHERE user_id = :user_id AND workspace_id = :workspace_id');
        $statement->execute(['role' => $role, 'user_id' => $memberId, 'workspace_id' => $workspaceId]);
        return $statement->rowCount() === 1;
    }

    public function removeMember(int $workspaceId, int $memberId): bool
    {
        $statement = $this->pdo->prepare('DELETE FROM memberships WHERE user_id = :user_id AND workspace_id = :workspace_id');
        $statement->execute(['user_id' => $memberId, 'workspace_id' => $workspaceId]);
        return $statement->rowCount() === 1;
    }

    // ------------------------------------------------------------------
    // Auditoria
    // ------------------------------------------------------------------

    public function audit(int $workspaceId, int $actorId, string $action, string $summary): void
    {
        $statement = $this->pdo->prepare(
            'INSERT INTO audit_log (workspace_id, actor_id, action, summary) VALUES (:workspace_id, :actor_id, :action, :summary)'
        );
        $statement->execute(['workspace_id' => $workspaceId, 'actor_id' => $actorId, 'action' => $action, 'summary' => mb_substr($summary, 0, 300)]);
    }

    public function listAudit(int $workspaceId, int $limit = 100): array
    {
        $statement = $this->pdo->prepare(
            'SELECT a.id, a.action, a.summary, a.created_at, a.actor_id, u.name AS actor_name
             FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id
             WHERE a.workspace_id = :workspace_id
             ORDER BY a.created_at DESC, a.id DESC LIMIT ' . max(1, min(500, $limit))
        );
        $statement->execute(['workspace_id' => $workspaceId]);
        return $statement->fetchAll();
    }
}
