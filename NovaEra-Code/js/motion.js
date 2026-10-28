// ==========================================
// NOVAERA CODE - CAMADA DE MOVIMENTO
// Rolagem suave (Lenis) e animações de rolagem (GSAP + ScrollTrigger),
// carregados via CDN. Tudo aqui é opcional: sem as bibliotecas ou com
// "movimento reduzido" ativo, o site continua completo e estático.
// ==========================================

document.addEventListener("DOMContentLoaded", () => {

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) return;

    const hasGsap = typeof window.gsap !== "undefined" && typeof window.ScrollTrigger !== "undefined";
    const header = document.querySelector("[data-header]");
    let lenis = null;

    // ==========================================
    // ROLAGEM SUAVE
    // ==========================================

    if (typeof window.Lenis !== "undefined") {
        lenis = new window.Lenis({ duration: 1.1, smoothWheel: true });
        document.documentElement.classList.add("lenis", "lenis-smooth");

        if (hasGsap) {
            lenis.on("scroll", window.ScrollTrigger.update);
            window.gsap.ticker.add(time => lenis.raf(time * 1000));
            window.gsap.ticker.lagSmoothing(0);
        } else {
            const raf = time => {
                lenis.raf(time);
                requestAnimationFrame(raf);
            };
            requestAnimationFrame(raf);
        }

        // Âncoras internas respeitam a altura do cabeçalho fixo
        document.querySelectorAll('a[href^="#"]').forEach(link => {
            link.addEventListener("click", event => {
                const id = link.getAttribute("href");
                if (!id || id === "#") return;
                const target = document.querySelector(id);
                if (!target) return;
                event.preventDefault();
                lenis.scrollTo(target, { offset: -((header?.offsetHeight || 0) + 16) });
                history.pushState(null, "", id);
            });
        });

        // Pausa a rolagem suave enquanto o menu mobile ou um modal está aberto
        new MutationObserver(() => {
            const locked = document.body.classList.contains("nav-open") ||
                document.body.classList.contains("modal-open");
            if (locked) lenis.stop();
            else lenis.start();
        }).observe(document.body, { attributes: true, attributeFilter: ["class"] });
    }

    if (!hasGsap) return;

    const { gsap, ScrollTrigger } = window;
    gsap.registerPlugin(ScrollTrigger);

    // ==========================================
    // REVELAÇÕES AO ENTRAR NA TELA
    // IntersectionObserver dispara um gsap.to com estado final explícito;
    // ao terminar, os estilos inline são removidos e o CSS (hover,
    // transições) volta a valer.
    // ==========================================

    const onView = (element, callback) => {
        if (!("IntersectionObserver" in window)) {
            callback();
            return;
        }
        const observer = new IntersectionObserver((entries, obs) => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) return;
                obs.unobserve(entry.target);
                callback();
            });
        }, { rootMargin: "0px 0px -8% 0px" });
        observer.observe(element);
    };

    const reveal = (trigger, targets, from, options = {}) => {
        const items = gsap.utils.toArray(targets);
        if (!items.length) return;
        gsap.set(items, { ...from, transition: "none" });
        onView(trigger, () => gsap.to(items, {
            x: 0,
            y: 0,
            yPercent: 0,
            opacity: 1,
            duration: options.duration || 0.9,
            ease: options.ease || "power3.out",
            stagger: options.stagger || 0,
            delay: options.delay || 0,
            clearProps: "transform,opacity,transition"
        }));
    };

    // Títulos de cartaz — linhas sobem em sequência
    document.querySelectorAll("[data-split]").forEach(title => {
        reveal(title, title.querySelectorAll(".line"), { yPercent: 60, opacity: 0 },
            { duration: 1, ease: "power4.out", stagger: 0.12, delay: 0.15 });
    });

    document.querySelectorAll("[data-fade-up]").forEach(element => {
        reveal(element, element, { y: 30, opacity: 0 }, { delay: Number(element.dataset.fadeUp) || 0 });
    });

    // ==========================================
    // PARALLAX DE MÍDIA
    // ==========================================

    document.querySelectorAll("[data-parallax]").forEach(element => {
        const amount = Number(element.dataset.parallax) || 12;
        const trigger = element.closest("section") || element;
        gsap.fromTo(element,
            { yPercent: -amount / 2, scale: 1.12 },
            {
                yPercent: amount / 2,
                scale: 1.12,
                ease: "none",
                scrollTrigger: { trigger, start: "top bottom", end: "bottom top", scrub: true }
            });
    });

    // ==========================================
    // FAIXA CINÉTICA — acelera conforme a velocidade da rolagem
    // ==========================================

    const kinetic = document.querySelector(".kinetic-track");
    if (kinetic) {
        const animation = kinetic.getAnimations?.()[0];
        if (animation) {
            ScrollTrigger.create({
                trigger: kinetic,
                start: "top bottom",
                end: "bottom top",
                onUpdate: self => {
                    const boost = Math.min(Math.abs(self.getVelocity()) / 400, 5);
                    gsap.to(animation, { playbackRate: 1 + boost, duration: 0.2, overwrite: true });
                    gsap.to(animation, { playbackRate: 1, duration: 1.2, delay: 0.2 });
                }
            });
        }
    }

    // ==========================================
    // CONTADORES
    // ==========================================

    document.querySelectorAll("[data-count]").forEach(element => {
        const target = Number(element.dataset.count);
        const pad = element.textContent.trim().length;
        const counter = { value: 0 };
        onView(element, () => gsap.to(counter, {
            value: target,
            duration: 1.6,
            ease: "power2.out",
            onUpdate: () => {
                element.textContent = String(Math.round(counter.value)).padStart(pad, "0");
            }
        }));
    });

    // ==========================================
    // CARDS EM SEQUÊNCIA
    // ==========================================

    document.querySelectorAll("[data-stagger]").forEach(group => {
        reveal(group, group.children, { y: 50, opacity: 0 }, { stagger: 0.1 });
    });

    // Recalcula posições depois que fontes e imagens terminam de carregar
    window.addEventListener("load", () => ScrollTrigger.refresh(), { once: true });
});
