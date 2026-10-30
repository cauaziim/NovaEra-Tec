// ==========================================
// NOVAERA CODE - PÁGINA INICIAL
// Interações exclusivas da home:
//  - luz que segue o cursor no topo e nos cards de serviço;
//  - vitrine com um tipo de projeto por aba (troca sozinha, pausa ao
//    passar o mouse, ao focar com o teclado, fora da tela ou pelo botão);
//  - linha do processo que avança com a rolagem;
//  - configurador "Monte seu projeto", que sugere um dos pacotes e abre o
//    contato já preenchido.
// Tudo é aprimoramento progressivo: sem JS, o conteúdo continua legível e
// os links levam aos mesmos lugares.
// ==========================================

(() => {
    "use strict";

    const root = document.documentElement;
    // Mesma decisão do <head> (sistema + escolha do visitante em js/motion-check.js)
    const reduceMotion = root.dataset.motion
        ? root.dataset.motion === "off"
        : window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

    const $ = (selector, scope = document) => scope.querySelector(selector);
    const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));
    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

    // Atualiza variáveis CSS no máximo uma vez por quadro
    function onPointer(element, handler) {
        let frame = 0;
        let last = null;
        element.addEventListener("pointermove", event => {
            last = event;
            if (frame) return;
            frame = requestAnimationFrame(() => {
                frame = 0;
                handler(last);
            });
        }, { passive: true });
    }

    // ==========================================
    // LUZ QUE SEGUE O CURSOR
    // ==========================================

    function initSpotlight() {
        if (!finePointer || reduceMotion) return;

        const hero = $("[data-hero]");
        if (hero) {
            onPointer(hero, event => {
                const rect = hero.getBoundingClientRect();
                hero.style.setProperty("--mx", `${event.clientX - rect.left}px`);
                hero.style.setProperty("--my", `${event.clientY - rect.top}px`);
            });
            hero.addEventListener("pointerenter", () => hero.classList.add("is-lit"));
            hero.addEventListener("pointerleave", () => hero.classList.remove("is-lit"));
        }

        $$("[data-spotlight-group] > *").forEach(card => {
            onPointer(card, event => {
                const rect = card.getBoundingClientRect();
                card.style.setProperty("--mx", `${event.clientX - rect.left}px`);
                card.style.setProperty("--my", `${event.clientY - rect.top}px`);
            });
        });
    }

    // ==========================================
    // VITRINE DE PROJETOS (abas)
    // ==========================================

    function initStage() {
        const stage = $("[data-stage]");
        if (!stage) return;

        const tablist = $('[role="tablist"]', stage);
        const tabs = $$('[role="tab"]', stage);
        const panels = tabs.map(tab => document.getElementById(tab.getAttribute("aria-controls")));
        const device = $("[data-stage-device]", stage);
        const mocks = $$("[data-mock]", stage);
        const url = $("[data-stage-url]", stage);
        const pauseButton = $("[data-stage-pause]", stage);
        if (!tablist || !tabs.length || panels.includes(null) || !device) return;

        const URLS = {
            site: "suaempresa.com.br",
            sistema: "painel.suaempresa.com.br",
            app: "",
            iot: "monitor.suaempresa.com.br",
        };
        const DURATION = 6500;

        let index = 0;
        let elapsed = 0;
        let last = 0;
        let frame = 0;
        let userPaused = reduceMotion;
        let hovering = false;
        let focused = false;
        let visible = true;

        const setProgress = value => tabs[index].style.setProperty("--progress", value.toFixed(3));

        function select(next, { focus = false } = {}) {
            index = (next + tabs.length) % tabs.length;
            elapsed = 0;
            tabs.forEach((tab, i) => {
                const active = i === index;
                tab.setAttribute("aria-selected", String(active));
                tab.tabIndex = active ? 0 : -1;
                tab.style.setProperty("--progress", "0");
                panels[i].hidden = !active;
            });
            const kind = tabs[index].dataset.stageTab;
            device.dataset.kind = kind;
            mocks.forEach(mock => mock.classList.toggle("is-active", mock.dataset.mock === kind));
            if (url) url.textContent = URLS[kind] ?? "";
            if (focus) tabs[index].focus();
        }

        const running = () => !userPaused && !hovering && !focused && visible && !document.hidden;

        // O laço só existe enquanto a troca automática está rodando
        function loop(now) {
            frame = 0;
            if (!running()) {
                last = 0;
                return;
            }
            if (last) elapsed += now - last;
            last = now;
            setProgress(Math.min(1, elapsed / DURATION));
            if (elapsed >= DURATION) select(index + 1);
            frame = requestAnimationFrame(loop);
        }

        function sync() {
            stage.classList.toggle("is-paused", !running());
            if (running() && !frame) {
                last = 0;
                frame = requestAnimationFrame(loop);
            }
        }

        tabs.forEach((tab, i) => tab.addEventListener("click", () => {
            select(i);
            sync();
        }));

        // Teclado no padrão WAI-ARIA de abas (ativação automática)
        tablist.addEventListener("keydown", event => {
            const moves = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: tabs.length - 1 };
            if (!(event.key in moves)) return;
            event.preventDefault();
            select(moves[event.key], { focus: true });
        });

        if (pauseButton) {
            pauseButton.hidden = false;
            const renderPause = () => {
                pauseButton.setAttribute("aria-pressed", String(userPaused));
                pauseButton.innerHTML = userPaused
                    ? '<i class="fas fa-play" aria-hidden="true"></i>'
                    : '<i class="fas fa-pause" aria-hidden="true"></i>';
                pauseButton.title = userPaused ? "Retomar a troca automática" : "Pausar a troca automática";
            };
            pauseButton.addEventListener("click", () => {
                userPaused = !userPaused;
                renderPause();
                sync();
            });
            renderPause();
        }

        if (finePointer) {
            stage.addEventListener("pointerenter", () => { hovering = true; sync(); });
            stage.addEventListener("pointerleave", () => { hovering = false; sync(); });
        }
        // Pausa com foco de teclado (WCAG 2.2.2); um clique de mouse na aba não
        // conta, senão a troca nunca mais voltaria depois do primeiro clique.
        const keyboardFocus = element => {
            try {
                return element.matches(":focus-visible");
            } catch (error) {
                return true;
            }
        };
        const recomputeFocus = () => {
            const active = document.activeElement;
            focused = Boolean(active && stage.contains(active) && keyboardFocus(active));
            sync();
        };
        stage.addEventListener("focusin", recomputeFocus);
        stage.addEventListener("focusout", () => window.setTimeout(recomputeFocus, 0));
        document.addEventListener("visibilitychange", sync);

        if ("IntersectionObserver" in window) {
            new IntersectionObserver(entries => {
                visible = entries[0].isIntersecting;
                sync();
            }, { threshold: 0.25 }).observe(stage);
        }

        // Inclinação 3D leve acompanhando o cursor
        if (finePointer && !reduceMotion) {
            onPointer(stage, event => {
                const rect = device.getBoundingClientRect();
                const x = clamp((event.clientX - rect.left) / rect.width - 0.5, -0.5, 0.5);
                const y = clamp((event.clientY - rect.top) / rect.height - 0.5, -0.5, 0.5);
                device.style.setProperty("--ry", `${(x * 8).toFixed(2)}deg`);
                device.style.setProperty("--rx", `${(-y * 6).toFixed(2)}deg`);
            });
            stage.addEventListener("pointerleave", () => {
                device.style.setProperty("--ry", "0deg");
                device.style.setProperty("--rx", "0deg");
            });
        }

        initLiveReading(stage, device, () => visible);

        select(0);
        stage.classList.add("is-ready");
        sync();
    }

    // Leitura do sensor oscila como uma medição real (só na aba IoT visível)
    function initLiveReading(stage, device, isVisible) {
        const reading = $("[data-iot-temp]", stage);
        const mirror = $("[data-iot-mirror]", stage);
        const gauge = $(".mock-iot", stage);
        if (!reading || !gauge || reduceMotion) return;

        let value = 4.2;
        window.setInterval(() => {
            if (document.hidden || !isVisible() || device.dataset.kind !== "iot") return;
            value = clamp(value + (Math.random() - 0.5) * 0.5, 3.4, 5.4);
            const text = value.toFixed(1).replace(".", ",");
            reading.textContent = text;
            if (mirror) mirror.textContent = `${text}°`;
            // Faixa segura de 2 °C a 8 °C ocupa o arco de 0 a 100
            gauge.style.setProperty("--t", clamp(((value - 2) / 6) * 100, 4, 100).toFixed(1));
        }, 1700);
    }

    // ==========================================
    // PROCESSO: linha que avança com a rolagem
    // ==========================================

    function initProcess() {
        const list = $("[data-process]");
        if (!list) return;
        const steps = $$(".process-step", list);
        if (!steps.length) return;

        if (reduceMotion) {
            steps.forEach(step => step.classList.add("is-active"));
            return;
        }

        list.classList.add("is-live");
        let frame = 0;

        const update = () => {
            frame = 0;
            const rect = list.getBoundingClientRect();
            const viewport = window.innerHeight;
            // Começa quando o topo da lista passa de 85% da tela e termina
            // quando o fim dela chega a 55%: a linha completa sem pressa.
            const start = viewport * 0.85;
            const end = viewport * 0.55;
            const progress = clamp((start - rect.top) / (rect.height + start - end), 0, 1);
            list.style.setProperty("--progress", progress.toFixed(3));
            steps.forEach((step, i) => {
                const threshold = steps.length > 1 ? i / (steps.length - 1) : 0;
                step.classList.toggle("is-active", progress >= threshold - 0.001 && progress > 0);
            });
        };

        const schedule = () => {
            if (!frame) frame = requestAnimationFrame(update);
        };
        window.addEventListener("scroll", schedule, { passive: true });
        window.addEventListener("resize", schedule);
        update();
    }

    // ==========================================
    // MONTE SEU PROJETO
    // ==========================================

    function initBuilder() {
        const form = $("[data-builder]");
        if (!form) return;

        const TYPES = {
            site: {
                label: "Site",
                subject: "Site",
                features: ["Formulário de contato", "SEO", "Painel para editar o conteúdo", "Integrações"],
            },
            sistema: {
                label: "Sistema web",
                subject: "Sistema web",
                features: ["Painel administrativo", "Login e perfis de acesso", "Banco de dados", "Relatórios e dashboard", "Integração com API"],
            },
            app: {
                label: "Aplicativo",
                subject: "Aplicativo",
                features: ["Android e iOS", "Login de usuários", "Notificações", "Integração com API", "Painel administrativo"],
            },
            iot: {
                label: "IoT e automação",
                subject: "IoT",
                features: ["Sensores", "Painel em tempo real", "Alertas", "Acionamento remoto", "Histórico e relatórios"],
            },
        };
        const MOMENTS = {
            ideia: "Só tenho a ideia",
            referencia: "Já tenho layout ou referência",
            evoluir: "Quero melhorar algo que já existe",
        };
        // Recursos de site que já pedem banco de dados e painel (pacote Business)
        const SITE_ADVANCED = ["Painel para editar o conteúdo", "Integrações"];

        const featuresBox = $("[data-builder-features]", form);
        const packageLine = $("[data-builder-package-line]", form);
        const out = name => $(`[data-out="${name}"]`, form);
        const cards = $$("[data-package]");
        const remembered = new Map();
        const previous = {};
        // Os cards de pacote só ganham o selo depois que a pessoa mexe no
        // configurador: ao abrir a página, ninguém "pediu" nada ainda.
        let touched = false;

        const currentType = () => form.elements.tipo.value;

        function renderFeatures(type) {
            const chosen = remembered.get(type) ?? new Set();
            featuresBox.replaceChildren(...TYPES[type].features.map(feature => {
                const label = document.createElement("label");
                const input = document.createElement("input");
                const text = document.createElement("span");
                label.className = "builder-chip";
                input.type = "checkbox";
                input.name = "recursos";
                input.value = feature;
                input.checked = chosen.has(feature);
                text.textContent = feature;
                label.append(input, text);
                return label;
            }));
        }

        function readState() {
            const type = currentType();
            return {
                type,
                features: $$('input[name="recursos"]:checked', form).map(input => input.value),
                moment: form.elements.momento.value,
            };
        }

        function suggestPackage({ type, features }) {
            if (type !== "site") return "Enterprise";
            return features.some(feature => SITE_ADVANCED.includes(feature)) ? "Business" : "Start";
        }

        // Nome e preço vêm do próprio card do pacote: o preço fica num lugar só
        function packageLabel(name) {
            const card = cards.find(item => item.dataset.package === name);
            const price = card?.querySelector(".price");
            if (!price) return `pacote ${name}`;
            const prefix = price.querySelector(".price-prefix") ? "a partir de " : "";
            const value = Array.from(price.childNodes)
                .filter(node => !(node.nodeType === Node.ELEMENT_NODE && node.classList.contains("price-prefix")))
                .map(node => node.textContent.trim())
                .join(" ")
                .replace(/R\$\s*/, "R$ ")
                .trim();
            return `pacote ${name} · ${prefix}${value}`;
        }

        function write(name, text) {
            const element = out(name);
            if (!element || previous[name] === text) return;
            previous[name] = text;
            element.textContent = text;
            if (reduceMotion) return;
            element.classList.remove("is-updated");
            void element.offsetWidth;
            element.classList.add("is-updated");
        }

        function update() {
            const state = readState();
            const suggestion = suggestPackage(state);

            write("tipo", TYPES[state.type].label);
            write("recursos", state.features.length ? state.features.join(", ") : "A definir na conversa");
            write("momento", MOMENTS[state.moment]);
            write("pacote", packageLabel(suggestion));

            const link = out("pacote");
            if (link) link.setAttribute("href", `#pacote-${suggestion.toLowerCase()}`);
            if (packageLine) packageLine.hidden = false;

            cards.forEach(card => {
                const match = touched && card.dataset.package === suggestion;
                card.classList.toggle("is-suggested", match);
                const badge = card.querySelector(".suggest-badge");
                if (badge) badge.hidden = !match;
            });
        }

        function buildMessage(state) {
            const lines = [
                "Olá, equipe NovaEra Code!",
                `Quero um orçamento para: ${TYPES[state.type].label}.`,
                `Recursos: ${state.features.length ? state.features.join(", ") : "a definir na conversa"}.`,
                `Momento do projeto: ${MOMENTS[state.moment]}.`,
                `Ponto de partida sugerido no site: pacote ${suggestPackage(state)}.`,
                "",
                "Mais detalhes sobre o projeto: ",
            ];
            return lines.join("\n");
        }

        form.addEventListener("change", event => {
            const target = event.target;
            touched = true;
            if (target.name === "tipo") {
                renderFeatures(target.value);
            } else if (target.name === "recursos") {
                remembered.set(currentType(), new Set(readState().features));
            }
            update();
        });

        form.addEventListener("submit", event => {
            event.preventDefault();
            const state = readState();
            const destination = new URL(form.getAttribute("action"), window.location.href);
            destination.searchParams.set("assunto", `Orçamento - ${TYPES[state.type].subject}`);
            destination.searchParams.set("mensagem", buildMessage(state));
            destination.hash = "contact-form";
            window.location.assign(destination.toString());
        });

        // Atalhos dos cards de serviço: já chegam com o tipo escolhido
        $$("[data-pick-type]").forEach(link => {
            link.addEventListener("click", () => {
                const input = form.querySelector(`input[name="tipo"][value="${link.dataset.pickType}"]`);
                if (!input) return;
                touched = true;
                if (!input.checked) {
                    input.checked = true;
                    renderFeatures(input.value);
                }
                update();
            });
        });

        // "Ponto de partida": leva ao card e chama atenção para ele
        out("pacote")?.addEventListener("click", () => {
            const card = cards.find(item => item.classList.contains("is-suggested"));
            if (!card || reduceMotion) return;
            card.classList.remove("is-flash");
            void card.offsetWidth;
            card.classList.add("is-flash");
        });

        renderFeatures(currentType());
        update();
    }

    initSpotlight();
    initStage();
    initProcess();
    initBuilder();
})();
