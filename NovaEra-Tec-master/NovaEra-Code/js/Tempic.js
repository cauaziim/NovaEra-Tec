// ==========================================
// TEMPIC — monitor com dados reais (API Open-Meteo) e sub-navegação
// Tema, menu, preloader e "voltar ao topo" ficam em script.js.
// Se a API não responder, o monitor volta para a simulação local.
// ==========================================

document.addEventListener("DOMContentLoaded", () => {
    const FORECAST_API = "https://api.open-meteo.com/v1/forecast";
    const GEOCODING_API = "https://geocoding-api.open-meteo.com/v1/search";
    const REFRESH_MS = 10 * 60 * 1000;
    const DEFAULT_PLACE = { latitude: -23.55, longitude: -46.63, label: "São Paulo, SP" };

    const monitorTemperature = document.getElementById("monitorTemperature");
    const monitorUpdated = document.getElementById("monitorUpdated");
    const monitorTrend = document.getElementById("monitorTrend");
    const monitorLocation = document.getElementById("monitorLocation");
    const monitorBadge = document.getElementById("monitorBadge");
    const monitorSource = document.getElementById("monitorSource");
    const monitorRefresh = document.querySelector(".monitor-refresh");
    const monitorSearch = document.getElementById("monitorSearch");
    const monitorCity = document.getElementById("monitorCity");
    const monitorLocate = document.getElementById("monitorLocate");
    const monitorBars = document.querySelectorAll(".monitor-chart span");

    if (!monitorTemperature) return;

    const formatNumber = value => value.toFixed(1).replace(".", ",");

    const setSource = (html, offline = false) => {
        if (!monitorSource) return;
        monitorSource.innerHTML = html;
        monitorSource.classList.toggle("is-offline", offline);
    };

    const loadPlace = () => {
        try {
            const saved = JSON.parse(localStorage.getItem("tempic-place") || "null");
            if (saved && Number.isFinite(saved.latitude) && Number.isFinite(saved.longitude)) return saved;
        } catch (error) { /* armazenamento indisponível */ }
        return DEFAULT_PLACE;
    };

    let place = loadPlace();
    let simulationTimer = null;

    // ---------- Simulação local (fallback) ----------
    let simulatedTemperature = 23.5;

    const updateSimulation = () => {
        const variation = (Math.random() - 0.5) * 0.4;
        simulatedTemperature = Math.max(18, Math.min(30, simulatedTemperature + variation));
        const normalized = (simulatedTemperature - 18) / 12;

        monitorTemperature.textContent = formatNumber(simulatedTemperature);
        if (monitorUpdated) monitorUpdated.textContent = "Atualizado agora";
        if (monitorTrend) monitorTrend.textContent = "";
        monitorBars.forEach((bar, index) => {
            const historyVariation = (Math.sin(Date.now() / 900000 + index) * 0.12) + (Math.random() - 0.5) * 0.08;
            const height = Math.max(22, Math.min(92, (normalized * 55) + 35 + historyVariation * 100));
            bar.style.height = `${height}%`;
        });
    };

    const startSimulation = reason => {
        if (monitorBadge) {
            monitorBadge.textContent = "SIMULAÇÃO";
            monitorBadge.classList.add("is-sim");
        }
        if (monitorLocation) monitorLocation.textContent = "Ambiente monitorado";
        setSource(`<i class="fas fa-triangle-exclamation" aria-hidden="true"></i> ${reason} Exibindo simulação local.`, true);
        updateSimulation();
        if (!simulationTimer) simulationTimer = window.setInterval(updateSimulation, 5000);
    };

    const stopSimulation = () => {
        window.clearInterval(simulationTimer);
        simulationTimer = null;
        if (monitorBadge) {
            monitorBadge.textContent = "AO VIVO";
            monitorBadge.classList.remove("is-sim");
        }
    };

    // ---------- Dados reais ----------
    const fetchJson = async url => {
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 8000);
        try {
            const response = await fetch(url, { signal: controller.signal });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.json();
        } finally {
            window.clearTimeout(timeout);
        }
    };

    const renderWeather = data => {
        const current = data.current?.temperature_2m;
        const hourly = (data.hourly?.temperature_2m || []).filter(Number.isFinite).slice(-monitorBars.length);
        if (!Number.isFinite(current) || !hourly.length) throw new Error("Resposta sem temperatura");

        stopSimulation();
        monitorTemperature.textContent = formatNumber(current);
        if (monitorLocation) monitorLocation.textContent = place.label;

        const min = Math.min(...hourly, current);
        const max = Math.max(...hourly, current);
        const range = max - min || 1;
        monitorBars.forEach((bar, index) => {
            const value = hourly[index] ?? current;
            bar.style.height = `${25 + ((value - min) / range) * 67}%`;
            bar.title = `${formatNumber(value)} °C`;
        });

        if (monitorTrend) {
            const diff = current - hourly[0];
            const up = diff >= 0;
            monitorTrend.className = up ? "" : "is-down";
            monitorTrend.innerHTML = `<i class="fas fa-arrow-trend-${up ? "up" : "down"}" aria-hidden="true"></i> ${up ? "+" : "−"}${formatNumber(Math.abs(diff))} °C em ${hourly.length - 1}h`;
        }

        const time = data.current?.time ? data.current.time.slice(11, 16) : "";
        if (monitorUpdated) monitorUpdated.textContent = time ? `Leitura das ${time} (hora local)` : "Atualizado agora";
        setSource('<i class="fas fa-wifi" aria-hidden="true"></i> Dados reais · API Open-Meteo');
    };

    const loadWeather = async () => {
        const params = new URLSearchParams({
            latitude: place.latitude,
            longitude: place.longitude,
            current: "temperature_2m",
            hourly: "temperature_2m",
            past_hours: String(monitorBars.length - 1),
            forecast_hours: "1",
            timezone: "auto"
        });
        try {
            renderWeather(await fetchJson(`${FORECAST_API}?${params}`));
        } catch (error) {
            startSimulation("API de clima indisponível.");
        }
    };

    const setPlace = newPlace => {
        place = newPlace;
        try { localStorage.setItem("tempic-place", JSON.stringify(place)); } catch (error) { /* ignora */ }
        loadWeather();
    };

    monitorSearch?.addEventListener("submit", async event => {
        event.preventDefault();
        const name = monitorCity.value.trim();
        if (name.length < 2) {
            monitorCity.focus();
            return;
        }

        setSource('<i class="fas fa-magnifying-glass" aria-hidden="true"></i> Procurando cidade…');
        try {
            const params = new URLSearchParams({ name, count: "1", language: "pt", format: "json" });
            const result = (await fetchJson(`${GEOCODING_API}?${params}`)).results?.[0];
            if (!result) {
                setSource(`<i class="fas fa-circle-question" aria-hidden="true"></i> Não encontramos “${name.replace(/[<>&"]/g, "")}”. Tente outro nome.`, true);
                return;
            }
            monitorCity.value = "";
            setPlace({
                latitude: result.latitude,
                longitude: result.longitude,
                label: [result.name, result.admin1 || result.country].filter(Boolean).join(", ")
            });
        } catch (error) {
            setSource('<i class="fas fa-triangle-exclamation" aria-hidden="true"></i> Busca indisponível no momento.', true);
        }
    });

    if (monitorLocate) {
        if (!("geolocation" in navigator)) {
            monitorLocate.hidden = true;
        } else {
            monitorLocate.addEventListener("click", () => {
                setSource('<i class="fas fa-location-crosshairs" aria-hidden="true"></i> Obtendo sua localização…');
                navigator.geolocation.getCurrentPosition(
                    position => setPlace({
                        latitude: Number(position.coords.latitude.toFixed(3)),
                        longitude: Number(position.coords.longitude.toFixed(3)),
                        label: "Sua localização"
                    }),
                    () => setSource('<i class="fas fa-location-dot" aria-hidden="true"></i> Não foi possível usar sua localização. Busque uma cidade.', true),
                    { timeout: 10000, maximumAge: 600000 }
                );
            });
        }
    }

    monitorRefresh?.addEventListener("click", () => {
        if (simulationTimer) updateSimulation();
        else loadWeather();
        monitorRefresh.classList.remove("is-spinning");
        window.requestAnimationFrame(() => monitorRefresh.classList.add("is-spinning"));
    });

    loadWeather();
    window.setInterval(() => {
        if (!simulationTimer && document.visibilityState === "visible") loadWeather();
    }, REFRESH_MS);

    // ---------- Destaca na sub-navegação a seção visível ----------
    const subnavLinks = document.querySelectorAll('.subnav a[href^="#"]');
    if (subnavLinks.length && "IntersectionObserver" in window) {
        const observer = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) return;
                subnavLinks.forEach(link => {
                    const active = link.getAttribute("href") === `#${entry.target.id}`;
                    link.classList.toggle("active", active);
                    if (active) link.setAttribute("aria-current", "true");
                    else link.removeAttribute("aria-current");
                });
            });
        }, { rootMargin: "-35% 0px -55%" });

        subnavLinks.forEach(link => {
            const section = document.querySelector(link.getAttribute("href"));
            if (section) observer.observe(section);
        });
    }
});
