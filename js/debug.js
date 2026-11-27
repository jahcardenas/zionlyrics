(function () {
    'use strict';

    // Atajos jQuery-style
    function $(id) {
        if (id instanceof Element) return id;
        if (typeof id !== 'string') return null;
        const clean = id.startsWith('#') ? id.slice(1) : id;
        return document.getElementById(clean);
    }
    function $$(selector, scope) {
        const root = scope instanceof Element ? scope : document;
        return root.querySelector(selector);
    }

    // -----------------------------------------------------------------
    // LOGGER — buffer en memoria
    // -----------------------------------------------------------------
    // Reglas:
    //   - NADA se imprime en consola por defecto.
    //   - Todos los mensajes se acumulan en window.__logBuffer (array).
    //   - Si `zionLyricsObj.debugLogging === true`, cada entrada se vuelca
    //     también a archivo (vía IPC) con timestamp local.
    //   - Los mensajes son internos; van en inglés (no i18n).
    // -----------------------------------------------------------------

    const MAX_BUFFER = 5000;
    window.__logBuffer = window.__logBuffer || [];

    function localStamp() {
        const d = new Date();
        const pad = (n, len = 2) => String(n).padStart(len, '0');
        return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
    }

    function stringify(v) {
        if (v === null || v === undefined) return String(v);
        if (typeof v === 'object') {
            try { return JSON.stringify(v); } catch (_) { return String(v); }
        }
        return String(v);
    }

    function push(level, tag, args) {
        const entry = {
            ts: Date.now(),
            stamp: localStamp(),
            level,
            tag,
            msg: args.map(stringify).join(' ')
        };
        window.__logBuffer.push(entry);
        if (window.__logBuffer.length > MAX_BUFFER) window.__logBuffer.shift();

        // Volcado a archivo solo si el usuario activó debugLogging
        if (window.zionLyricsObj?.debugLogging && window.electronAPI?.debugLog) {
            window.electronAPI.debugLog(tag, `[${level}] ${entry.msg}`).catch(() => {});
        }
    }

    function logInfo(tag, ...args)  { push('info',  tag, args); }
    function logWarn(tag, ...args)  { push('warn',  tag, args); }
    function logError(tag, ...args) { push('error', tag, args); }

    // Alias legacy
    function debugLog(tag, ...args) { logInfo(tag, ...args); }

    // API pública
    window.$        = $;
    window.$$       = $$;
    window.logInfo  = logInfo;
    window.logWarn  = logWarn;
    window.logError = logError;
    window.debugLog = debugLog;
})();