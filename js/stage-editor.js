(function () {
    'use strict';

    // ----------------------------------------------------------
    // ESCENAS: cada tipo de contenido (versículo / coro) tiene su propio layout.
    // Un elemento PRESENTE en la escena = activado; ausente = quitado.
    // Formato guardado:  { scenes: { verse: { bg, panel, ref, verse, version, logo }, coro: { bg, coro, ... } } }
    // ----------------------------------------------------------
    const DEFAULTS = {
        verse: {
            bg:      { x: 0,  y: 0,  width: 100, height: 100 },
            panel:   { x: 5,  y: 36, width: 66,  height: 56, auto: true, pad: 2 },   // auto: se ajusta solo al texto
            ref:     { x: 8,  y: 38, fs: 2.4 },
            verse:   { x: 8,  y: 47, maxWidth: 60, fs: 3.6 },
            version: { x: 8,  y: 82, fs: 1.8 },
            logo:    { x: 84, y: 6,  width: 10, height: 18 },
            placeholder: { x: 10, y: 10, width: 80, height: 80 },
            sermon:  { x: 10, y: 85, fs: 3, maxWidth: 80 },
        },
        coro: {
            bg:    { x: 0,  y: 0,  width: 100, height: 100 },
            panel: { x: 8,  y: 20, width: 84,  height: 60, auto: true, pad: 2 },
            coro:  { x: 12, y: 30, maxWidth: 76, fs: 4.5 },
            logo:  { x: 84, y: 6,  width: 10, height: 18 },
            placeholder: { x: 10, y: 10, width: 80, height: 80 },
            sermon:  { x: 10, y: 85, fs: 3, maxWidth: 80 },
        },
        placeholder: {
            bg: { x: 0, y: 0, width: 100, height: 100 },
            placeholder: { x: 10, y: 10, width: 80, height: 80 }
        },
        sermon: {
            bg: { x: 0, y: 0, width: 100, height: 100 },
            panel: { x: 10, y: 80, width: 80, height: 15, auto: true, pad: 2 },
            logo: { x: 84, y: 6, width: 10, height: 18 },
            sermon: { x: 10, y: 85, fs: 3, maxWidth: 80 }
        }
    };
    // Multi versión: UNA referencia compartida y, por versículo: texto, versión y su propio rectángulo.
    const MULTI_LAYOUT = {
        2: {
            ref:      { x: 6,    y: 14, fs: 2.6 },
            verse:    { x: 6,    y: 30, maxWidth: 40, fs: 3.2 },
            version:  { x: 6,    y: 78, fs: 1.6 },
            panel:    { x: 4,    y: 26, width: 44, height: 58, auto: true, pad: 2 },
            verse2:   { x: 54,   y: 30, maxWidth: 40, fs: 3.2 },
            version2: { x: 54,   y: 78, fs: 1.6 },
            panel2:   { x: 52,   y: 26, width: 44, height: 58, auto: true, pad: 2 }
        },
        3: {
            ref:      { x: 5,    y: 12, fs: 2.2 },
            verse:    { x: 5,    y: 28, maxWidth: 27, fs: 2.5 },
            version:  { x: 5,    y: 78, fs: 1.4 },
            panel:    { x: 3,    y: 24, width: 30, height: 60, auto: true, pad: 2 },
            verse2:   { x: 36.5, y: 28, maxWidth: 27, fs: 2.5 },
            version2: { x: 36.5, y: 78, fs: 1.4 },
            panel2:   { x: 34.5, y: 24, width: 30, height: 60, auto: true, pad: 2 },
            verse3:   { x: 68,   y: 28, maxWidth: 27, fs: 2.5 },
            version3: { x: 68,   y: 78, fs: 1.4 },
            panel3:   { x: 66,   y: 24, width: 30, height: 60, auto: true, pad: 2 }
        }
    };
    const MULTI_BASE = { bg: { x: 0, y: 0, width: 100, height: 100 }, logo: { x: 84, y: 6, width: 10, height: 18 } };
    DEFAULTS.multi2 = { ...MULTI_BASE, ...MULTI_LAYOUT[2] };
    DEFAULTS.multi3 = { ...MULTI_BASE, ...MULTI_LAYOUT[3] };
    // Wordy: una palabra (hebreo / arameo / griego) con su significado, en 2 o 3 columnas y hasta 3 filas.
    // Cada COLUMNA es un texto independiente (wordy1, wordy2, wordy3): posición, tamaño, alineación y estilo propios.
    // Aquí solo se configura la PRIMERA fila; las demás copian su formato al proyectar.
    const WORDY_BASE = {
        bg:    { x: 0, y: 0,  width: 100, height: 100 },
        logo:  { x: 84, y: 6, width: 10, height: 18 },
        panel: { x: 4,  y: 26, width: 92, height: 24, auto: true, pad: 2 }
    };
    DEFAULTS.wordy2 = { ...WORDY_BASE,
        wordy1: { x: 8,  y: 30, maxWidth: 28, fs: 3.4 },
        wordy2: { x: 40, y: 30, maxWidth: 52, fs: 3 }
    };
    DEFAULTS.wordy3 = { ...WORDY_BASE,
        wordy1: { x: 6,  y: 30, maxWidth: 24, fs: 3 },
        wordy2: { x: 32, y: 30, maxWidth: 38, fs: 2.6 },
        wordy3: { x: 74, y: 30, maxWidth: 20, fs: 2 }
    };
    // Por versículo: [texto, versión, rectángulo]
    const SLOT_KEYS = [['verse', 'version', 'panel'], ['verse2', 'version2', 'panel2'], ['verse3', 'version3', 'panel3']];
    // Tipo de contenido -> escena:  coro = coro · 1 versículo = verse · 2 versículos = multi2 · 3 versículos = multi3
    const SCENES = {
        verse:  { 
            main: 'verse', 
            keys: ['bg', 'panel', 'ref', 'verse', 'version', 'logo'], 
            on:   ['bg', 'panel', 'ref', 'verse', 'version', 'logo'] 
        },
        coro:   { 
            main: 'coro',  
            keys: ['bg', 'panel', 'coro', 'logo'],                    
            on:   ['bg', 'coro'] 
        },
        multi2: { 
            main: 'verse', 
            keys: ['bg', 'logo', 'ref', ...SLOT_KEYS.slice(0, 2).flat()],
            on:   ['bg', 'ref', 'verse', 'version', 'panel', 'verse2', 'version2', 'panel2'] 
        },
        multi3: { 
            main: 'verse', 
            keys: ['bg', 'logo', 'ref', ...SLOT_KEYS.flat()],
            on:   ['bg', 'ref', 'verse', 'version', 'panel', 'verse2', 'version2', 'panel2', 'verse3', 'version3', 'panel3'] 
        },
        placeholder: {
            main: 'placeholder',
            keys: ['bg', 'placeholder'],
            on:   ['bg', 'placeholder']
        },
        sermon: {
            main: 'sermon',
            keys: ['bg', 'logo', 'panel', 'sermon'],
            on:   ['bg', 'logo', 'panel', 'sermon']
        },
        wordy2: {
            main: 'wordy1',
            keys: ['bg', 'logo', 'panel', 'wordy1', 'wordy2'],
            on:   ['bg', 'logo', 'panel', 'wordy1', 'wordy2']
        },
        wordy3: {
            main: 'wordy1',
            keys: ['bg', 'logo', 'panel', 'wordy1', 'wordy2', 'wordy3'],
            on:   ['bg', 'logo', 'panel', 'wordy1', 'wordy2', 'wordy3']
        }
    };
    const LAYOUT_VERSION = 3;
    const newMemo = () => Object.fromEntries(Object.keys(SCENES).map(k => [k, {}]));
    const DEFAULT_MARGIN = { x: 4, y: 4, width: 92, height: 92 };   // área segura, en % del stage
    const FRAME_MIN = 30;                                           // tamaño mínimo (%) del rectángulo de márgenes
    const REMOVABLE = new Set(['logo', 'panel', 'panel2', 'panel3', 'ref', 'version', 'version2', 'version3', 'placeholder', 'sermon']);

    function makeInitial() {
        const scenes = {};
        const margins = {};
        Object.keys(SCENES).forEach(sc => {
            scenes[sc] = {};
            SCENES[sc].on.forEach(k => { scenes[sc][k] = structuredClone(DEFAULTS[sc][k]); });
            margins[sc] = structuredClone(DEFAULT_MARGIN);
        });
        return { version: LAYOUT_VERSION, scenes, margins };
    }
    // Acepta el formato actual y los anteriores:
    //   v1 (plano)  -> escena "verse"
    //   v2 (scenes.multi, una sola escena con 2 o 3 versículos) -> "multi2" o "multi3" según cuántos versículos tenga
    function normalizeLayout(l) {
        const out = makeInitial();
        if (l && l.scenes) {
            Object.keys(SCENES).forEach(sc => { if (l.scenes[sc]) out.scenes[sc] = structuredClone(l.scenes[sc]); });
            if (l.scenes.multi) out.scenes[l.scenes.multi.verse3 ? 'multi3' : 'multi2'] = structuredClone(l.scenes.multi);
        } else if (l) {
            SCENES.verse.keys.forEach(k => { if (l[k]) out.scenes.verse[k] = structuredClone(l[k]); });
        }
        Object.keys(SCENES).forEach(sc => { if (!out.scenes[sc].bg) out.scenes[sc].bg = structuredClone(DEFAULTS[sc].bg); });
        ['multi2', 'multi3'].forEach(sc => ['ref2', 'ref3'].forEach(k => delete out.scenes[sc][k])); 
        // wordy: antes era un único bloque 'wordy'; ahora hay un texto por columna
        ['wordy2', 'wordy3'].forEach(sc => {
            if (!out.scenes[sc].wordy1) {
                out.scenes[sc] = {};
                SCENES[sc].on.forEach(k => { out.scenes[sc][k] = structuredClone(DEFAULTS[sc][k]); });
            }
        });

        // Migración de margen global a por escena
        if (l && l.margins) {
            Object.keys(out.margins).forEach(k => { 
                if (l.margins[k]) out.margins[k] = { ...DEFAULT_MARGIN, ...l.margins[k] }; 
            });
        } else if (l && l.margin) {
            Object.keys(out.margins).forEach(k => out.margins[k] = { ...DEFAULT_MARGIN, ...l.margin });
        }
        
        return out;
    }

    // ---- multi versión: cuántos versículos tiene la escena actual ----
    const slotCount = () => _scene === 'multi3' ? 3 : 2;
    // ---- wordy: columnas de la escena actual (2 o 3) ----
    const isWordy   = () => _scene === 'wordy2' || _scene === 'wordy3';
    const wordyCols = () => _scene === 'wordy3' ? 3 : 2;
    // Traducción con respaldo: si la cadena aún no existe en el archivo de idioma se usa el texto de respaldo
    const tr = (key, fallback) => {
        let v; try { v = setLang(key); } catch (_) {}
        return (v && v !== key) ? v : (fallback || key);
    };

    const MIN  = 3;
    const SNAP = 6;

    let _stage, _blocks, _movable, _moveable, _selected, _sel = [];
    let _draft, _start, _liveMax = 0, _busy = false;
    let _targets = [], _guideEls = [];
    let _box, _mq, _ctx, _rail;
    let _currentDisplayId = null;
    let _applyToAll = false;
    let _tip = null;      // etiqueta con el valor del margen mientras se arrastra
    let _snapOn = true;   // imán: se activa / desactiva desde la barra izquierda
    let _scene = 'verse', _memo = {};   // _memo = última posición de lo que se quitó
    const S = () => _draft.layout.scenes[_scene];    // layout de la escena actual

    const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
    const round = v => Math.round(v * 100) / 100;

    // ----------------------------------------------------------
    // LAYOUT: aplicar y commitear
    // ----------------------------------------------------------
    function apply(el, s) {
        if (!s) return;
        el.style.left     = (s.x != null ? s.x : 0) + '%';
        el.style.top      = (s.y != null ? s.y : 0) + '%';
        el.style.width    = s.width    != null ? s.width    + '%' : '';
        el.style.height   = s.height   != null ? s.height   + '%' : '';
        el.style.maxWidth = s.maxWidth != null ? s.maxWidth + '%' : '';
        el.style.textAlign = s.align || '';
        if (s.fs != null) el.style.setProperty('--fs', s.fs);
        el.style.removeProperty('transform');
    }

    const stateOf = k => k === 'margin' ? _draft.layout.margins[_scene] : S()[k];

    function applyBgVisual(el, bg) {
        if (!el) return;
        el.style.background = '';
        el.style.backgroundImage = '';
        el.innerHTML = '';
        
        if (!bg || !bg.type) {
            el.style.background = 'linear-gradient(135deg, #1a2238, #3a2a4d)';
            return;
        }
        if (bg.type === 'color') {
            el.style.background = bg.value || '#000';
        } else if (bg.type === 'image') {
            el.style.backgroundImage = `url("${bg.value}")`;
            el.style.backgroundSize = 'cover';
            el.style.backgroundPosition = 'center';
        } else if (bg.type === 'video') {
            const v = document.createElement('video');
            v.src = bg.value;
            v.muted = true; v.loop = true; v.autoplay = true; v.playsInline = true;
            v.style.cssText = 'width:100%; height:100%; object-fit:cover; pointer-events:none;';
            
            // NUEVO: Aplicar la velocidad de reproducción al preview
            v.playbackRate = parseFloat(bg.speed) || 1;
            
            el.appendChild(v);
        }
    }

    function refreshSelectionUI() {
        requestAnimationFrame(() => {
            if (_moveable) _moveable.updateRect();
            drawSel();
            placeCtx();
        });
    }

    let _animRaf = null;

    function trackAnimations() {
        if (_animRaf) cancelAnimationFrame(_animRaf);
        
        const loop = () => {
            if (!_selected) return;
            const anims = _selected.getAnimations();
            if (anims.length > 0) {
                drawSel();
                placeCtx();
                _animRaf = requestAnimationFrame(loop);
            } else {
                _animRaf = null;
            }
        };
        
        _animRaf = requestAnimationFrame(loop);
    }

    function applyTextVisuals(el, key) {
        if (!el || !_draft.contentStyles) return;
        const cs = _draft.contentStyles;
        
        // Seleccionamos el contenedor y el nodo de texto interno (.t)
        const targetEls = [el];
        const inner = el.querySelector('.t');
        if (inner) targetEls.push(inner);

        // Fuente (con !important para ganar cualquier herencia)
        if (cs[key + 'Font']) {
            const font = window.Fonts ? Fonts.resolve(cs[key + 'Font']) : `'${cs[key + 'Font']}', sans-serif`;
            targetEls.forEach(e => e.style.setProperty('font-family', font, 'important'));
        } else {
            // Si elige "Default", forzamos la variable de contenido para que se vea igual que en el proyector
            targetEls.forEach(e => e.style.setProperty('font-family', 'var(--font-content)', 'important'));
        }
        
        // Peso
        if (cs[key + 'Weight']) targetEls.forEach(e => e.style.setProperty('font-weight', cs[key + 'Weight'], 'important'));
        
        // Color
        if (cs[key + 'Color']) targetEls.forEach(e => e.style.setProperty('color', cs[key + 'Color'], 'important'));
        
        // Sombra
        if (cs.textShadow && cs.textShadow[key]) {
            const s = cs.textShadow[key];
            if (s.enabled) {
                const hex = s.color || '#000000';
                const r = parseInt(hex.slice(1, 3), 16) || 0;
                const g = parseInt(hex.slice(3, 5), 16) || 0;
                const b = parseInt(hex.slice(5, 7), 16) || 0;
                targetEls.forEach(e => e.style.textShadow = `${s.offsetX}px ${s.offsetY}px ${s.blur}px rgba(${r},${g},${b},${s.opacity})`);
            } else {
                targetEls.forEach(e => e.style.textShadow = 'none');
            }
        }
        
        // Alineación
        const st = S()[key];
        if (st && st.align) targetEls.forEach(e => e.style.textAlign = st.align);

        refreshSelectionUI();
    }

    // Límites (px del stage) dentro de los que se puede mover / redimensionar un elemento:
    // el área segura; el propio rectángulo de márgenes se limita al stage.
    function limits(el) {
        const sw = _start.sw, sh = _start.sh;
        if (el.classList.contains('frame')) return { l: 0, t: 0, r: sw, b: sh };
        const M = _draft.layout.margins[_scene];
        return { l: M.x / 100 * sw, t: M.y / 100 * sh, r: (M.x + M.width) / 100 * sw, b: (M.y + M.height) / 100 * sh };
    }

    // Al cambiar el margen (o de escena) deja TODO dentro del área segura: si algo es más grande se reduce, y se desplaza hacia adentro.
    function enforceMargin() {
        const M = _draft.layout.margins[_scene], s = _stage.getBoundingClientRect();
        if (!s.width) return;
        _movable.forEach(el => {
            const st = S()[el.dataset.key];
            if (!st) return;
            if (el.dataset.type === 'panel' && st.auto) return;   // el panel automático lo ajusta fitPanel()
            const pct = () => { const r = el.getBoundingClientRect();
                return { w: r.width / s.width * 100, h: r.height / s.height * 100 }; };
            let r = pct();
            const f = Math.min(1, M.width / r.w, M.height / r.h);
            if (f < 0.999) {
                if (el.classList.contains('text')) {
                    st.fs = round(st.fs * f);
                    if (st.maxWidth != null) st.maxWidth = round(st.maxWidth * f);
                } else { st.width = round(st.width * f); st.height = round(st.height * f); }
                apply(el, st);
                r = pct();
            }
            st.x = round(clamp(st.x, M.x, Math.max(M.x, M.x + M.width - r.w)));
            st.y = round(clamp(st.y, M.y, Math.max(M.y, M.y + M.height - r.h)));
            apply(el, st);
        });
        fitPanel();
    }

    // ---- Márgenes: cada línea punteada se arrastra directamente (Alt = mueve también la opuesta) ----
    function initFrame() {
        const fr = blockByKey('margin');
        if (fr && !fr.querySelector('.fh')) {
            ['n', 'e', 's', 'w'].forEach(edge =>
                fr.insertAdjacentHTML('beforeend', `<div class="fh fh-${edge}" data-edge="${edge}"></div>`));
        }
        _tip = _stage.querySelector('.margin-tip');
        if (!_tip) {
            _tip = document.createElement('div');
            _tip.className = 'margin-tip';
            _stage.appendChild(_tip);
        }
    }

    function startMarginDrag(ev, edge) {
        ev.preventDefault();
        setSel([blockByKey('margin')]);
        const fr = blockByKey('margin'), s = _stage.getBoundingClientRect(), M0 = _draft.layout.margins[_scene];
        const ins0 = { w: M0.x, n: M0.y, e: 100 - M0.x - M0.width, s: 100 - M0.y - M0.height };
        const opp = { w: 'e', e: 'w', n: 's', s: 'n' }[edge];
        const x0 = ev.clientX, y0 = ev.clientY;
        const handle = ev.target.closest('.fh');
        handle.classList.add('drag');

        const move = e2 => {
            const dx = (e2.clientX - x0) / s.width * 100, dy = (e2.clientY - y0) / s.height * 100;
            const raw = edge === 'w' ? dx : edge === 'e' ? -dx : edge === 'n' ? dy : -dy;   // positivo = hacia adentro
            const room = 100 - FRAME_MIN - ins0[edge] - ins0[opp];                           // lo que se puede cerrar
            const ins = { ...ins0 };
            if (e2.altKey) {                                  // simétrico: la línea opuesta se mueve igual
                const d = clamp(raw, -Math.min(ins0[edge], ins0[opp]), room / 2);
                ins[edge] = ins0[edge] + d; ins[opp] = ins0[opp] + d;
            } else {
                ins[edge] = clamp(ins0[edge] + raw, 0, ins0[edge] + room);
            }
            _draft.layout.margins[_scene] = {
                x: round(ins.w), y: round(ins.n),
                width: round(100 - ins.w - ins.e), height: round(100 - ins.n - ins.s)
            };
            apply(fr, _draft.layout.margins[_scene]);
            // etiqueta con el valor, sobre la línea que se arrastra
            const pos = { n: [50, ins.n], s: [50, 100 - ins.s], w: [ins.w, 50], e: [100 - ins.e, 50] }[edge];
            Object.assign(_tip.style, { display: 'block', left: pos[0] + '%', top: pos[1] + '%' });
            _tip.textContent = round(ins[edge]) + ' %';
        };
        const up = () => {
            document.removeEventListener('mousemove', move);
            document.removeEventListener('mouseup', up);
            handle.classList.remove('drag');
            _tip.style.display = 'none';
            enforceMargin();                                   // lo que quedó fuera se acomoda dentro
            if (_moveable) _moveable.updateRect();
            renderCtx();
            drawSel();
        };
        document.addEventListener('mousemove', move);
        document.addEventListener('mouseup', up);
    }

    // Textos que abraza cada rectángulo: en multi, el texto y la versión de SU versículo; en las demás escenas, todos.
    function panelTexts(pk) {
        const keys = _scene.startsWith('multi')
            ? SLOT_KEYS[pk === 'panel' ? 0 : pk === 'panel2' ? 1 : 2].slice(0, 2)
            : _scene === 'sermon' ? ['sermon'] : isWordy() ? ['wordy1', 'wordy2', 'wordy3'] : ['ref', 'verse', 'version', 'coro'];
        return keys.map(blockByKey).filter(el => el && _movable.includes(el));
    }

    // Un rectángulo en modo automático abraza a SUS textos (+ relleno), sin salirse del área segura.
    function fitPanel() {
        if (!_draft || !_stage || !_blocks || !_movable) return;
        const s = _stage.getBoundingClientRect();
        if (!s.width) return;
        ['panel', 'panel2', 'panel3'].forEach(pk => {
            const st = S()[pk], pe = blockByKey(pk);
            if (!st || !st.auto || !pe) return;
            const texts = panelTexts(pk);
            if (!texts.length) return;
            let L = 1e9, T = 1e9, R = -1e9, B = -1e9;
            texts.forEach(el => { const r = el.getBoundingClientRect();
                L = Math.min(L, r.left); T = Math.min(T, r.top); R = Math.max(R, r.right); B = Math.max(B, r.bottom); });
            const pad = (st.pad != null ? st.pad : 2) / 100 * s.width;          // relleno en cqi (% del ancho)
            const M = _draft.layout.margins[_scene];
            const ml = s.left + M.x / 100 * s.width,  mt = s.top + M.y / 100 * s.height;
            const mr = ml + M.width / 100 * s.width,   mb = mt + M.height / 100 * s.height;
            L = Math.max(L - pad, ml); T = Math.max(T - pad, mt); R = Math.min(R + pad, mr); B = Math.min(B + pad, mb);
            st.x = round((L - s.left) / s.width * 100);  st.y = round((T - s.top) / s.height * 100);
            st.width = round((R - L) / s.width * 100);   st.height = round((B - T) / s.height * 100);
            apply(pe, st);
        });
    }

    // Guarda el tamaño real (en % del stage) de cada bloque de texto de la escena actual.
    // El visor lo usa para saber hacia dónde debe crecer el texto: centrado → ambos lados,
    // mitad izquierda/superior → crece hacia derecha/abajo, mitad derecha/inferior → hacia izquierda/arriba.
    function measureBoxes() {
        if (!_stage || !_blocks) return;
        const s = _stage.getBoundingClientRect();
        if (!(s.width > 0 && s.height > 0)) return;
        _blocks.forEach(b => {
            if (!b.classList.contains('text') || b.classList.contains('off')) return;
            const st = stateOf(b.dataset.key);
            if (!st) return;
            const r = b.getBoundingClientRect();
            if (r.width < 1 || r.height < 1) return;
            st.w = round(r.width  / s.width  * 100);
            st.h = round(r.height / s.height * 100);
        });
    }

    function commit(el, resized) {
        const s = _stage.getBoundingClientRect();
        const r = el.getBoundingClientRect();
        const st = stateOf(el.dataset.key);
        if (![s.width, s.height, r.width, r.height].every(v => v > 0)) { apply(el, st); return; }

        if (el.classList.contains('frame')) {            // rectángulo de márgenes
            if (resized) {
                st.width  = round(clamp(r.width  / s.width  * 100, FRAME_MIN, 100));
                st.height = round(clamp(r.height / s.height * 100, FRAME_MIN, 100));
            }
            st.x = round(clamp((r.left - s.left) / s.width  * 100, 0, 100 - st.width));
            st.y = round(clamp((r.top  - s.top)  / s.height * 100, 0, 100 - st.height));
            apply(el, st);
            enforceMargin();                              // todo lo demás se acomoda dentro del nuevo margen
            if (_moveable) _moveable.updateRect();
            renderCtx();
            drawSel();
            return;
        }

        const M = _draft.layout.margins[_scene];
        if (el.classList.contains('text')) {
            if (resized) {
                st.fs = round(parseFloat(el.style.getPropertyValue('--fs')) || st.fs);
                if (st.maxWidth != null) st.maxWidth = round(clamp(_liveMax / s.width * 100, MIN, M.width));
            }
            const wp = r.width / s.width * 100, hp = r.height / s.height * 100;
            st.x = round(clamp((r.left - s.left) / s.width  * 100, M.x, Math.max(M.x, M.x + M.width  - wp)));
            st.y = round(clamp((r.top  - s.top)  / s.height * 100, M.y, Math.max(M.y, M.y + M.height - hp)));
            apply(el, st);
            if (_moveable) _moveable.updateRect();
            drawSel();
            return;
        }

        if (resized) {
            st.width  = round(clamp(r.width  / s.width  * 100, MIN, M.width));
            st.height = round(clamp(r.height / s.height * 100, MIN, M.height));
        }
        st.x = round(clamp((r.left - s.left) / s.width  * 100, M.x, Math.max(M.x, M.x + M.width  - st.width)));
        st.y = round(clamp((r.top  - s.top)  / s.height * 100, M.y, Math.max(M.y, M.y + M.height - st.height)));
        apply(el, st);
        if (_moveable) _moveable.updateRect();
        drawSel();
    }

    // ----------------------------------------------------------
    // SELECCIÓN Y MARCO
    // ----------------------------------------------------------
    function union(list) {
        const s = _stage.getBoundingClientRect();
        let L = 1e9, T = 1e9, R = -1e9, B = -1e9;
        list.forEach(el => {
            const r = el.getBoundingClientRect();
            L = Math.min(L, r.left); T = Math.min(T, r.top);
            R = Math.max(R, r.right); B = Math.max(B, r.bottom);
        });
        return { left: L - s.left, top: T - s.top, right: R - s.left, bottom: B - s.top, sw: s.width, sh: s.height };
    }

    function drawSel() {
        fitPanel();                // si el panel está en modo automático, sigue al texto en vivo
        if (!_box) return;
        if (!_sel.length || (_selected && _selected.classList.contains('frame'))) { _box.style.display = 'none'; placeCtx(); return; }
        const u = union(_sel);
        Object.assign(_box.style, {
            display: 'block',
            left:   u.left + 'px',
            top:    u.top + 'px',
            width:  (u.right - u.left) + 'px',
            height: (u.bottom - u.top) + 'px'
        });
        placeCtx();
    }

    function setSel(list, ev) {
        _sel = list;
        _selected = _sel.length === 1 ? _sel[0] : null;
        _blocks.forEach(b => b.classList.toggle('selected', _sel.includes(b)));
        buildMoveable();
        renderCtx();
        railMark();
        drawSel();
        if (_selected && ev && _moveable) {
            const ready = _moveable.waitToChangeTarget ? _moveable.waitToChangeTarget() : Promise.resolve();
            ready.then(() => _moveable.dragStart(ev));
        }
        if (_selected) trackAnimations();
    }

    // ----------------------------------------------------------
    // MOVEABLE
    // ----------------------------------------------------------
    const wraps = el => !!el && el.classList.contains('text') && S()[el.dataset.key]?.maxWidth != null;

    function measure(el) {
        const s = _stage.getBoundingClientRect(), r = el.getBoundingClientRect();
        _start = { left: r.left - s.left, top: r.top - s.top, w: r.width, h: r.height, sw: s.width, sh: s.height };
    }

    function buildMoveable() {
        if (_moveable) { _moveable.destroy(); _moveable = null; }
        if (!_stage) return;

        const isLogo  = _selected && _selected.dataset.key === 'logo';
        const isPanel = _selected && _selected.dataset.type === 'panel';
        const isFrame = _selected && _selected.dataset.key === 'margin';
        const tg = _sel.filter(el => !el.classList.contains('fixed') && !el.classList.contains('frame')
            && !(el.dataset.type === 'panel' && (S()[el.dataset.key] || {}).auto));   // el panel automático no se arrastra
        if (tg.length === 0) return;

        _moveable = new Moveable(_stage, {
            target: tg.length > 1 ? tg : tg[0],
            container: _stage,
            hideDefaultLines: true,
            draggable: !isFrame,
            resizable: _sel.length < 2,
            keepRatio: !wraps(_selected) && !isPanel && !isFrame,
            renderDirections: isFrame
                ? ['n', 'e', 's', 'w']
                : isPanel
                ? ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
                : wraps(_selected)
                    ? ['nw', 'ne', 'se', 'sw', 'e', 'w']
                    : ['nw', 'ne', 'se', 'sw'],
            origin: false,
            throttleDrag: 0,
            checkResizableError: false
        });

        _moveable.on('dragStart', e => { _busy = true; measure(e.target); collectTargets([e.target]); });

        _moveable.on('drag', e => {
            let dx = e.beforeTranslate[0], dy = e.beforeTranslate[1];
            const sn = snapMove(_start.left + dx, _start.top + dy, _start.w, _start.h, snapOff(e));
            const L = limits(e.target);
            dx = clamp(dx + sn.sx, L.l - _start.left, L.r - _start.w - _start.left);
            dy = clamp(dy + sn.sy, L.t - _start.top,  L.b - _start.h - _start.top);
            showGuides(sn.guides);
            e.target.style.transform = `translate(${dx}px, ${dy}px)`;
            drawSel();
        });

        _moveable.on('dragEnd', e => {
            _busy = false;
            showGuides([]);
            if (e.isDrag) commit(e.target, false);
        });

        _moveable.on('dragGroupStart', () => { _busy = true; _start = union(_sel); collectTargets(_sel); });

        _moveable.on('dragGroup', e => {
            let [dx, dy] = e.events[0].beforeTranslate;
            const sn = snapMove(_start.left + dx, _start.top + dy, _start.right - _start.left, _start.bottom - _start.top, snapOff(e));
            const L = limits(_sel[0]);
            dx = clamp(dx + sn.sx, L.l - _start.left, L.r - _start.right);
            dy = clamp(dy + sn.sy, L.t - _start.top,  L.b - _start.bottom);
            showGuides(sn.guides);
            e.events.forEach(ev => ev.target.style.transform = `translate(${dx}px, ${dy}px)`);
            drawSel();
        });

        _moveable.on('dragGroupEnd', e => {
            _busy = false;
            showGuides([]);
            if (e.isDrag) _sel.forEach(el => commit(el, false));
        });

        _moveable.on('resizeStart', e => {
            _busy = true;
            if (e.dragStart) e.dragStart.set([0, 0]);
            measure(e.target);
        });

        _moveable.on('resize', e => {
            if (e.target.classList.contains('text')) {
                const st = S()[e.target.dataset.key], [dx, dy] = e.direction, L = limits(e.target);
                let tx = 0, ty = 0;
                if (dx && dy) {
                    const maxW = dx < 0 ? _start.left + _start.w - L.l : L.r - _start.left;
                    const maxH = dy < 0 ? _start.top  + _start.h - L.t : L.b - _start.top;
                    const f = Math.min(
                        Math.max(0.2, (e.width / _start.w + e.height / _start.h) / 2),
                        maxW / _start.w, maxH / _start.h
                    );
                    e.target.style.setProperty('--fs', st.fs * f);
                    if (st.maxWidth != null) {
                        _liveMax = st.maxWidth * _start.sw / 100 * f;
                        e.target.style.maxWidth = _liveMax + 'px';
                    }
                    if (dx < 0) tx = _start.w - _start.w * f;
                    if (dy < 0) ty = _start.h - _start.h * f;
                } else {
                    _liveMax = clamp(e.width, MIN / 100 * _start.sw, dx < 0 ? _start.left + _start.w - L.l : L.r - _start.left);
                    e.target.style.maxWidth = _liveMax + 'px';
                    if (dx < 0) tx = _start.w - e.target.getBoundingClientRect().width;
                }
                e.target.style.transform = `translate(${tx}px, ${ty}px)`;
                drawSel();
                return;
            }

            let [tx, ty] = e.drag.beforeTranslate, w = e.width, h = e.height;
            const L = limits(e.target);
            if (!isLogo) {
                if (_start.left + tx < L.l) { w += _start.left + tx - L.l; tx = L.l - _start.left; }
                if (_start.top  + ty < L.t) { h += _start.top  + ty - L.t; ty = L.t - _start.top; }
                w = Math.min(w, L.r - (_start.left + tx));
                h = Math.min(h, L.b - (_start.top  + ty));
            }
            w = Math.max(w, (isFrame ? FRAME_MIN : MIN) / 100 * _start.sw);
            h = Math.max(h, (isFrame ? FRAME_MIN : MIN) / 100 * _start.sh);
            e.target.style.width  = w + 'px';
            e.target.style.height = h + 'px';
            e.target.style.transform = `translate(${tx}px, ${ty}px)`;
            drawSel();
        });

        _moveable.on('resizeEnd', e => {
            _busy = false;
            if (e.isDrag && !Array.isArray(e.target)) commit(e.target, true);
        });
    }

    // ----------------------------------------------------------
    // TOOLBAR CONTEXTUAL
    // ----------------------------------------------------------
    const ALIGN_ES = { left: 'izquierda', center: 'centro', right: 'derecha' };
    const TB = {
        text:  [['sel', 'str111'], ['sel', 'str123'], ['sep'], ['color', '#ffffff'], ['sep'],
                ['align', 'left'], ['align', 'center'], ['align', 'right'], ['sep'], ['btn', 'str262']],
        image: [['btn', 'str328'], ['sel', 'str330'], ['btn', 'str236'], ['sel', 'str122']],
        panel: [['fit'], ['sep'], ['color', '#000000'], ['sel', 'str236'], ['sel', 'str330'], ['sel', 'str341']],
        bg:    [['btn', 'str328'], ['sel', 'str329']],
        margin: [['info'], ['sep'], ['mreset']],
        multi: [['lbl'], ['btn', 'str332'], ['btn', 'str333']],
        margin: [['info'], ['sep'], ['btn', 'str334'], ['sep'], ['mreset']],
        placeholder: [['btn', 'str328'], ['color', '#000000']],
        sermon: [['sel', 'str111'], ['sel', 'str123'], ['color', '#ffffff'], ['sep'], ['sel', 'str330'], ['btn', 'str350']],
    };

    function renderCtx() {
        if (!_ctx) return;
        if (!_sel.length) { _ctx.style.display = 'none'; return; }
        const kind = _sel.length > 1 ? 'multi' : (
            _selected.dataset.key === 'placeholder' ? 'placeholder' : 
            _selected.dataset.key === 'sermon' ? 'sermon' : _selected.dataset.type
        );
        const html = TB[kind].map(([t, a, c]) => {
            switch (t) {
                case 'sel': {
                    let label = setLang(a);
                    let extraAttrs = '';
                    
                    if (a === 'str111') {
                        label = (_draft.contentStyles[_selected.dataset.key + 'Font']) || setLang('str265');
                    } else if (a === 'str123') {
                        const wVal = _draft.contentStyles[_selected.dataset.key + 'Weight'] || '400';
                        const wOpts = window.MultiPicker ? MultiPicker.getOptions('font-weight') : [];
                        const found = wOpts.find(o => o.value === String(wVal));
                        label = found ? found.label : wVal;
                    } else if (a === 'str329') {
                        label = `${(_draft.customLayers.background.speed || '1')}x`;
                    } else if (a === 'str236') { // Opacidad
                        const val = _selected.dataset.type === 'panel' 
                            ? (_draft.customLayers.panel.opacity !== undefined ? _draft.customLayers.panel.opacity : 0.5)
                            : (_draft.customLayers.logo.opacity !== undefined ? _draft.customLayers.logo.opacity : 1);
                        label = Math.round(val * 100) + '%';
                    } else if (a === 'str330') { // Animación
                        const val = _selected.dataset.type === 'panel' 
                            ? (_draft.customLayers.panel.animation || 'none')
                            : (_draft.customLayers.logo.animation || 'none');
                        const prov = _selected.dataset.type === 'panel' ? 'anim-type' : 'logo-animation';
                        const opts = window.MultiPicker ? MultiPicker.getOptions(prov) : [];
                        const found = opts.find(o => o.value === val);
                        label = found ? found.label : setLang('str219');
                    } else if (a === 'str341') { // Redondeo de Esquinas
                        const val = _draft.customLayers.panel.borderRadius || '1.2';
                        const opts = window.MultiPicker ? MultiPicker.getOptions('panel-border') : [];
                        const found = opts.find(o => o.value === val);
                        label = found ? found.label : '1.2';
                    } else if (a === 'str122') {
                        const ctx = _draft.customLayers.logo.contexts || { coros: true, citas: true, media: true };
                        const opts = [
                            { label: setLang('str2'), checked: ctx.coros },
                            { label: setLang('str7'), checked: ctx.citas },
                            { label: setLang('str9'), checked: ctx.media }
                        ];
                        label = (window.MultiPicker && MultiPicker.computeLabel) ? MultiPicker.computeLabel(opts) : setLang('str217');
                        extraAttrs = 'data-type="multi"';
                    }
                    
                    return `<button data-action="${a}" ${extraAttrs} data-tooltip="${setLang(a)}">${label} ▾</button>`;
                }
                case 'color': {
                    const currentColor = _selected.dataset.type === 'panel'
                        ? (_draft.customLayers.panel.color || '#000000')
                        : ((_draft.contentStyles[_selected.dataset.key + 'Color']) || '#ffffff');
                    return `<div data-action="color-pick" data-tooltip="${setLang('str110')}" style="width:28px; height:28px; border-radius:6px; border:1px solid var(--border-light); cursor:pointer; background:${currentColor}; margin: 0 4px;"></div>`;
                }
                case 'btn':   return `<button data-action="${a}" data-tooltip="${setLang(a)}">${setLang(a)}</button>`;
                case 'tog': {
                    if (c === 'bold') {
                        const isBold = parseInt(_draft.contentStyles[_selected.dataset.key + 'Weight'] || 400) >= 700;
                        return `<button class="tog${isBold ? ' on' : ''}" data-cls="bold"><b>B</b></button>`;
                    }
                    return `<button class="tog${_selected.classList.contains(c) ? ' on' : ''}" data-cls="${c}">${a}</button>`;
                }
                case 'align': {
                    const cur = (S()[_selected.dataset.key] || {}).align || 'left';
                    const icon = ICONS['align' + a.charAt(0).toUpperCase() + a.slice(1)];
                    const dirLabel = { left: 'str241', center: 'str238', right: 'str242' }[a];
                    return `<button class="al${cur === a ? ' on' : ''}" data-align="${a}" data-tooltip="${setLang('str332')} ${setLang(dirLabel)}">${icon}</button>`;
                }
                case 'fit': {
                    const p = _selected && S()[_selected.dataset.key];
                    return `<button class="fit${p && p.auto ? ' on' : ''}" title="El rectángulo se ajusta solo al texto">Ajustar al texto</button>`;
                }
                case 'info': {
                    const M = _draft.layout.margins[_scene];
                    // Usamos setLang con placeholders para armar el texto dinámico
                    let str = setLang('str335')
                        .replace('{top}', round(M.y))
                        .replace('{right}', round(100 - M.x - M.width))
                        .replace('{bottom}', round(100 - M.y - M.height))
                        .replace('{left}', round(M.x));
                    return `<span class="lbl">${str}</span>`;
                }
                case 'mreset': return `<button class="mreset">${setLang('str336')}</button>`;
                case 'mreset': return '<button class="mreset">Restablecer</button>';
                case 'color': {
                    const currentColor = _selected.dataset.type === 'panel'
                        ? (_draft.customLayers.panel.color || '#000000')
                        : ((_draft.contentStyles[_selected.dataset.key + 'Color']) || '#ffffff');
                    return `<div data-action="color-pick" style="width:28px; height:28px; border-radius:6px; border:1px solid var(--border-light); cursor:pointer; background:${currentColor}; margin: 0 4px;"></div>`;
                }
                case 'lbl':   return `<span class="lbl">${_sel.length} elementos</span>`;
                default:      return '<span class="sep"></span>';
            }
        }).join('');
        const trash = _sel.some(el => REMOVABLE.has(el.dataset.key))
            ? `<span class="sep"></span><button class="trash" data-tooltip="${setLang('str4')}">` + ICONS.trash + '</button>' : '';
        _ctx.innerHTML = html + trash;
        if (window.Tooltip?.init) Tooltip.init();
    }

    function placeCtx() {
        if (!_ctx) return;
        if (!_sel.length) { _ctx.style.display = 'none'; return; }
        _ctx.style.display = 'flex';
        const u = union(_sel), w = _ctx.offsetWidth, h = _ctx.offsetHeight;
        const ox = _stage.offsetLeft, oy = _stage.offsetTop, G = 12, M = 8;
        // DEBAJO del elemento; si no cabe, encima; siempre DENTRO del stage.
        // El fondo lleva la barra pegada al borde inferior.
        let top;
        if (_selected && _selected.dataset.key === 'bg') top = u.sh - h - M;
        else if (_selected && _selected.dataset.key === 'margin') top = u.top + 16;
        else {
            top = u.bottom + G;
            if (top + h > u.sh - M) top = u.top - h - G;
            top = clamp(top, M, Math.max(M, u.sh - h - M));
        }
        const left = clamp((u.left + u.right) / 2 - w / 2, M, Math.max(M, u.sw - w - M));
        Object.assign(_ctx.style, {
            left: (ox + left) + 'px',
            top:  (oy + top) + 'px',
            visibility: _busy ? 'hidden' : 'visible'
        });
    }

    // ----------------------------------------------------------
    // RAIL
    // ----------------------------------------------------------
    const ICONS = {
        verse:   '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 17V5a2 2 0 0 0-2-2H4"/><path d="M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3"/></svg>',
        coro:    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 5H3"/><path d="M11 12H3"/><path d="M11 19H3"/><path d="M21 16V5"/><circle cx="18" cy="16" r="3"/></svg>',
        ref:     '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2v7.751a.25.25 0 00.407.195l2.28-1.834a.5.5 0 01.627 0l2.28 1.834A.25.25 0 0016 9.751V2"/><path d="M4 19.5v-15A2.5 2.5 0 016.5 2H19a1 1 0 011 1v18a1 1 0 01-1 1H6.5a1 1 0 010-5H20"/></svg>',
        version: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7a2 2 0 0 0-2 2v11"/><path d="M5.803 18H5a2 2 0 0 0 0 4h9.5a.5.5 0 0 0 .5-.5V21"/><path d="M9 15V4a2 2 0 0 1 2-2h9.5a.5.5 0 0 1 .5.5v14a.5.5 0 0 1-.5.5H11a2 2 0 0 1 0-4h10"/></svg>',
        logo:    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>',
        panel:   '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 7v15"/><path d="M2 12a1 1 0 00.58.91l5.093 2.316"/><path d="M22 12a1 1 0 01-.59.92l-5.077 2.308"/><path d="M8 10.37 2.6 7.91a1 1 0 010-1.831l8.57-3.9a2 2 0 011.66.001l8.59 3.91a1 1 0 010 1.831l-5.392 2.45"/><path d="m9 19 3 3 3-3"/></svg>',
        bg:      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>',
        placeholder: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>',        trash: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M10 11v6" /><path d="M14 11v6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>',
        snap: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><rect width="9" height="6" x="6" y="14" rx="2" /><rect width="16" height="6" x="6" y="4" rx="2" /><path d="M2 2v20" /></svg>',
        alignLeft: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M21 5H3" /><path d="M15 12H3" /><path d="M17 19H3" /></svg>',
        alignCenter: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M21 5H3" /><path d="M17 12H7" /><path d="M19 19H5" /></svg>',
        alignRight: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M21 5H3" /><path d="M21 12H9" /><path d="M21 19H7" /></svg>',
        margin: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M5 3a2 2 0 0 0-2 2" /><path d="M19 3a2 2 0 0 1 2 2" /><path d="M21 19a2 2 0 0 1-2 2" /><path d="M5 21a2 2 0 0 1-2-2" /><path d="M9 3h1" /><path d="M9 21h1" /><path d="M14 3h1" /><path d="M14 21h1" /><path d="M3 9v1" /><path d="M21 9v1" /><path d="M3 14v1" /><path d="M21 14v1" /></svg>',
        multi: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M9 3v18" /><path d="M15 3v18" /></svg>',
        reset: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></svg>'
    };

    // modo: scene = pestaña (versículo / coro) · toggle = agrega o quita · select = selecciona
    const RAIL = [
        ['verse',       'str8',   'scene',  'scroll'],                // Versículo
        ['coro',        'str2',   'scene',  'list-music'],            // Cantos
        ['multi',       'str342', 'scene',  'square-stack'],          // Multi versión
        ['ref',         'str343', 'toggle', 'book-bookmark'],         // Referencia
        ['version',     'str73',  'toggle', 'book-copy'],             // Versión
        ['logo',        'str75',  'toggle', 'hexagon'],               // Logotipo
        ['panel',       'str344', 'toggle', 'square-letter-a'],       // Fondo texto
        ['bg',          'str69',  'select', 'image'],                 // Fondo
        ['margin',      'str297', 'select', 'square-padding'],        // Márgenes
        ['snap',        'str346', 'tool',   'align-start-vertical'],  // Imán
        ['placeholder', 'str345', 'scene',  'monitor-pause'],         // Contenido en espera
        ['sermon',      'str322', 'scene',  'text-cursor-input'],     // Título del sermón
        ['wordy',       'str_wordy', 'scene', 'grid-3x3'],            // Palabra y significados (2 o 3 columnas)
        ['reset',       'str336', 'action', 'rotate-ccw'],            // Reset
    ];

    const RAIL_TIPS = { wordy: 'Palabra y significados (clic: 2 o 3 columnas)' };

    function initRail() {
        _rail = $('stage-editor-rail');
        if (!_rail) return;
        
        // Aquí generamos SOLO el ícono y el badge, cero texto.
        _rail.innerHTML = RAIL.map(([k, strKey, m, icon]) =>
            `<button data-k="${k}" data-mode="${m}" class="${m === 'toggle' || m === 'tool' ? 'toggle' : ''}" data-tooltip="${tr(strKey, RAIL_TIPS[k])}">
                <i data-lucide="${icon}" style="pointer-events: none;"></i>
                ${(k === 'multi' || k === 'wordy') ? '<i class="badge"></i>' : ''}
            </button>`
        ).join('');
        
        // Renderizar los íconos de Lucide inmediatamente
        if (typeof createIcons === 'function') createIcons();
        if (window.Tooltip?.init) Tooltip.init();

        if (_rail._bound) return;
        _rail._bound = true;
        
        _rail.addEventListener('click', e => {
            const b = e.target.closest('button');
            if (!b || b.classList.contains('disabled')) return;
            const k = b.dataset.k, mode = b.dataset.mode;
            if (mode === 'action') armReset(b);
            else if (mode === 'tool') { _snapOn = !_snapOn; railMark(); }
            else if (mode === 'scene') switchScene(
                k === 'multi' ? (_scene === 'multi2' ? 'multi3' : 'multi2')
                : k === 'wordy' ? (_scene === 'wordy2' ? 'wordy3' : 'wordy2')
                : k);
            else if (mode === 'toggle') toggleKey(k);
            else { const el = blockByKey(k); if (el && !el.classList.contains('off')) setSel([el]); }
        });
    }

    function blockByKey(k) { return _blocks.find(b => b.dataset.key === k); }

    // Reset: el primer clic arma el botón ("¿Seguro?", 2.5 s); el segundo restablece todo.
    function armReset(btn) {
        const label = btn.lastChild;
        const disarm = () => { clearTimeout(btn._t); btn.classList.remove('armed'); label.textContent = 'Reset'; };
        if (btn.classList.contains('armed')) { disarm(); reset(); return; }
        btn.classList.add('armed');
        label.textContent = '¿Seguro?';
        btn._t = setTimeout(disarm, 2500);
    }

    function railMark() {
        if (!_rail || !_draft) return;
        _rail.querySelectorAll('button').forEach(b => {
            const k = b.dataset.k, mode = b.dataset.mode;
            const allowed = mode === 'scene' || mode === 'tool' || mode === 'action' || k === 'margin' || SCENES[_scene].keys.includes(k);
            b.classList.toggle('disabled', !allowed);
            if (k === 'multi') { const bd = b.querySelector('.badge'); if (bd) bd.textContent = _scene.startsWith('multi') ? slotCount() : ''; }
            if (k === 'wordy') { const bd = b.querySelector('.badge'); if (bd) bd.textContent = isWordy() ? wordyCols() : ''; }
            if (mode === 'scene')       b.classList.toggle('active', k === 'multi' ? _scene.startsWith('multi') : k === 'wordy' ? isWordy() : _scene === k);
            else if (mode === 'tool')   b.classList.toggle('on', _snapOn);
            else if (mode === 'toggle') b.classList.toggle('on', allowed && !!S()[k]);
            else                        b.classList.toggle('active', _sel.some(x => x.dataset.key === k));
        });
    }

    // ---- escenas: mostrar solo lo que pertenece a la escena actual ----
    function refreshScene() {
        const sc = S();
        _blocks.forEach(b => {
            const st = stateOf(b.dataset.key);
            b.classList.toggle('off', !st);
            if (st) {
                apply(b, st);
                if (b.classList.contains('text')) {
                    applyTextVisuals(b, b.dataset.key);
                }
                if (b.dataset.key === 'logo') {
                    b.style.opacity = _draft.customLayers.logo.opacity !== undefined ? _draft.customLayers.logo.opacity : 1;
                    
                    const img = b.querySelector('img');
                    if (img) {
                        if (_draft.customLayers.logo.url) {
                            img.src = _draft.customLayers.logo.url;
                        } else {
                            const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" fill="#f5c542"/><path d="M44 18h12v26h26v12H56v26H44V56H18V44h26z" fill="#1a2238"/></svg>';
                            img.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
                        }
                        
                        const anim = _draft.customLayers.logo.animation || 'none';
                        b.className = 'block logo' + (anim !== 'none' ? ' logo-anim-' + anim : '');
                    }
                }
                if (b.dataset.key === 'panel') {
                    const p = _draft.customLayers.panel || {};
                    b.style.setProperty('--pc', p.color || '#000000');
                    b.style.opacity = p.opacity !== undefined ? p.opacity : 0.5;
                    b.style.borderRadius = (p.borderRadius || '1.2') + 'cqi';
                }
                if (b.dataset.key === 'placeholder') {
                    const ph = _draft.customLayers.placeholder || {};
                    b.style.background = ph.bgColor || '#000000';
                    
                    const img = b.querySelector('img');
                    if (img) {
                        if (ph.value) {
                            img.src = ph.value;
                            img.style.display = 'block';
                        } else {
                            img.removeAttribute('src');
                            img.style.display = 'none';
                        }
                    }
                }
                if (b.dataset.key === 'sermon') {
                    const txt = _draft.customLayers.sermon.text || 'Título del Sermón de Ejemplo';
                    b.querySelector('.t').textContent = txt;
                }
            }
        });
        const bgEl = blockByKey('bg');
        if (bgEl && _draft.customLayers) applyBgVisual(bgEl, _draft.customLayers.background);
        
        _movable = _blocks.filter(b => !['fixed', 'off', 'frame'].some(c => b.classList.contains(c)));
        enforceMargin();
        railMark();
    }

    function switchScene(name) {
        if (!SCENES[name]) return;
        _scene = name;
        refreshScene();
        setSel([blockByKey(SCENES[name].main)]);
    }

    function setPresent(key, on) {
        const sc = S();
        const memo = _memo[_scene] || (_memo[_scene] = {});     // última posición de lo que se quitó
        if (on && !sc[key]) sc[key] = structuredClone(memo[key] || DEFAULTS[_scene][key]);
        if (!on && sc[key]) { memo[key] = sc[key]; delete sc[key]; }
    }

    const isMulti = () => _scene === 'multi2' || _scene === 'multi3';
    const GROUP_IDX = { version: 1, panel: 2 };   // en multi, "Versión" y "Fondo texto" afectan a todos los versículos

    function toggleKey(key) {
        if (!SCENES[_scene].keys.includes(key) || !REMOVABLE.has(key)) return;
        const adding = !S()[key];
        const keys = (isMulti() && GROUP_IDX[key] != null)
            ? SLOT_KEYS.slice(0, slotCount()).map(k => [GROUP_IDX[key]]) : [key];
        
        keys.forEach(k => {
            setPresent(k, adding);
            // Si desactivamos el logo, limpiamos la URL para que vuelva al SVG por defecto
            if (k === 'logo' && !adding) _draft.customLayers.logo.url = '';
        });
        
        refreshScene();
        const els = keys.map(blockByKey);
        setSel(adding ? [els[0]] : _sel.filter(x => !els.includes(x)));
    }

    // Crea los bloques de los versículos 2 y 3 (no hace falta tocar el HTML)
    function initSlotBlocks() {
        const logo = _stage.querySelector('[data-key="logo"]');
        const mk = (key, cls, type, html) => {
            if (_stage.querySelector(`[data-key="${key}"]`)) return;
            const d = document.createElement('div');
            d.className = cls; d.dataset.key = key; d.dataset.type = type; d.innerHTML = html;
            _stage.insertBefore(d, logo);
        };
        [['2', 'Texto de ejemplo del versículo en otra versión; aquí fluye el texto bíblico.', 'VERSIÓN 2'],
         ['3', 'Texto de ejemplo del versículo en una tercera versión; aquí fluye el texto bíblico.', 'VERSIÓN 3']].forEach(([n, v, ver]) => {
            mk('panel' + n, 'block panel', 'panel', '');
            mk('verse' + n, 'block text verse', 'text', `<div class="t">${v}</div>`);
            mk('version' + n, 'block text version', 'text', `<div class="t">${ver}</div>`);
        });
    }

    function removeSelected() {                      // papelera del toolbar / tecla Supr
        const gone = _sel.filter(el => REMOVABLE.has(el.dataset.key));
        if (!gone.length) return;
        gone.forEach(el => {
            setPresent(el.dataset.key, false);
            // Si eliminamos el logo, limpiamos la URL para que vuelva al SVG por defecto
            if (el.dataset.key === 'logo') _draft.customLayers.logo.url = '';
        });
        refreshScene();
        setSel(_sel.filter(el => !gone.includes(el)));
    }

    // ----------------------------------------------------------
    // SNAP & GUIDES
    // ----------------------------------------------------------
    const snapOff = e => {
        return !_snapOn || !!(e.inputEvent && e.inputEvent.altKey);   // Alt = sin imán
    };

    function collectTargets(exclude) {
        const s = _stage.getBoundingClientRect();
        // El imán trabaja contra los bordes y el centro del ÁREA SEGURA, y contra el centro del stage
        const M = _draft.layout.margins[_scene];
        _targets = [
            { left: M.x / 100 * s.width, top: M.y / 100 * s.height,
              right: (M.x + M.width) / 100 * s.width, bottom: (M.y + M.height) / 100 * s.height },
            { left: s.width / 2, right: s.width / 2, top: s.height / 2, bottom: s.height / 2 }
        ];
        _movable.filter(el => !exclude.includes(el)).forEach(el => {
            const r = el.getBoundingClientRect();
            _targets.push({
                left: r.left - s.left, top: r.top - s.top,
                right: r.right - s.left, bottom: r.bottom - s.top
            });
        });
    }

    function snapMove(L, T, W, H, off) {
        const three = (a, len) => [a, a + len / 2, a + len];
        let bx = Infinity, by = Infinity;
        if (!off) _targets.forEach(t => {
            const tx = three(t.left, t.right - t.left), ty = three(t.top, t.bottom - t.top);
            three(L, W).forEach(a => tx.forEach(b => { if (Math.abs(b - a) < Math.abs(bx)) bx = b - a; }));
            three(T, H).forEach(a => ty.forEach(b => { if (Math.abs(b - a) < Math.abs(by)) by = b - a; }));
        });
        const sx = Math.abs(bx) <= SNAP ? bx : 0, sy = Math.abs(by) <= SNAP ? by : 0;
        const guides = [], X = L + sx, Y = T + sy;
        if (!off) _targets.forEach(t => {
            const tx = three(t.left, t.right - t.left), ty = three(t.top, t.bottom - t.top);
            three(X, W).forEach(a => tx.forEach(b => { if (Math.abs(a - b) < .6)
                guides.push({ v: 1, x: b, y1: Math.min(Y, t.top), y2: Math.max(Y + H, t.bottom) }); }));
            three(Y, H).forEach(a => ty.forEach(b => { if (Math.abs(a - b) < .6)
                guides.push({ v: 0, y: b, x1: Math.min(X, t.left), x2: Math.max(X + W, t.right) }); }));
        });
        return { sx, sy, guides };
    }

    function showGuides(list) {
        while (_guideEls.length < list.length) {
            const d = document.createElement('div');
            d.className = 'guide';
            _stage.appendChild(d);
            _guideEls.push(d);
        }
        _guideEls.forEach((d, i) => {
            const g = list[i];
            if (!g) { d.style.display = 'none'; return; }
            Object.assign(d.style, g.v
                ? { display: 'block', left: g.x + 'px', top: g.y1 + 'px', width: '1px', height: (g.y2 - g.y1) + 'px' }
                : { display: 'block', top: g.y + 'px', left: g.x1 + 'px', height: '1px', width: (g.x2 - g.x1) + 'px' });
        });
    }

    // ----------------------------------------------------------
    // EVENTOS DEL STAGE
    // ----------------------------------------------------------
    function bindStageEvents() {
        if (_stage._bound) return;
        _stage._bound = true;

        _stage.addEventListener('mousedown', ev => {
            if (ev.button !== 0 || ev.target.closest('.moveable-control-box')) return;
            const fh = ev.target.closest('.fh');
            if (fh) { startMarginDrag(ev, fh.dataset.edge); return; }   // arrastrar una línea del margen
            const b = ev.target.closest('.block');
            if (b) {
                const isMod = ev.shiftKey || ev.ctrlKey || ev.metaKey;
                if (isMod) {
                    setSel(_sel.includes(b) ? _sel.filter(x => x !== b) : [..._sel, b]);
                } else if (!_sel.includes(b)) {
                    setSel([b], ev);
                } else {
                    // NUEVO: Si el bloque ya está seleccionado (o es parte de una multi-selección),
                    // le decimos a Moveable que inicie el arrastre del grupo.
                    if (_moveable) {
                        const ready = _moveable.waitToChangeTarget ? _moveable.waitToChangeTarget() : Promise.resolve();
                        ready.then(() => _moveable.dragStart(ev));
                    }
                }
                return;
            }
            // Marquee / Selección de fondo
            const x0 = ev.clientX, y0 = ev.clientY, s = _stage.getBoundingClientRect();
            const base = (ev.shiftKey || ev.ctrlKey || ev.metaKey) ? [..._sel] : [];
            let hits = [];
            let dragged = false; // NUEVO: detectar si fue un click simple o un arrastre
            
            const move = e2 => {
                if (Math.abs(e2.clientX - x0) > 3 || Math.abs(e2.clientY - y0) > 3) dragged = true;
                const x = Math.min(x0, e2.clientX), y = Math.min(y0, e2.clientY);
                const w = Math.abs(e2.clientX - x0), h = Math.abs(e2.clientY - y0);
                Object.assign(_mq.style, {
                    display: 'block',
                    left: (x - s.left) + 'px', top: (y - s.top) + 'px',
                    width: w + 'px', height: h + 'px'
                });
                hits = _movable.filter(bl => {
                    const r = bl.getBoundingClientRect();
                    return r.left < x + w && r.right > x && r.top < y + h && r.bottom > y;
                });
                _blocks.forEach(bl => bl.classList.toggle('picked', hits.includes(bl)));
            };
            
            const up = () => {
                document.removeEventListener('mousemove', move);
                document.removeEventListener('mouseup', up);
                _mq.style.display = 'none';
                _blocks.forEach(bl => bl.classList.remove('picked'));
                
                // Si no arrastró y no seleccionó nada, seleccionar el fondo
                if (!dragged && hits.length === 0) {
                    const bgBlock = blockByKey('bg');
                    if (bgBlock) setSel([bgBlock]);
                } else {
                    setSel([...new Set([...base, ...hits])]);
                }
            };
            document.addEventListener('mousemove', move);
            document.addEventListener('mouseup', up);
        });

        // CTX events
        if (_ctx && !_ctx._bound) {
            _ctx._bound = true;
            _ctx.addEventListener('click', e => {
                if (e.target.closest('.trash')) { removeSelected(); return; }
                if (e.target.closest('.mreset')) {
                    _draft.layout.margins[_scene] = structuredClone(DEFAULT_MARGIN);
                    refreshScene(); buildMoveable(); renderCtx(); drawSel();
                    return;
                }
                if (e.target.closest('.fit')) {
                    const p = _selected && S()[_selected.dataset.key];
                    if (p) { p.auto = !p.auto; if (p.auto && p.pad == null) p.pad = 2; }
                    fitPanel(); buildMoveable(); renderCtx(); drawSel();
                    return;
                }
                const al = e.target.closest('.al');
                if (al && _selected) {
                    const st = S()[_selected.dataset.key];
                    if (st) st.align = al.dataset.align;
                    _selected.style.textAlign = al.dataset.align;
                    _ctx.querySelectorAll('.al').forEach(b => b.classList.toggle('on', b === al));
                    drawSel();
                    return;
                }

                const btn = e.target.closest('[data-action]');
                const action = btn ? btn.dataset.action : null;

                // --- COLOR PICKER (Para todos los elementos) ---
                if (action === 'color-pick') {
                    if (_selected.dataset.key === 'placeholder') {
                        const curCol = _draft.customLayers.placeholder.bgColor || '#000000';
                        ColorPicker.open(e.target, (hex) => {
                            _draft.customLayers.placeholder.bgColor = hex;
                            e.target.style.background = hex;
                            _selected.style.background = hex;
                        }, curCol);
                    } else if (_selected.dataset.type === 'panel') {
                        const curCol = _draft.customLayers.panel.color || '#000000';
                        ColorPicker.open(e.target, (hex) => {
                            _draft.customLayers.panel.color = hex;
                            e.target.style.background = hex;
                            _selected.style.setProperty('--pc', hex);
                        }, curCol);
                    } else {
                        const key = _selected.dataset.key;
                        const curCol = _draft.contentStyles[key + 'Color'] || '#ffffff';
                        ColorPicker.open(e.target, (hex) => {
                            _draft.contentStyles[key + 'Color'] = hex;
                            e.target.style.background = hex;
                            applyTextVisuals(_selected, key);
                        }, curCol);
                    }
                    return;
                }

                // --- BG: Reemplazar y Velocidad ---
                if (_selected && _selected.dataset.key === 'bg') {
                    const action = e.target.closest('[data-action]')?.dataset.action;
                    
                    if (action === 'str328') { // Reemplazar
                        openMediaLibrary(null, null, 'background', (url) => {
                            _draft.customLayers.background.value = url;
                            _draft.customLayers.background.type = detectMediaType(url);
                            applyBgVisual(blockByKey('bg'), _draft.customLayers.background);
                        });
                        return;
                    }
                    if (action === 'str329') { // Velocidad
                        e.target.dataset.value = String(_draft.customLayers.background.speed || 1);
                        MultiPicker.openSingle(e.target, 'bg-speed', (val) => {
                            _draft.customLayers.background.speed = val;
                            applyBgVisual(blockByKey('bg'), _draft.customLayers.background);
                            e.target.textContent = `${val}x ▾`;
                            refreshSelectionUI();
                        });
                        return;
                    }
                }

                // --- PANEL ---
                if (_selected && _selected.dataset.type === 'panel') {
                    const btnEl = e.target.closest('[data-action]');

                    if (action === 'str236') { // Opacidad
                        const currentOpacity = _draft.customLayers.panel.opacity !== undefined ? _draft.customLayers.panel.opacity : 0.5;
                        const initialOpacity = currentOpacity;
                        PickerBase.open(btnEl, {
                            className: 'opacity-picker',
                            minWidth: 220,
                            content: `
                                <div style="padding: 4px 0;">
                                    <div style="font-size: 11px; font-weight: 600; color: var(--text-muted); margin-bottom: 4px;">${setLang('str236')}</div>
                                    <input type="range" class="toolbar-opacity-slider" min="0" max="1" step="0.05" value="${currentOpacity}" style="width: 100%;">
                                    <div style="text-align: center; font-size: 12px; margin-top: 2px;" class="opacity-val">${Math.round(currentOpacity * 100)}%</div>
                                    <div class="cc-cp-actions modal-footer-right" style="margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--border-light);">
                                        <div class="code-btn code-btn-primary op-save">${setLang('str57')}</div>
                                        <div class="code-btn code-btn-cancel op-cancel">${setLang('str38')}</div>
                                    </div>
                                </div>
                            `,
                            onMount(el, closeFn) {
                                const slider = el.querySelector('.toolbar-opacity-slider');
                                const valEl = el.querySelector('.opacity-val');
                                slider.addEventListener('input', () => {
                                    const v = parseFloat(slider.value);
                                    _draft.customLayers.panel.opacity = v;
                                    valEl.textContent = Math.round(v * 100) + '%';
                                    _selected.style.opacity = v;
                                    if (btnEl) btnEl.textContent = `${Math.round(v * 100)}% ▾`;
                                    refreshSelectionUI();
                                });
                                el.querySelector('.op-save').onclick = () => closeFn();
                                el.querySelector('.op-cancel').onclick = () => {
                                    _draft.customLayers.panel.opacity = initialOpacity;
                                    _selected.style.opacity = initialOpacity;
                                    closeFn();
                                    renderCtx();
                                };
                            }
                        });
                        return;
                    }
                    if (action === 'str330') { // Animación
                        btnEl.dataset.value = _draft.customLayers.panel.animation || 'none';
                        MultiPicker.openSingle(btnEl, 'anim-type', (val, picked) => {
                            _draft.customLayers.panel.animation = val;
                            btnEl.textContent = `${picked ? picked.label : val} ▾`;
                            _selected.classList.remove('anim-fade', 'anim-slide-up', 'anim-zoom');
                            _selected.style.animation = 'none';
                            void _selected.offsetWidth;
                            _selected.style.animation = '';
                            if (val !== 'none') _selected.classList.add('anim-' + val);
                            refreshSelectionUI();
                            trackAnimations();
                        });
                        return;
                    }
                    if (action === 'str341') { // Redondeo de Esquinas
                        btnEl.dataset.value = _draft.customLayers.panel.borderRadius || '1.2';
                        MultiPicker.openSingle(btnEl, 'panel-border', (val, picked) => {
                            _draft.customLayers.panel.borderRadius = val;
                            _selected.style.borderRadius = val + 'cqi';
                            btnEl.textContent = `${picked ? picked.label : val} ▾`;
                            refreshSelectionUI();
                        });
                        return;
                    }
                }

                // --- MARGEN: Igualar ---
                if (e.target.dataset.action === 'str334') {
                    const M = _draft.layout.margins[_scene];
                    // Calcula el promedio de los 4 márgenes (izq, arriba, der, abajo)
                    const avg = Math.round((M.x + M.y + (100 - M.x - M.width) + (100 - M.y - M.height)) / 4);
                    _draft.layout.margins[_scene] = { x: avg, y: avg, width: 100 - (avg * 2), height: 100 - (avg * 2) };
                    
                    apply(blockByKey('margin'), _draft.layout.margins[_scene]);
                    enforceMargin();
                    renderCtx(); // Refresca el texto del toolbar
                    drawSel();
                    return;
                }

                // --- LOGO ---
                if (_selected && _selected.dataset.key === 'logo') {
                    const action = e.target.closest('[data-action]')?.dataset.action;
                    const btn = e.target.closest('[data-action]');
                    const logo = _draft.customLayers.logo;

                    if (action === 'str328') { // Reemplazar
                        openMediaLibrary(null, null, 'logo', (url) => {
                            logo.url = url;
                            _selected.querySelector('img').src = url;
                        });
                        return;
                    }
                    if (action === 'str330') { // Animación
                        btn.dataset.value = logo.animation || 'none';
                        MultiPicker.openSingle(btn, 'logo-animation', (val, picked) => {
                            logo.animation = val;
                            btn.textContent = (picked ? picked.label : val) + ' ▾';
                            let cls = 'block logo';
                            if (val !== 'none') cls += ' logo-anim-' + val;
                            _selected.className = cls;
                            refreshSelectionUI();
                            trackAnimations();
                        });
                        return;
                    }
                    if (action === 'str122') { // Contextos
                        btn.dataset.multi = JSON.stringify(logo.contexts);
                        MultiPicker.open(btn, [
                            { id: 'coros', label: setLang('str2'), checked: logo.contexts.coros },
                            { id: 'citas', label: setLang('str7'), checked: logo.contexts.citas },
                            { id: 'media', label: setLang('str9'), checked: logo.contexts.media }
                        ], (result) => {
                            logo.contexts = result;
                            const opts = [
                                { label: setLang('str2'), checked: result.coros },
                                { label: setLang('str7'), checked: result.citas },
                                { label: setLang('str9'), checked: result.media }
                            ];
                            const label = (window.MultiPicker && MultiPicker.computeLabel) ? MultiPicker.computeLabel(opts) : setLang('str217');
                            btn.textContent = label + ' ▾';
                            refreshSelectionUI();
                        });
                        return;
                    }
                    if (action === 'str236') { // Opacidad
                        const currentOpacity = logo.opacity !== undefined ? logo.opacity : 1;
                        const initialOpacity = currentOpacity;
                        
                        PickerBase.open(btn, {
                            className: 'opacity-picker',
                            minWidth: 220,
                            content: `
                                <div style="padding: 4px 0;">
                                    <div style="font-size: 11px; font-weight: 600; color: var(--text-muted); margin-bottom: 4px;">${setLang('str236')}</div>
                                    <input type="range" class="toolbar-opacity-slider" min="0" max="1" step="0.05" value="${currentOpacity}" style="width: 100%;">
                                    <div style="text-align: center; font-size: 12px; margin-top: 2px;" class="opacity-val">${Math.round(currentOpacity * 100)}%</div>
                                    <div class="cc-cp-actions modal-footer-right" style="margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--border-light);">
                                        <div class="code-btn code-btn-primary op-save">${setLang('str57')}</div>
                                        <div class="code-btn code-btn-cancel op-cancel">${setLang('str38')}</div>
                                    </div>
                                </div>
                            `,
                            onMount(el, closeFn) {
                                const slider = el.querySelector('.toolbar-opacity-slider');
                                const valEl = el.querySelector('.opacity-val');
                                
                                slider.addEventListener('input', () => {
                                    const v = parseFloat(slider.value);
                                    logo.opacity = v;
                                    valEl.textContent = Math.round(v * 100) + '%';
                                    _selected.style.opacity = v;
                                    refreshSelectionUI();
                                });
                                
                                el.querySelector('.op-save').onclick = () => closeFn();
                                el.querySelector('.op-cancel').onclick = () => {
                                    logo.opacity = initialOpacity;
                                    _selected.style.opacity = initialOpacity;
                                    closeFn();
                                };
                            }
                        });
                        return;
                    }
                }

                // --- TEXTOS ---
                if (_selected && _selected.dataset.type === 'text') {
                    const action = e.target.closest('[data-action]')?.dataset.action;
                    const key = _selected.dataset.key;

                    // Fuente
                    if (action === 'str111') {
                        const btn = e.target.closest('[data-action]'); // Aseguramos el ancla real
                        btn.dataset.value = _draft.contentStyles[key + 'Font'] || '';
                        MultiPicker.openSingle(btn, 'fonts', (val, picked) => {
                            _draft.contentStyles[key + 'Font'] = val;
                            btn.textContent = (picked ? picked.label : val) + ' ▾';
                            applyTextVisuals(_selected, key);
                        });
                        return;
                    }

                    // Color Picker ZionLyrics
                    if (action === 'color-pick') {
                        if (_selected.dataset.type === 'panel') {
                            const curCol = _draft.customLayers.panel.color || '#000000';
                            ColorPicker.open(e.target, (hex) => {
                                _draft.customLayers.panel.color = hex;
                                e.target.style.background = hex;
                                _selected.style.setProperty('--pc', hex);
                            }, curCol);
                        } else {
                            const curCol = _draft.contentStyles[key + 'Color'] || '#ffffff';
                            ColorPicker.open(e.target, (hex) => {
                                _draft.contentStyles[key + 'Color'] = hex;
                                e.target.style.background = hex;
                                applyTextVisuals(_selected, key);
                            }, curCol);
                        }
                        return;
                    }

                    // Sombra
                    if (action === 'str262') {
                        const btn = e.target.closest('[data-action]');
                        const shadow = _draft.contentStyles.textShadow[key] || { enabled: false };
                        btn.dataset.shadow = JSON.stringify(shadow);
                        btn.dataset.type = 'shadow';
                        
                        // Pasamos el key ('coro', 'verse', etc.) para el label correcto
                        ShadowPicker.open(btn, key); 
                        return;
                    }

                    // Peso
                    if (action === 'str123') {
                        e.target.dataset.value = _draft.contentStyles[key + 'Weight'] || '400';
                        MultiPicker.openSingle(e.target, 'font-weight', (val, picked) => {
                            _draft.contentStyles[key + 'Weight'] = val;
                            e.target.textContent = (picked ? picked.label : val) + ' ▾';
                            applyTextVisuals(_selected, key);
                        });
                        return;
                    }

                    // Sombra (corregido usando e.target real)
                    if (action === 'str262') {
                        const key = _selected.dataset.key;
                        const shadow = _draft.contentStyles.textShadow[key] || { enabled: false };
                        
                        // Inyectamos el estado y el tipo en el botón real para que 
                        // el ShadowPicker y DataBinding lo lean correctamente.
                        e.target.dataset.shadow = JSON.stringify(shadow);
                        e.target.dataset.type = 'shadow';
                        
                        // Abrimos el picker usando el botón real (e.target) como ancla
                        ShadowPicker.open(e.target, 'coro'); 
                        return;
                    }
                }

                // --- PLACEHOLDER ---
                if (_selected && _selected.dataset.key === 'placeholder') {
                    const action = e.target.closest('[data-action]')?.dataset.action;
                    if (action === 'str328') {
                        openMediaLibrary(null, null, 'placeholder', (url) => {
                            _draft.customLayers.placeholder.value = url;
                            _draft.customLayers.placeholder.type = 'image';
                            refreshScene();
                        });
                        return;
                    }
                }

                // --- SERMÓN ---
                if (_selected && _selected.dataset.key === 'sermon') {
                    const action = e.target.closest('[data-action]')?.dataset.action;
                    const btn = e.target.closest('[data-action]');
                    
                    if (action === 'str330') { // Animación
                        btn.dataset.value = _draft.customLayers.sermon.animation || 'fade-up';
                        MultiPicker.openSingle(btn, 'sermon-anim', (val, picked) => {
                            _draft.customLayers.sermon.animation = val;
                            btn.textContent = (picked ? picked.label : val) + ' ▾';
                            refreshSelectionUI();
                        });
                        return;
                    }
                    if (action === 'str350') { // Configurar aparición
                        const trigger = _draft.customLayers.sermon.trigger || { type: 'verses', value: 3 };
                        PickerBase.open(btn, {
                            className: 'sermon-trigger-picker',
                            minWidth: 280,
                            content: `
                                <div style="padding: 8px;">
                                    <div style="font-size: 11px; font-weight: 600; color: var(--text-muted); margin-bottom: 8px;">${setLang('str354')}</div>
                                    <div style="display: flex; gap: 8px; margin-bottom: 12px;">
                                        <select class="opciones-select trigger-type" style="flex: 1;">
                                            <option value="verses" ${trigger.type === 'verses' ? 'selected' : ''}>${setLang('str351').replace('{n}', '')}</option>
                                            <option value="time" ${trigger.type === 'time' ? 'selected' : ''}>${setLang('str352').replace('{n}', '')}</option>
                                            <option value="none" ${trigger.type === 'none' ? 'selected' : ''}>${setLang('str219')}</option>
                                        </select>
                                        <input type="number" class="opciones-select trigger-val" min="1" value="${trigger.value}" style="width: 60px;">
                                    </div>
                                    <div class="cc-cp-actions modal-footer-right">
                                        <div class="code-btn code-btn-primary trg-save">${setLang('str57')}</div>
                                        <div class="code-btn code-btn-cancel trg-cancel">${setLang('str38')}</div>
                                    </div>
                                </div>
                            `,
                            onMount(el, closeFn) {
                                const selType = el.querySelector('.trigger-type');
                                const inputVal = el.querySelector('.trigger-val');
                                
                                selType.addEventListener('change', () => {
                                    inputVal.style.opacity = selType.value === 'none' ? '0.3' : '1';
                                });
                                if (selType.value === 'none') inputVal.style.opacity = '0.3';
                                
                                el.querySelector('.trg-cancel').onclick = () => closeFn();
                                el.querySelector('.trg-save').onclick = () => {
                                    _draft.customLayers.sermon.trigger = {
                                        type: selType.value,
                                        value: parseInt(inputVal.value) || 1
                                    };
                                    closeFn();
                                };
                            }
                        });
                        return;
                    }
                }

                const t = e.target.closest('.tog');
                if (!t || !_selected) return;
                
                if (t.dataset.cls === 'bold' && _selected.dataset.type === 'text') {
                    const key = _selected.dataset.key;
                    const isBold = t.classList.contains('on');
                    const newWeight = isBold ? '400' : '700';
                    _draft.contentStyles[key + 'Weight'] = newWeight;
                    applyTextVisuals(_selected, key);
                    t.classList.toggle('on', !isBold);
                } else {
                    _selected.classList.toggle(t.dataset.cls);
                    t.classList.toggle('on');
                }
                drawSel();
            });
            _ctx.addEventListener('input', e => {
                if (!_selected) return;

                if (e.target.dataset.type === 'shadow') {
                    const key = _selected.dataset.key;
                    try {
                        const newShadow = JSON.parse(e.target.dataset.shadow || '{}');
                        _draft.contentStyles.textShadow[key] = newShadow;
                        applyTextVisuals(_selected, key);
                    } catch (_) {}
                }
            });
        }

        // ResizeObserver para reajustar el marco cuando cambia el stage
        if (!_stage._ro) {
            _stage._ro = new ResizeObserver(() => {
                if (!_busy) {
                    buildMoveable();
                    drawSel();
                }
            });
            _stage._ro.observe(_stage);
        }
    }

    // ----------------------------------------------------------
    // MOUNT / UNMOUNT / SAVE / OPEN
    // ----------------------------------------------------------
    function mount(displayId, applyToAll = false) {
        _currentDisplayId = displayId;
        _applyToAll = applyToAll;

        const display = state.settings.connectedDisplays.find(d => d.id === displayId);
        if (!display) {
            debugLog('STAGE-EDITOR', 'mount: display not found:', displayId);
            return;
        }

        _stage = $('stage-editor-stage');
        if (!_stage) return;
        initSlotBlocks();
        _blocks  = [..._stage.querySelectorAll('.block')];
        _movable = _blocks.filter(b => !b.classList.contains('fixed'));

        // Si es "todos", cargamos el entry de __ALL__. Si no, el del monitor.
        let entryToLoad;
        if (_applyToAll) {
            entryToLoad = zionLyricsObj.displays['__ALL__'] || getDisplayLayers(display);
        } else {
            entryToLoad = getDisplayLayers(display);
        }

        _draft = {
            layout: normalizeLayout(entryToLoad.layout),
            customLayers: structuredClone(entryToLoad.customLayers),
            contentStyles: structuredClone(entryToLoad.contentStyles)
        };
        _scene = 'verse';
        _memo = newMemo();

        const labelEl = $('stage-editor-monitor-label');
        if (labelEl) labelEl.textContent = _applyToAll ? "Todos los monitores" : display.label;

        // Logo
        const logoImg = $('stage-editor-logo');
        if (logoImg) {
            const url = entryToLoad.customLayers?.logo?.url;
            if (url) {
                logoImg.src = url;
            } else {
                const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" fill="#f5c542"/><path d="M44 18h12v26h26v12H56v26H44V56H18V44h26z" fill="#1a2238"/></svg>';
                logoImg.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
            }
        }

        // Apply layout

        // Overlays
        _box = _stage.querySelector('.sel-box');
        if (!_box) {
            _box = document.createElement('div');
            _box.className = 'sel-box';
            _stage.appendChild(_box);
        }
        _box.style.display = 'none';

        _mq = _stage.querySelector('.marquee');
        if (!_mq) {
            _mq = document.createElement('div');
            _mq.className = 'marquee';
            _stage.appendChild(_mq);
        }

        _ctx = $('stage-editor-ctx');

        initRail();
        initFrame();   // tiradores en las 4 líneas del margen
        refreshScene();   // aplica el layout y oculta lo que no pertenece a la escena
        bindStageEvents();

        _sel = [];
        _selected = null;
        buildMoveable();
        drawSel();
    }

    function unmount() {
        if (_moveable) { _moveable.destroy(); _moveable = null; }
        if (_stage && _stage._ro) { _stage._ro.disconnect(); _stage._ro = null; }
        _stage = _blocks = _movable = _box = _mq = _ctx = _rail = null;
        _sel = [];
        _selected = null;
        _draft = null;
        _currentDisplayId = null;
        _targets = [];
        _guideEls.forEach(g => g.remove());
        _guideEls = [];
    }

    function save() {
        // Medir los bloques de texto de TODAS las escenas antes de guardar
        const keepScene = _scene;
        try {
            Object.keys(SCENES).forEach(name => { _scene = name; refreshScene(); measureBoxes(); });
        } finally {
            _scene = keepScene;
            refreshScene();
        }

        if (_applyToAll) {
            // 1. Guardar la configuración global en __ALL__
            if (!zionLyricsObj.displays['__ALL__']) {
                zionLyricsObj.displays['__ALL__'] = {};
            }
            const allEntry = zionLyricsObj.displays['__ALL__'];
            allEntry.layout = structuredClone(_draft.layout);
            allEntry.customLayers = structuredClone(_draft.customLayers);
            allEntry.contentStyles = structuredClone(_draft.contentStyles);

            // 2. Aplanar (sobrescribir) esta configuración en todos los monitores extendidos
            const extended = state.settings.connectedDisplays.filter(d => !d.isPrimary);
            extended.forEach(d => {
                const entry = getDisplayLayers(d);
                entry.layout = structuredClone(_draft.layout);
                entry.customLayers = structuredClone(_draft.customLayers);
                entry.contentStyles = structuredClone(_draft.contentStyles);
                
                ProyController.applyLayers([d.id], entry.customLayers);
                ProyController.applyStyles([d.id], entry.contentStyles);
            });
        } else {
            // Guardar solo para el monitor actual
            const display = state.settings.connectedDisplays.find(d => d.id === _currentDisplayId);
            if (!display) return;
            
            const entry = getDisplayLayers(display);
            entry.layout = structuredClone(_draft.layout);
            entry.customLayers = structuredClone(_draft.customLayers);
            entry.contentStyles = structuredClone(_draft.contentStyles);
            
            ProyController.applyLayers([_currentDisplayId], entry.customLayers);
            ProyController.applyStyles([_currentDisplayId], entry.contentStyles);
        }

        saveZionLyricsObj();
        renderMedia();
        close();
    }

    function reset() {
        _draft.layout = makeInitial();  // restablece las dos escenas
        _memo = newMemo();
        if (!_blocks) return;
        refreshScene();
        setSel([]);
    }

    async function open(elOrId, applyToAll = false) {
        let displayId = (typeof elOrId === 'string') ? elOrId : null;

        const extended = state.settings.connectedDisplays.filter(d => !d.isPrimary);
        if (extended.length === 0) {
            customAlert(setLang('str134'));
            return;
        }

        if (!displayId) {
            displayId = extended[0].id;
        }

        const loaded = await loadModalHtml('stage-editor-modal');
        if (!loaded) return;

        const modal = $('stage-editor-modal');
        if (!modal) return;
        modal.dataset.displayId = displayId;
        modal.dataset.applyToAll = applyToAll ? 'true' : 'false';

        openModal(null, null, 'stage-editor-modal');
    }

    function close() {
        closeModal(null, null, 'stage-editor-modal');
    }

    // Document-level dismissal (bound once)
    document.addEventListener('mousedown', ev => {
        if (!_stage) return;
        // Agregamos '.picker-popup' y '.dropdown-menu' para que al clickear un picker no se deseleccione el elemento y se destruya el ancla.
        if (!ev.target.closest('#stage-editor-stage, #stage-editor-ctx, #stage-editor-rail, .picker-popup, .dropdown-menu')) {
            setSel([]);
        }
    });

    document.addEventListener('keydown', ev => {
        if (!_stage) return;
        if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'a') {
            ev.preventDefault();
            setSel([..._movable]);
        }
        if (ev.key === 'Escape') setSel([]);
        if (ev.key === 'Delete' && !ev.target.closest('input, textarea, [contenteditable]')) removeSelected();
    });

    window.StageEditor = { open, mount, unmount, save, close, reset };
    window.openStageEditor  = open;
    window.saveStageEditor  = save;
    window.closeStageEditor = close;
    window.resetStageEditor = reset;
})();