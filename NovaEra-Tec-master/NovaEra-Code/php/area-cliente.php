<?php
declare(strict_types=1);

require_once __DIR__ . '/sessao.php';

$usuario = novaeraCurrentUser();
if ($usuario === null) {
    novaeraRedirect('../html/login.html?erro=sessao');
}

header('Cache-Control: no-store, private');

$primeiroNome = explode(' ', trim($usuario['nome']))[0] ?: 'cliente';
$e = fn (string $value): string => htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
?>
<!DOCTYPE html>
<html lang="pt-BR">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <title>Área do cliente | NovaEra Code</title>
    <meta name="robots" content="noindex, nofollow">
    <meta name="theme-color" content="#fafafa">

    <script>(function(r){r.classList.add("js","no-preloader");try{var t=localStorage.getItem("theme");if(t==="dark"||(!t&&matchMedia("(prefers-color-scheme: dark)").matches))r.dataset.theme="dark"}catch(e){}if(!matchMedia("(prefers-reduced-motion: reduce)").matches){r.classList.add("motion");setTimeout(function(){if(!window.__neMotion)r.classList.remove("motion")},3500)}})(document.documentElement)</script>

    <link rel="icon" type="image/webp" href="../img/opt/logo-mark.webp">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,500..900&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css">
    <link rel="stylesheet" href="../css/style.css?v=20261030">
</head>

<body>

    <a class="skip-link" href="#conteudo">Pular para o conteúdo</a>

    <header class="site-header" data-header>
        <div class="container nav">
            <a href="../index.php" class="brand" aria-label="NovaEra Code — página inicial">
                <span class="brand-mark"><img src="../img/opt/logo-mark.webp" alt="" width="40" height="40"></span>
                <span class="brand-name">Nova<b>Era</b> Code</span>
            </a>

            <nav class="nav-menu" id="nav-menu" aria-label="Navegação principal">
                <ul class="nav-list">
                    <li><a href="../index.php" class="nav-link">Início</a></li>
                    <li><a href="../html/projetos.html" class="nav-link">Projetos</a></li>
                    <li><a href="../html/contato.html" class="nav-link">Contato</a></li>
                    <li><a href="area-cliente.php" class="nav-link active" aria-current="page">Área do cliente</a></li>
                </ul>
            </nav>

            <div class="nav-actions">
                <button type="button" id="theme-toggle" class="icon-btn theme-toggle" aria-label="Ativar tema escuro">
                    <i class="fas fa-moon" aria-hidden="true"></i>
                </button>
                <button type="button" class="icon-btn hamburger" aria-controls="nav-menu" aria-expanded="false" aria-label="Abrir menu">
                    <span></span><span></span><span></span>
                </button>
            </div>
        </div>
    </header>

    <main id="conteudo">
        <section class="page-hero" aria-labelledby="page-title">
            <div class="container">
                <div class="page-hero-inner">
                    <span class="eyebrow">Área do cliente</span>
                    <h1 id="page-title">Olá, <?= $e($primeiroNome) ?></h1>
                    <p class="lead">Você entrou como <strong><?= $e($usuario['email']) ?></strong>. Aqui ficam os projetos acompanhados com a equipe NovaEra Code.</p>
                    <form action="logout.php" method="POST">
                        <button type="submit" class="btn btn-secondary">
                            <i class="fas fa-arrow-right-from-bracket" aria-hidden="true"></i>
                            Sair da conta
                        </button>
                    </form>
                </div>
            </div>
        </section>

        <section class="section section-tight" aria-labelledby="painel-title">
            <div class="container">
                <h2 id="painel-title" class="sr-only">Painel</h2>
                <div class="grid grid-3" data-stagger>
                    <article class="card">
                        <span class="card-icon"><i class="fas fa-folder-open" aria-hidden="true"></i></span>
                        <h3>Seus projetos</h3>
                        <p>Nenhum projeto vinculado à sua conta ainda. Quando a equipe iniciar um projeto com você, o andamento aparece aqui.</p>
                        <a href="../html/contato.html?assunto=Or%C3%A7amento#contact-form" class="text-link">Solicitar orçamento <i class="fas fa-arrow-right" aria-hidden="true"></i></a>
                    </article>
                    <article class="card">
                        <span class="card-icon"><i class="fas fa-temperature-low" aria-hidden="true"></i></span>
                        <h3>Demonstração do Tempic</h3>
                        <p>Teste o painel de monitoramento com sensores simulados, alertas e controle da refrigeração.</p>
                        <a href="../html/tempic-app.html" target="_blank" rel="noopener" class="text-link">Abrir demonstração <i class="fas fa-arrow-right" aria-hidden="true"></i><span class="sr-only"> (abre em nova aba)</span></a>
                    </article>
                    <article class="card">
                        <span class="card-icon"><i class="fas fa-headset" aria-hidden="true"></i></span>
                        <h3>Suporte</h3>
                        <p>Dúvidas sobre um projeto ou sobre a sua conta? Fale direto com a equipe.</p>
                        <a href="../html/contato.html?assunto=Suporte%20%E2%80%94%20%C3%A1rea%20do%20cliente#contact-form" class="text-link">Abrir chamado <i class="fas fa-arrow-right" aria-hidden="true"></i></a>
                    </article>
                </div>
            </div>
        </section>
    </main>

    <footer class="site-footer">
        <div class="container">
            <div class="footer-bottom">
                <p>© <span data-year>2026</span> NovaEra Code. Todos os direitos reservados. · <a href="../html/privacidade.html">Política de privacidade</a></p>
            </div>
        </div>
    </footer>

    <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js" defer></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js" defer></script>
    <script src="https://cdn.jsdelivr.net/npm/lenis@1.1.13/dist/lenis.min.js" defer></script>
    <script src="../js/script.js?v=20261030" defer></script>
    <script src="../js/motion.js?v=20261030" defer></script>

</body>

</html>
