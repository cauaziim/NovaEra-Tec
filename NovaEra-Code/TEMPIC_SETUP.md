# TempIC Web App

## Executar

1. No XAMPP, inicie o Apache.
2. Abra `http://localhost/NovaEra-Tec-main/NovaEra-Code/html/tempic-app.html` (ou o caminho equivalente à pasta do projeto no seu `htdocs`).
3. Crie uma conta pela opção **Cadastrar**. A senha precisa ter pelo menos 8 caracteres; cadastro inclui confirmação e idade.
4. A sessão é mantida pelo PHP. Ao sair, a Home e os dados da API exigem novo login.

O PHP precisa ter `PDO_SQLite` habilitado. O banco TempIC é criado automaticamente fora do diretório público, em um arquivo temporário por projeto. Para definir outro caminho persistente, configure `TEMPIC_DATABASE_PATH` no ambiente do Apache para um caminho gravável fora do `htdocs`.

O projeto também tem uma conexão MySQL legada em `php/conexao.php`, mas o servidor configurado nela não aceita conexões deste ambiente. Para manter o TempIC funcional sem fingir que essa conexão funciona, esta implementação usa SQLite e autenticação própria do TempIC; ela não compartilha automaticamente as contas do site principal.

## Fluxo de teste

- Acesse **Cadastrar**, informe nome, e-mail, senha, confirmação e idade. Cadastro repetido deve mostrar “Este e-mail já está cadastrado.”
- Saia e teste um e-mail inexistente; o login deve mostrar “Conta não encontrada. Verifique seus dados ou cadastre-se.”
- Teste uma senha incorreta; o login deve mostrar “Senha incorreta.”
- Entre com a conta válida, recarregue a página e confira que a sessão e os sensores continuam disponíveis.
- Em **Meus Sensores**, adicione um sensor, escolha o tipo e configure local, rede Wi-Fi e nome. No modo demonstração, a senha da rede não é enviada nem salva.
- Abra os detalhes, ajuste o alvo entre 2 °C e 8 °C e confirme. Leituras, histórico, gráfico e alertas usam os registros SQLite.
- Saia e abra a URL com `?view=home`; sem sessão, o app redireciona para Login.

O app atual é modo demonstração, sem hardware conectado. Leituras são geradas pelo provider isolado, armazenadas no banco e atualizadas enquanto a Home está aberta.

## Testes de backend

No Windows com XAMPP:

```powershell
C:\xampp\php\php.exe tests\tempic-core.test.php
C:\xampp\php\php.exe tests\tempic-database.test.php
```

O teste do banco usa um arquivo temporário e verifica isolamento de sensores, leituras, estatísticas, alertas, ajustes e acesso entre usuários.

## Dados persistidos

O schema automático contém `users`, `sensors`, `readings`, `alerts` e `sensor_adjustments`. As senhas são gravadas com `password_hash()`; consultas usam prepared statements. Não é necessária configuração manual de tabela para SQLite.

Veja [IOT_INTEGRATION.md](IOT_INTEGRATION.md) para o ponto exato de integração de ESP32/MQTT/API e as salvaguardas esperadas para credenciais de dispositivo.