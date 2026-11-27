const RTL_LOCALES = new Set(['ar', 'he', 'fa', 'ur', 'yi']);

function resolveDir(localeId) {
    const loc = state.availableLocales.find(l => l.id === localeId);
    if (loc?.dir === 'rtl' || loc?.dir === 'ltr') return loc.dir;
    return RTL_LOCALES.has(localeId) ? 'rtl' : 'ltr';
}

function applyDocumentDir() {
    const dir  = resolveDir(zionLyricsObj.currentLocale);
    const lang = zionLyricsObj.currentLocale;
    document.documentElement.setAttribute('dir', dir);
    document.documentElement.setAttribute('lang', lang);
}

function initI18n() {
    // 1) Cargar catálogo de locales (sync, ya validados en main.js)
    state.availableLocales = window.electronAPI.loadLocalesSync() || [];

    // 2) Resolver el idioma activo.
    //    Prioridad: currentLocale ya seteado > localStorage > 'es' > primer locale disponible.
    let target = zionLyricsObj.currentLocale;

    if (!target) {
        try {
            const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
            if (raw) target = JSON.parse(raw).currentLocale;
        } catch (_) {}
    }
    if (!target && state.availableLocales.length > 0) {
        target = state.availableLocales.some(l => l.id === 'es')
            ? 'es'
            : state.availableLocales[0].id;
    }
    // Validar que exista; si no, fallback a 'es' o al primero
    if (!state.availableLocales.some(l => l.id === target)) {
        target = state.availableLocales.some(l => l.id === 'es')
            ? 'es'
            : (state.availableLocales[0]?.id || 'es');
    }
    zionLyricsObj.currentLocale = target;
    applyDocumentDir();
}

function setLang(id) {
    const active   = state.availableLocales.find(l => l.id === zionLyricsObj.currentLocale);
    const fallback = state.availableLocales.find(l => l.id === 'es');
    return active?.strings?.[id] ?? fallback?.strings?.[id] ?? id;
}

function applyTranslations(root = document) {
    root.querySelectorAll('[data-i18n]').forEach(el => {
        el.textContent = setLang(el.dataset.i18n);
    });
    root.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        el.placeholder = setLang(el.dataset.i18nPlaceholder);
    });
    root.querySelectorAll('[data-i18n-tooltip]').forEach(el => {
        el.dataset.tooltip = setLang(el.dataset.i18nTooltip);
    });

    // Re-crear tooltips: los data-tooltip cambiaron
    if (window.Tooltip?.init) Tooltip.init();
}

function setLocale(id) {
    if (!state.availableLocales.some(l => l.id === id)) return;
    zionLyricsObj.currentLocale = id;
    applyDocumentDir();
    applyTranslations();

    // Persistir la elección
    if (typeof saveZionLyricsObj === 'function') saveZionLyricsObj();
}

function populateLocaleDropdown(selectEl) {
    if (!selectEl) return;
    selectEl.innerHTML = '';

    state.availableLocales.forEach(loc => {
        const opt = document.createElement('option');
        opt.value = loc.id;
        opt.textContent = loc.label;
        selectEl.appendChild(opt);
    });

    selectEl.value = zionLyricsObj.currentLocale;
}

function onLocaleChange(sel, ev) {
    setLocale(sel.value);
}

window.initI18n             = initI18n;
window.setLang              = setLang;
window.applyTranslations    = applyTranslations;
window.setLocale            = setLocale;
window.populateLocaleDropdown = populateLocaleDropdown;
window.resolveDir       = resolveDir;
window.applyDocumentDir = applyDocumentDir;