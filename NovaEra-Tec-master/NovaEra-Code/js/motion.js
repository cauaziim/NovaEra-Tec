// ==========================================
// NOVAERA CODE - ANIMAÇÕES
// GSAP + ScrollTrigger para a entrada das páginas e efeitos de rolagem,
// Lenis para a rolagem suave. Nada roda com "movimento reduzido" ou se
// as bibliotecas não carregarem — o conteúdo continua visível.
// Os elementos [data-reveal] continuam com o reveal de js/script.js.
// ==========================================

document.addEventListener("DOMContentLoaded", () => {

    const root = document.documentElement;
    const gsap = window.gsap;
    const ScrollTrigger = window.ScrollTrigger;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduceMotion || !gsap) {
        root.classList.remove("motion");
        return;
    }

    window.__neMotion = true;
    if (ScrollTrigger) gsap.registerPlugin(ScrollTrigger);

    const ease = "power3.out";
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

    const onReady = callback => {
        if (window.__neReady) callback();
        else document.addEventListener("novaera:ready", callback, { once: true });
    };

    // Divide o texto em palavras preservando <em>, .highlight, .line etc.
    function splitWords(element) {
        if (element.dataset.split === "done") return Array.from(element.querySelectorAll(".split-word-inner"));
        const words = [];

        const walk = node => {
            Array.from(node.childNodes).forEach(child => {
                if (child.nodeType === Node.TEXT_NODE) {
                    const parts = child.textContent.split(/(\s+)/);
                    if (parts.every(part => !part.trim())) return;
                    const fragment = document.createDocumentFragment();
                    parts.forEach(part => {
                        if (!part) return;
                        if (!part.trim()) {
                            fragment.append(document.createTextNode(" "));
                            return;
                        }
                        const outer = document.createElement("span");
                        const inner = document.createElement("span");
                        outer.className = "split-word";
                        inner.className = "split-word-inner";
                        inner.textContent = part;
                        outer.append(inner);
                        fragment.append(outer);
                        words.push(inner);
                    });
                    child.replaceWith(fragment);
                } else if (child.nodeType === Node.ELEMENT_NODE && !/^(I|SVG|IMG|BR)$/i.test(child.tagName)) {
                    walk(child);
                }
            });
        };

        walk(element);
        element.dataset.split = "done";
        return words;
    }

    const revealAll = () => {
        root.classList.remove("motion");
    };

    // ==========================================
    // ROLAGEM SUAVE (Lenis)
    // ==========================================

    function initSmoothScroll() {
        if (!window.Lenis) return;

        const lenis = new window.Lenis({ lerp: 0.11, smoothWheel: true });
        window.__neLenis = lenis;

        if (ScrollTrigger) lenis.on("scroll", ScrollTrigger.update);
        gsap.ticker.add(time => lenis.raf(time * 1000));
        gsap.ticker.lagSmoothing(0);

        // Âncoras da mesma página: rola com o Lenis, descontando o cabeçalho fixo
        document.addEventListener("click", event => {
            const link = event.target.closest('a[href*="#"]');
            if (!link || link.classList.contains("skip-link")) return;
            const url = new URL(link.href, window.location.href);
            if (url.pathname !== window.location.pathname || !url.hash || url.hash === "#") return;
            const target = document.getElementById(decodeURIComponent(url.hash.slice(1)));
            if (!target) return;

            event.preventDefault();
            const headerHeight = document.querySelector("[data-header]")?.offsetHeight || 0;
            lenis.scrollTo(target, {
                offset: -(headerHeight + 16),
                onComplete: () => {
                    if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
                    target.focus({ preventScroll: true });
                }
            });
            history.pushState(null, "", url.hash);
        });

        // Menu mobile e modal travam a rolagem da página
        const syncLock = () => {
            const locked = document.body.classList.contains("nav-open") || document.body.classList.contains("modal-open");
            if (locked) lenis.stop();
            else lenis.start();
        };
        new MutationObserver(syncLock).observe(document.body, { attributes: true, attributeFilter: ["class"] });

        document.querySelectorAll(".modal-dialog, .table-wrap, [data-rail]").forEach(element => {
            element.setAttribute("data-lenis-prevent", "");
        });
    }

    // ==========================================
    // ENTRADA DA PÁGINA
    // ==========================================

    function introHome(tl) {
        const inner = document.querySelector(".hero-x-inner");
        if (!inner) return false;

        const title = inner.querySelector(".hero-x-title");
        const words = title ? splitWords(title) : [];

        tl.fromTo(inner.querySelector(".announce"), { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.6 })
            .set(title, { opacity: 1 }, "<0.1")
            .fromTo(words, { yPercent: 110 }, { yPercent: 0, duration: 0.9, stagger: 0.05 }, "<")
            .fromTo(inner.querySelector(".hero-x-sub"), { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.7 }, "-=0.55")
            .fromTo(inner.querySelector(".hero-x-actions"), { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.7 }, "-=0.5");

        const shot = document.querySelector(".product-shot");
        if (shot) {
            tl.fromTo(shot,
                { opacity: 0, y: 70 },
                { opacity: 1, y: 0, duration: 1.1, ease: "expo.out" },
                "-=0.45");

            const chart = shot.querySelector(".app-chart");
            if (chart) {
                tl.fromTo(chart,
                    { clipPath: "inset(0 100% 0 0)" },
                    { clipPath: "inset(0 0% 0 0)", duration: 1.6, ease: "power2.inOut", clearProps: "clipPath" },
                    "-=0.6");
            }

            tl.fromTo(shot.querySelectorAll(".app-sidebar li, .app-control"),
                { opacity: 0, x: -10 },
                { opacity: 1, x: 0, duration: 0.5, stagger: 0.05 },
                "<");
        }
        return true;
    }

    function introPageHero(tl) {
        const inner = document.querySelector(".page-hero-inner");
        if (!inner) return false;

        const hero = inner.closest(".page-hero, section");
        const media = hero?.querySelectorAll(".media-bg > img:not(.team-hero-strip img), .media-bg > video");
        if (media?.length) {
            tl.fromTo(media, { scale: 1.14 }, { scale: 1, duration: 1.8, ease: "expo.out" }, 0);
        }

        const strip = hero?.querySelectorAll(".team-hero-strip img");
        if (strip?.length) {
            tl.fromTo(strip, { opacity: 0, yPercent: 6 }, { opacity: 1, yPercent: 0, duration: 1.1, stagger: 0.08, ease: "expo.out" }, 0);
        }

        Array.from(inner.children).forEach((child, index) => {
            if (/^H1$/i.test(child.tagName)) {
                const words = splitWords(child);
                tl.set(child, { opacity: 1 }, index ? "-=0.45" : 0.1)
                    .fromTo(words, { yPercent: 110 }, { yPercent: 0, duration: 0.9, stagger: 0.045 }, "<");
            } else {
                tl.fromTo(child, { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.7 }, index ? "-=0.55" : 0.1);
            }
        });

        const grid = inner.parentElement;
        if (grid?.matches(".project-hero-grid, .team-hero-grid")) {
            const aside = Array.from(grid.children).filter(child => child !== inner);
            tl.fromTo(aside, { opacity: 0, x: 40 }, { opacity: 1, x: 0, duration: 1, ease: "expo.out" }, 0.35);
        }
        return true;
    }

    function introAuth(tl) {
        const card = document.querySelector(".auth-card");
        if (!card) return false;
        const banner = document.querySelectorAll(".auth-banner-inner > *");
        tl.fromTo(banner, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.7, stagger: 0.08 }, 0)
            .fromTo(card, { opacity: 0, y: 30, scale: 0.98 }, { opacity: 1, y: 0, scale: 1, duration: 0.9, ease: "expo.out" }, 0.15);
        return true;
    }

    function introGeneric(tl) {
        const items = document.querySelectorAll(".error-page-inner > *");
        if (!items.length) return false;
        tl.fromTo(items, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.7, stagger: 0.08 }, 0);
        return true;
    }

    function initIntro() {
        const tl = gsap.timeline({ defaults: { ease }, paused: true });
        try {
            introHome(tl) || introPageHero(tl) || introAuth(tl) || introGeneric(tl);
        } catch (error) {
            revealAll();
            return;
        }
        onReady(() => {
            tl.play();
            if (ScrollTrigger) ScrollTrigger.refresh();
        });
    }

    // ==========================================
    // EFEITOS AO ROLAR
    // ==========================================

    function initScrollEffects() {
        if (!ScrollTrigger) return;

        // Barra de progresso de leitura
        const bar = document.createElement("div");
        bar.className = "scroll-progress";
        bar.setAttribute("aria-hidden", "true");
        document.body.append(bar);
        gsap.to(bar, {
            scaleX: 1,
            ease: "none",
            scrollTrigger: { start: 0, end: "max", scrub: 0.3 }
        });

        // Títulos de seção entram palavra por palavra
        document.querySelectorAll(".section-head h2, .cta-band h2, .cta-cine h2, .prose > h2").forEach(heading => {
            if (heading.closest("[data-reveal], .page-hero, .legal-prose")) return;
            const words = splitWords(heading);
            if (!words.length) return;
            gsap.from(words, {
                yPercent: 110,
                duration: 0.85,
                stagger: 0.035,
                ease,
                scrollTrigger: { trigger: heading, start: "top 94%", once: true }
            });
        });

        // Textos de apoio dos cabeçalhos de seção
        document.querySelectorAll(".section-head").forEach(head => {
            const items = head.querySelectorAll(":scope > .eyebrow, :scope > p");
            if (!items.length || head.closest("[data-reveal]")) return;
            gsap.from(items, {
                opacity: 0,
                y: 14,
                duration: 0.7,
                stagger: 0.08,
                ease,
                scrollTrigger: { trigger: head, start: "top 94%", once: true }
            });
        });

        // Parallax das mídias de fundo
        document.querySelectorAll("[data-parallax]").forEach(element => {
            const amount = Number(element.dataset.parallax) || 10;
            const section = element.closest("section") || element;
            const isHero = section.matches(".page-hero, .hero-x");
            if (isHero) {
                gsap.to(element, {
                    yPercent: amount,
                    ease: "none",
                    scrollTrigger: { trigger: section, start: "top top", end: "bottom top", scrub: true }
                });
            } else {
                gsap.fromTo(element,
                    { yPercent: -amount / 2, scale: 1.18 },
                    {
                        yPercent: amount / 2,
                        scale: 1.18,
                        ease: "none",
                        scrollTrigger: { trigger: section, start: "top bottom", end: "bottom top", scrub: true }
                    });
            }
        });

        // Prévia do painel "assenta" ao entrar na tela
        const appWindow = document.querySelector(".app-window");
        if (appWindow) {
            gsap.fromTo(appWindow,
                { rotateX: 9, scale: 0.95, transformPerspective: 1400, transformOrigin: "50% 0%" },
                {
                    rotateX: 0,
                    scale: 1,
                    ease: "none",
                    scrollTrigger: { trigger: appWindow, start: "top 95%", end: "top 35%", scrub: 0.6 }
                });
        }

        // Números contam a partir de zero
        document.querySelectorAll(".stat-num").forEach(element => {
            const raw = element.textContent.trim();
            const target = parseInt(raw, 10);
            if (Number.isNaN(target)) return;
            const pad = raw.length;
            const counter = { value: 0 };
            element.textContent = "0".padStart(pad, "0");
            gsap.to(counter, {
                value: target,
                duration: 1.4,
                ease: "power2.out",
                scrollTrigger: { trigger: element, start: "top 90%", once: true },
                onUpdate: () => { element.textContent = String(Math.round(counter.value)).padStart(pad, "0"); }
            });
        });

        // Cards do trilho de projetos deslizam ao entrar
        const railCards = document.querySelectorAll(".rail-card");
        if (railCards.length) {
            gsap.from(railCards, {
                opacity: 0,
                x: 60,
                duration: 0.9,
                stagger: 0.1,
                ease,
                scrollTrigger: { trigger: railCards[0].parentElement, start: "top 85%", once: true }
            });
        }
    }

    // ==========================================
    // DETALHES
    // ==========================================

    // Faixa de tecnologias em movimento contínuo (lista duplicada só para o efeito)
    function initMarquee() {
        const strip = document.querySelector(".stack-strip");
        const list = strip?.querySelector(".stack-logos");
        if (!list) return;

        const viewport = document.createElement("div");
        const track = document.createElement("div");
        viewport.className = "stack-viewport";
        track.className = "stack-marquee";
        list.replaceWith(viewport);
        viewport.append(track);
        track.append(list);

        const clone = list.cloneNode(true);
        clone.setAttribute("aria-hidden", "true");
        clone.querySelectorAll("img").forEach(image => image.setAttribute("alt", ""));
        track.append(clone);
        strip.classList.add("is-marquee");
    }

    // Temperatura da prévia oscila como uma leitura real
    function initLiveReading() {
        const temp = document.querySelector(".app-temp");
        if (!temp || !temp.firstChild) return;
        const sidebarValue = document.querySelector(".app-sidebar li.is-active b");
        let value = -18.2;

        setInterval(() => {
            if (document.hidden) return;
            value = Math.max(-18.8, Math.min(-17.6, value + (Math.random() - 0.5) * 0.4));
            const text = value.toFixed(1).replace(".", ",");
            temp.firstChild.textContent = text;
            if (sidebarValue) sidebarValue.textContent = `${text}°`;
            temp.classList.remove("is-tick");
            void temp.offsetWidth;
            temp.classList.add("is-tick");
        }, 2600);
    }

    // Botões principais acompanham levemente o cursor
    function initMagnetic() {
        if (!finePointer) return;
        document.querySelectorAll(".btn-primary.btn-lg, .nav-cta").forEach(button => {
            button.setAttribute("data-magnetic", "");
            const xTo = gsap.quickTo(button, "x", { duration: 0.4, ease: "power3.out" });
            const yTo = gsap.quickTo(button, "y", { duration: 0.4, ease: "power3.out" });

            button.addEventListener("pointermove", event => {
                const rect = button.getBoundingClientRect();
                xTo((event.clientX - rect.left - rect.width / 2) * 0.22);
                yTo((event.clientY - rect.top - rect.height / 2) * 0.3);
            });
            button.addEventListener("pointerleave", () => {
                xTo(0);
                yTo(0);
            });
        });
    }

    // ==========================================
    // INICIALIZAÇÃO
    // ==========================================

    initSmoothScroll();
    initIntro();
    initScrollEffects();
    initMarquee();
    initLiveReading();
    initMagnetic();

    // A troca para a fonte final (Archivo) muda a altura dos títulos;
    // recalcula as posições dos gatilhos de rolagem depois disso.
    if (ScrollTrigger) document.fonts?.ready.then(() => ScrollTrigger.refresh());

});
