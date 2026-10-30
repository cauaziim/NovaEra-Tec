# Configuração do banco de dados

Não coloque usuário ou senha do MySQL em arquivos versionados.

## Desenvolvimento local com XAMPP

1. Copie `config.local.example.php` para `config.local.php`.
2. Ajuste os valores de conexão para o banco local.
3. Mantenha `config.local.php` fora do Git; ele já está listado no `.gitignore` deste projeto.

## Produção

Configure estas variáveis no ambiente do servidor:

- `NOVAERA_DB_HOST`
- `NOVAERA_DB_USER`
- `NOVAERA_DB_PASSWORD`
- `NOVAERA_DB_NAME`
- `NOVAERA_DB_PORT` (opcional; padrão `3306`)

As variáveis de ambiente têm precedência sobre a configuração local. Depois de migrar a aplicação, troque qualquer credencial de banco que tenha sido usada anteriormente no código ou compartilhada com o repositório.
