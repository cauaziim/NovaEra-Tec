// ==========================================
// NOVAERA CODE - COOKIES E PREFERÊNCIAS (LGPD)
// API window.NovaEraCookies + aviso de cookies + central de preferências.
//
// Categorias:
//   necessarios   — sessão do login e o próprio registro do consentimento.
//                   Sempre ativos (não precisam de consentimento).
//   preferencias  — tema (ne_theme) e animações (ne_motion). Sem consentimento
//                   a escolha vale só para a visita atual (sessionStorage).
//
// Carregue antes de js/script.js e js/motion-check.js.
// ==========================================

(function () {

    const CONSENT_COOKIE = "ne_consent";
    const CONSENT_VERSION = 1;          // aumente para pedir o consentimento de novo
    const CONSENT_DAYS = 180;           // renovação semestral do consentimento
    const PREFERENCE_DAYS = 365;
    const PREFERENCE_KEYS = ["ne_theme", "ne_motion"];

    const baseUrl = new URL("..", document.currentScript?.src || window.location.href);
    const privacyUrl = new URL("html/privacidade.html", baseUrl).href;

    // ==========================================
    // COOKIES
    // ==========================================

    function getCookie(name) {
        const match = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
        if (!match) return null;
        try { return decodeURIComponent(match[1]); } catch (error) { return null; }
    }

    function setCookie(name, value, days) {
        const parts = [
            `${name}=${encodeURIComponent(value)}`,
            "path=/",
            "SameSite=Lax"
        ];
        if (days) parts.push(`max-age=${Math.round(days * 86400)}`);
        if (window.location.protocol === "https:") parts.push("Secure");
        document.cookie = parts.join("; ");
    }

    function removeCookie(name) {
        document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax`;
    }

    const session = {
        get(key) { try { return sessionStorage.getItem(key); } catch (error) { return null; } },
        set(key, value) { try { sessionStorage.setItem(key, value); } catch (error) { /* indisponível */ } },
        remove(key) { try { sessionStorage.removeItem(key); } catch (error) { /* indisponível */ } }
    };

    // ==========================================
    // CONSENTIMENTO
    // ==========================================

    function readConsent() {
        const raw = getCookie(CONSENT_COOKIE);
        if (!raw) return null;
        try {
            const data = JSON.parse(raw);
            if (data.v !== CONSENT_VERSION) return null;
            return { preferencias: Boolean(data.p), date: data.t };
        } catch (error) {
            return null;
        }
    }

    let consent = readConsent();
    const listeners = [];

    function allows(category) {
        if (category === "necessarios") return true;
        return Boolean(consent && consent[category]);
    }

    function saveConsent(choices) {
        consent = { preferencias: Boolean(choices.preferencias), date: Date.now() };
        setCookie(CONSENT_COOKIE, JSON.stringify({ v: CONSENT_VERSION, p: consent.preferencias ? 1 : 0, t: consent.date }), CONSENT_DAYS);

        if (consent.preferencias) {
            // Promove para cookie as escolhas feitas antes do consentimento
            PREFERENCE_KEYS.forEach(key => {
                const value = session.get(key);
                if (value !== null) {
                    setCookie(key, value, PREFERENCE_DAYS);
                    session.remove(key);
                }
            });
            try {
                const legacyTheme = localStorage.getItem("theme");
                if (legacyTheme && !getCookie("ne_theme")) setCookie("ne_theme", legacyTheme, PREFERENCE_DAYS);
                localStorage.removeItem("theme");
            } catch (error) { /* indisponível */ }
        } else {
            // Revogado: as escolhas continuam valendo só nesta visita
            PREFERENCE_KEYS.forEach(key => {
                const value = getCookie(key);
                if (value !== null) session.set(key, value);
                removeCookie(key);
            });
            try { localStorage.removeItem("theme"); } catch (error) { /* indisponível */ }
        }

        listeners.forEach(callback => callback(consent));
        document.dispatchEvent(new CustomEvent("novaera:consent", { detail: consent }));
    }

    // Preferências: cookie com consentimento, sessionStorage sem ele
    function getPreference(key) {
        return getCookie(key) ?? session.get(key);
    }

    function setPreference(key, value) {
        if (value === null || value === undefined) {
            removeCookie(key);
            session.remove(key);
            return;
        }
        if (allows("preferencias")) {
            setCookie(key, value, PREFERENCE_DAYS);
            session.remove(key);
        } else {
            session.set(key, value);
        }
    }

    // ==========================================
    // INTERFACE
    // ==========================================

    let banner = null;
    let dialog = null;

    function motionLabel(value) {
        return { on: "Sempre ativadas", off: "Desativadas" }[value] || "Seguir o sistema";
    }

    function closeBanner() {
        if (!banner) return;
        const element = banner;
        banner = null;
        element.classList.remove("is-visible");
        setTimeout(() => element.remove(), 400);
    }

    function showBanner() {
        if (banner) return;
        banner = document.createElement("section");
        banner.className = "ne-toast cookie-banner";
        banner.setAttribute("role", "region");
        banner.setAttribute("aria-label", "Aviso de cookies");
        banner.innerHTML = `
            <div class="ne-toast-head">
                <span class="ne-toast-icon" aria-hidden="true"><i class="fas fa-cookie-bite"></i></span>
                <h2 class="ne-toast-title">Cookies e privacidade</h2>
            </div>
            <p class="ne-toast-text">
                Usamos cookies <strong>necessários</strong> para o site funcionar e, se você permitir,
                cookies de <strong>preferências</strong> para lembrar o tema e as animações.
                Não usamos rastreamento nem publicidade.
                <a href="${privacyUrl}">Política de privacidade</a>
            </p>
            <div class="ne-toast-actions">
                <button type="button" class="btn btn-primary btn-sm" data-consent="all">Aceitar</button>
                <button type="button" class="btn btn-secondary btn-sm" data-consent="necessary">Só necessários</button>
                <button type="button" class="btn btn-ghost btn-sm" data-consent="custom">Personalizar</button>
            </div>`;

        banner.addEventListener("click", event => {
            const action = event.target.closest("[data-consent]")?.dataset.consent;
            if (!action) return;
            if (action === "custom") {
                openSettings();
                return;
            }
            saveConsent({ preferencias: action === "all" });
            closeBanner();
        });

        document.body.append(banner);
        requestAnimationFrame(() => banner?.classList.add("is-visible"));
    }

    function openSettings() {
        if (dialog) dialog.remove();

        const currentMotion = getPreference("ne_motion") || "auto";
        dialog = document.createElement("dialog");
        dialog.className = "cookie-dialog";
        dialog.setAttribute("aria-labelledby", "cookieDialogTitle");
        dialog.innerHTML = `
            <form method="dialog" class="cookie-dialog-inner">
                <header class="cookie-dialog-head">
                    <h2 id="cookieDialogTitle">Preferências de cookies</h2>
                    <button type="submit" value="cancel" class="icon-btn" aria-label="Fechar"><i class="fas fa-xmark" aria-hidden="true"></i></button>
                </header>

                <div class="cookie-option">
                    <div>
                        <h3>Necessários</h3>
                        <p>Mantêm o login (NOVAERASESSID) e guardam esta escolha (ne_consent). Sem eles o site não funciona.</p>
                    </div>
                    <span class="chip">Sempre ativos</span>
                </div>

                <label class="cookie-option">
                    <div>
                        <h3>Preferências</h3>
                        <p>Lembram o tema claro/escuro (ne_theme) e a escolha de animações (ne_motion) por 12 meses. Desligado, elas valem só nesta visita.</p>
                    </div>
                    <input type="checkbox" class="cookie-switch" name="preferencias" ${allows("preferencias") ? "checked" : ""}>
                </label>

                <div class="cookie-option">
                    <div>
                        <h3>Animações do site</h3>
                        <p>Se o Windows estiver com os efeitos de animação desligados, o navegador bloqueia as animações. Aqui você decide só para este site.</p>
                    </div>
                    <select name="motion" class="cookie-select" aria-label="Animações do site">
                        ${["auto", "on", "off"].map(value => `<option value="${value}" ${value === currentMotion ? "selected" : ""}>${motionLabel(value)}</option>`).join("")}
                    </select>
                </div>

                <footer class="cookie-dialog-actions">
                    <button type="submit" value="save" class="btn btn-primary btn-sm">Salvar preferências</button>
                    <button type="submit" value="all" class="btn btn-secondary btn-sm">Aceitar todos</button>
                </footer>
            </form>`;

        dialog.addEventListener("close", () => {
            const result = dialog.returnValue;
            const form = dialog.querySelector("form");
            const element = dialog;
            dialog = null;
            element.remove();
            if (result !== "save" && result !== "all") return;

            saveConsent({ preferencias: result === "all" || form.elements.preferencias.checked });
            closeBanner();

            const motion = form.elements.motion.value;
            if (motion !== currentMotion) {
                setPreference("ne_motion", motion); // "auto" = seguir o sistema, sem perguntar de novo
                window.location.reload();
            }
        });

        document.body.append(dialog);
        dialog.showModal();
    }

    // Link "Cookies" no rodapé de todas as páginas
    function addFooterLink() {
        const privacy = document.querySelector('.footer-bottom a[href$="privacidade.html"]');
        if (!privacy || document.querySelector(".footer-bottom [data-cookie-settings]")) return;
        const button = document.createElement("button");
        button.type = "button";
        button.className = "link-button";
        button.dataset.cookieSettings = "";
        button.textContent = "Preferências de cookies";
        privacy.after(document.createTextNode(" · "), button);
    }

    document.addEventListener("click", event => {
        if (event.target.closest("[data-cookie-settings]")) openSettings();
    });

    // ==========================================
    // API PÚBLICA
    // ==========================================

    window.NovaEraCookies = {
        get: getCookie,
        set: setCookie,
        remove: removeCookie,
        allows,
        hasDecided: () => consent !== null,
        getPreference,
        setPreference,
        openSettings,
        onChange(callback) { listeners.push(callback); }
    };

    const start = () => {
        addFooterLink();
        if (consent) return;
        // Espera o preloader sair para não competir com a entrada da página
        if (window.__neReady || !document.getElementById("preloader")) showBanner();
        else document.addEventListener("novaera:ready", () => setTimeout(showBanner, 600), { once: true });
    };

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
    else start();

})();
