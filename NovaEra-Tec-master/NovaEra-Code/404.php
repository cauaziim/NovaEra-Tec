<?php
http_response_code(404);
// Funciona tanto na raiz do domínio quanto em subpastas (ex.: XAMPP)
$docRoot = rtrim(str_replace('\\', '/', (string) realpath($_SERVER['DOCUMENT_ROOT'] ?? '')), '/');
$here = str_replace('\\', '/', __DIR__);
$base = ($docRoot !== '' && str_starts_with($here, $docRoot) ? substr($here, strlen($docRoot)) : '') . '/';
?>
<!DOCTYPE html>
<html lang="pt-BR">

<head>
    <meta charset="UTF-8">
    <base href="<?= htmlspecialchars($base, ENT_QUOTES) ?>">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <title>Página não encontrada | NovaEra Code</title>
    <meta name="description" content="A página procurada não existe ou mudou de endereço.">
    <meta name="robots" content="noindex">
    <meta name="theme-color" content="#fafafa">

    <script>(function(r){r.classList.add("js");try{var t=localStorage.getItem("theme");if(t==="dark"||(!t&&matchMedia("(prefers-color-scheme: dark)").matches))r.dataset.theme="dark";if(sessionStorage.getItem("ne-boot"))r.classList.add("no-preloader")}catch(e){}if(!matchMedia("(prefers-reduced-motion: reduce)").matches){r.classList.add("motion");setTimeout(function(){if(!window.__neMotion)r.classList.remove("motion")},3500)}})(document.documentElement)</script>

    <link rel="icon" type="image/webp" href="img/opt/logo-mark.webp">
    <link rel="apple-touch-icon" href="img/apple-touch-icon.png">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,500..900&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css">
    <link rel="stylesheet" href="css/style.css?v=20261030">
</head>

<body>

    <a class="skip-link" href="#conteudo">Pular para o conteúdo</a>

    <div id="preloader" class="preloader" role="status" aria-live="polite" aria-label="Carregando NovaEra Code">
        <div class="preloader-inner">
            <img class="preloader-logo" src="img/opt/logo-mark.webp" alt="" width="64" height="64">
            <div class="preloader-bar" aria-hidden="true">
                <div class="preloader-bar-fill" id="preloaderFill"></div>
            </div>
            <div class="preloader-status">
                <span id="preloaderStatus">Inicializando...</span>
                <span id="preloaderPercent">0%</span>
            </div>
        </div>
    </div>
    <!-- ===================== CABEÇALHO ===================== -->
    <header class="site-header" data-header>
        <div class="container nav">
            <a href="index.php" class="brand" aria-label="NovaEra Code — página inicial">
                <span class="brand-mark"><img src="img/opt/logo-mark.webp" alt="" width="40" height="40"></span>
                <span class="brand-name">Nova<b>Era</b> Code</span>
            </a>

            <nav class="nav-menu" id="nav-menu" aria-label="Navegação principal">
                <ul class="nav-list">
                    <li><a href="index.php" class="nav-link">Início</a></li>
                    <li><a href="html/sobre.html" class="nav-link">Sobre</a></li>
                    <li><a href="html/equipe.html" class="nav-link">Equipe</a></li>
                    <li><a href="html/projetos.html" class="nav-link">Projetos</a></li>
                    <li><a href="html/contato.html" class="nav-link">Contato</a></li>
                </ul>
                <a href="html/contato.html?assunto=Or%C3%A7amento#contact-form" class="btn btn-primary btn-sm nav-cta">Solicitar orçamento</a>
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

        <section class="error-page" aria-labelledby="page-title">
            <div class="container">
                <div class="error-page-inner">
                    <span class="error-code" aria-hidden="true">404</span>
                    <span class="eyebrow">Página não encontrada</span>
                    <h1 id="page-title">Este endereço não existe — ou mudou de lugar.</h1>
                    <p class="lead">Confira se o link está correto ou siga por um destes caminhos.</p>
                    <div class="btn-row">
                        <a href="index.php" class="btn btn-primary btn-lg">
                            <i class="fas fa-house" aria-hidden="true"></i>
                            Voltar ao início
                        </a>
                        <a href="html/projetos.html" class="btn btn-secondary btn-lg">
                            <i class="fas fa-folder-open" aria-hidden="true"></i>
                            Ver projetos
                        </a>
                    </div>
                    <p class="error-hint"><code>GET <span><?= htmlspecialchars(strtok($_SERVER['REQUEST_URI'] ?? '/', '?'), ENT_QUOTES) ?></span></code> → 404</p>
                </div>
            </div>
        </section>
    </main>


    <!-- ===================== RODAPÉ ===================== -->
    <footer class="site-footer">
        <div class="container">
            <div class="footer-grid">
                <div class="footer-brand">
                    <a href="index.php" class="brand" aria-label="NovaEra Code — página inicial">
                        <span class="brand-mark"><img src="img/opt/logo-mark.webp" alt="" width="40" height="40" loading="lazy"></span>
                        <span class="brand-name">Nova<b>Era</b> Code</span>
                    </a>
                    <p>Transformando ideias em soluções digitais inovadoras.</p>
                </div>

                <nav class="footer-col" aria-labelledby="footer-nav">
                    <h2 id="footer-nav">Navegação</h2>
                    <ul>
                        <li><a href="index.php">Início</a></li>
                        <li><a href="html/sobre.html">Sobre</a></li>
                        <li><a href="html/equipe.html">Equipe</a></li>
                        <li><a href="html/projetos.html">Projetos</a></li>
                    </ul>
                </nav>

                <nav class="footer-col" aria-labelledby="footer-projetos">
                    <h2 id="footer-projetos">Projetos</h2>
                    <ul>
                        <li><a href="html/Tempic.html">Tempic</a></li>
                        <li><a href="html/FarmaDigital.html">Farma Digital</a></li>
                        <li><a href="html/PublicCard.html">Public Card</a></li>
                    </ul>
                </nav>

                <div class="footer-col footer-col-contact">
                    <h2>Contato</h2>
                    <ul>
                        <li><a href="html/contato.html"><i class="fas fa-paper-plane" aria-hidden="true"></i> Fale com a equipe</a></li>
                        <li><a href="mailto:contato@novaeracode.com"><i class="fas fa-envelope" aria-hidden="true"></i> contato@novaeracode.com</a></li>
                        <li><a href="html/login.html"><i class="fas fa-user" aria-hidden="true"></i> Área do cliente</a></li>
                    </ul>
                </div>
            </div>

            <div class="footer-bottom">
                <p>© <span data-year>2026</span> NovaEra Code. Todos os direitos reservados. · <a href="html/privacidade.html">Política de privacidade</a></p>
                <p>Vídeos: Mixkit · Fotos: Unsplash · Clima: Open-Meteo</p>
            </div>
        </div>
    </footer>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js" defer></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js" defer></script>
    <script src="https://cdn.jsdelivr.net/npm/lenis@1.1.13/dist/lenis.min.js" defer></script>
    <script src="js/script.js?v=20261030" defer></script>
    <script src="js/motion.js?v=20261030" defer></script>

</body>

</html>
