// ==========================================
// NOVAERA CODE - PREMIUM SCRIPT v4.0
// ==========================================

document.addEventListener("DOMContentLoaded", () => {

    // ==========================================
    // ELEMENTOS GLOBAIS
    // ==========================================

    const navbar = document.querySelector(".navbar");
    const hamburger = document.querySelector(".hamburger");
    const navMenu = document.querySelector(".nav-menu");
    const themeToggle = document.getElementById("theme-toggle");
    const hero = document.querySelector(".hero");

    // ==========================================
    // TEMA ESCURO / CLARO
    // ==========================================

    function initTheme() {

        if (!themeToggle) return;

        const savedTheme = localStorage.getItem("theme");

        if (
            savedTheme === "dark" ||
            (
                !savedTheme &&
                window.matchMedia("(prefers-color-scheme: dark)").matches
            )
        ) {
            document.body.classList.add("dark-mode");
            themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
        }

        themeToggle.addEventListener("click", () => {

            document.body.classList.toggle("dark-mode");

            const dark =
                document.body.classList.contains("dark-mode");

            localStorage.setItem(
                "theme",
                dark ? "dark" : "light"
            );

            themeToggle.innerHTML = dark
                ? '<i class="fas fa-sun"></i>'
                : '<i class="fas fa-moon"></i>';

        });

    }

    // ==========================================
    // MENU MOBILE
    // ==========================================

    function initMenu() {

        if (!hamburger || !navMenu) return;

        hamburger.addEventListener("click", () => {

            hamburger.classList.toggle("active");
            navMenu.classList.toggle("active");

        });

        document.querySelectorAll(".nav-link")
            .forEach(link => {

                link.addEventListener("click", () => {

                    hamburger.classList.remove("active");
                    navMenu.classList.remove("active");

                });

            });

        document.addEventListener("click", e => {

            if (
                navMenu.classList.contains("active") &&
                !navMenu.contains(e.target) &&
                !hamburger.contains(e.target)
            ) {

                navMenu.classList.remove("active");
                hamburger.classList.remove("active");

            }

        });

        window.addEventListener("resize", () => {

            if (window.innerWidth > 768) {

                navMenu.classList.remove("active");
                hamburger.classList.remove("active");

            }

        });

    }

    // ==========================================
    // NAVBAR INTELIGENTE
    // ==========================================

    function initNavbar() {

        if (!navbar) return;

        let lastScroll = 0;

        window.addEventListener("scroll", () => {

            const current = window.scrollY;

            navbar.classList.toggle(
                "scrolled",
                current > 50
            );

            if (
                current > lastScroll &&
                current > 100
            ) {
                navbar.style.transform =
                    "translateY(-100%)";
            } else {
                navbar.style.transform =
                    "translateY(0)";
            }

            lastScroll = current;

        }, { passive: true });

    }

    // ==========================================
    // BOTÃO VOLTAR AO TOPO
    // ==========================================

    function initScrollTop() {

        let btn =
            document.querySelector(".scroll-top-btn");

        if (!btn) {

            btn = document.createElement("button");

            btn.className = "scroll-top-btn";

            btn.innerHTML =
                '<i class="fas fa-arrow-up"></i>';

            document.body.appendChild(btn);

        }

        btn.addEventListener("click", () => {

            window.scrollTo({
                top: 0,
                behavior: "smooth"
            });

        });

        window.addEventListener("scroll", () => {

            btn.classList.toggle(
                "show",
                window.scrollY > 400
            );

        });

    }

    // ==========================================
    // CONTADORES
    // ==========================================

    function animateNumbers(container) {

        const numbers =
            container.querySelectorAll(".stat-number");

        numbers.forEach(number => {

            const target =
                parseInt(number.dataset.target);

            if (!target) return;

            const duration = 2000;
            const start = performance.now();

            const easeOutExpo = t =>
                t === 1
                    ? 1
                    : 1 - Math.pow(2, -10 * t);

            const update = now => {

                const progress =
                    Math.min(
                        (now - start) / duration,
                        1
                    );

                const value =
                    target * easeOutExpo(progress);

                number.textContent =
                    Math.ceil(value)
                        .toLocaleString("pt-BR");

                if (progress < 1) {

                    requestAnimationFrame(update);

                }

            };

            requestAnimationFrame(update);

        });

    }

    // ==========================================
    // REVEAL ON SCROLL
    // ==========================================

    function initReveal() {

        const elements = document.querySelectorAll(
            ".stats, .valor-card, .servico-card, .team-card, .project-card, .testimonial-card"
        );

        const observer =
            new IntersectionObserver(
                (entries, obs) => {

                    entries.forEach(entry => {

                        if (!entry.isIntersecting)
                            return;

                        entry.target.classList.add(
                            "show"
                        );

                        if (
                            entry.target.classList.contains(
                                "stats"
                            )
                        ) {

                            animateNumbers(
                                entry.target
                            );

                        }

                        obs.unobserve(
                            entry.target
                        );

                    });

                },
                {
                    threshold: 0.15
                }
            );

        elements.forEach(el => {

            el.classList.add("reveal");

            observer.observe(el);

        });

    }

    // ==========================================
    // SCROLL SUAVE
    // ==========================================

    function initSmoothScroll() {

        document
            .querySelectorAll('a[href^="#"]')
            .forEach(link => {

                link.addEventListener(
                    "click",
                    e => {

                        const target =
                            document.querySelector(
                                link.getAttribute(
                                    "href"
                                )
                            );

                        if (!target) return;

                        e.preventDefault();

                        target.scrollIntoView({
                            behavior: "smooth"
                        });

                    }
                );

            });

    }

    // ==========================================
    // PARALLAX HERO
    // ==========================================

    function initParallax() {

        if (!hero) return;

        window.addEventListener(
            "mousemove",
            e => {

                const x =
                    (
                        e.clientX /
                        window.innerWidth -
                        0.5
                    ) * 10;

                const y =
                    (
                        e.clientY /
                        window.innerHeight -
                        0.5
                    ) * 10;

                hero.style.transform =
                    `translate(${x}px, ${y}px)`;

            }
        );

    }

    // ==========================================
    // CARDS 3D
    // ==========================================

    function initCards3D() {

        document
            .querySelectorAll(".project-card")
            .forEach(card => {

                card.addEventListener(
                    "mousemove",
                    e => {

                        const rect =
                            card.getBoundingClientRect();

                        const x =
                            e.clientX - rect.left;

                        const y =
                            e.clientY - rect.top;

                        const rotateY =
                            (
                                x / rect.width -
                                0.5
                            ) * 10;

                        const rotateX =
                            -(
                                y / rect.height -
                                0.5
                            ) * 10;

                        card.style.transform =
                            `
                            perspective(1000px)
                            rotateX(${rotateX}deg)
                            rotateY(${rotateY}deg)
                            translateY(-8px)
                        `;

                    }
                );

                card.addEventListener(
                    "mouseleave",
                    () => {

                        card.style.transform =
                            "";

                    }
                );

            });

    }

    // ==========================================
    // LOADER
    // ==========================================

    function initLoader() {

        const loader =
            document.getElementById("loader");

        if (!loader) return;

        const hideLoader = () => {

            loader.classList.add("hide");

            // Tempo alinhado com a transição de 1s do CSS
            // (deixa a saída suave em vez de sumir de repente).
            setTimeout(() => {

                loader.remove();

            }, 1000);

        };

        // Se a página já terminou de carregar antes deste script
        // rodar, o evento "load" nunca vai disparar e o loader
        // ficaria preso cobrindo a tela para sempre.
        if (document.readyState === "complete") {

            hideLoader();

        } else {

            window.addEventListener("load", hideLoader);

            // Rede de segurança: se algum recurso travar o "load"
            // (imagem quebrada, script externo lento, etc.), o
            // loader some de qualquer jeito depois de 6s.
            setTimeout(hideLoader, 6000);

        }

    }

    // ==========================================
    // INICIALIZAÇÃO
    // ==========================================

    initTheme();
    initMenu();
    initNavbar();
    initScrollTop();
    initReveal();
    initSmoothScroll();
    initParallax();
    initCards3D();
    initLoader();

    console.log(
        "%cNovaEra Code 🚀",
        "color:#2563EB;font-size:16px;font-weight:bold;"
    );

});

// login //

// 1. Simulação de um banco de dados de usuários permitidos
const usuariosValidos = [
    { email: "admin@novaeracode.com.br", senha: "123" },
    { email: "cliente@teste.com", senha: "senha" },
    { email: "dev@novaera.com", senha: "admin" }
];

const loginForm = document.getElementById('loginForm');


if(loginForm){

    loginForm.addEventListener('submit', function(event) {

        event.preventDefault();


        const emailInput =
        document.getElementById('email').value.trim();


        const passInput =
        document.getElementById('password').value.trim();


        const errorMessage =
        document.getElementById('errorMessage');


        errorMessage.style.display = 'none';


        const usuarioEncontrado =
        usuariosValidos.find(
            (user)=>
            user.email === emailInput &&
            user.senha === passInput
        );


        if(usuarioEncontrado){

            localStorage.setItem(
                'novaEra_session',
                JSON.stringify({
                    email:usuarioEncontrado.email,
                    isLogged:true,
                    loginTime:new Date().toISOString()
                })
            );


            window.location.href="index.php";


        }else{

            errorMessage.innerText =
            "E-mail ou senha incorretos. Tente novamente!";


            errorMessage.style.display="block";

        }

    });

}
const password =
document.getElementById("password");

const toggle =
document.getElementById("togglePassword");


if(password && toggle){

    toggle.addEventListener("click",()=>{

        password.type =
        password.type === "password"
        ? "text"
        : "password";

    });

}

// login //