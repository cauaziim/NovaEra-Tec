<?php
declare(strict_types=1);

namespace NovaEra\Contato;

use PDO;
use RuntimeException;

/**
 * Caixa de entrada das mensagens enviadas pelo formulário de contato.
 * Usa SQLite, como o TempIC, para funcionar sem configuração de MySQL.
 */
final class ContactInbox
{
    public const NAME_MAX = 120;
    public const EMAIL_MAX = 254;
    public const SUBJECT_MAX = 160;
    public const MESSAGE_MIN = 10;
    public const MESSAGE_MAX = 5000;

    private PDO $pdo;

    public function __construct(?string $databasePath = null)
    {
        $defaultPath = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'novaera-contato-' . substr(hash('sha256', dirname(__DIR__)), 0, 16) . '.sqlite';
        $databasePath = $databasePath ?: (getenv('NOVAERA_CONTACT_DATABASE_PATH') ?: $defaultPath);
        $directory = dirname($databasePath);

        if (!is_dir($directory) && !mkdir($directory, 0700, true) && !is_dir($directory)) {
            throw new RuntimeException('Não foi possível criar o diretório da caixa de mensagens.');
        }

        $this->pdo = new PDO('sqlite:' . $databasePath, null, null, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
        $this->pdo->exec(<<<SQL
            CREATE TABLE IF NOT EXISTS contact_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT NOT NULL,
                subject TEXT NOT NULL,
                message TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
        SQL);

        if (is_file($databasePath)) {
            @chmod($databasePath, 0600);
        }
    }

    /**
     * Valida os campos e devolve uma lista de erros por campo (vazia quando válido).
     */
    public static function validate(array $data): array
    {
        $errors = [];
        $name = trim((string) ($data['nome'] ?? ''));
        $email = trim((string) ($data['email'] ?? ''));
        $subject = trim((string) ($data['assunto'] ?? ''));
        $message = trim((string) ($data['mensagem'] ?? ''));

        if (mb_strlen($name) < 2 || mb_strlen($name) > self::NAME_MAX) {
            $errors['nome'] = 'Informe seu nome (2 a ' . self::NAME_MAX . ' caracteres).';
        }
        if (strlen($email) > self::EMAIL_MAX || filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
            $errors['email'] = 'Informe um e-mail válido.';
        }
        if ($subject !== '' && (mb_strlen($subject) < 3 || mb_strlen($subject) > self::SUBJECT_MAX)) {
            $errors['assunto'] = 'O assunto deve ter entre 3 e ' . self::SUBJECT_MAX . ' caracteres.';
        }
        if (mb_strlen($message) < self::MESSAGE_MIN || mb_strlen($message) > self::MESSAGE_MAX) {
            $errors['mensagem'] = 'A mensagem deve ter entre ' . self::MESSAGE_MIN . ' e ' . self::MESSAGE_MAX . ' caracteres.';
        }

        return $errors;
    }

    public function save(array $data): int
    {
        $statement = $this->pdo->prepare(
            'INSERT INTO contact_messages (name, email, subject, message, created_at) VALUES (?, ?, ?, ?, ?)'
        );
        $statement->execute([
            trim((string) $data['nome']),
            trim((string) $data['email']),
            trim((string) ($data['assunto'] ?? '')) ?: 'Contato pelo site',
            trim((string) $data['mensagem']),
            gmdate('c'),
        ]);

        return (int) $this->pdo->lastInsertId();
    }

    public function find(int $id): ?array
    {
        $statement = $this->pdo->prepare('SELECT * FROM contact_messages WHERE id = ?');
        $statement->execute([$id]);
        $row = $statement->fetch();
        return $row ?: null;
    }
}
