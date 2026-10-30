// ==========================================
// NOVAERA CODE - SCRIPT PRINCIPAL v5.0
// ==========================================

document.addEventListener("DOMContentLoaded", () => {

    const root = document.documentElement;
    const header = document.querySelector("[data-header]");
    const hamburger = document.querySelector(".hamburger");
    const navMenu = document.querySelector(".nav-menu");
    const themeToggle = document.getElementById("theme-toggle");
    // Decidido no <head>: sistema + escolha do visitante (cookie ne_motion)
    const reduceMotion = root.dataset.motion
        ? root.dataset.motion === "off"
        : window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Preferências passam pelo consentimento de cookies (js/cookies.js)
    const storage = {
        set(key, value) {
            if (window.NovaEraCookies) window.NovaEraCookies.setPreference(key, value);
            else try { sessionStorage.setItem(key, value); } catch (error) { /* armazenamento indisponível */ }
        }
    };

    // ==========================================
    // PRELOADER — ver js/preloader.js, que avisa "novaera:ready" ao sair.
    // Sem preloader na página, ela já está pronta. Se o script do preloader
    // falhar, libera a página junto com a trava de 6 s do CSS.
    // ==========================================

    function initPreloader() {
        const markReady = () => {
            if (window.__neReady) return;
            window.__neReady = true;
            document.getElementById("preloader")?.remove();
            root.classList.remove("is-loading");
            document.dispatchEvent(new CustomEvent("novaera:ready"));
        };
        if (!document.getElementById("preloader")) markReady();
        else setTimeout(markReady, 6000);
    }

    // ==========================================
    // TEMA ESCURO / CLARO
    // O tema inicial é aplicado por um script no <head> para evitar "flash".
    // ==========================================

    function initTheme() {
        if (!themeToggle) return;

        const metaTheme = document.querySelector('meta[name="theme-color"]');

        const render = () => {
            const dark = root.dataset.theme === "dark";
            themeToggle.innerHTML = dark
                ? '<i class="fas fa-sun" aria-hidden="true"></i>'
                : '<i class="fas fa-moon" aria-hidden="true"></i>';
            themeToggle.setAttribute("aria-label", dark ? "Ativar tema claro" : "Ativar tema escuro");
            themeToggle.setAttribute("title", dark ? "Ativar tema claro" : "Ativar tema escuro");
            if (metaTheme) metaTheme.setAttribute("content", dark ? "#08080a" : "#fafafa");
        };

        render();

        themeToggle.addEventListener("click", () => {
            const dark = root.dataset.theme !== "dark";
            if (dark) root.dataset.theme = "dark";
            else delete root.dataset.theme;
            storage.set("ne_theme", dark ? "dark" : "light");
            render();
        });
    }

    // ==========================================
    // MENU MOBILE
    // ==========================================

    function initMenu() {
        if (!hamburger || !navMenu) return;

        const mobileQuery = window.matchMedia("(max-width: 959px)");

        const setOpen = open => {
            hamburger.classList.toggle("active", open);
            navMenu.classList.toggle("active", open);
            document.body.classList.toggle("nav-open", open);
            hamburger.setAttribute("aria-expanded", String(open));
            hamburger.setAttribute("aria-label", open ? "Fechar menu" : "Abrir menu");
        };

        hamburger.addEventListener("click", () => {
            setOpen(!navMenu.classList.contains("active"));
        });

        navMenu.querySelectorAll("a").forEach(link => {
            link.addEventListener("click", () => setOpen(false));
        });

        document.addEventListener("click", event => {
            if (
                navMenu.classList.contains("active") &&
                !navMenu.contains(event.target) &&
                !hamburger.contains(event.target)
            ) {
                setOpen(false);
            }
        });

        document.addEventListener("keydown", event => {
            if (event.key === "Escape" && navMenu.classList.contains("active")) {
                setOpen(false);
                hamburger.focus();
            }
        });

        mobileQuery.addEventListener("change", event => {
            if (!event.matches) setOpen(false);
        });
    }

    // ==========================================
    // CABEÇALHO AO ROLAR
    // ==========================================

    function initHeader() {
        if (!header) return;

        const update = () => header.classList.toggle("is-scrolled", window.scrollY > 8);
        update();
        window.addEventListener("scroll", update, { passive: true });
    }

    // ==========================================
    // BOTÃO VOLTAR AO TOPO
    // ==========================================

    function initScrollTop() {
        let btn = document.querySelector(".scroll-top-btn");

        if (!btn) {
            btn = document.createElement("button");
            btn.type = "button";
            btn.className = "scroll-top-btn";
            btn.setAttribute("aria-label", "Voltar ao topo");
            btn.innerHTML = '<i class="fas fa-arrow-up" aria-hidden="true"></i>';
            document.body.appendChild(btn);
        }

        btn.addEventListener("click", () => {
            // Com a rolagem suave (js/motion.js) ativa, quem rola é o Lenis
            if (window.__neLenis) window.__neLenis.scrollTo(0);
            else window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
        });

        window.addEventListener("scroll", () => {
            btn.classList.toggle("show", window.scrollY > 600);
        }, { passive: true });
    }

    // ==========================================
    // REVEAL AO ROLAR
    // ==========================================

    function initReveal() {
        // Grupos [data-stagger]: cada filho entra com um pequeno atraso
        document.querySelectorAll("[data-stagger]").forEach(group => {
            Array.from(group.children).forEach((child, index) => {
                child.setAttribute("data-reveal", "");
                child.style.setProperty("--reveal-delay", `${Math.min(index, 6) * 60}ms`);
            });
        });

        const elements = document.querySelectorAll("[data-reveal]");
        if (!elements.length || reduceMotion || !("IntersectionObserver" in window)) return;

        const observer = new IntersectionObserver((entries, obs) => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) return;
                entry.target.classList.add("show");
                obs.unobserve(entry.target);
            });
        }, { threshold: 0.12, rootMargin: "0px 0px -40px" });

        elements.forEach(element => {
            // Elementos já visíveis na primeira tela não são escondidos
            if (element.getBoundingClientRect().top < window.innerHeight) return;
            element.classList.add("reveal");
            observer.observe(element);
        });
    }

    // ==========================================
    // ANO ATUAL NO RODAPÉ
    // ==========================================

    function initYear() {
        document.querySelectorAll("[data-year], #current-year").forEach(element => {
            element.textContent = new Date().getFullYear();
        });
    }

    // ==========================================
    // PROJETOS — FILTROS
    // ==========================================

    function initProjectFilters() {
        const filters = document.querySelectorAll(".project-filter");
        const cards = document.querySelectorAll(".projects-grid .project-card");
        const resultCount = document.querySelector(".project-results");
        if (!filters.length || !cards.length) return;

        filters.forEach(filter => {
            filter.addEventListener("click", () => {
                const category = filter.dataset.filter;
                let visibleCount = 0;

                filters.forEach(button => {
                    const selected = button === filter;
                    button.classList.toggle("active", selected);
                    button.setAttribute("aria-pressed", String(selected));
                });

                cards.forEach(card => {
                    const visible = category === "all" ||
                        card.dataset.category.split(" ").includes(category);
                    card.hidden = !visible;
                    if (visible) visibleCount += 1;
                });

                if (resultCount) {
                    resultCount.textContent = `${visibleCount} ${visibleCount === 1 ? "projeto encontrado" : "projetos encontrados"}`;
                }
            });
        });
    }

    // ==========================================
    // PROJETOS — MODAL DE DETALHES
    // ==========================================

    function initProjectModal() {
        const modal = document.getElementById("project-modal");
        if (!modal) return;

        const title = modal.querySelector("#project-modal-title");
        const description = modal.querySelector(".project-modal-description");
        const image = modal.querySelector(".project-modal-image");
        const link = modal.querySelector(".project-modal-link");
        let returnFocus = null;

        const focusable = () => Array.from(
            modal.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')
        ).filter(element => element.offsetParent !== null);

        const close = () => {
            modal.classList.remove("open");
            modal.setAttribute("aria-hidden", "true");
            document.body.classList.remove("modal-open");
            if (returnFocus) returnFocus.focus();
        };

        document.querySelectorAll(".project-info-button").forEach(button => {
            button.addEventListener("click", () => {
                const card = button.closest(".project-card");
                if (!card) return;
                returnFocus = button;
                title.textContent = card.dataset.title;
                description.textContent = card.dataset.description;
                image.src = card.dataset.image;
                image.alt = `Logotipo do ${card.dataset.title}`;
                const pageLink = card.querySelector(".project-page-link");
                if (link && pageLink) link.href = pageLink.getAttribute("href");
                modal.classList.add("open");
                modal.setAttribute("aria-hidden", "false");
                document.body.classList.add("modal-open");
                modal.querySelector(".modal-close").focus();
            });
        });

        modal.querySelectorAll("[data-modal-close]").forEach(control => {
            control.addEventListener("click", close);
        });

        document.addEventListener("keydown", event => {
            if (!modal.classList.contains("open")) return;

            if (event.key === "Escape") {
                close();
                return;
            }

            if (event.key === "Tab") {
                const items = focusable();
                if (!items.length) return;
                const first = items[0];
                const last = items[items.length - 1];
                if (event.shiftKey && document.activeElement === first) {
                    event.preventDefault();
                    last.focus();
                } else if (!event.shiftKey && document.activeElement === last) {
                    event.preventDefault();
                    first.focus();
                }
            }
        });
    }

    // ==========================================
    // VALIDAÇÃO DE FORMULÁRIOS (mensagens inline)
    // ==========================================

    function fieldMessage(input) {
        const labelElement = input.closest(".field")?.querySelector("label")?.cloneNode(true);
        labelElement?.querySelectorAll("[aria-hidden], .optional, .sr-only").forEach(element => element.remove());
        const label = labelElement?.textContent.trim() || "Este campo";
        const v = input.validity;
        if (v.valueMissing && input.type === "checkbox") return "Marque esta opção para continuar.";
        if (v.valueMissing) return `Preencha o campo ${label}.`;
        if (v.typeMismatch && input.type === "email") return "Informe um e-mail válido, como nome@exemplo.com.";
        if (v.tooShort) return `O campo ${label} precisa ter pelo menos ${input.minLength} caracteres.`;
        return input.validationMessage;
    }

    function showFieldError(input) {
        const field = input.closest(".field");
        if (!field) return;
        let error = field.querySelector(".field-error");
        const valid = input.checkValidity();

        if (input.dataset.describedby === undefined) {
            input.dataset.describedby = input.getAttribute("aria-describedby") || "";
        }
        const baseDescription = input.dataset.describedby;

        input.setAttribute("aria-invalid", String(!valid));

        if (valid) {
            if (error) error.remove();
            if (baseDescription) input.setAttribute("aria-describedby", baseDescription);
            else input.removeAttribute("aria-describedby");
            return;
        }

        if (!error) {
            error = document.createElement("p");
            error.className = "field-error";
            error.id = `${input.id}-error`;
            field.appendChild(error);
        }
        error.innerHTML = '<i class="fas fa-circle-exclamation" aria-hidden="true"></i>';
        error.append(fieldMessage(input));
        input.setAttribute("aria-describedby", `${baseDescription} ${error.id}`.trim());
    }

    function validateForm(form) {
        const inputs = Array.from(form.querySelectorAll("input, textarea, select"))
            .filter(input => input.willValidate && input.id);
        inputs.forEach(showFieldError);
        const firstInvalid = inputs.find(input => !input.checkValidity());
        if (firstInvalid) firstInvalid.focus();
        return !firstInvalid;
    }

    function initInlineValidation() {
        document.querySelectorAll("form[data-validate]").forEach(form => {
            form.setAttribute("novalidate", "");

            form.querySelectorAll("input, textarea").forEach(input => {
                input.addEventListener("blur", () => {
                    if (input.value.trim() !== "" || input.hasAttribute("aria-invalid")) showFieldError(input);
                });
                input.addEventListener("input", () => {
                    if (input.getAttribute("aria-invalid") === "true") showFieldError(input);
                });
            });

            // Formulários enviados ao servidor (login/cadastro)
            if (form.hasAttribute("action")) {
                form.addEventListener("submit", event => {
                    if (!validateForm(form)) {
                        event.preventDefault();
                        return;
                    }
                    form.querySelector('[type="submit"]')?.classList.add("is-loading");
                });
            }
        });
    }

    // ==========================================
    // FORMULÁRIO DE CONTATO
    // ==========================================

    function initContactForm() {
        const form = document.querySelector(".contact-form");
        const status = document.getElementById("contact-form-status");
        if (!form || !status) return;

        const subject = form.querySelector('[name="assunto"]');
        const params = new URLSearchParams(window.location.search);
        const requestedPackage = params.get("pacote");
        const requestedSubject = params.get("assunto");

        if (subject && !subject.value.trim()) {
            if (requestedPackage) {
                subject.value = `Orçamento - ${requestedPackage}`;
            } else if (requestedSubject) {
                subject.value = requestedSubject;
            }
        }

        // Pedido montado no configurador da página inicial (?mensagem=).
        // Só preenche se o campo estiver vazio; o limite é o mesmo do servidor.
        const message = form.elements.mensagem;
        const requestedMessage = params.get("mensagem");
        if (message && requestedMessage && !message.value.trim()) {
            message.value = requestedMessage.slice(0, 5000);
        }

        const submit = form.querySelector('[type="submit"]');
        const endpoint = form.dataset.endpoint;

        const showStatus = (type, ...content) => {
            status.className = `alert alert-${type}`;
            status.innerHTML = type === "success"
                ? '<i class="fas fa-circle-check" aria-hidden="true"></i>'
                : '<i class="fas fa-circle-exclamation" aria-hidden="true"></i>';
            const text = document.createElement("span");
            text.append(...content);
            status.append(text);
        };

        // Alternativa sem servidor: monta um e-mail no aplicativo do visitante
        const mailtoLink = () => {
            const recipient = document.querySelector("[data-contact-email]")?.getAttribute("href")?.replace(/^mailto:/, "");
            if (!recipient) return null;

            const message = [
                `Nome: ${form.elements.nome.value.trim()}`,
                `E-mail: ${form.elements.email.value.trim()}`,
                `Assunto: ${subject.value.trim() || "Contato pelo site"}`,
                "",
                form.elements.mensagem.value.trim()
            ].join("\n");

            const link = document.createElement("a");
            link.href = `mailto:${recipient}?subject=${encodeURIComponent(subject.value.trim() || "Contato pelo site NovaEra Code")}&body=${encodeURIComponent(message)}`;
            link.textContent = "enviar pelo seu aplicativo de e-mail";
            return link;
        };

        const fallbackToMail = reason => {
            const link = mailtoLink();
            if (!link) {
                showStatus("error", `${reason} Tente novamente mais tarde.`);
                return;
            }
            showStatus("error", `${reason} Você pode `, link, ".");
            link.focus();
        };

        form.addEventListener("submit", async event => {
            event.preventDefault();
            status.textContent = "";
            status.className = "alert";

            if (!validateForm(form)) return;

            if (!endpoint || !window.fetch) {
                fallbackToMail("O envio direto não está disponível neste navegador.");
                return;
            }

            submit.classList.add("is-loading");
            submit.setAttribute("aria-disabled", "true");

            try {
                const response = await fetch(endpoint, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "Accept": "application/json" },
                    credentials: "same-origin",
                    body: JSON.stringify(Object.fromEntries(new FormData(form)))
                });
                const data = await response.json().catch(() => ({}));

                if (response.ok) {
                    form.reset();
                    form.querySelectorAll("[aria-invalid]").forEach(input => input.removeAttribute("aria-invalid"));
                    showStatus("success", data.message || "Mensagem enviada! Responderemos em breve.");
                    status.setAttribute("tabindex", "-1");
                    status.focus();
                    return;
                }

                if (response.status === 422 && data.fields) {
                    Object.entries(data.fields).forEach(([name, message]) => {
                        const input = form.elements[name];
                        if (input) input.setCustomValidity(message);
                    });
                    validateForm(form);
                    Object.keys(data.fields).forEach(name => form.elements[name]?.setCustomValidity(""));
                    showStatus("error", data.error || "Revise os campos destacados.");
                    return;
                }

                if (response.status === 429) {
                    showStatus("error", data.error || "Aguarde alguns segundos antes de enviar outra mensagem.");
                    return;
                }

                fallbackToMail(data.error || "Não foi possível enviar sua mensagem agora.");
            } catch (error) {
                fallbackToMail("Sem conexão com o servidor.");
            } finally {
                submit.classList.remove("is-loading");
                submit.removeAttribute("aria-disabled");
            }
        });
    }

    // ==========================================
    // VÍDEOS DE FUNDO
    // Carregam só quando visíveis; não tocam sozinhos com "movimento
    // reduzido" ou "economia de dados" — o visitante pode dar play.
    // ==========================================

    function initVideos() {
        const videos = document.querySelectorAll("video[data-src]");
        if (!videos.length) return;

        const saveData = navigator.connection?.saveData === true;
        const autoplay = !reduceMotion && !saveData;

        const load = video => {
            if (video.dataset.loaded) return;
            video.src = video.dataset.src;
            video.dataset.loaded = "true";
        };

        const setToggle = (video, playing) => {
            const button = video.closest("section")?.querySelector("[data-video-toggle]");
            if (!button) return;
            button.setAttribute("aria-pressed", String(!playing));
            button.setAttribute("aria-label", playing ? "Pausar vídeo de fundo" : "Reproduzir vídeo de fundo");
            button.innerHTML = playing
                ? '<i class="fas fa-pause" aria-hidden="true"></i>'
                : '<i class="fas fa-play" aria-hidden="true"></i>';
        };

        const play = video => {
            load(video);
            video.play().then(() => setToggle(video, true)).catch(() => setToggle(video, false));
        };

        videos.forEach(video => {
            video.muted = true;
            setToggle(video, false);

            const button = video.closest("section")?.querySelector("[data-video-toggle]");
            button?.addEventListener("click", () => {
                if (video.paused) {
                    video.dataset.userPaused = "";
                    play(video);
                } else {
                    video.dataset.userPaused = "true";
                    video.pause();
                    setToggle(video, false);
                }
            });
        });

        if (!autoplay || !("IntersectionObserver" in window)) return;

        const observer = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                const video = entry.target;
                if (entry.isIntersecting && video.dataset.userPaused !== "true") play(video);
                else if (!entry.isIntersecting && !video.paused) video.pause();
            });
        }, { threshold: 0.15 });

        videos.forEach(video => observer.observe(video));
    }

    // ==========================================
    // TRILHO HORIZONTAL (projetos em destaque)
    // ==========================================

    function initRails() {
        document.querySelectorAll("[data-rail]").forEach(rail => {
            const prev = document.querySelector(`[data-rail-prev="${rail.id}"]`);
            const next = document.querySelector(`[data-rail-next="${rail.id}"]`);

            const step = () => (rail.firstElementChild?.getBoundingClientRect().width || rail.clientWidth) + 24;

            const update = () => {
                const max = rail.scrollWidth - rail.clientWidth - 2;
                if (prev) prev.disabled = rail.scrollLeft <= 2;
                if (next) next.disabled = rail.scrollLeft >= max;
            };

            prev?.addEventListener("click", () => rail.scrollBy({ left: -step(), behavior: reduceMotion ? "auto" : "smooth" }));
            next?.addEventListener("click", () => rail.scrollBy({ left: step(), behavior: reduceMotion ? "auto" : "smooth" }));
            rail.addEventListener("scroll", update, { passive: true });
            window.addEventListener("resize", update);
            update();
        });
    }

    // ==========================================
    // LOGIN / CADASTRO
    // ==========================================

    function initPasswordToggle() {
        document.querySelectorAll("[data-password-toggle]").forEach(button => {
            const input = document.getElementById(button.getAttribute("aria-controls"));
            if (!input) return;

            button.addEventListener("click", () => {
                const show = input.type === "password";
                input.type = show ? "text" : "password";
                button.setAttribute("aria-pressed", String(show));
                button.setAttribute("aria-label", show ? "Ocultar senha" : "Mostrar senha");
                button.innerHTML = show
                    ? '<i class="fas fa-eye-slash" aria-hidden="true"></i>'
                    : '<i class="fas fa-eye" aria-hidden="true"></i>';
            });
        });
    }

    function initPasswordStrength() {
        const input = document.querySelector("[data-password-strength]");
        const meter = document.querySelector(".password-strength");
        const text = document.getElementById("strength-text");
        if (!input || !meter || !text) return;

        const labels = ["Muito fraca", "Fraca", "Razoável", "Boa", "Forte"];

        input.addEventListener("input", () => {
            const value = input.value;
            let score = 0;
            if (value.length >= 8) score += 1;
            if (value.length >= 12) score += 1;
            if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score += 1;
            if (/\d/.test(value)) score += 1;
            if (/[^A-Za-z0-9]/.test(value)) score += 1;
            score = Math.min(score, 4);

            meter.dataset.score = value ? String(score) : "";
            text.textContent = value
                ? `Segurança da senha: ${labels[score]}`
                : "Use 8 ou mais caracteres, misturando letras, números e símbolos.";
        });
    }

    function initAuthFeedback() {
        const box = document.querySelector("[data-auth-feedback]");
        if (!box) return;

        const params = new URLSearchParams(window.location.search);
        const messages = {
            "1": "E-mail ou senha incorretos. Verifique os dados e tente novamente.",
            campos: "Preencha todos os campos para criar sua conta.",
            email: "O e-mail informado não é válido.",
            existente: "Já existe uma conta com este e-mail. Tente entrar.",
            database: "Não foi possível concluir o cadastro agora. Tente novamente em instantes.",
            nome: "Informe seu nome (de 2 a 120 caracteres).",
            senha: "A senha precisa ter de 8 a 72 caracteres.",
            privacidade: "Para criar a conta, aceite a política de privacidade.",
            limite: "Muitas tentativas de acesso. Aguarde alguns minutos e tente novamente.",
            sessao: "Entre com seu e-mail e senha para acessar a área do cliente."
        };

        const error = params.get("erro");
        const success = params.get("sucesso");

        if (error) {
            box.className = "alert alert-error";
            box.innerHTML = '<i class="fas fa-circle-exclamation" aria-hidden="true"></i>';
            box.append(messages[error] || "Algo deu errado. Tente novamente.");
        } else if (success === "cadastro" || success === "saida") {
            box.className = "alert alert-success";
            box.innerHTML = '<i class="fas fa-circle-check" aria-hidden="true"></i>';
            box.append(success === "cadastro"
                ? "Conta criada com sucesso! Entre com seu e-mail e senha."
                : "Você saiu da sua conta com segurança.");
        }
    }

    // ==========================================
    // INICIALIZAÇÃO
    // ==========================================

    initPreloader();
    initTheme();
    initMenu();
    initHeader();
    initScrollTop();
    initReveal();
    initYear();
    initProjectFilters();
    initProjectModal();
    initInlineValidation();
    initContactForm();
    initVideos();
    initRails();
    initPasswordToggle();
    initPasswordStrength();
    initAuthFeedback();

});
