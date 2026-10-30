// ==========================================
// NOVAERA CODE - VERIFICAÇÃO DE ANIMAÇÕES DO SISTEMA
// Quando o Windows está com "Efeitos de animação" desligado (ou o macOS/
// Android com "Reduzir movimento"), o navegador informa ao site
// prefers-reduced-motion: reduce e as animações ficam bloqueadas.
//
// Um site não pode alterar configurações do Windows. O que este script faz:
//   1. detecta o bloqueio e pergunta ao visitante se quer liberar as
//      animações só neste site (cookie ne_motion = on/off);
//   2. no Windows, oferece abrir a tela certa do app Configurações
//      (ms-settings:) — o navegador pede a permissão do usuário — e libera
//      as animações sozinho assim que o Windows passar a permiti-las.
//
// A decisão inicial é aplicada pelo script do <head> (data-motion e
// .motion-forced). Depende de js/cookies.js.
// ==========================================

(function () {

    const cookies = window.NovaEraCookies;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!cookies || !media.matches || cookies.getPreference("ne_motion")) return;

    const platform = navigator.userAgentData?.platform || navigator.userAgent;
    const isWindows = /windows|win32|win64/i.test(platform);
    let settingsUri = "ms-settings:easeofaccess-visualeffects"; // Windows 11

    // Windows 10 guarda a opção em "Tela" (platformVersion < 13 = Windows 10)
    if (isWindows && navigator.userAgentData?.getHighEntropyValues) {
        navigator.userAgentData.getHighEntropyValues(["platformVersion"]).then(values => {
            if (parseInt(values.platformVersion, 10) < 13) settingsUri = "ms-settings:easeofaccess-display";
        }).catch(() => { /* mantém o padrão */ });
    }

    let toast = null;

    function close() {
        if (!toast) return;
        const element = toast;
        toast = null;
        element.classList.remove("is-visible");
        setTimeout(() => element.remove(), 400);
    }

    function choose(value) {
        cookies.setPreference("ne_motion", value);
        close();
        if (value === "on") window.location.reload();
    }

    // Assim que o sistema liberar as animações, recarrega já animado
    function watchSystem() {
        const check = () => {
            if (media.matches) return;
            media.removeEventListener?.("change", check);
            const text = toast?.querySelector(".ne-toast-text");
            if (text) text.textContent = "Animações liberadas pelo Windows. Recarregando…";
            setTimeout(() => window.location.reload(), 700);
        };
        media.addEventListener?.("change", check);
        window.addEventListener("focus", check);
    }

    function openWindowsSettings() {
        watchSystem();
        const text = toast?.querySelector(".ne-toast-text");
        if (text) {
            text.innerHTML = `Na janela que abrir, ligue <strong>Efeitos de animação</strong> e volte para esta aba —
                o site detecta a mudança sozinho. Se nada abrir, vá em <em>Configurações › Acessibilidade › Efeitos visuais</em>.`;
        }
        toast?.querySelector('[data-motion-action="windows"]')?.remove();
        // O navegador pergunta se o usuário permite abrir o app Configurações
        window.location.href = settingsUri;
    }

    function show() {
        if (toast) return;
        toast = document.createElement("section");
        toast.className = "ne-toast motion-toast";
        toast.setAttribute("role", "region");
        toast.setAttribute("aria-label", "Animações do site");

        const message = isWindows
            ? "O Windows deste computador está com os <strong>efeitos de animação desligados</strong>, então o navegador bloqueia as animações do site. Você pode liberá-las só aqui ou ativá-las no Windows."
            : "Seu sistema pediu <strong>movimento reduzido</strong>, então as animações do site estão desligadas. Você pode liberá-las só para este site.";

        toast.innerHTML = `
            <div class="ne-toast-head">
                <span class="ne-toast-icon" aria-hidden="true"><i class="fas fa-wand-magic-sparkles"></i></span>
                <h2 class="ne-toast-title">Animações bloqueadas pelo sistema</h2>
                <button type="button" class="icon-btn ne-toast-close" data-motion-action="off" aria-label="Manter animações desativadas"><i class="fas fa-xmark" aria-hidden="true"></i></button>
            </div>
            <p class="ne-toast-text">${message}</p>
            <div class="ne-toast-actions">
                <button type="button" class="btn btn-primary btn-sm" data-motion-action="on">Ativar animações</button>
                ${isWindows ? '<button type="button" class="btn btn-secondary btn-sm" data-motion-action="windows"><i class="fab fa-windows" aria-hidden="true"></i> Abrir configurações do Windows</button>' : ""}
                <button type="button" class="btn btn-ghost btn-sm" data-motion-action="off">Manter desativadas</button>
            </div>`;

        toast.addEventListener("click", event => {
            const action = event.target.closest("[data-motion-action]")?.dataset.motionAction;
            if (action === "windows") openWindowsSettings();
            else if (action) choose(action);
        });

        document.body.append(toast);
        requestAnimationFrame(() => toast?.classList.add("is-visible"));
    }

    // Só pergunta depois do preloader e da decisão sobre cookies
    const schedule = () => setTimeout(show, 700);
    const afterReady = () => {
        if (cookies.hasDecided()) schedule();
        else document.addEventListener("novaera:consent", schedule, { once: true });
    };

    if (window.__neReady) afterReady();
    else document.addEventListener("novaera:ready", afterReady, { once: true });

})();
