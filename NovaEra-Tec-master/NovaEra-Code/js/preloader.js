// ==========================================
// NOVAERA CODE - PRELOADER
// Carregado com "async" logo depois do markup do #preloader, para começar
// a contar antes dos scripts com "defer" (GSAP e Lenis vêm de CDN e podem
// demorar em conexões lentas).
//
// - Aparece só na primeira página da visita (sessionStorage "ne-boot",
//   lido pelo script do <head>).
// - O progresso real (imagens não-lazy, fontes e o evento load) define um
//   alvo; o número exibido persegue esse alvo com suavização e avança
//   sozinho até ~85%, para nunca parecer travado.
// - Se a página fica pronta em menos de 250 ms (cache), sai na hora — o
//   conteúdo do preloader só aparece depois desse tempo (ver CSS).
// - Teto de 4 s. O CSS ainda tem uma trava de 6 s caso este script falhe.
// Ao sair, avisa js/motion.js, js/cookies.js e js/motion-check.js com
// o evento "novaera:ready" (e window.__neReady).
// ==========================================

(function () {

    const root = document.documentElement;
    const preloader = document.getElementById("preloader");

    function markReady() {
        if (window.__neReady) return;
        window.__neReady = true;
        document.dispatchEvent(new CustomEvent("novaera:ready"));
    }

    if (!preloader || root.classList.contains("no-preloader")) {
        preloader?.remove();
        markReady();
        return;
    }

    try { sessionStorage.setItem("ne-boot", "1"); } catch (error) { /* armazenamento indisponível */ }

    const ring = document.getElementById("preloaderRing");
    const percent = document.getElementById("preloaderPercent");
    const status = document.getElementById("preloaderStatus");
    const steps = [[1, "Pronto"], [0.7, "Preparando interface"], [0.35, "Carregando recursos"], [0, "Inicializando"]];
    const reduceMotion = root.dataset.motion === "off";
    const started = performance.now();
    const instantUntil = 250;
    const minVisible = reduceMotion ? 0 : 900;
    const maxDuration = 4000;

    let total = 2; // fontes + evento load
    let completed = 0;
    let shown = 0;
    let finished = false;
    let exiting = false;
    let frameId = 0;

    root.classList.add("is-loading");

    const complete = () => { completed += 1; };
    (document.fonts?.ready || Promise.resolve()).then(complete);

    // As imagens ainda podem não estar no DOM (script async): conta no DOMContentLoaded
    const trackImages = () => {
        const images = Array.from(document.images).filter(image => image.loading !== "lazy" && !preloader.contains(image));
        total += images.length;
        images.forEach(image => {
            if (image.complete) { complete(); return; }
            image.addEventListener("load", complete, { once: true });
            image.addEventListener("error", complete, { once: true });
        });
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", trackImages, { once: true });
    else trackImages();

    const render = value => {
        const pct = Math.round(value * 100);
        if (ring) ring.style.strokeDashoffset = `${100 - pct}px`;
        if (percent) percent.textContent = `${pct}%`;
        if (status) status.textContent = steps.find(([min]) => value >= min)[1];
        preloader.setAttribute("aria-valuenow", String(pct));
    };

    const goal = () => {
        if (finished) return 1;
        const trickle = 0.85 * (1 - Math.exp(-(performance.now() - started) / 1200));
        return Math.min(0.96, Math.max(completed / total, trickle));
    };

    const exit = instant => {
        if (exiting) return;
        exiting = true;
        cancelAnimationFrame(frameId);
        render(1);

        const wait = instant ? 0 : Math.max(0, minVisible - (performance.now() - started));
        setTimeout(() => {
            preloader.classList.toggle("is-instant", instant);
            preloader.classList.add("is-done");
            root.classList.remove("is-loading");
            markReady();

            const remove = () => preloader.remove();
            preloader.addEventListener("animationend", event => { if (event.target === preloader) remove(); });
            setTimeout(remove, 1400);
        }, wait);
    };

    const frame = () => {
        const target = goal();
        shown += (target - shown) * (finished ? 0.2 : 0.07);
        if (Math.abs(target - shown) < 0.005) shown = target;
        render(shown);
        if (finished && shown >= 1) exit(false);
        else frameId = requestAnimationFrame(frame);
    };

    const finish = () => {
        if (finished) return;
        finished = true;
        // Página em cache ou aba em segundo plano: sem cerimônia
        if (performance.now() - started < instantUntil || document.hidden) exit(true);
    };

    frameId = requestAnimationFrame(frame);
    if (document.readyState === "complete") finish();
    else window.addEventListener("load", finish, { once: true });
    setTimeout(finish, maxDuration);

})();
