/* ==========================================================
   PanelFit — ajusta el rectángulo (panel) al texto REAL que se proyecta
   Para el VISOR / proyector. No depende del editor de layout.

   Contrato del layout (escena actual, scenes.verse | scenes.coro | scenes.multi):
     panel:  { x, y, width, height, auto: true, pad: 2 }   // auto = se ajusta solo; pad en cqi (% del ancho)
     margin: { x, y, width, height }                        // área segura, en % del stage

   Si panel.auto es true, NO uses x/y/width/height del layout: llama a PanelFit cada vez que
   cambie el texto. Si es false, usa la geometría guardada como siempre.
   ========================================================== */
(function (root) {
    'use strict';

    const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
    const round = v => Math.round(v * 100) / 100;
    const FULL = { x: 0, y: 0, width: 100, height: 100 };

    function union(rects) {
        let L = Infinity, T = Infinity, R = -Infinity, B = -Infinity;
        rects.forEach(r => {
            L = Math.min(L, r.left); T = Math.min(T, r.top);
            R = Math.max(R, r.right); B = Math.max(B, r.bottom);
        });
        return { L, T, R, B };
    }

    /* ---------- funciones PURAS (sin DOM; se pueden probar en Node) ---------- */

    // stage = {width, height} en px · rects = [{left, top, right, bottom}] en px del stage
    // Devuelve el rectángulo del panel en % del stage, o null si no hay texto.
    function computePanelRect(stage, rects, opts) {
        if (!rects || !rects.length) return null;
        const o = opts || {}, M = o.margin || FULL;
        const pad = (o.pad != null ? o.pad : 2) / 100 * stage.width;
        let { L, T, R, B } = union(rects);
        const ml = M.x / 100 * stage.width,  mt = M.y / 100 * stage.height;
        const mr = ml + M.width / 100 * stage.width, mb = mt + M.height / 100 * stage.height;
        L = Math.max(L - pad, ml); T = Math.max(T - pad, mt);          // abraza al texto + relleno,
        R = Math.min(R + pad, mr); B = Math.min(B + pad, mb);          // sin salirse del área segura
        if (R <= L || B <= T) return null;
        return {
            x: round(L / stage.width * 100),  y: round(T / stage.height * 100),
            width: round((R - L) / stage.width * 100), height: round((B - T) / stage.height * 100)
        };
    }

    // Factor (<= 1) por el que hay que reducir el texto para que quepa en el área segura. 1 = ya cabe.
    function fitFactor(stage, rects, opts) {
        if (!rects || !rects.length) return 1;
        const o = opts || {}, M = o.margin || FULL;
        const pad = (o.pad != null ? o.pad : 2) / 100 * stage.width;
        const { L, T, R, B } = union(rects);
        // El relleno NO se reduce con el texto: el factor se calcula solo sobre el texto, con el espacio que queda
        const availW = M.width / 100 * stage.width - 2 * pad, availH = M.height / 100 * stage.height - 2 * pad;
        if (availW <= 0 || availH <= 0) return 0.1;
        const f = Math.min(1, availW / (R - L), availH / (B - T));
        return f < 0.995 ? f : 1;
    }

    /* ---------- DOM ---------- */

    // Mide los textos visibles y con contenido, en px relativos al stage.
    // (Mide con getBoundingClientRect: hazlo cuando no haya una animación de escala en curso.)
    function measure(stageEl, textEls) {
        const s = stageEl.getBoundingClientRect(), rects = [];
        (textEls || []).forEach(el => {
            if (!el || !el.isConnected || !(el.textContent || '').trim()) return;
            const r = el.getBoundingClientRect();
            if (r.width < 1 || r.height < 1) return;                       // oculto o vacío
            rects.push({ left: r.left - s.left, top: r.top - s.top, right: r.right - s.left, bottom: r.bottom - s.top });
        });
        return { stage: { width: s.width, height: s.height }, rects };
    }

    // Ajusta el panel una vez. Devuelve el rectángulo aplicado (% del stage) o null.
    //   opts.pad       relleno en cqi (por defecto 2)
    //   opts.margin    {x,y,width,height} del área segura, en % (por defecto, todo el stage)
    //   opts.shrink    true = si el texto no cabe en el área segura, lo reduce con --fit (ver nota abajo)
    //   opts.minScale  tope de reducción (por defecto 0.5)
    // NOTA shrink: el CSS de TODOS los textos de la escena debe multiplicar su font-size por var(--fit, 1).
    function fitPanelToText(stageEl, panelEl, textEls, opts) {
        const o = opts || {};
        let m = measure(stageEl, textEls);
        if (o.shrink) {
            let scale = 1;
            stageEl.style.setProperty('--fit', '1');                       // parte siempre del tamaño completo
            m = measure(stageEl, textEls);
            for (let i = 0; i < 4 && m.rects.length; i++) {                // el texto reacomoda líneas: hasta 4 pasadas
                const f = fitFactor(m.stage, m.rects, o);
                if (f >= 1) break;
                scale = Math.max(o.minScale || 0.5, scale * f);
                stageEl.style.setProperty('--fit', String(Math.round(scale * 1000) / 1000));
                m = measure(stageEl, textEls);
            }
        }
        const r = computePanelRect(m.stage, m.rects, o);
        if (!r) { panelEl.style.visibility = 'hidden'; return null; }      // sin texto: sin rectángulo
        panelEl.style.visibility = '';
        panelEl.style.left = r.x + '%';        panelEl.style.top = r.y + '%';
        panelEl.style.width = r.width + '%';   panelEl.style.height = r.height + '%';
        return r;
    }

    // Se engancha una vez por escena. Reajusta solo cuando cambia el texto, el tamaño del stage o las fuentes.
    // getTextEls: función que devuelve los elementos de texto ACTUALES de la escena.
    // Devuelve { refit(), destroy() }. Llama a refit() justo después de poner el texto de cada versículo.
    function watch(stageEl, panelEl, getTextEls, opts) {
        let raf = 0, dead = false, ro = null, mo = null;
        const run = () => { raf = 0; if (!dead) fitPanelToText(stageEl, panelEl, getTextEls(), opts); };
        const schedule = () => { if (!raf && !dead) raf = requestAnimationFrame(run); };
        function bind() {
            if (ro) ro.disconnect();
            if (mo) mo.disconnect();
            ro = new ResizeObserver(schedule);
            mo = new MutationObserver(schedule);
            ro.observe(stageEl);
            getTextEls().filter(Boolean).forEach(el => {
                ro.observe(el);
                mo.observe(el, { childList: true, characterData: true, subtree: true });
            });
        }
        bind();
        schedule();
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule);
        return {
            refit() { bind(); if (raf) { cancelAnimationFrame(raf); raf = 0; } run(); },
            destroy() { dead = true; if (raf) cancelAnimationFrame(raf); if (ro) ro.disconnect(); if (mo) mo.disconnect(); }
        };
    }

    const api = { computePanelRect, fitFactor, measure, fitPanelToText, watch };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.PanelFit = api;
})(typeof window !== 'undefined' ? window : this);
