<!DOCTYPE html>
<html lang="pt-BR">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <title>NovaEra Code | Transformando ideias em soluções digitais</title>
    <meta name="description" content="A NovaEra Code desenvolve sites, sistemas e aplicativos sob medida para empresas que desejam crescer no mundo digital.">
    <meta name="theme-color" content="#f5f7fb">

    <script>try{var t=localStorage.getItem("theme");if(t==="dark"||(!t&&matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.dataset.theme="dark"}catch(e){}</script>

    <link rel="icon" type="image/webp" href="img/opt/logo-mark.webp">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="preconnect" href="https://images.unsplash.com">
    <link rel="preconnect" href="https://assets.mixkit.co">
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,500..900&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@500&display=swap">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css">
    <link rel="stylesheet" href="css/style.css">
</head>

<body class="has-media-hero">

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
                    <li><a href="index.php" class="nav-link active" aria-current="page">Início</a></li>
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

        <!-- ===================== HERO EM VÍDEO ===================== -->
        <section class="hero-cine on-media" aria-labelledby="hero-title">
            <div class="media-bg" aria-hidden="true">
                <video data-src="https://assets.mixkit.co/videos/46635/46635-720.mp4" data-parallax="10"
                    poster="https://images.unsplash.com/photo-1555066931-4365d14bab8c?auto=format&fit=crop&w=1600&q=60"
                    muted loop playsinline preload="none"></video>
            </div>

            <div class="container hero-cine-inner">
                <span class="eyebrow" data-fade-up>NovaEra Code · Software sob medida</span>
                <h1 class="display hero-cine-title" id="hero-title" data-split>
                    <span class="line">Transformando</span>
                    <span class="line">ideias em</span>
                    <span class="line"><em>soluções digitais</em></span>
                </h1>
                <div class="hero-cine-foot" data-fade-up="0.5">
                    <p>
                        Desenvolvemos sistemas, sites e aplicações modernas para
                        empresas que desejam crescer no mundo digital.
                    </p>
                    <div class="btn-row">
                        <a href="html/projetos.html" class="btn btn-primary btn-lg">
                            Ver projetos
                            <i class="fas fa-arrow-right" aria-hidden="true"></i>
                        </a>
                        <a href="html/equipe.html" class="btn btn-secondary btn-lg">
                            Nossa equipe
                        </a>
                    </div>
                </div>
            </div>

            <button type="button" class="icon-btn video-toggle" data-video-toggle aria-pressed="false" aria-label="Reproduzir vídeo de fundo">
                <i class="fas fa-play" aria-hidden="true"></i>
            </button>
            <a href="#servicos" class="scroll-cue">Role</a>
        </section>

        <!-- ===================== FAIXA CINÉTICA ===================== -->
        <div class="kinetic" aria-hidden="true">
            <div class="kinetic-track">
                <div class="kinetic-group">
                    <span>Sites</span><i>✦</i><span>Sistemas</span><i>✦</i><span>Aplicativos</span><i>✦</i><span>IoT</span><i>✦</i><span>APIs</span><i>✦</i><span>Dashboards</span><i>✦</i>
                </div>
                <div class="kinetic-group" aria-hidden="true">
                    <span>Sites</span><i>✦</i><span>Sistemas</span><i>✦</i><span>Aplicativos</span><i>✦</i><span>IoT</span><i>✦</i><span>APIs</span><i>✦</i><span>Dashboards</span><i>✦</i>
                </div>
            </div>
        </div>

        <!-- ===================== SERVIÇOS ===================== -->
        <section class="section" id="servicos" aria-labelledby="servicos-title">
            <div class="container">
                <div class="section-head">
                    <span class="eyebrow">O que fazemos</span>
                    <h2 id="servicos-title" class="display" data-split><span class="line">Vamos criar algo</span><span class="line">incrível?</span></h2>
                    <p>Do site institucional ao sistema sob medida: tecnologia pensada para o seu negócio.</p>
                </div>

                <div class="grid grid-3" data-stagger>
                    <article class="media-card">
                        <img src="https://images.unsplash.com/photo-1555066931-4365d14bab8c?auto=format&fit=crop&w=900&q=70"
                            srcset="https://images.unsplash.com/photo-1555066931-4365d14bab8c?auto=format&fit=crop&w=600&q=70 600w, https://images.unsplash.com/photo-1555066931-4365d14bab8c?auto=format&fit=crop&w=900&q=70 900w"
                            sizes="(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 400px" alt="" loading="lazy" width="900" height="1125">
                        <span class="media-card-index">01 / Web</span>
                        <h3>Sites Profissionais</h3>
                        <p>Sites modernos e responsivos para destacar sua empresa.</p>
                    </article>
                    <article class="media-card">
                        <img src="https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&w=900&q=70"
                            srcset="https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&w=600&q=70 600w, https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&w=900&q=70 900w"
                            sizes="(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 400px" alt="" loading="lazy" width="900" height="1125">
                        <span class="media-card-index">02 / Sistemas</span>
                        <h3>Sistemas Inteligentes</h3>
                        <p>Soluções personalizadas para automatizar processos.</p>
                    </article>
                    <article class="media-card">
                        <img src="https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?auto=format&fit=crop&w=900&q=70"
                            srcset="https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?auto=format&fit=crop&w=600&q=70 600w, https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?auto=format&fit=crop&w=900&q=70 900w"
                            sizes="(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 400px" alt="" loading="lazy" width="900" height="1125">
                        <span class="media-card-index">03 / Mobile</span>
                        <h3>Aplicativos Mobile</h3>
                        <p>Apps modernos para Android e iOS com foco em performance.</p>
                    </article>
                </div>
            </div>
        </section>

        <!-- ===================== NÚMEROS ===================== -->
        <section class="section section-tight section-alt" aria-label="NovaEra Code em números">
            <div class="container stats-grid" data-stagger>
                <div class="stat"><span class="stat-num" data-count="3">03</span><span class="stat-label">produtos no portfólio</span></div>
                <div class="stat"><span class="stat-num" data-count="5">05</span><span class="stat-label">especialistas no time</span></div>
                <div class="stat"><span class="stat-num" data-count="14">14</span><span class="stat-label">tecnologias no nosso stack</span></div>
                <div class="stat"><span class="stat-num" data-count="4">04</span><span class="stat-label">etapas, do planejamento à entrega</span></div>
            </div>
        </section>

        <!-- ===================== PROJETOS EM DESTAQUE ===================== -->
        <section class="section" aria-labelledby="projetos-title">
            <div class="container rail-head">
                <div class="section-head">
                    <span class="eyebrow">Portfólio</span>
                    <h2 id="projetos-title" class="display" data-split><span class="line">Projetos em</span><span class="line">destaque</span></h2>
                    <p>Conheça algumas soluções desenvolvidas pela NovaEra Code.</p>
                </div>
                <div class="rail-controls">
                    <button type="button" class="icon-btn" data-rail-prev="projects-rail" aria-controls="projects-rail" aria-label="Projeto anterior"><i class="fas fa-arrow-left" aria-hidden="true"></i></button>
                    <button type="button" class="icon-btn" data-rail-next="projects-rail" aria-controls="projects-rail" aria-label="Próximo projeto"><i class="fas fa-arrow-right" aria-hidden="true"></i></button>
                    <a href="html/projetos.html" class="btn btn-secondary">Ver todos</a>
                </div>
            </div>

            <div class="rail" id="projects-rail" data-rail tabindex="0" aria-label="Projetos em destaque (role para os lados)">
                <a class="rail-card accent-tempic" href="html/Tempic.html">
                    <div class="rail-media">
                        <img src="https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&w=1200&q=70"
                            srcset="https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&w=700&q=70 700w, https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&w=1200&q=70 1200w"
                            sizes="(max-width: 740px) 84vw, 620px" alt="" loading="lazy" width="1200" height="750">
                        <img class="rail-logo" src="img/opt/logo_tempic.webp" alt="Logotipo do Tempic" width="88" height="88" loading="lazy">
                    </div>
                    <div class="rail-body">
                        <span class="chip chip-brand">IoT e monitoramento</span>
                        <h3>Tempic</h3>
                        <p>Sistema IoT que monitora câmaras frias e veículos refrigerados em tempo real, com alertas e acionamento remoto de equipamentos e da iluminação.</p>
                        <span class="text-link">Conhecer projeto <i class="fas fa-arrow-right" aria-hidden="true"></i></span>
                    </div>
                </a>

                <a class="rail-card accent-farma" href="html/FarmaDigital.html">
                    <div class="rail-media">
                        <img src="https://images.unsplash.com/photo-1631549916768-4119b2e5f926?auto=format&fit=crop&w=1200&q=70"
                            srcset="https://images.unsplash.com/photo-1631549916768-4119b2e5f926?auto=format&fit=crop&w=700&q=70 700w, https://images.unsplash.com/photo-1631549916768-4119b2e5f926?auto=format&fit=crop&w=1200&q=70 1200w"
                            sizes="(max-width: 740px) 84vw, 620px" alt="" loading="lazy" width="1200" height="750">
                        <img class="rail-logo" src="img/opt/farma_digital.webp" alt="Logotipo do Farma Digital" width="88" height="88" loading="lazy">
                    </div>
                    <div class="rail-body">
                        <span class="chip chip-brand">Aplicativo</span>
                        <h3>Farma Digital</h3>
                        <p>Aplicativo para facilitar o acesso da população aos medicamentos fornecidos pela prefeitura.</p>
                        <span class="text-link">Conhecer projeto <i class="fas fa-arrow-right" aria-hidden="true"></i></span>
                    </div>
                </a>

                <a class="rail-card accent-public" href="html/PublicCard.html">
                    <div class="rail-media">
                        <img src="https://images.unsplash.com/photo-1517400508447-f8dd518b86db?auto=format&fit=crop&w=1200&q=70"
                            srcset="https://images.unsplash.com/photo-1517400508447-f8dd518b86db?auto=format&fit=crop&w=700&q=70 700w, https://images.unsplash.com/photo-1517400508447-f8dd518b86db?auto=format&fit=crop&w=1200&q=70 1200w"
                            sizes="(max-width: 740px) 84vw, 620px" alt="" loading="lazy" width="1200" height="750">
                        <img class="rail-logo" src="img/opt/public.webp" alt="Logotipo do Public Card" width="88" height="88" loading="lazy">
                    </div>
                    <div class="rail-body">
                        <span class="chip chip-brand">Plataforma digital</span>
                        <h3>Public Card</h3>
                        <p>Plataforma digital voltada à modernização de serviços, organização de dados e atendimento.</p>
                        <span class="text-link">Conhecer projeto <i class="fas fa-arrow-right" aria-hidden="true"></i></span>
                    </div>
                </a>
            </div>
        </section>

        <!-- ===================== NOSSO DNA ===================== -->
        <section class="section section-alt" aria-labelledby="dna-title">
            <div class="container">
                <div class="section-head">
                    <span class="eyebrow">Quem somos</span>
                    <h2 id="dna-title" class="display" data-split><span class="line">Nosso DNA</span></h2>
                    <p>Missão, visão e os pilares que guiam nosso código.</p>
                </div>

                <div class="bento" data-stagger>
                    <article class="bento-card bento-missao">
                        <div class="bento-bg" style="background-image: url('https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&q=70&w=1200');"></div>
                        <span class="eyebrow">Missão</span>
                        <h3>Desenvolver o futuro, hoje.</h3>
                        <p>Nossa missão é traduzir ideias complexas em soluções digitais inteligentes, escaláveis e com design impecável, impulsionando o crescimento dos nossos parceiros.</p>
                    </article>

                    <article class="bento-card bento-visao">
                        <span class="eyebrow">Visão</span>
                        <h3>Ser a principal referência em engenharia de software e inovação web.</h3>
                    </article>

                    <article class="bento-card bento-valores">
                        <span class="eyebrow">Nossos valores</span>
                        <ul class="value-tags">
                            <li class="value-tag"><i class="fas fa-rocket" aria-hidden="true"></i> Alta Performance</li>
                            <li class="value-tag"><i class="fas fa-shield-halved" aria-hidden="true"></i> Segurança Absoluta</li>
                            <li class="value-tag"><i class="fas fa-brain" aria-hidden="true"></i> Inovação Contínua</li>
                            <li class="value-tag"><i class="fas fa-handshake" aria-hidden="true"></i> Transparência</li>
                        </ul>
                    </article>
                </div>
            </div>
        </section>

        <!-- ===================== TECNOLOGIAS ===================== -->
        <section class="section section-tight" aria-labelledby="tech-title">
            <div class="container">
                <div class="section-head center">
                    <span class="eyebrow">Stack</span>
                    <h2 id="tech-title">Tecnologias que dominamos</h2>
                    <p>Ferramentas de ponta para construir soluções robustas e escaláveis.</p>
                </div>
            </div>

            <div class="marquee">
                <div class="marquee-track">
                    <ul class="marquee-group">
                        <li class="tech-badge"><img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/php/php-plain.svg" alt="" width="26" height="26">PHP</li>
                        <li class="tech-badge"><img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/laravel/laravel-original.svg" alt="" width="26" height="26">Laravel</li>
                        <li class="tech-badge"><img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/javascript/javascript-original.svg" alt="" width="26" height="26">JavaScript</li>
                        <li class="tech-badge"><img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/typescript/typescript-original.svg" alt="" width="26" height="26">TypeScript</li>
                        <li class="tech-badge"><img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/react/react-original.svg" alt="" width="26" height="26">React</li>
                        <li class="tech-badge"><img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/flutter/flutter-original.svg" alt="" width="26" height="26">Flutter</li>
                        <li class="tech-badge"><img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/dart/dart-original.svg" alt="" width="26" height="26">Dart</li>
                        <li class="tech-badge"><img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/python/python-original.svg" alt="" width="26" height="26">Python</li>
                        <li class="tech-badge"><img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/mysql/mysql-original.svg" alt="" width="26" height="26">MySQL</li>
                        <li class="tech-badge"><img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/css3/css3-original.svg" alt="" width="26" height="26">CSS3</li>
                        <li class="tech-badge"><img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/html5/html5-original.svg" alt="" width="26" height="26">HTML5</li>
                        <li class="tech-badge"><img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/nodejs/nodejs-original.svg" alt="" width="26" height="26">Node.js</li>
                        <li class="tech-badge"><img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/git/git-original.svg" alt="" width="26" height="26">Git</li>
                        <li class="tech-badge"><img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/docker/docker-original.svg" alt="" width="26" height="26">Docker</li>
                    </ul>
                    <!-- Cópia para o loop contínuo (oculta de leitores de tela) -->
                    <ul class="marquee-group" aria-hidden="true">
                        <li class="tech-badge"><img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/php/php-plain.svg" alt="" width="26" height="26">PHP</li>
                        <li class="tech-badge"><img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/laravel/laravel-original.svg" alt="" width="26" height="26">Laravel</li>
                        <li class="tech-badge"><img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/javascript/javascript-original.svg" alt="" width="26" height="26">JavaScript</li>
                        <li class="tech-badge"><img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/typescript/typescript-original.svg" alt="" width="26" height="26">TypeScript</li>
                        <li class="tech-badge"><img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/react/react-original.svg" alt="" width="26" height="26">React</li>
                        <li class="tech-badge"><img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/flutter/flutter-original.svg" alt="" width="26" height="26">Flutter</li>
                        <li class="tech-badge"><img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/dart/dart-original.svg" alt="" width="26" height="26">Dart</li>
                        <li class="tech-badge"><img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/python/python-original.svg" alt="" width="26" height="26">Python</li>
                        <li class="tech-badge"><img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/mysql/mysql-original.svg" alt="" width="26" height="26">MySQL</li>
                        <li class="tech-badge"><img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/css3/css3-original.svg" alt="" width="26" height="26">CSS3</li>
                        <li class="tech-badge"><img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/html5/html5-original.svg" alt="" width="26" height="26">HTML5</li>
                        <li class="tech-badge"><img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/nodejs/nodejs-original.svg" alt="" width="26" height="26">Node.js</li>
                        <li class="tech-badge"><img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/git/git-original.svg" alt="" width="26" height="26">Git</li>
                        <li class="tech-badge"><img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/docker/docker-original.svg" alt="" width="26" height="26">Docker</li>
                    </ul>
                </div>
            </div>
        </section>

        <!-- ===================== PACOTES ===================== -->
        <section class="section section-alt" aria-labelledby="pacotes-title">
            <div class="container">
                <div class="section-head center">
                    <span class="eyebrow">Investimento</span>
                    <h2 id="pacotes-title" class="display" data-split><span class="line">Pacotes de</span><span class="line">Desenvolvimento</span></h2>
                    <p>Escolha a solução ideal para o seu negócio.</p>
                </div>

                <div class="grid grid-3 pricing-grid" data-stagger>
                    <article class="card pricing-card">
                        <header>
                            <h3>Start</h3>
                            <p class="price"><small>R$</small>799</p>
                            <p>Ideal para pequenos negócios</p>
                        </header>
                        <ul class="check-list">
                            <li>Site até 5 páginas</li>
                            <li>Design Responsivo</li>
                            <li>Formulário de Contato</li>
                            <li>SEO Básico</li>
                            <li>Suporte 7 dias</li>
                        </ul>
                        <a href="html/contato.html?pacote=Start#contact-form" class="btn btn-secondary btn-block">Solicitar <span class="sr-only">pacote Start</span></a>
                    </article>

                    <article class="card pricing-card featured">
                        <span class="chip chip-brand featured-badge">Mais popular</span>
                        <header>
                            <h3>Business</h3>
                            <p class="price"><small>R$</small>2.499</p>
                            <p>Para empresas em crescimento</p>
                        </header>
                        <ul class="check-list">
                            <li>Site Profissional</li>
                            <li>Painel Administrativo</li>
                            <li>Banco de Dados</li>
                            <li>Integrações</li>
                            <li>SEO Avançado</li>
                            <li>Suporte 30 dias</li>
                        </ul>
                        <a href="html/contato.html?pacote=Business#contact-form" class="btn btn-primary btn-block">Solicitar <span class="sr-only">pacote Business</span></a>
                    </article>

                    <article class="card pricing-card">
                        <header>
                            <h3>Enterprise</h3>
                            <p class="price"><span class="price-prefix">A partir de</span><small>R$</small>4.999</p>
                            <p>Sistemas personalizados</p>
                        </header>
                        <ul class="check-list">
                            <li>Sistema Sob Medida</li>
                            <li>API Integrada</li>
                            <li>Dashboard Completo</li>
                            <li>Banco de Dados</li>
                            <li>Alta Performance</li>
                            <li>Suporte Prioritário</li>
                        </ul>
                        <a href="html/contato.html?pacote=Enterprise#contact-form" class="btn btn-secondary btn-block">Solicitar <span class="sr-only">pacote Enterprise</span></a>
                    </article>
                </div>
            </div>
        </section>

        <!-- ===================== CTA EM VÍDEO ===================== -->
        <section class="cta-cine on-media" aria-labelledby="cta-title">
            <div class="media-bg" aria-hidden="true">
                <video data-src="https://assets.mixkit.co/videos/23282/23282-720.mp4" data-parallax="14"
                    poster="https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1600&q=60"
                    muted loop playsinline preload="none"></video>
            </div>
            <div class="container cta-cine-inner">
                <span class="eyebrow">Próximo passo</span>
                <h2 id="cta-title" class="display" data-split><span class="line">Tem um projeto</span><span class="line"><em>em mente?</em></span></h2>
                <p>Conte-nos sobre sua necessidade para conversarmos sobre o projeto.</p>
                <div class="btn-row">
                    <a href="html/contato.html?assunto=Or%C3%A7amento#contact-form" class="btn btn-primary btn-lg">
                        <i class="fas fa-envelope" aria-hidden="true"></i>
                        Solicitar orçamento
                    </a>
                    <a href="html/projetos.html" class="btn btn-secondary btn-lg">
                        <i class="fas fa-folder-open" aria-hidden="true"></i>
                        Conhecer projetos
                    </a>
                </div>
            </div>
            <button type="button" class="icon-btn video-toggle" data-video-toggle aria-pressed="false" aria-label="Reproduzir vídeo de fundo">
                <i class="fas fa-play" aria-hidden="true"></i>
            </button>
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
                <p>© <span data-year>2026</span> NovaEra Code. Todos os direitos reservados.</p>
                <p>Vídeos: Mixkit · Fotos: Unsplash · Clima: Open-Meteo</p>
            </div>
        </div>
    </footer>

    <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js" defer></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js" defer></script>
    <script src="https://cdn.jsdelivr.net/npm/lenis@1.1.13/dist/lenis.min.js" defer></script>
    <script src="js/script.js" defer></script>
    <script src="js/motion.js" defer></script>

</body>

</html>
