# TempIC Web App

## Executar

1. No XAMPP, inicie o Apache.
2. Abra `http://localhost/NovaEra-Tec-main/NovaEra-Code/html/tempic-app.html` (ou o caminho equivalente à pasta do projeto no seu `htdocs`).
3. Crie uma conta pela opção **Cadastrar**. A senha precisa ter pelo menos 8 caracteres; cadastro inclui confirmação e idade.
4. A sessão é mantida pelo PHP. Ao sair, a Home e os dados da API exigem novo login.

O PHP precisa ter `PDO_SQLite` habilitado (vem ligado no XAMPP).

### Banco interno

As contas, sensores e leituras ficam em **`data/tempic.sqlite`**, dentro do projeto. O arquivo é criado sozinho no primeiro acesso e é o mesmo para qualquer usuário do Windows. O Apache bloqueia o acesso a ele pela web (`data/.htaccess`), e ele está no `.gitignore`, porque guarda e-mails e hashes de senha.

- **Copiou a pasta do projeto (zip ou pendrive)?** As contas vão junto.
- **Várias pessoas usando as mesmas contas:** um computador roda o XAMPP e os outros acessam pela rede, em `http://IP-DO-SERVIDOR/.../html/tempic-app.html`. Descubra o IP com `ipconfig`. Se não abrir, libere o Apache no Firewall do Windows (porta 80). Cada computador rodando o próprio XAMPP tem o próprio banco, e as contas **não** se sincronizam entre eles.
- **Migração automática:** versões antigas gravavam o banco na pasta temporária do Windows (`%TEMP%\tempic-*.sqlite`), o que fazia as contas "sumirem" ao trocar de usuário do Windows, renomear a pasta ou limpar os temporários. No primeiro acesso, o banco interno copia o banco antigo mais recente e importa as contas dos outros (sem os sensores deles).
- **Outro caminho:** defina `TEMPIC_DATABASE_PATH` no ambiente do Apache ou `"tempic_database" => "C:/caminho/tempic.sqlite"` em `php/config.local.php`.

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

## Papéis: administrador e membro

Toda conta criada **sem** código de convite é dona do próprio espaço e é **administradora**. Para colocar outras pessoas na mesma operação:

1. O administrador abre **Administração → Convidar**, escolhe o papel (Membro ou Administrador) e a validade (1, 7 ou 30 dias).
2. Manda o código (`ABCD-2345`) ou o link (`tempic-app.html?convite=ABCD-2345`). O link abre o cadastro com o código preenchido. A tela mostra em qual espaço e com qual papel a pessoa vai entrar.
3. Cada código serve **uma vez**. Dá para revogar códigos ainda não usados.

| Pode fazer | Membro | Admin |
|---|:-:|:-:|
| Ver sensores, gráficos, histórico, iluminação | ✓ | ✓ |
| Receber alertas e marcar “estou ciente” | ✓ | ✓ |
| Guardar, mover e retirar itens do inventário | ✓ | ✓ |
| Editar/apagar registros do inventário | | ✓ |
| Adicionar/remover sensores, mudar alvo, ligar/desligar refrigeração, modo automático | | ✓ |
| Iluminação, laboratório de falhas | | ✓ |
| Equipe, convites e auditoria | | ✓ |

- A matriz fica em um único lugar (`php/tempic-access.php`). A API confere a permissão em **toda** requisição e responde 403 fora do papel. O painel só esconde ou trava os controles, com o selo “só admin”.
- O papel é lido do banco a cada requisição. Promover, rebaixar ou remover alguém vale na hora, mesmo com o painel aberto, que se atualiza sozinho.
- O dono do espaço não pode ser rebaixado nem removido, e ninguém altera o próprio papel.
- **Ver como membro** (em Administração ou Ctrl K) mostra ao administrador exatamente o que um membro vê, sem mudar o acesso dele.
- **Auditoria** registra quem fez o quê: alvo alterado, refrigeração, iluminação, itens guardados/retirados, convites, mudanças de papel e “ciente”. Pode ser filtrada e exportada em CSV.

## Inventário (o que está guardado em cada equipamento)

- Cada item tem equipamento, prateleira (P1–P6), quantidade, unidade, categoria, validade e quem guardou.
- **Guardar por frase:** na tela Inventário, escreva como falaria, por exemplo “2 kg de frango no freezer p2 vence em 90 dias”. O painel reconhece quantidade, unidade, categoria (por palavras-chave), equipamento, prateleira e validade, e mostra a prévia antes de salvar. Se faltar o equipamento ou a categoria, abre o formulário já preenchido.
- **Validade sugerida** pela categoria e pelo tipo de equipamento. Exemplo: carne dura 180 dias congelada e 3 dias refrigerada.
- **Compatibilidade:** guardar algo no lugar errado, como vacina no freezer ou sorvete na geladeira, exige confirmação explícita, e a confirmação fica na auditoria.
- **Cadeia de frio:** para cada item, o sistema soma o tempo em que o equipamento ficou em alerta **depois** que o item foi guardado. O resultado é Íntegro, Exposto ou Comprometido, com limites próprios por categoria (vacinas são as mais rígidas). Quando um equipamento entra em alerta, o aviso já lista os itens em risco.
- Lista em ordem **FEFO** (vence primeiro, sai primeiro), com filtros Vencendo, Vencidos e Em risco, busca e categorias. No detalhe do sensor, os itens aparecem nas prateleiras e podem ser **arrastados** entre elas.
- **Retirar** permite tirar uma parte ou tudo, com motivo (consumido, descartado ou transferido). O registro continua no histórico. Apagar o registro (só admin) serve para lançamentos errados.
- A busca global (Ctrl K) encontra itens: “frango” mostra onde ele está.

## Testes de backend

No Windows com XAMPP:

```powershell
C:\xampp\php\php.exe tests\tempic-core.test.php
C:\xampp\php\php.exe tests\tempic-database.test.php
C:\xampp\php\php.exe tests\tempic-equipe.test.php
C:\xampp\php\php.exe tests\tempic-inventario.test.php
```

`tempic-equipe` cobre a matriz de permissões, os convites (uso único, revogado, expirado), as mudanças de papel, a proteção do dono, a auditoria e o “ciente”. `tempic-inventario` cobre FEFO, validade sugerida, compatibilidade, retirada parcial e total, o cálculo da exposição e o isolamento entre espaços.

O teste do banco usa um arquivo temporário e verifica isolamento de sensores, leituras, estatísticas, alertas, ajustes e acesso entre usuários.

## Dados persistidos

O schema automático contém `users`, `sensors`, `readings`, `alerts` e `sensor_adjustments`, mais `memberships`, `invites`, `storage_items` e `audit_log`. Bancos antigos ganham as colunas novas sozinhos, sem perder dados, e as contas existentes viram administradoras do próprio espaço. As senhas são gravadas com `password_hash()`; consultas usam prepared statements. Não é necessária configuração manual de tabela para SQLite.

Veja [IOT_INTEGRATION.md](IOT_INTEGRATION.md) para o ponto exato de integração de ESP32/MQTT/API e as salvaguardas esperadas para credenciais de dispositivo.