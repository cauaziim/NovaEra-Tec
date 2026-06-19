<!DOCTYPE html>
<html lang="pt-BR">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>NovaEra Code - Transformando ideias em soluções</title>

    <link rel="stylesheet" href="css/style.css">

    <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700&family=Roboto:wght@300;400;500&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
    <link rel="icon" type="image/png" href="img/logonova.png">

</head>

<body>

    <!-- ===================== NAVBAR ===================== -->
    <nav class="navbar">
        <div class="nav-container">

            <div class="logo">
                <img src="img/logonova.png" alt="NovaEra Code" class="logo-img">
                <span class="logo-text">NovaEra Code</span>
            </div>

            <ul class="nav-menu">
                <li class="nav-item">
                    <a href="index.php" class="nav-link active">Início</a>
                </li>

                <!-- "Sobre" e "Quem Somos" unificados -->
                <li class="nav-item">
                    <a href="html/sobre.html" class="nav-link">Sobre & Equipe</a>
                </li>

                <li class="nav-item">
                    <a href="html/projetos.html" class="nav-link">Projetos</a>
                </li>

                <!-- Nova página de contato -->
                <li class="nav-item">
                    <a href="html/contato.html" class="nav-link">Contato</a>
                </li>
            </ul>
            <button id="theme-toggle" class="theme-toggle">
                <i class="fas fa-moon"></i>
            </button>
            <div class="hamburger">
                <span></span>
                <span></span>
                <span></span>
            </div>

        </div>
    </nav>
    <div id="loader">
        <div class="loader-spinner"></div>
    </div>

    <!-- ===================== HERO ===================== -->
    <section class="hero">
        <div class="hero-container">

            <div class="hero-content">
                <h1 class="hero-title">
                    Transformando
                    <span class="highlight">ideias</span> em
                    <span class="highlight">soluções digitais</span>
                </h1>
                <p class="hero-subtitle">
                    Desenvolvemos sistemas, sites e aplicações modernas para
                    empresas que desejam crescer no mundo digital.
                </p>
                <div class="hero-buttons">
                    <a href="html/projetos.html" class="btn btn-primary">
                        Ver Projetos
                        <i class="fas fa-arrow-right"></i>
                    </a>
                    <a href="html/sobre.html" class="btn btn-secondary">
                        Nossa Equipe
                    </a>
                </div>
            </div>

            <div class="hero-image">
                <div class="tech-animation">
                    <div class="circle circle-1"></div>
                    <div class="circle circle-2"></div>
                    <div class="circle circle-3"></div>
                    <div class="circle circle-4"></div>
                    <div class="circle circle-5"></div>

                    <div class="floating-ui-card">
                        <div class="card-header">
                            <span class="dot red"></span>
                            <span class="dot yellow"></span>
                            <span class="dot green"></span>
                        </div>
                        <div class="card-body">
                            <div class="code-line w-70"></div>
                            <div class="code-line w-50 highlight-line"></div>
                            <div class="code-line w-80"></div>
                            <div class="code-line w-40"></div>
                        </div>

                        <div class="card-badge">
                            <i class="fab fa-js"></i>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        </div>

        </div>
    </section>

    <!-- ===================== STATS ===================== -->
    <section class="testimonials-animated">
        <div class="section-title">
            <h2>O que nossos parceiros dizem</h2>
            <p>Histórias de sucesso de quem confiou na NovaEra Code</p>
        </div>

        <div class="marquee-wrapper">
            <div class="marquee-track">

                <div class="testimonial-card">
                    <div class="quote-icon"><i class="fas fa-quote-left"></i></div>
                    <div class="stars">
                        <i class="fas fa-star"></i><i class="fas fa-star"></i><i class="fas fa-star"></i><i class="fas fa-star"></i><i class="fas fa-star"></i>
                    </div>
                    <p class="testimonial-text">
                        "O site da Fazenda Prata ficou simplesmente incrível! A equipe traduziu perfeitamente nossa essência de natureza e sustentabilidade em um design moderno e muito responsivo."
                    </p>
                    <div class="testimonial-author">
                        <div class="author-avatar" style="background: linear-gradient(135deg, #2ecc71, #27ae60);">FP</div>
                        <div class="author-info">
                            <strong>Diretoria Sustentável</strong>
                            <span>Fazenda Prata</span>
                        </div>
                    </div>
                </div>

                <div class="testimonial-card">
                    <div class="quote-icon"><i class="fas fa-quote-left"></i></div>
                    <div class="stars">
                        <i class="fas fa-star"></i><i class="fas fa-star"></i><i class="fas fa-star"></i><i class="fas fa-star"></i><i class="fas fa-star"></i>
                    </div>
                    <p class="testimonial-text">
                        "A reformulação do nosso sistema superou todas as expectativas. A gestão do Pet Gato ficou muito mais ágil, segura e o design da interface facilitou muito o nosso dia a dia."
                    </p>
                    <div class="testimonial-author">
                        <div class="author-avatar" style="background: linear-gradient(135deg, #f39c12, #d35400);">PG</div>
                        <div class="author-info">
                            <strong>Gestão de Operações</strong>
                            <span>Pet Gato</span>
                        </div>
                    </div>
                </div>

                <div class="testimonial-card">
                    <div class="quote-icon"><i class="fas fa-quote-left"></i></div>
                    <div class="stars">
                        <i class="fas fa-star"></i><i class="fas fa-star"></i><i class="fas fa-star"></i><i class="fas fa-star"></i><i class="fas fa-star"></i>
                    </div>
                    <p class="testimonial-text">
                        "A NovaEra Code captou exatamente a força e a elegância que queríamos transmitir. A identidade digital da Ouro e Crina ganhou um nível de profissionalismo que impulsionou nossas vendas."
                    </p>
                    <div class="testimonial-author">
                        <div class="author-avatar" style="background: linear-gradient(135deg, #f1c40f, #f39c12);">OC</div>
                        <div class="author-info">
                            <strong>Fundador</strong>
                            <span>Ouro e Crina</span>
                        </div>
                    </div>
                </div>

                <div class="testimonial-card">
                    <div class="quote-icon"><i class="fas fa-quote-left"></i></div>
                    <div class="stars">
                        <i class="fas fa-star"></i><i class="fas fa-star"></i><i class="fas fa-star"></i><i class="fas fa-star"></i><i class="fas fa-star-half-alt"></i>
                    </div>
                    <p class="testimonial-text">
                        "Excelente trabalho no desenvolvimento do nosso e-commerce. A plataforma da Balaboots ficou rápida, intuitiva e converte super bem. Suporte técnico rápido e sempre à disposição."
                    </p>
                    <div class="testimonial-author">
                        <div class="author-avatar" style="background: linear-gradient(135deg, #e74c3c, #c0392b);">BB</div>
                        <div class="author-info">
                            <strong>Equipe Comercial</strong>
                            <span>Balaboots Energy</span>
                        </div>
                    </div>
                </div>

                <div class="testimonial-card">
                    <div class="quote-icon"><i class="fas fa-quote-left"></i></div>
                    <div class="stars">
                        <i class="fas fa-star"></i><i class="fas fa-star"></i><i class="fas fa-star"></i><i class="fas fa-star"></i><i class="fas fa-star"></i>
                    </div>
                    <p class="testimonial-text">
                        "O site da Fazenda Prata ficou simplesmente incrível! A equipe traduziu perfeitamente nossa essência de natureza e sustentabilidade em um design moderno e muito responsivo."
                    </p>
                    <div class="testimonial-author">
                        <div class="author-avatar" style="background: linear-gradient(135deg, #2ecc71, #27ae60);">FP</div>
                        <div class="author-info">
                            <strong>Diretoria Sustentável</strong>
                            <span>Fazenda Prata</span>
                        </div>
                    </div>
                </div>

                <div class="testimonial-card">
                    <div class="quote-icon"><i class="fas fa-quote-left"></i></div>
                    <div class="stars">
                        <i class="fas fa-star"></i><i class="fas fa-star"></i><i class="fas fa-star"></i><i class="fas fa-star"></i><i class="fas fa-star"></i>
                    </div>
                    <p class="testimonial-text">
                        "A reformulação do nosso sistema superou todas as expectativas. A gestão do Pet Gato ficou muito mais ágil, segura e o design da interface facilitou muito o nosso dia a dia."
                    </p>
                    <div class="testimonial-author">
                        <div class="author-avatar" style="background: linear-gradient(135deg, #f39c12, #d35400);">PG</div>
                        <div class="author-info">
                            <strong>Gestão de Operações</strong>
                            <span>Pet Gato</span>
                        </div>
                    </div>
                </div>

                <div class="testimonial-card">
                    <div class="quote-icon"><i class="fas fa-quote-left"></i></div>
                    <div class="stars">
                        <i class="fas fa-star"></i><i class="fas fa-star"></i><i class="fas fa-star"></i><i class="fas fa-star"></i><i class="fas fa-star"></i>
                    </div>
                    <p class="testimonial-text">
                        "A NovaEra Code captou exatamente a força e a elegância que queríamos transmitir. A identidade digital da Ouro e Crina ganhou um nível de profissionalismo que impulsionou nossas vendas."
                    </p>
                    <div class="testimonial-author">
                        <div class="author-avatar" style="background: linear-gradient(135deg, #f1c40f, #f39c12);">OC</div>
                        <div class="author-info">
                            <strong>Fundador</strong>
                            <span>Ouro e Crina</span>
                        </div>
                    </div>
                </div>

                <div class="testimonial-card">
                    <div class="quote-icon"><i class="fas fa-quote-left"></i></div>
                    <div class="stars">
                        <i class="fas fa-star"></i><i class="fas fa-star"></i><i class="fas fa-star"></i><i class="fas fa-star"></i><i class="fas fa-star-half-alt"></i>
                    </div>
                    <p class="testimonial-text">
                        "Excelente trabalho no desenvolvimento do nosso e-commerce. A plataforma da Balaboots ficou rápida, intuitiva e converte super bem. Suporte técnico rápido e sempre à disposição."
                    </p>
                    <div class="testimonial-author">
                        <div class="author-avatar" style="background: linear-gradient(135deg, #e74c3c, #c0392b);">BB</div>
                        <div class="author-info">
                            <strong>Equipe Comercial</strong>
                            <span>Balaboots Energy</span>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    </section>

    <!-- ===================== VALORES ===================== -->
    <section class="nosso-dna">
        <div class="container">
            <div class="section-title">
                <h2>Nosso DNA</h2>
                <p>Missão, visão e os pilares que guiam nosso código.</p>
            </div>

            <div class="bento-grid">

                <div class="bento-card bento-missao">
                    <div class="bento-bg-image" style="background-image: url('https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&q=80&w=1000');"></div>
                    <div class="bento-overlay"></div>
                    <div class="bento-content">
                        <span class="bento-badge">Missão</span>
                        <h3>Desenvolver o futuro, hoje.</h3>
                        <p>Nossa missão é traduzir ideias complexas em soluções digitais inteligentes, escaláveis e com design impecável, impulsionando o crescimento dos nossos parceiros.</p>
                    </div>
                </div>

                <div class="bento-card bento-visao">
                    <div class="glow-effect"></div>
                    <div class="bento-content">
                        <span class="bento-badge badge-outline">Visão</span>
                        <h3>Ser a principal referência em engenharia de software e inovação web.</h3>
                    </div>
                </div>

                <div class="bento-card bento-valores">
                    <div class="bento-content">
                        <span class="bento-badge">Nossos Valores</span>
                        <div class="valores-tags">
                            <div class="v-tag">
                                <i class="fas fa-rocket"></i> Alta Performance
                            </div>
                            <div class="v-tag">
                                <i class="fas fa-shield-alt"></i> Segurança Absoluta
                            </div>
                            <div class="v-tag">
                                <i class="fas fa-brain"></i> Inovação Contínua
                            </div>
                            <div class="v-tag">
                                <i class="fas fa-handshake"></i> Transparência
                            </div>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    </section>

    <section class="tech-stack">
        <div class="section-title">
            <h2>Tecnologias que dominamos</h2>
            <p>Ferramentas de ponta para construir soluções robustas e escaláveis</p>
        </div>

        <div class="tech-track-wrapper">
            <div class="tech-track" id="techTrack">

                <!-- === Conjunto 1 === -->
                <div class="tech-badge">
                    <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/php/php-plain.svg" alt="PHP">
                    <span>PHP</span>
                </div>
                <div class="tech-badge">
                    <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/laravel/laravel-plain.svg" alt="Laravel">
                    <span>Laravel</span>
                </div>
                <div class="tech-badge">
                    <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/javascript/javascript-original.svg" alt="JavaScript">
                    <span>JavaScript</span>
                </div>
                <div class="tech-badge">
                    <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/typescript/typescript-original.svg" alt="TypeScript">
                    <span>TypeScript</span>
                </div>
                <div class="tech-badge">
                    <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/react/react-original.svg" alt="React">
                    <span>React</span>
                </div>
                <div class="tech-badge">
                    <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/flutter/flutter-original.svg" alt="Flutter">
                    <span>Flutter</span>
                </div>
                <div class="tech-badge">
                    <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/dart/dart-original.svg" alt="Dart">
                    <span>Dart</span>
                </div>
                <div class="tech-badge">
                    <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/python/python-original.svg" alt="Python">
                    <span>Python</span>
                </div>
                <div class="tech-badge">
                    <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/mysql/mysql-original.svg" alt="MySQL">
                    <span>MySQL</span>
                </div>
                <div class="tech-badge">
                    <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/css3/css3-original.svg" alt="CSS3">
                    <span>CSS3</span>
                </div>
                <div class="tech-badge">
                    <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/html5/html5-original.svg" alt="HTML5">
                    <span>HTML5</span>
                </div>
                <div class="tech-badge">
                    <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/nodejs/nodejs-original.svg" alt="Node.js">
                    <span>Node.js</span>
                </div>
                <div class="tech-badge">
                    <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/git/git-original.svg" alt="Git">
                    <span>Git</span>
                </div>
                <div class="tech-badge">
                    <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/docker/docker-original.svg" alt="Docker">
                    <span>Docker</span>
                </div>

                <!-- === Conjunto 2 (duplicado para loop contínuo) === -->
                <div class="tech-badge">
                    <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/php/php-plain.svg" alt="PHP">
                    <span>PHP</span>
                </div>
                <div class="tech-badge">
                    <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/Laravel.svg/250px-Laravel.svg.png" alt="Laravel">
                    <span>Laravel</span>
                </div>
                <div class="tech-badge">
                    <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/javascript/javascript-original.svg" alt="JavaScript">
                    <span>JavaScript</span>
                </div>
                <div class="tech-badge">
                    <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/typescript/typescript-original.svg" alt="TypeScript">
                    <span>TypeScript</span>
                </div>
                <div class="tech-badge">
                    <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/react/react-original.svg" alt="React">
                    <span>React</span>
                </div>
                <div class="tech-badge">
                    <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/flutter/flutter-original.svg" alt="Flutter">
                    <span>Flutter</span>
                </div>
                <div class="tech-badge">
                    <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/dart/dart-original.svg" alt="Dart">
                    <span>Dart</span>
                </div>
                <div class="tech-badge">
                    <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/python/python-original.svg" alt="Python">
                    <span>Python</span>
                </div>
                <div class="tech-badge">
                    <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/mysql/mysql-original.svg" alt="MySQL">
                    <span>MySQL</span>
                </div>
                <div class="tech-badge">
                    <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/css3/css3-original.svg" alt="CSS3">
                    <span>CSS3</span>
                </div>
                <div class="tech-badge">
                    <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/html5/html5-original.svg" alt="HTML5">
                    <span>HTML5</span>
                </div>
                <div class="tech-badge">
                    <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/nodejs/nodejs-original.svg" alt="Node.js">
                    <span>Node.js</span>
                </div>
                <div class="tech-badge">
                    <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/git/git-original.svg" alt="Git">
                    <span>Git</span>
                </div>
                <div class="tech-badge">
                    <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/docker/docker-original.svg" alt="Docker">
                    <span>Docker</span>
                </div>

            </div>
        </div>
    </section>


    <!-- ===================== PACOTES ===================== -->
    <section class="pricing-section">
        <div class="container">

            <div class="section-title">
                <h2>Pacotes de Desenvolvimento</h2>
                <p>Escolha a solução ideal para o seu negócio</p>
            </div>

            <div class="pricing-grid">

                <!-- Básico -->
                <div class="pricing-card">
                    <div class="pricing-header">
                        <h3>Start</h3>
                        <div class="price">
                            <span>R$</span>799
                        </div>
                        <p>Ideal para pequenos negócios</p>
                    </div>

                    <ul>
                        <li><i class="fas fa-check"></i> Site até 5 páginas</li>
                        <li><i class="fas fa-check"></i> Design Responsivo</li>
                        <li><i class="fas fa-check"></i> Formulário de Contato</li>
                        <li><i class="fas fa-check"></i> SEO Básico</li>
                        <li><i class="fas fa-check"></i> Suporte 7 dias</li>
                    </ul>

                    <a href="#" class="pricing-btn">Solicitar</a>
                </div>

                <!-- Destaque -->
                <div class="pricing-card featured">
                    <div class="featured-badge">Mais Popular</div>

                    <div class="pricing-header">
                        <h3>Business</h3>
                        <div class="price">
                            <span>R$</span>2.499
                        </div>
                        <p>Para empresas em crescimento</p>
                    </div>

                    <ul>
                        <li><i class="fas fa-check"></i> Site Profissional</li>
                        <li><i class="fas fa-check"></i> Painel Administrativo</li>
                        <li><i class="fas fa-check"></i> Banco de Dados</li>
                        <li><i class="fas fa-check"></i> Integrações</li>
                        <li><i class="fas fa-check"></i> SEO Avançado</li>
                        <li><i class="fas fa-check"></i> Suporte 30 dias</li>
                    </ul>

                    <a href="#" class="pricing-btn">Solicitar</a>
                </div>

                <!-- Premium -->
                <div class="pricing-card">
                    <div class="pricing-header">
                        <h3>Enterprise</h3>
                        <div class="price">
                            <span>A partir de</span><br>
                            R$ 4.999
                        </div>
                        <p>Sistemas personalizados</p>
                    </div>

                    <ul>
                        <li><i class="fas fa-check"></i> Sistema Sob Medida</li>
                        <li><i class="fas fa-check"></i> API Integrada</li>
                        <li><i class="fas fa-check"></i> Dashboard Completo</li>
                        <li><i class="fas fa-check"></i> Banco de Dados</li>
                        <li><i class="fas fa-check"></i> Alta Performance</li>
                        <li><i class="fas fa-check"></i> Suporte Prioritário</li>
                    </ul>

                    <a href="#" class="pricing-btn">Solicitar</a>
                </div>

            </div>
        </div>
    </section>
    <!-- ===================== PROJETOS ===================== -->
    <section class="projects-section">
        <div class="projects-container">

            <div class="section-title">
                <h2>Nossos Projetos</h2>
                <p>Veja algumas soluções desenvolvidas pela NovaEra Code</p>
            </div>

            <div class="projects-grid">
                <div class="project-card">

                    <div class="project-image">
                        <img src="https://fazendaprata.com.br/wp-content/uploads/2018/09/Logotipo-Fazenda-Prata-FINAL-2-1-e1536088429495.png">
                    </div>

                    <div class="project-content">
                        <span class="project-category">Sistema Web</span>

                        <h3>Fazenda Prata</h3>
                        </h3>

                        <p>
                            Plataforma de gestão agrícola com monitoramento de culturas, controle de estoque e análise de dados para otimizar a produção.

                        </p>

                        <a href="#">Ver projeto</a>
                    </div>

                </div>
                <div class="project-card">

                    <div class="project-image">
                        <img src="img/projeto1.jpg">
                    </div>

                    <div class="project-content">
                        <span class="project-category">Sistema Web</span>

                        <h3>Sistema Escolar</h3>

                        <p>
                            Plataforma completa com painel administrativo,
                            controle de notas e dashboards.
                        </p>

                        <a href="#">Ver projeto</a>
                    </div>

                </div>
                <div class="project-card">

                    <div class="project-image">
                        <img src="img/projeto1.jpg">
                    </div>

                    <div class="project-content">
                        <span class="project-category">Sistema Web</span>

                        <h3>Sistema Escolar</h3>

                        <p>
                            Plataforma completa com painel administrativo,
                            controle de notas e dashboards.
                        </p>

                        <a href="#">Ver projeto</a>
                    </div>

                </div>


    </section>

    <!-- ===================== DEPOIMENTOS (NOVO) ===================== -->
    <section class="testimonials">
        <div class="section-title">
            <h2>O que nossos parceiros dizem</h2>
            <p>Resultados reais para empresas que confiaram na NovaEra Code</p>
        </div>

        <div class="testimonials-grid">

            <div class="testimonial-card">
                <div class="quote-icon">
                    <i class="fas fa-quote-left"></i>
                </div>

                <div class="stars">
                    <i class="fas fa-star"></i>
                    <i class="fas fa-star"></i>
                    <i class="fas fa-star"></i>
                    <i class="fas fa-star"></i>
                    <i class="fas fa-star"></i>
                </div>

                <p class="testimonial-text">
                    "A NovaEra Code transformou nossa presença digital. O novo site da Fazenda Prata transmite exatamente nossos valores de sustentabilidade e profissionalismo."
                </p>

                <div class="testimonial-author">
                    <div class="author-avatar" style="background:linear-gradient(135deg,#2ecc71,#27ae60);">
                        FP
                    </div>

                    <div class="author-info">
                        <strong>Fazenda Prata</strong>
                        <span>Gestão Institucional</span>
                    </div>
                </div>
            </div>

            <div class="testimonial-card">
                <div class="quote-icon">
                    <i class="fas fa-quote-left"></i>
                </div>

                <div class="stars">
                    <i class="fas fa-star"></i>
                    <i class="fas fa-star"></i>
                    <i class="fas fa-star"></i>
                    <i class="fas fa-star"></i>
                    <i class="fas fa-star"></i>
                </div>

                <p class="testimonial-text">
                    "Nosso sistema ficou muito mais rápido e organizado. O trabalho da equipe trouxe eficiência para processos que antes consumiam horas do nosso dia."
                </p>

                <div class="testimonial-author">
                    <div class="author-avatar" style="background:linear-gradient(135deg,#f39c12,#d35400);">
                        PG
                    </div>

                    <div class="author-info">
                        <strong>Pet Gato</strong>
                        <span>Equipe Operacional</span>
                    </div>
                </div>
            </div>

            <div class="testimonial-card">
                <div class="quote-icon">
                    <i class="fas fa-quote-left"></i>
                </div>

                <div class="stars">
                    <i class="fas fa-star"></i>
                    <i class="fas fa-star"></i>
                    <i class="fas fa-star"></i>
                    <i class="fas fa-star"></i>
                    <i class="fas fa-star"></i>
                </div>

                <p class="testimonial-text">
                    "O resultado superou nossas expectativas. O visual moderno e a experiência do usuário ajudaram a fortalecer nossa marca e aumentar a credibilidade online."
                </p>

                <div class="testimonial-author">
                    <div class="author-avatar" style="background:linear-gradient(135deg,#f1c40f,#f39c12);">
                        OC
                    </div>

                    <div class="author-info">
                        <strong>Ouro e Crina</strong>
                        <span>Fundação e Marketing</span>
                    </div>
                </div>
            </div>

        </div>


    </section>


    </div>
    </section>

    <!-- ===================== SERVIÇOS + CTA (ATUALIZADO) ===================== -->
    <section class="servicos">
        <div class="container">

            <h2 class="section-title">Vamos criar algo incrível?</h2>

            <div class="servicos-grid">

                <div class="servico-card">
                    <i class="fas fa-code"></i>
                    <h3>Sites Profissionais</h3>
                    <p>Sites modernos e responsivos para destacar sua empresa.</p>
                </div>

                <div class="servico-card">
                    <i class="fas fa-server"></i>
                    <h3>Sistemas Inteligentes</h3>
                    <p>Soluções personalizadas para automatizar processos.</p>
                </div>

                <div class="servico-card">
                    <i class="fas fa-mobile-alt"></i>
                    <h3>Aplicativos Mobile</h3>
                    <p>Apps modernos para Android e iOS com foco em performance.</p>
                </div>

            </div>

            <!-- CTA NOVO -->
            <div class="servicos-cta">
                <a
                    href="https://wa.me/5519999999999?text=Olá!%20Vim%20pelo%20site%20da%20NovaEra%20Code%20e%20gostaria%20de%20solicitar%20um%20orçamento."
                    class="btn-cta-whatsapp"
                    target="_blank"
                    rel="noopener noreferrer">
                    <i class="fab fa-whatsapp"></i>
                    Solicitar Orçamento pelo WhatsApp
                </a>

                <a href="html/contato.html" class="btn-cta-contact">
                    <i class="fas fa-envelope"></i>
                    Fale com um Especialista
                </a>

                <span class="servicos-cta-label">
                    Respondemos em até 2 horas &nbsp;·&nbsp; Orçamento 100% gratuito
                </span>
            </div>

        </div>
    </section>

    <!-- ===================== FOOTER ===================== -->
    <footer class="footer">
        <div class="footer-container">

            <h3>NovaEra Code</h3>
            <p>Transformando ideias em soluções digitais inovadoras.</p>

            <div class="social-icons">
                <a href="#" aria-label="Instagram"><i class="fab fa-instagram"></i></a>
                <a href="#" aria-label="LinkedIn"><i class="fab fa-linkedin"></i></a>
                <a href="#" aria-label="GitHub"><i class="fab fa-github"></i></a>
                <a
                    href="https://wa.me/5519999999999"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="WhatsApp">
                    <i class="fab fa-whatsapp"></i>
                </a>
            </div>

            <p class="copyright">© 2026 NovaEra Code - Todos os direitos reservados</p>

        </div>
    </footer>

    <!-- <script src="js/script.js"></script> -->

</body>

</html>