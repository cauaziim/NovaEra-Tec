# NovaEra Code

Site institucional da NovaEra Code e demonstração web do **Tempic**, sistema IoT de monitoramento e controle de temperatura para câmaras frias, freezers e veículos refrigerados (TCC do Técnico em Desenvolvimento de Sistemas — SENAI, 2026).

Produção: <https://novaeracode.com.br>

## Stack

| Camada | Tecnologia |
|---|---|
| Front-end | HTML, CSS (design tokens, tema claro/escuro), JavaScript sem framework |
| Animações | GSAP 3.12 + ScrollTrigger, Lenis 1.1 (rolagem suave) — respeitam `prefers-reduced-motion` |
| Back-end | PHP 8.1+ (`strict_types`, prepared statements, `password_hash`) |
| Banco | MySQL (área do cliente) · SQLite (formulário de contato e Tempic) |
| Tempic real | ESP32 + sensores, API Node.js, MySQL, app Flutter |

## Estrutura

```text
index.php                 página inicial
404.php                   página de erro (usada pelo .htaccess)
html/                     páginas do site, projetos, login, cadastro e privacidade
html/Tempic.html          página do projeto Tempic
html/tempic-app.html      painel web do Tempic (demonstração)
css/style.css             estilos compartilhados (tokens, componentes, animações)
css/tempic-app.css        estilos do painel do Tempic
js/script.js              tema, menu, preloader, formulários, filtros, modal
js/motion.js              animações de entrada, rolagem e efeitos (GSAP + Lenis)
js/tempic-app.js          painel do Tempic (SPA)
php/                      login, cadastro, área do cliente, API de contato e API do Tempic
php/tempic-access.php     papéis e permissões do Tempic (administrador e membro)
php/tempic-inventory.php  inventário: categorias, validade, compatibilidade, exposição
data/                     banco SQLite do Tempic (criado sozinho, bloqueado pela web)
database/usuarios.sql     tabela de usuários da área do cliente (MySQL)
img/opt, img/photos       imagens otimizadas em WebP servidas pelo próprio site
tests/                    testes em PHP puro
```

## Como rodar localmente

Pré-requisito: PHP 8.1 ou superior com `pdo_sqlite` (o do XAMPP serve).

```bash
# na pasta NovaEra-Code
php -S localhost:8000
```

Acesse <http://localhost:8000>. Pelo XAMPP, copie a pasta para `htdocs` e acesse pelo Apache.

- **Tempic e formulário de contato:** funcionam sem configuração. O Tempic grava em `data/tempic.sqlite` (detalhes em [TEMPIC_SETUP.md](TEMPIC_SETUP.md)).
- **Área do cliente (login e cadastro do site):** precisa de um MySQL. Crie o banco, rode `database/usuarios.sql` e copie `php/config.local.example.php` para `php/config.local.php` com os dados de conexão — ou defina `NOVAERA_DB_HOST`, `NOVAERA_DB_USER`, `NOVAERA_DB_PASSWORD`, `NOVAERA_DB_NAME` e `NOVAERA_DB_PORT`. Detalhes em [php/CONFIGURACAO.md](php/CONFIGURACAO.md). Sem isso, essas páginas respondem "Banco de dados não configurado".

## Testes

```bash
php tests/contato.test.php
php tests/tempic-core.test.php
php tests/tempic-database.test.php
php tests/tempic-controle.test.php
php tests/tempic-demo.test.php
php tests/tempic-equipe.test.php
php tests/tempic-inventario.test.php
```

No Windows com XAMPP, troque `php` por `C:\xampp\php\php.exe`.

## Painel web do Tempic

`html/tempic-app.html` é uma SPA sem framework (`js/tempic-app.js`), com rotas por hash:

- **Visão geral** — saúde da operação, sensores com minigráfico ao vivo, posição na faixa segura e o que está guardado em cada equipamento.
- **Sensor** — medidor em arco com zonas de alerta, alvo ajustável, refrigeração (automática com histerese ou manual), gráfico com tooltip, exportação CSV, **laboratório de falhas** e as prateleiras do equipamento com arrastar e soltar.
- **Inventário** — o que está guardado em cada equipamento, em ordem FEFO, com validade sugerida, aviso de incompatibilidade (ex.: vacina no freezer), tempo de exposição fora da faixa por item e cadastro escrevendo uma frase ("2 kg de frango no freezer p2").
- **Iluminação** — acionamento remoto e programação com linha do tempo de 24 h (inclui janelas que passam da meia-noite).
- **Atividade** — alertas e acionamentos agrupados por dia, com "estou ciente" e notificações do navegador.
- **Administração** — equipe, convites por código ou link, troca de papéis, matriz de permissões e auditoria de quem fez o quê (exportável em CSV).
- Paleta de comandos (`Ctrl/⌘ + K`), tema claro/escuro e conta temporária com ambiente de demonstração em um clique.

**Papéis:** quem cria conta sem convite é administrador do próprio espaço. Membros (entram por convite) acompanham tudo, recebem alertas e guardam/retiram itens, mas não alteram configurações. A API confere a permissão em toda requisição.

Uma única requisição `action=tick` a cada 5 s gera a leitura de todos os sensores e aplica o controle automático. Integração com o hardware real em [IOT_INTEGRATION.md](IOT_INTEGRATION.md).

## Segurança

- Senhas com `password_hash` (bcrypt) e rehash automático; consultas sempre parametrizadas.
- Login com `session_regenerate_id`, cookie `HttpOnly` + `SameSite=Lax`, limite de 5 tentativas a cada 10 minutos por IP e resposta igual para e-mail existente ou não.
- Tempic: token CSRF em toda ação, permissões por papel verificadas no servidor e auditoria das alterações.
- Logout apenas por POST.
- Formulário de contato com honeypot e intervalo mínimo entre envios.
- `.htaccess` com HTTPS obrigatório, cabeçalhos de segurança, bloqueio de `tests/`, `data/`, `database/` e arquivos de configuração.

## Publicação

1. Envie todo o conteúdo de `NovaEra-Code/` para a raiz pública do domínio.
2. Confirme que o servidor é Apache com `AllowOverride All` (para o `.htaccess`). Em Nginx, replique as regras de bloqueio e a página 404.
3. Garanta permissão de escrita na pasta `data/` (banco do Tempic).
4. Configure as variáveis do banco MySQL e rode `database/usuarios.sql` (área do cliente).
5. Envie `sitemap.xml` no Google Search Console.

## Limitações conhecidas

- A demonstração do Tempic usa leituras simuladas; a integração com o ESP32 via MQTT está descrita em [IOT_INTEGRATION.md](IOT_INTEGRATION.md).
- O site tem dois logins separados: a área do cliente (MySQL) e o Tempic (SQLite). As contas não são compartilhadas.
- A área do cliente ainda não lista projetos reais; mostra atalhos para orçamento, demonstração e suporte.
- O aplicativo desktop do Tempic está em desenvolvimento; por enquanto o acesso é pelo painel web.
