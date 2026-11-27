(function (global) {
    'use strict';

    const ANCHOR_TRANSLATE = {
        'top-left':[0,0], 'top-center':[-50,0], 'top-right':[-100,0],
        'middle-left':[0,-50], 'middle-center':[-50,-50], 'center':[-50,-50],
        'middle-right':[-100,-50],
        'bottom-left':[0,-100], 'bottom-center':[-50,-100], 'bottom-right':[-100,-100]
    };

    // Área segura activa (en % del stage). El editor guarda TODAS las coordenadas en % del stage,
    // pero los textos se posicionan dentro de .proy-safe-area: hay que convertirlas.
    let _SAFE = null;
    const PIVOT_BAND = 10;                 // ±10 % alrededor del centro: el texto crece hacia los dos lados
    const rebaseMax = v => (v != null && _SAFE) ? v / _SAFE.width * 100 : v;
    const legacy = p => (p && typeof p === 'object') ? { ...p, legacy: true } : p;

    // Convierte una caja del editor (esquina sup. izq. + tamaño, en % del stage) en un punto de anclaje.
    // El punto de anclaje es el que NO se mueve cuando el texto crece:
    //   - centrado (±PIVOT_BAND del centro)  → crece hacia ambos lados
    //   - mitad izquierda / superior         → ancla izquierda / arriba → crece hacia derecha / abajo
    //   - mitad derecha / inferior           → ancla derecha / abajo    → crece hacia izquierda / arriba
    function resolveEditorPos(pos) {
        const m = _SAFE;
        const cxRef = m ? m.x + m.width  / 2 : 50;
        const cyRef = m ? m.y + m.height / 2 : 50;
        const hasBox = pos.w != null && pos.h != null;
        let px = pos.x ?? 0, py = pos.y ?? 0, h = 'left', vv = 'top';

        if (hasBox) {
            const cx = px + pos.w / 2, cy = py + pos.h / 2;
            if (Math.abs(cx - cxRef) <= PIVOT_BAND)      { h = 'center'; px = cx; }
            else if (cx > cxRef)                          { h = 'right';  px = (pos.x ?? 0) + pos.w; }
            if (Math.abs(cy - cyRef) <= PIVOT_BAND)      { vv = 'middle'; py = cy; }
            else if (cy > cyRef)                          { vv = 'bottom'; py = (pos.y ?? 0) + pos.h; }
        }

        const out = { ...pos, anchor: vv + '-' + h, fitContent: hasBox };
        out.x = m ? (px - m.x) / m.width  * 100 : px;
        out.y = m ? (py - m.y) / m.height * 100 : py;
        if (pos.maxWidth != null) out.maxWidth = rebaseMax(pos.maxWidth);
        return out;
    }

    function applyPositionXY(el, pos) {
        if (!pos) return;
        if (typeof pos === 'string') pos = { x: 50, y: 50, anchor: pos };
        // Coordenadas del editor visual (anchor 'top-left', % del stage)
        if (pos.anchor === 'top-left' && !pos.stage && !pos.legacy) pos = resolveEditorPos(pos);
        const [tx, ty] = ANCHOR_TRANSLATE[pos.anchor] || [0, 0];

        el.style.position = 'absolute';

        if (pos.anchor === 'top-left' || pos.anchor === 'left') {
            // Coordenadas del editor visual (esquina superior izquierda)
            el.style.left = (pos.x ?? 0) + '%';
            el.style.right = 'auto';
            el.style.transform = 'none';
        } else if (pos.anchor && pos.anchor.endsWith('-right')) {
            el.style.left = 'auto';
            el.style.right = (100 - (pos.x ?? 100)) + '%';
            el.style.transform = `translate(0, ${ty}%)`;
        } else if (pos.anchor && pos.anchor.endsWith('-left')) {
            el.style.left = (pos.x ?? 0) + '%';
            el.style.right = 'auto';
            el.style.transform = `translate(0, ${ty}%)`;
        } else {
            // -center o 'center'
            el.style.left = (pos.x ?? 50) + '%';
            el.style.right = 'auto';
            el.style.transform = `translate(-50%, ${ty}%)`;
        }

        el.style.top = (pos.y ?? 0) + '%';
        if (pos.maxWidth != null) el.style.maxWidth = pos.maxWidth + '%';
        // La caja se ajusta al texto (como en el editor) hasta llegar a maxWidth
        if (pos.fitContent) el.style.width = 'max-content';
        if (pos.fitContent) el.dataset.pivot = pos.anchor;
    }

    function buildShadow(cfg) {
        if (!cfg || !cfg.enabled) return 'none';
        const { color = '#000000', opacity = 0.9, blur = 15, offsetX = 0, offsetY = 0 } = cfg;
        const m = color.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
        const rgb = m
            ? `${parseInt(m[1],16)},${parseInt(m[2],16)},${parseInt(m[3],16)}`
            : '0,0,0';
        return `${offsetX}px ${offsetY}px ${blur}px rgba(${rgb},${opacity})`;
    }

    function getShadowFromStyles(styles, key) {
        const ts = styles.textShadow || {};
        if (ts[key]) return ts[key];
        // Fallback legacy
        return { enabled: styles[`${key}Shadow`] === true };
    }

    function applyVerseStyleVars(el, s) {
        el.style.setProperty('--proy-ref-size',      (s.refSize ?? 3) + 'cqi');
        el.style.setProperty('--proy-verse-size',    (s.verseSize ?? 5) + 'cqi');
        el.style.setProperty('--proy-version-size',  (s.versionSize ?? 2.5) + 'cqi');
        el.style.setProperty('--proy-ref-color',     s.refColor || '#ffffff');
        el.style.setProperty('--proy-verse-color',   s.verseColor || '#ffffff');
        el.style.setProperty('--proy-version-color', s.versionColor || '#ffffff');
        el.style.setProperty('--proy-ref-shadow',    buildShadow(getShadowFromStyles(s, 'ref')));
        el.style.setProperty('--proy-verse-shadow',  buildShadow(getShadowFromStyles(s, 'verse')));
        el.style.setProperty('--proy-version-shadow',buildShadow(getShadowFromStyles(s, 'version')));
        el.style.setProperty('--proy-ref-font',      s.refFont || "var(--font-content, sans-serif)");
        el.style.setProperty('--proy-verse-font',    s.verseFont || "var(--font-content, sans-serif)");
        el.style.setProperty('--proy-version-font',  s.versionFont || "var(--font-content, sans-serif)");
        el.style.setProperty('--proy-verse-num-color', s.verseNumberColor || '#ff5555');
        el.style.setProperty('--proy-verse-align',   s.verseAlign || 'center');
        el.style.setProperty('--proy-verse-valign',  s.verseVAlign === 'top' ? 'flex-start' : s.verseVAlign === 'bottom' ? 'flex-end' : 'center');
        el.style.setProperty('--proy-ref-weight',     s.refWeight     || '400');
        el.style.setProperty('--proy-verse-weight',   s.verseWeight   || '400');
        el.style.setProperty('--proy-version-weight', s.versionWeight || '400');
    }

    function normalizeVerseBlocks(data) {
        if (Array.isArray(data.versions) && data.versions.length) {
            return data.versions.map(v => ({
                acronym: v.acronym || '',
                verses: Array.isArray(v.verses) ? v.verses : null,
                text: v.text || null
            }));
        }
        if (Array.isArray(data.verses) && data.verses.length) {
            return [{ acronym: data.version || '', verses: data.verses, text: null }];
        }
        return [{ acronym: data.version || '', verses: null, text: data.text || '' }];
    }

    function createTextContent(data) {
        return {
            type: 'text',
            data,
            run(conector, ctx) {
                const s = ctx.styles || {};
                const layout = ctx.layout || {};
                const el = document.createElement('div');
                el.className = 'proy-text';

                const isPlaceholder = data.placeholder === true;
                const coroPos = isPlaceholder
                    ? { x: 50, y: 50, anchor: 'middle-center' }
                    : (s.coroPos || layout.coro || { x: 50, y: 50, anchor: 'middle-center' });
                applyPositionXY(el, coroPos);

                const size = layout.coro?.fs ?? s.coroSize ?? 5;
                el.style.setProperty('--proy-text-size', size + 'cqi');
                el.style.setProperty('--proy-text-color', s.coroColor || '#ffffff');
                el.style.setProperty('--proy-text-font', s.coroFont || "var(--font-content, sans-serif)");
                el.style.setProperty('--proy-text-shadow', buildShadow(getShadowFromStyles(s, 'coro')));
                el.style.setProperty('--proy-text-weight', s.coroWeight || '600');
                if (!el.style.width) el.style.width = '100%';
                if (!el.style.maxWidth) el.style.maxWidth = '100%';

                el.textContent = String(data.text ?? '').trim();
                conector.appendChild(el);
            }
        };
    }

    function fillVerseBody(bodyEl, block, showNumbers) {
        if (block.verses && block.verses.length) {
            block.verses.forEach(v => {
                const vDiv = document.createElement('div');
                if (showNumbers && v.number != null) {
                    const num = document.createElement('span');
                    num.className = 'proy-verse-num';
                    num.textContent = v.number;
                    vDiv.appendChild(num);
                }
                vDiv.appendChild(document.createTextNode(v.text || ''));
                bodyEl.appendChild(vDiv);
            });
        } else {
            bodyEl.textContent = block.text || '';
        }
    }

    function createVerseContent(data) {
        return {
            type: 'verse',
            data,
            run(conector, ctx) {
                const s = ctx.styles || {};
                const layout = ctx.layout || {};
                const blocks = normalizeVerseBlocks(data).slice(0, 3);
                if (blocks.length > 1) renderMultiVersionVerse(conector, s, blocks, data, layout);
                else renderSingleVersionVerse(conector, s, blocks[0], data, layout);
            }
        };
    }

    function layoutSingleVerse(conector, s, L) {
        const ref     = conector.querySelector('.proy-verse-ref');
        const body    = conector.querySelector('.proy-verse-body');
        const version = conector.querySelector('.proy-verse-version');

        // Toggle del modal de Capas: cuando useEditorLayout === false,
        // ignoramos layout.scenes.* y usamos contentStyles.*Pos (el modal gana).
        const useEditor = s.useEditorLayout !== false;

        const refPos  = (useEditor && L.ref)
            ? { ...L.ref }
            : { ...(s.verseRefPos     || { x: 50, y: 0,   anchor: 'top-center'    }) };
        const bodyPos = (useEditor && L.verse)
            ? { ...L.verse }
            : { ...(s.verseTextPos    || { x: 50, y: 50,  anchor: 'middle-center' }) };
        const verPos  = (useEditor && L.version)
            ? { ...L.version }
            : { ...(s.verseVersionPos || { x: 50, y: 100, anchor: 'bottom-center' }) };

        // Si el layout viene del editor visual (anchor top-left), las coords son
        // explícitas. Aplicarlas directo, sin algoritmo de colisión.
        const fromEditor = (refPos.anchor === 'top-left' || bodyPos.anchor === 'top-left' || verPos.anchor === 'top-left');

        // Vecinos del verso en el layout del editor (para no montarse sobre ellos)
        delete conector.dataset.vAbove; delete conector.dataset.vBelow;
        if (fromEditor && L.verse && L.verse.w != null && L.verse.y != null) {
            const V = L.verse, mid = o => o.y + o.h / 2;
            const nb = [['ref', L.ref], ['version', L.version]].filter(([, o]) => o && o.y != null && o.h != null);
            conector.dataset.vAbove = nb.filter(([, o]) => mid(o) < V.y).map(([k]) => k).join(',');
            conector.dataset.vBelow = nb.filter(([, o]) => mid(o) > V.y + V.h).map(([k]) => k).join(',');
        }

        if (fromEditor) {
            if (ref) {
                applyPositionXY(ref, refPos);
                if (L.ref?.fs) ref.style.setProperty('--proy-ref-size', L.ref.fs + 'cqi');
                if (L.ref?.maxWidth != null) ref.style.maxWidth = rebaseMax(L.ref.maxWidth) + '%';
            }
            if (body) {
                applyPositionXY(body, bodyPos);
                if (L.verse?.fs) body.style.setProperty('--proy-verse-size', L.verse.fs + 'cqi');
                if (L.verse?.maxWidth != null) body.style.maxWidth = rebaseMax(L.verse.maxWidth) + '%';
            }
            if (version) {
                applyPositionXY(version, verPos);
                if (L.version?.fs) version.style.setProperty('--proy-version-size', L.version.fs + 'cqi');
            }
            return;
        }

        // --- Sin editor: comportamiento original con colisión ---
        // --- SIMETRÍA EN EL CENTRO ---
        if (ref && version && 
            refPos.y === verPos.y && 
            refPos.x === verPos.x && 
            refPos.anchor.includes('center') && 
            verPos.anchor.includes('center')) {
            
            refPos.anchor = refPos.anchor.replace('center', 'right');
            refPos.x = Math.max(0, refPos.x - 2);
            
            verPos.anchor = verPos.anchor.replace('center', 'left');
            verPos.x = Math.min(100, verPos.x + 2);
        }

        if (ref) {
            applyPositionXY(ref, refPos);
            if (L.ref?.fs) ref.style.setProperty('--proy-ref-size', L.ref.fs + 'cqi');
            if (L.ref?.maxWidth != null) ref.style.maxWidth = rebaseMax(L.ref.maxWidth) + '%';
        }
        if (body) {
            applyPositionXY(body, bodyPos);
            if (L.verse?.fs) body.style.setProperty('--proy-verse-size', L.verse.fs + 'cqi');
            if (L.verse?.maxWidth != null) body.style.maxWidth = rebaseMax(L.verse.maxWidth) + '%';
        }
        if (version) {
            applyPositionXY(version, verPos);
            if (L.version?.fs) version.style.setProperty('--proy-version-size', L.version.fs + 'cqi');
        }
    }

    function renderSingleVersionVerse(conector, s, block, data, layout) {
        conector.dataset.renderMode = 'verse-single';
        applyVerseStyleVars(conector, s);

        if (data.ref) {
            const ref = document.createElement('div');
            ref.className = 'proy-verse-ref';
            ref.textContent = data.ref;
            conector.appendChild(ref);
        }

        const body = document.createElement('div');
        body.className = 'proy-verse-body';
        fillVerseBody(body, block, data.showNumbers);
        conector.appendChild(body);

        if (block.acronym) {
            const version = document.createElement('div');
            version.className = 'proy-verse-version';
            version.textContent = block.acronym;
            conector.appendChild(version);
        }

        layoutSingleVerse(conector, s, layout || {});
    }

    function renderMultiVersionVerse(conector, s, blocks, data, layout) {
        conector.dataset.renderMode = 'verse-multi';
        applyVerseStyleVars(conector, s);

        // 1. Referencia compartida (usando el layout del editor)
        if (data.ref) {
            const ref = document.createElement('div');
            ref.className = 'proy-verse-ref';
            ref.textContent = data.ref;
            
            const refPos = layout.ref || s.verseRefPos || { x: 50, y: 0, anchor: 'top-center' };
            applyPositionXY(ref, legacy(refPos));
            if (layout.ref?.fs) ref.style.setProperty('--proy-ref-size', layout.ref.fs + 'cqi');
            conector.appendChild(ref);
        }

        // 2. Iterar cada versículo (bloque) y posicionarlo absolutamente
        blocks.forEach((block, i) => {
            const suffix = i === 0 ? '' : String(i + 1); // '', '2', '3'
            const versePos = layout['verse' + suffix];
            const versionPos = layout['version' + suffix];

            // Texto del versículo
            const body = document.createElement('div');
            body.className = 'proy-verse-body';
            fillVerseBody(body, block, data.showNumbers);
            
            applyPositionXY(body, legacy(versePos) || { x: 50, y: 50, anchor: 'middle-center' });
            if (versePos?.fs) body.style.setProperty('--proy-verse-size', versePos.fs + 'cqi');
            if (versePos?.maxWidth) body.style.maxWidth = versePos.maxWidth + '%';
            conector.appendChild(body);

            // Versión (acrónimo)
            if (block.acronym) {
                const version = document.createElement('div');
                version.className = 'proy-verse-version';
                version.textContent = block.acronym;
                
                applyPositionXY(version, legacy(versionPos) || { x: 50, y: 90, anchor: 'bottom-center' });
                if (versionPos?.fs) version.style.setProperty('--proy-version-size', versionPos.fs + 'cqi');
                conector.appendChild(version);
            }
        });

        // 3. Nota: Los rectángulos (panels) individuales para cada versículo
        // requerirían clonar el div .proy-layer-panel en el DOM. Por ahora 
        // solo posicionamos el contenido del texto.
    }

    function createMediaContent(data) {
        return {
            type: 'media',
            data,
            run(conector) {
                const wrap = document.createElement('div');
                wrap.className = 'proy-media';
                wrap.innerHTML = data.html || '';
                conector.appendChild(wrap);

                const video = wrap.querySelector('video');
                if (!video) return;

                const isProjector = !!conector.closest('#proy-content');
                video.muted = !isProjector;

                if (isProjector) {
                    video.removeAttribute('controls');
                } else {
                    video.removeAttribute('controls');
                    buildMediaControls(conector, video);
                }

                // Auto-play: el video arranca apenas se proyecta, sin esperar a
                // que el usuario le dé play en los controles de la miniatura.
                video.play().catch(() => {});
            }
        };
    }

    function buildMediaControls(conector, video) {
        const stageRoot = conector.closest('.proy-stage');
        if (!stageRoot) return;

        const panel = document.createElement('div');
        panel.className = 'media-controls';
        panel.innerHTML = `
            <div class="mc-row mc-row-top">
                <div class="mc-vol-group">
                    <button class="mc-btn mc-vol-toggle" data-i18n-tooltip="str256" data-tooltip="Volumen">
                        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M3 6 L3 10 L6 10 L9 13 L9 3 L6 6 Z" fill="currentColor" stroke="none"/>
                            <path class="mc-vol-wave" d="M11 5 A4 4 0 0 1 11 11"/>
                        </svg>
                    </button>
                    <input type="range" class="mc-vol" min="0" max="1" step="0.01" value="1">
                </div>
                <div class="mc-spacer"></div>
                <!--button class="mc-btn mc-rew" data-i18n-tooltip="str258" data-tooltip="Retroceder 10s">
                    <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
                        <path d="M4.5 3 L4.5 13 L5.5 13 L5.5 9 L11 13 L11 3 L5.5 7 L5.5 3 Z"/>
                    </svg>
                </button-->
                <button class="mc-btn mc-play" data-i18n-tooltip="str257" data-tooltip="Reproducir">
                    <svg viewBox="0 0 16 16" width="18" height="18" fill="currentColor">
                        <path class="mc-play-icon" d="M4 2 L13 8 L4 14 Z"/>
                    </svg>
                </button>
                <div class="mc-spacer"></div>
                <!--button class="mc-btn mc-fwd" data-i18n-tooltip="str259" data-tooltip="Avanzar 10s">
                    <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
                        <path d="M11.5 3 L11.5 13 L10.5 13 L10.5 9 L5 13 L5 3 L10.5 7 L10.5 3 Z"/>
                    </svg>
                </button-->
            </div>
            <div class="mc-row mc-row-bottom">
                <span class="mc-time mc-time-current">0:00</span>
                <input type="range" class="mc-seek" min="0" max="1000" step="1" value="0">
                <span class="mc-time mc-time-total">0:00</span>
            </div>
        `;
        stageRoot.appendChild(panel);

        const playBtn   = panel.querySelector('.mc-play');
        const playIcon  = panel.querySelector('.mc-play-icon');
        //const rewBtn    = panel.querySelector('.mc-rew');
        //const fwdBtn    = panel.querySelector('.mc-fwd');
        const seekRange = panel.querySelector('.mc-seek');
        const timeCur   = panel.querySelector('.mc-time-current');
        const timeTotal = panel.querySelector('.mc-time-total');
        const volRange  = panel.querySelector('.mc-vol');
        const volWave   = panel.querySelector('.mc-vol-wave');

        const wrapper = stageRoot.closest('.projector-thumb-wrapper');
        const displayId = wrapper && wrapper.dataset.displayId;

        // --- Play/Pause ---
        const updatePlayIcon = () => {
            if (video.paused) {
                playIcon.setAttribute('d', 'M4 2 L13 8 L4 14 Z');
                playBtn.title = setLang('str257');
            } else {
                playIcon.setAttribute('d', 'M4 2 L6.5 2 L6.5 14 L4 14 Z M9.5 2 L12 2 L12 14 L9.5 14 Z');
                playBtn.title = setLang('str260');
            }
        };
        playBtn.onclick = (e) => {
            e.stopPropagation();
            if (video.paused) video.play().catch(() => {});
            else video.pause();
        };
        video.addEventListener('play',  updatePlayIcon);
        video.addEventListener('pause', updatePlayIcon);
        updatePlayIcon();

        // --- Rewind / Forward ---
        /*rewBtn.onclick = (e) => {
            e.stopPropagation();
            video.currentTime = Math.max(0, video.currentTime - 10);
        };
        fwdBtn.onclick = (e) => {
            e.stopPropagation();
            const dur = video.duration || 0;
            video.currentTime = Math.min(dur, video.currentTime + 10);
        };*/

        // --- Seek ---
        let seeking = false;
        seekRange.addEventListener('mousedown', () => { seeking = true; });
        seekRange.addEventListener('mouseup',   () => { seeking = false; });
        seekRange.addEventListener('input', () => {
            if (!video.duration) return;
            video.currentTime = (parseFloat(seekRange.value) / 1000) * video.duration;
        });

        // --- Tiempo ---
        const fmt = (s) => {
            if (!isFinite(s) || s < 0) return '0:00';
            const m = Math.floor(s / 60);
            const ss = Math.floor(s % 60);
            return `${m}:${ss < 10 ? '0' : ''}${ss}`;
        };
        video.addEventListener('loadedmetadata', () => {
            timeTotal.textContent = fmt(video.duration);
        });
        video.addEventListener('timeupdate', () => {
            timeCur.textContent = fmt(video.currentTime);
            if (!seeking && video.duration) {
                seekRange.value = String(Math.round((video.currentTime / video.duration) * 1000));
            }
        });
        if (video.duration) timeTotal.textContent = fmt(video.duration);

        // --- Volumen (controla el proyector) ---
        volRange.addEventListener('input', () => {
            const val = parseFloat(volRange.value);
            if (val === 0) {
                volWave.setAttribute('d', 'M10 6 L13 9 M13 6 L10 9');
            } else if (val < 0.5) {
                volWave.setAttribute('d', 'M11 6.5 A2 2 0 0 1 11 9.5');
            } else {
                volWave.setAttribute('d', 'M11 5 A4 4 0 0 1 11 11');
            }
            if (displayId && window.ProyController) {
                window.ProyController.videoSync(displayId, 'volume', val);
            }
        });

        // --- Auto-hide ---
        let hideTimer = null;
        const showPanel = () => {
            panel.classList.add('visible');
            if (hideTimer) clearTimeout(hideTimer);
            hideTimer = setTimeout(() => panel.classList.remove('visible'), 3000);
        };
        wrapper.addEventListener('mousemove', showPanel);
        wrapper.addEventListener('mouseenter', showPanel);
        wrapper.addEventListener('mouseleave', () => {
            if (hideTimer) clearTimeout(hideTimer);
            panel.classList.remove('visible');
        });
        applyTranslations();
    }

    // =====================================================================
    // WORDY: tabla de 2–3 columnas × 1–3 filas (palabra · significado · referencias)
    //   Contenido: { type: 'wordy', columns: 2|3, rows: [[c1, c2, c3?], ...] }
    //   El editor configura SOLO la fila 1 (un texto por columna: wordy1..wordy3, escena wordy2 / wordy3);
    //   las demás filas copian ese formato. Cada columna tiene su posición, tamaño, alineación,
    //   fuente, peso, color y sombra. Las filas se apilan hacia abajo según su altura real.
    // =====================================================================
    const WORDY_ROW_GAP = 2.6;      // separación entre filas, en % del alto del área segura
    // Valores por defecto (los mismos del editor) para cuando el layout no trae la escena wordy
    const WORDY_DEFAULTS = {
        2: { wordy1: { x: 8,  y: 30, maxWidth: 28, fs: 3.4 },
             wordy2: { x: 40, y: 30, maxWidth: 52, fs: 3 } },
        3: { wordy1: { x: 6,  y: 30, maxWidth: 24, fs: 3 },
             wordy2: { x: 32, y: 30, maxWidth: 38, fs: 2.6 },
             wordy3: { x: 74, y: 30, maxWidth: 20, fs: 2 } }
    };

    // Estilo y posición horizontal de las celdas (la posición vertical la reparte _layoutWordy del stage).
    function styleWordy(safeArea, cols, nRows, styles, layout) {
        const s = styles || {}, L = layout || {};
        const m = _SAFE;                                   // margen activo (null: coordenadas = área segura)
        const info = [];

        for (let c = 0; c < cols; c++) {
            const n = c + 1, key = 'wordy' + n;
            const p = { ...WORDY_DEFAULTS[cols][key], ...(L[key] || {}) };
            const align = p.align === 'center' || p.align === 'right' ? p.align : 'left';

            // Ancla horizontal según la alineación: izquierda → borde izq., centro → centro, derecha → borde der.
            // (coordenadas del editor: % del stage; se convierten a % del área segura)
            const w  = p.w != null ? p.w : p.maxWidth;
            const ax = align === 'right' ? p.x + w : align === 'center' ? p.x + w / 2 : p.x;
            const rx = m ? (ax - m.x) / m.width * 100 : ax;

            const fonts  = safeArea._wordyFonts || {};
            const fam    = fonts[key] || s[key + 'Font'];
            const weight = s[key + 'Weight'] || (c === 0 ? '700' : '600');
            const color  = s[key + 'Color'] || '#ffffff';
            const shadow = buildShadow(getShadowFromStyles(s, key));

            safeArea.querySelectorAll('.proy-wordy-cell[data-col="' + c + '"]').forEach(el => {
                el.style.position   = 'absolute';
                el.style.margin     = '0';
                el.style.width      = 'max-content';
                el.style.maxWidth   = rebaseMax(p.maxWidth) + '%';
                el.style.whiteSpace = 'pre-line';
                el.style.overflowWrap = 'anywhere';
                el.style.lineHeight = '1.2';
                el.style.textAlign  = align;
                // El centrado usa la propiedad `translate` (deja libre `transform` para las animaciones)
                if (align === 'right')       { el.style.left = 'auto'; el.style.right = (100 - rx) + '%'; el.style.translate = ''; }
                else if (align === 'center') { el.style.right = 'auto'; el.style.left = rx + '%'; el.style.translate = '-50% 0'; }
                else                         { el.style.right = 'auto'; el.style.left = rx + '%'; el.style.translate = ''; }
                // Tamaño en cqi × zoom; --wordy-scale lo reduce si la tabla no cabe
                el.style.fontSize   = 'calc(' + (p.fs ?? 3) + 'cqi * var(--proy-zoom, 1) / var(--wordy-scale, 1))';
                el.style.fontFamily = fam || "'Segoe UI', sans-serif";
                el.style.fontWeight = weight;
                el.style.color      = color;
                el.style.textShadow = shadow;
            });
            info.push({ y: p.y, h: p.h });
        }
        safeArea._wordy = { cols, rows: nRows, info, m };
    }

    function createWordyContent(data) {
        const cols = (data && data.columns === 3) ? 3 : 2;
        const rows = ((data && data.rows) || []).slice(0, 3);
        return {
            type: 'wordy',
            data,
            run(conector, ctx) {
                conector.dataset.renderMode = 'wordy';
                conector._wordyFonts = (data && data.fonts) || {};
                rows.forEach((row, r) => {
                    for (let c = 0; c < cols; c++) {
                        const el = document.createElement('div');
                        el.className = 'proy-wordy-cell';
                        el.dataset.row = r;
                        el.dataset.col = c;
                        // dir="auto" deja que el navegador detecte hebreo/árabe y coloque
                        // la puntuación del lado correcto. Sin esto, "אֱלֹהִים." muestra el
                        // punto en el extremo equivocado.
                        el.dir = 'auto';
                        el.textContent = String((row && row[c]) == null ? '' : row[c]).trim();
                        conector.appendChild(el);
                    }
                });
                // Para re-aplicar estilos/layout sin reconstruir el contenido
                conector._wordyApply = (styles, layout) => styleWordy(conector, cols, rows.length, styles, layout);
                conector._wordyApply((ctx || {}).styles, (ctx || {}).layout);
            }
        };
    }

    function applyStylesToExistingContent(conector, styles, layout) {
        const s = styles || {};
        const L = layout || {};

        // ---------- TEXTO (coro) ----------
        const textEl = conector.querySelector('.proy-text');
        if (textEl) {
            // Tamaño: layout gana sobre contentStyles
            const size = L.coro?.fs ?? s.coroSize ?? 5;
            textEl.style.setProperty('--proy-text-size',  size + 'cqi');
            textEl.style.setProperty('--proy-text-color', s.coroColor || '#ffffff');
            textEl.style.setProperty('--proy-text-font',  s.coroFont || "var(--font-content, sans-serif)");
            textEl.style.setProperty('--proy-text-shadow', buildShadow(getShadowFromStyles(s, 'coro')));
            textEl.style.setProperty('--proy-text-weight', s.coroWeight || '600');

            // maxWidth del layout (si existe)
            if (L.coro?.maxWidth != null) textEl.style.maxWidth = rebaseMax(L.coro.maxWidth) + '%';

            // Posición XY: layout.coro > contentStyles.coroPos > default
            const coroPos = L.coro || s.coroPos;
            if (coroPos) applyPositionXY(textEl, coroPos);

            // --proy-text-valign ya no se setea: la posición la resuelve applyPositionXY
        }

        // ---------- VERSO SINGLE ----------
        const safeArea = conector.querySelector('.proy-safe-area');
        if (safeArea && safeArea.dataset.renderMode === 'verse-single') {
            applyVerseStyleVars(safeArea, s);
            layoutSingleVerse(safeArea, s, L);

            const refEl = safeArea.querySelector('.proy-verse-ref');
            const bodyEl = safeArea.querySelector('.proy-verse-body');
            const verEl = safeArea.querySelector('.proy-verse-version');

            [refEl, bodyEl, verEl].forEach(el => {
                if (el) el.classList.remove('anim-fade', 'anim-slide-up', 'anim-zoom');
            });

            if (refEl && s.refAnim !== 'none') refEl.classList.add('anim-' + (s.refAnim || 'fade'));
            if (bodyEl && s.verseAnim !== 'none') bodyEl.classList.add('anim-' + (s.verseAnim || 'fade'));
            if (verEl && s.versionAnim !== 'none') verEl.classList.add('anim-' + (s.versionAnim || 'fade'));
        }

        // ---------- VERSO MULTI ----------
        if (safeArea && safeArea.dataset.renderMode === 'verse-multi') {
            applyVerseStyleVars(safeArea, s);
            const rows = safeArea.querySelector('.proy-verse-rows');
            if (rows) {
                const wrapPos = L.verse || s.verseTextPos || { x: 50, y: 50, anchor: 'middle-center' };
                applyPositionXY(rows, legacy(wrapPos));
                if (L.verse?.fs) rows.style.fontSize = L.verse.fs + 'cqi';
                if (L.verse?.maxWidth != null) rows.style.maxWidth = L.verse.maxWidth + '%';
            }
        }

        // ---------- WORDY ----------
        if (safeArea && safeArea.dataset.renderMode === 'wordy' && safeArea._wordyApply) {
            safeArea._wordyApply(s, L);
        }

        // ---------- MARGEN INTERNO ----------
        if (s.contentPadding !== undefined) {
            conector.style.setProperty('--proy-safe-padding', s.contentPadding + 'cqi');
        }

        // ---------- MEDIA ----------
        // El video/imagen llena el conector por CSS. No hay estilos
        // de contentStyles ni de layout que aplicar aquí.
        // (Si en el futuro se permite redimensionar el media en el editor,
        //  agregar acá: const mediaWrap = conector.querySelector('.proy-media');
        //  if (mediaWrap && L.media) applyPositionXY(mediaWrap, L.media); )
    }

    const CONTENT_RENDERERS = {
        text:          createTextContent,
        verse:         createVerseContent,
        media:         createMediaContent,
        wordy:         createWordyContent
    };

    function createProyStage(host, templateHtml) {
        if (!host) throw new Error('createProyStage: required host');
        if (!templateHtml) throw new Error('createProyStage: required templateHtml');

        host.innerHTML = templateHtml.trim();

        const wrapper = host.querySelector('.projector-thumb-wrapper');
        if (!wrapper) throw new Error('visor.html has no .projector-thumb-wrapper');

        const qs = s => wrapper.querySelector(s);
        const stageEl      = qs('.proy-stage');
        const bgLayer      = qs('.proy-layer-bg');
        const bgImg        = qs('.proy-bg-image');
        const bgVideo      = qs('.proy-bg-video');
        const panelLayer   = qs('.proy-layer-panel');
        const conector     = qs('.proy-conector');
        const safeArea     = qs('.proy-safe-area');
        const marquee      = qs('.proy-layer-marquee');
        const marqueeTxt   = qs('.proy-marquee-text');
        const sermon       = qs('.proy-layer-sermon');
        const sermonTxt    = qs('.proy-sermon-text');
        let sermonPanel    = qs('.proy-layer-sermon-panel');
        if (!sermonPanel) {                       // plantillas viejas sin el elemento
            sermonPanel = document.createElement('div');
            sermonPanel.className = 'proy-layer-sermon-panel';
            stageEl.insertBefore(sermonPanel, sermon);
        }
        const logoLayer    = qs('.proy-layer-logo');
        const logoImg      = qs('.proy-logo-image');
        const logoVideo    = qs('.proy-logo-video');
        const pauseOverlay = qs('.proy-pause-overlay');
        const controlsEl   = qs('.thumb-control-bar');
        const labelEl      = qs('.thumb-label');

        let _lastContentType = null;

        function _getPanelTextEls() {
            const out = [];
            const mode = safeArea.dataset.renderMode;

            if (mode === 'verse-single') {
                const r = safeArea.querySelector('.proy-verse-ref');
                const b = safeArea.querySelector('.proy-verse-body');
                const v = safeArea.querySelector('.proy-verse-version');
                if (r && (r.textContent || '').trim()) out.push(r);
                if (b && (b.textContent || '').trim()) out.push(b);
                if (v && (v.textContent || '').trim()) out.push(v);
            } else if (mode === 'verse-multi') {
                safeArea.querySelectorAll(
                    '.proy-verse-ref, .proy-verse-body, .proy-verse-version, .proy-verse-acronym'
                ).forEach(el => {
                    if ((el.textContent || '').trim()) out.push(el);
                });
            } else if (mode === 'wordy') {
                safeArea.querySelectorAll('.proy-wordy-cell').forEach(el => {
                    if ((el.textContent || '').trim()) out.push(el);
                });
            } else {
                const t = safeArea.querySelector('.proy-text');
                if (t && (t.textContent || '').trim()) out.push(t);
            }

            return out;
        }

        // Rectángulo que abraza las líneas de texto reales. La caja del elemento puede ser más ancha
        // que el texto (max-width, texto centrado o alineado) y dejaría un hueco desigual a un lado.
        function _tightRect(el) {
            const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
            const range = document.createRange();
            let L = Infinity, T = Infinity, R = -Infinity, B = -Infinity, n = 0;
            for (let node = walker.nextNode(); node; node = walker.nextNode()) {
                if (!node.nodeValue || !node.nodeValue.trim()) continue;
                range.selectNodeContents(node);
                for (const r of range.getClientRects()) {
                    if (r.width < 0.5 || r.height < 0.5) continue;
                    L = Math.min(L, r.left);  T = Math.min(T, r.top);
                    R = Math.max(R, r.right); B = Math.max(B, r.bottom);
                    n++;
                }
            }
            if (!n) return el.getBoundingClientRect();
            return { left: L, top: T, right: R, bottom: B, width: R - L, height: B - T };
        }
        // Objeto con la misma interfaz que usa PanelFit.measure (isConnected, textContent, getBoundingClientRect)
        function _asTightEl(el) {
            return {
                isConnected: el.isConnected,
                textContent: el.textContent,
                getBoundingClientRect: () => _tightRect(el)
            };
        }

        // Coloca el versículo dentro del espacio libre del área segura:
        //  - su ancla (centro / arriba / abajo) sale del layout del editor: centrado crece hacia ambos lados;
        //  - la referencia y la versión NO se mueven: el verso no puede invadir su zona;
        //  - si aun así no cabe en el espacio libre, se reduce su letra (mínimo 50 %);
        //  - si se sale de ese espacio, se desplaza lo mínimo para volver a entrar.
        // Mide con offsetTop/offsetHeight (posición de layout): no dependen de las animaciones de entrada.
        function _guardVerse() {
            if (safeArea.dataset.renderMode !== 'verse-single') return;
            const body = safeArea.querySelector('.proy-verse-body');
            if (!body || !body.dataset.pivot) return;            // solo con layout del editor
            const SH = safeArea.clientHeight;
            if (SH < 1) return;

            const SEL = { ref: '.proy-verse-ref', version: '.proy-verse-version' };
            body.style.transition = 'none';                       // medir sin esperar la transición de font-size
            safeArea.style.setProperty('--verse-scale', '1');

            const extent = e => {
                const h = e.offsetHeight;
                const pv = (e.dataset.pivot || 'top-left').split('-')[0];
                const top = e.offsetTop + (pv === 'middle' ? -h / 2 : pv === 'bottom' ? -h : 0);
                return { top, bottom: top + h };
            };
            const named = list => (list || '').split(',').filter(Boolean)
                .map(k => safeArea.querySelector(SEL[k]))
                .filter(e => e && (e.textContent || '').trim());

            // Espacio libre para el verso
            const gap = SH * 0.012;
            let topL = 0, botL = SH;
            named(safeArea.dataset.vAbove).forEach(e => { topL = Math.max(topL, extent(e).bottom + gap); });
            named(safeArea.dataset.vBelow).forEach(e => { botL = Math.min(botL, extent(e).top - gap); });
            if (botL - topL < SH * 0.2) { topL = 0; botL = SH; }   // vecinos mal colocados: ignorarlos
            const avail = botL - topL;

            // 1) que quepa
            let f = 1;
            for (let i = 0; i < 3 && body.offsetHeight > avail * 1.001; i++) {
                f = Math.max(0.5, f * (avail / body.offsetHeight));
                safeArea.style.setProperty('--verse-scale', String(Math.round(1000 / f) / 1000));
            }

            // 2) que no se salga del espacio libre (desplazamiento mínimo)
            const h = body.offsetHeight;
            const T = extent(body).top;
            const Tc = Math.min(Math.max(T, topL), Math.max(topL, botL - h));
            body.style.translate = '0 ' + Math.round((Tc - T) * 100) / 100 + 'px';
            ['ref', 'version'].forEach(k => { const e = safeArea.querySelector(SEL[k]); if (e) e.style.translate = ''; });

            void body.offsetHeight;
            body.style.transition = '';
        }

        // Reparto vertical de la tabla wordy (px del área segura):
        //  - cada fila mide lo que mide su celda más alta y se apila bajo la anterior con un hueco fijo;
        //  - si la tabla no cabe en el área segura se reduce la letra (--wordy-scale, mínimo 50 %);
        //  - el punto fijo sale de la fila 1 del editor: si estaba centrada, la tabla crece hacia arriba y
        //    abajo; si estaba en la mitad superior, crece hacia abajo; si en la inferior, hacia arriba;
        //  - nunca se sale del área segura.
        // Mide con offsetHeight (no depende de las animaciones de entrada).
        function _layoutWordy() {
            const W = safeArea._wordy;
            if (safeArea.dataset.renderMode !== 'wordy' || !W) return;
            const SH = safeArea.clientHeight;
            const cells = [...safeArea.querySelectorAll('.proy-wordy-cell')];
            if (SH < 1 || !cells.length) return;

            const grid = {};
            cells.forEach(el => { grid[el.dataset.row + ':' + el.dataset.col] = el; });
            const m = W.m;
            const toPx = pct => ((m ? (pct - m.y) / m.height * 100 : pct) / 100) * SH;   // % del stage → px
            const yPx = W.info.map(i => toPx(i.y));
            const baseY = Math.min(...yPx);
            const offs = yPx.map(y => y - baseY);
            const gap = WORDY_ROW_GAP / 100 * SH;

            const measure = () => {
                const rowTop = [], rowBottom = [];
                for (let r = 0; r < W.rows; r++) {
                    rowTop[r] = r === 0 ? baseY : rowBottom[r - 1] + gap;
                    let bottom = rowTop[r];
                    for (let c = 0; c < W.cols; c++) {
                        const el = grid[r + ':' + c];
                        if (el) bottom = Math.max(bottom, rowTop[r] + offs[c] + el.offsetHeight);
                    }
                    rowBottom[r] = bottom;
                }
                return { rowTop, rowBottom };
            };

            // Cabe si la tabla (alto total) no supera el área segura. Al reducir la letra el texto se
            // reacomoda en menos líneas, así que el alto no baja de forma lineal: se busca por bisección
            // la letra más grande que quepa (entre 50 % y 100 %).
            const tableH = () => { const m2 = measure(); return m2.rowBottom[W.rows - 1] - baseY; };
            const setScale = f => safeArea.style.setProperty('--wordy-scale', String(Math.round(1000 / f) / 1000));
            setScale(1);
            if (tableH() > SH * 1.001) {
                let lo = 0.5, hi = 1;
                for (let i = 0; i < 7; i++) {
                    const mid = (lo + hi) / 2;
                    setScale(mid);
                    if (tableH() <= SH * 1.001) lo = mid; else hi = mid;
                }
                setScale(lo);
            }
            const g = measure();

            // Punto fijo (según la fila 1 del editor)
            const top = baseY, bottom = g.rowBottom[W.rows - 1];
            let dy = 0;
            if (W.info.every(i => i.h != null)) {
                const top0 = Math.min(...W.info.map(i => i.y));
                const bot0 = Math.max(...W.info.map(i => i.y + i.h));
                const c0 = (top0 + bot0) / 2, cRef = m ? m.y + m.height / 2 : 50;
                if (Math.abs(c0 - cRef) <= PIVOT_BAND)  dy = (toPx(top0) + toPx(bot0)) / 2 - (top + bottom) / 2;
                else if (c0 > cRef)                      dy = toPx(bot0) - bottom;
            }
            dy = Math.min(Math.max(dy, -top), SH - bottom);

            cells.forEach(el => {
                const r = +el.dataset.row, c = +el.dataset.col;
                el.style.top = ((g.rowTop[r] + offs[c] + dy) / SH * 100) + '%';
            });
        }

        function _refitPanel() {
            _guardVerse();
            _layoutWordy();
            if (!window.PanelFit) return;
            if (panelLayer.dataset.auto !== '1') return;
            if (!panelLayer.classList.contains('is-visible')) return;

            const texts = _getPanelTextEls().map(_asTightEl);
            if (texts.length === 0) {
                panelLayer.style.visibility = 'hidden';
                return;
            }

            // Margen = rectángulo REAL del safeArea, relativo al stage (%).
            // Cubre ambos casos: layout con `margin` explícito, y fallback con --proy-safe-padding.
            const stageRect = stageEl.getBoundingClientRect();
            const safeRect  = safeArea.getBoundingClientRect();
            if (stageRect.width < 1 || stageRect.height < 1) return;

            const margin = {
                x:      ((safeRect.left - stageRect.left) / stageRect.width)  * 100,
                y:      ((safeRect.top  - stageRect.top)  / stageRect.height) * 100,
                width:  (safeRect.width  / stageRect.width)  * 100,
                height: (safeRect.height / stageRect.height) * 100
            };

            const pad = parseFloat(panelLayer.dataset.pad || '2');

            window.PanelFit.fitPanelToText(stageEl, panelLayer, texts, { pad, margin });
        }

        // Ajusta el rectángulo del sermón al texto real (sin depender de PanelFit).
        // Usa offsetLeft/Top/Width/Height: miden la posición FINAL del texto y no se ven
        // afectados por el transform de la animación de entrada (a diferencia de getBoundingClientRect).
        function _fitSermonPanel() {
            if (sermonPanel.dataset.auto !== '1') return;
            if (!sermon.classList.contains('is-visible')) return;
            const W = stageEl.clientWidth, H = stageEl.clientHeight;
            const w = sermon.offsetWidth,  h = sermon.offsetHeight;
            if (W < 1 || H < 1 || w < 1 || h < 1) return;

            let tl = sermon.offsetLeft, tt = sermon.offsetTop;
            if (sermon.offsetParent !== stageEl) {            // respaldo si cambia la estructura
                const s = stageEl.getBoundingClientRect(), r = sermon.getBoundingClientRect();
                tl = (r.left - s.left) * (W / s.width);
                tt = (r.top  - s.top)  * (H / s.height);
            }

            const pad = parseFloat(sermonPanel.dataset.pad || '2') / 100 * W;
            const M = sermonPanel._margin || { x: 0, y: 0, width: 100, height: 100 };
            const ml = M.x / 100 * W,  mt = M.y / 100 * H;
            const mr = ml + M.width / 100 * W,  mb = mt + M.height / 100 * H;

            const L = Math.max(tl - pad, ml),      T = Math.max(tt - pad, mt);
            const R = Math.min(tl + w + pad, mr),  B = Math.min(tt + h + pad, mb);
            if (R <= L || B <= T) { sermonPanel.style.visibility = 'hidden'; return; }

            sermonPanel.style.visibility = '';
            sermonPanel.style.left   = (L / W * 100) + '%';
            sermonPanel.style.top    = (T / H * 100) + '%';
            sermonPanel.style.width  = ((R - L) / W * 100) + '%';
            sermonPanel.style.height = ((B - T) / H * 100) + '%';
        }

        function _applySermonPanel(extra, anim) {
            const lp = extra && extra.panel;
            if (!lp) {
                sermonPanel.classList.remove('is-visible');
                sermonPanel.dataset.auto = '0';
                return;
            }
            const sp = extra.style || {};
            const op = (sp.opacity != null) ? Number(sp.opacity) : 0.5;
            // La transparencia va en el color (no en opacity) para que la animación de entrada,
            // que termina en opacity:1, no la pise.
            sermonPanel.style.background   = 'color-mix(in srgb, ' + (sp.color || '#000000') + ' ' + Math.round(op * 100) + '%, transparent)';
            sermonPanel.style.opacity      = '1';
            sermonPanel.style.borderRadius = (sp.borderRadius !== undefined ? sp.borderRadius : 1.2) + 'cqi';
            sermonPanel.dataset.pad = String(lp.pad != null ? lp.pad : 2);
            sermonPanel._margin = extra.margin || null;
            sermonPanel.style.setProperty('--sx', '0%');
            sermonPanel.style.setProperty('--sy', '0%');

            if (lp.auto === true) {
                sermonPanel.dataset.auto = '1';
                _fitSermonPanel();                    // posición final, ya desde el primer fotograma
            } else {
                sermonPanel.dataset.auto = '0';
                sermonPanel.style.left   = (lp.x      ?? 10) + '%';
                sermonPanel.style.top    = (lp.y      ?? 80) + '%';
                sermonPanel.style.width  = (lp.width  ?? 80) + '%';
                sermonPanel.style.height = (lp.height ?? 15) + '%';
                sermonPanel.style.visibility = '';
            }

            // Misma animación de entrada que el texto, para que entren juntos
            sermonPanel.className = 'proy-layer-sermon-panel';
            if (anim && anim !== 'none') {
                void sermonPanel.offsetWidth;
                sermonPanel.classList.add('sermon-anim-' + anim);
            }
            sermonPanel.classList.add('is-visible');
        }
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { _fitSermonPanel(); _layoutWordy(); _refitPanel(); });
        // Si el texto cambia de tamaño (fuente que termina de cargar, título nuevo), el rectángulo lo sigue
        if (window.ResizeObserver) new ResizeObserver(_fitSermonPanel).observe(sermon);

        // NUEVA FUNCIÓN LOCAL: No depende de 'this', así no falla en setTimeout
        function _applyAudioOutput(deviceId) {
            const target = deviceId || '';
            const vids = wrapper.querySelectorAll('video');
            vids.forEach(v => {
                if (!v.setSinkId) return;
                if (v.dataset.sinkId === target) return;
                v.dataset.sinkId = target;
                v.setSinkId(target).catch(err => {
                    console.warn('setSinkId failed for ', target, ':', err.message);
                });
            });
        }

        return {
            root: host,
            wrapper,
            stageEl,
            conector,
            controlsEl,
            labelEl,

            get lastContentType() { return _lastContentType; },

            setBackground(bg) {
                if (!bg || !bg.type) {
                    if (bgLayer.dataset.lastType === 'none') return;
                    bgLayer.dataset.lastType = 'none';
                    bgImg.classList.remove('is-active');
                    bgVideo.classList.remove('is-active');
                    try { bgVideo.pause(); } catch (_) {}
                    bgLayer.style.background = '#000';
                    bgVideo.removeAttribute('src');
                    bgVideo.load();
                    return;
                }

                if (bg.type === 'color') {
                    if (bgLayer.dataset.lastType === 'color' && bgLayer.dataset.lastValue === bg.value) return;
                    bgLayer.dataset.lastType = 'color';
                    bgLayer.dataset.lastValue = bg.value;
                    bgImg.classList.remove('is-active');
                    bgVideo.classList.remove('is-active');
                    try { bgVideo.pause(); } catch (_) {}
                    bgLayer.style.background = bg.value || '#000';
                    bgVideo.removeAttribute('src');
                    bgVideo.load();
                    return;
                }

                if (bg.type === 'image') {
                    if (bgLayer.dataset.lastType === 'image' && bgLayer.dataset.lastValue === bg.value) return;
                    bgLayer.dataset.lastType = 'image';
                    bgLayer.dataset.lastValue = bg.value;
                    bgImg.classList.remove('is-active');
                    bgVideo.classList.remove('is-active');
                    try { bgVideo.pause(); } catch (_) {}
                    bgLayer.style.background = 'transparent';
                    bgImg.onload  = () => bgImg.classList.add('is-active');
                    bgImg.onerror = () => { bgLayer.style.background = '#000'; };
                    bgImg.src = bg.value;
                    return;
                }

                if (bg.type === 'video') {
                    const spd = parseFloat(bg.speed);
                    const targetSpeed = (isFinite(spd) && spd > 0) ? spd : 1;

                    // Mismo video → solo ajustar velocidad, NO recargar
                    if (bgLayer.dataset.lastType === 'video' && bgLayer.dataset.lastValue === bg.value) {
                        if (bgVideo.playbackRate !== targetSpeed) {
                            bgVideo.playbackRate = targetSpeed;
                        }
                        return;
                    }
                    bgLayer.dataset.lastType = 'video';
                    bgLayer.dataset.lastValue = bg.value;

                    bgImg.classList.remove('is-active');
                    bgLayer.style.background = 'transparent';
                    bgVideo.onerror = () => { bgLayer.style.background = '#000'; };

                    // Aplicar velocidad cuando el navegador tenga metadata
                    const applySpeed = () => {
                        try { bgVideo.playbackRate = targetSpeed; } catch (_) {}
                    };
                    bgVideo.addEventListener('loadedmetadata', applySpeed, { once: true });

                    bgVideo.src = bg.value;
                    bgVideo.classList.add('is-active');
                    bgVideo.load();
                    bgVideo.playbackRate = targetSpeed;   // intento inmediato
                    bgVideo.play().then(applySpeed).catch(() => {});   // refuerzo al arrancar
                }
            },

            setPanel(layoutPanel, stylePanel) {
                // Si el editor no tiene panel activado en la escena actual, ocultar.
                if (!layoutPanel) {
                    panelLayer.classList.remove('is-visible');
                    panelLayer.dataset.auto = '0';
                    return;
                }

                const sp = stylePanel || {};
                const isAuto = layoutPanel.auto === true && !!window.PanelFit;

                panelLayer.dataset.auto = isAuto ? '1' : '0';
                panelLayer.dataset.pad  = String(layoutPanel.pad != null ? layoutPanel.pad : 2);
                panelLayer.style.background = sp.color   || '#000000';
                panelLayer.style.opacity    = (sp.opacity != null) ? sp.opacity : 0.5;
                panelLayer.style.borderRadius = (sp.borderRadius !== undefined ? sp.borderRadius : 1.2) + 'cqi';

                if (isAuto) {
                    // El rectángulo lo calcula _refitPanel() midiendo los textos reales.
                    // Solo limpiamos las coords estáticas para que el fit las reemplace.
                    panelLayer.style.left   = '';
                    panelLayer.style.top    = '';
                    panelLayer.style.width  = '';
                    panelLayer.style.height = '';
                    panelLayer.style.visibility = '';
                } else {
                    // Modo manual: usar coordenadas guardadas del editor.
                    panelLayer.style.left   = (layoutPanel.x      ?? 5)  + '%';
                    panelLayer.style.top    = (layoutPanel.y      ?? 36) + '%';
                    panelLayer.style.width  = (layoutPanel.width  ?? 66) + '%';
                    panelLayer.style.height = (layoutPanel.height ?? 56) + '%';
                    panelLayer.style.visibility = '';
                }

                panelLayer.classList.add('is-visible');
            },

            setLogo(logo, visible, layoutLogo) {
                const url = (logo && logo.url) || '';
                const pos = (logo && logo.position) || 'left';
                const anim = (logo && logo.animation) || 'none';
                
                // Si el layout del stage editor tiene coordenadas, las usamos
                const hasLayout = layoutLogo && layoutLogo.x != null;
                const layoutSig = hasLayout ? `${layoutLogo.x},${layoutLogo.y},${layoutLogo.width},${layoutLogo.height}` : 'none';
                const signature = visible ? `${url}|${pos}|${anim}|${layoutSig}` : '';

                // Misma firma → no reaplicar
                if (logoLayer.dataset.signature === signature) return;
                logoLayer.dataset.signature = signature;

                logoImg.classList.remove('is-active');
                logoVideo.classList.remove('is-active');
                try { logoVideo.pause(); } catch (_) {}

                if (!url || !visible) {
                    logoLayer.style.display = 'none';
                    logoVideo.removeAttribute('src');
                    logoVideo.load();
                    return;
                }

                logoLayer.style.display = 'block';
                logoLayer.style.opacity = (logo && logo.opacity !== undefined) ? logo.opacity : 1;
                
                // Aplicar posición: Layout (Stage Editor) gana sobre Modal de Capas
                if (hasLayout) {
                    logoLayer.className = 'proy-layer-logo';
                    logoLayer.style.left   = layoutLogo.x + '%';
                    logoLayer.style.top    = layoutLogo.y + '%';
                    logoLayer.style.width  = layoutLogo.width + '%';
                    logoLayer.style.height = layoutLogo.height + '%';
                } else {
                    logoLayer.className = 'proy-layer-logo pos-' + pos;
                    logoLayer.style.left   = '';
                    logoLayer.style.top    = '';
                    logoLayer.style.width  = '';
                    logoLayer.style.height = '';
                }

                const animClass = (anim && anim !== 'none') ? ' logo-anim-' + anim : '';

                const isVideo = /\.(mp4|webm|mov|mkv|avi)$/i.test(url);
                if (isVideo) {
                    logoVideo.className = 'proy-logo-video is-active' + animClass;
                    logoVideo.src = url;
                    logoVideo.play().catch(() => {});
                } else {
                    logoImg.className = 'proy-logo-image is-active' + animClass;
                    logoImg.src = url;
                }
            },

            setMarquee(cfg) {
                const d = {
                    visible: false, text: '', position: 'bottom',
                    bgColor: '#000000', color: '#ffffff', fontSize: 3, speed: 60,
                    fontFamily: "'Source Sans 3', sans-serif", fontWeight: '600',
                    durationMode: 'cycles', durationValue: 3, animation: 'slide',
                    fireAt: 0
                };
                const m = Object.assign({}, d, cfg || {});

                // Firma: solo se re-instala si algo relevante cambió (incluido fireAt)
                const sig = JSON.stringify({
                    text: m.text, visible: m.visible, speed: m.speed, position: m.position,
                    bgColor: m.bgColor, color: m.color, fontSize: m.fontSize,
                    fontFamily: m.fontFamily, fontWeight: m.fontWeight,
                    durationMode: m.durationMode, durationValue: m.durationValue,
                    animation: m.animation, fireAt: m.fireAt
                });
                if (marquee.dataset.lastSig === sig) return;
                marquee.dataset.lastSig = sig;

                // Cancelar timer previo
                if (marquee._stopTimer) {
                    clearTimeout(marquee._stopTimer);
                    marquee._stopTimer = null;
                }

                if (!m.visible || !m.text) {
                    if (marquee.classList.contains('is-visible') && !marquee.classList.contains('is-leaving')) {
                        marquee.classList.add('is-leaving');
                        setTimeout(() => {
                            marquee.classList.remove('is-visible', 'is-leaving');
                            delete marquee.dataset.anim;
                        }, 400);
                    }
                    return;
                }

                marquee.classList.remove('is-leaving');
                marquee.classList.add('is-visible');
                marquee.dataset.position = m.position;
                marquee.dataset.anim     = m.animation;
                marquee.style.background = m.bgColor;
                marquee.style.color      = m.color;
                marquee.style.fontSize   = m.fontSize + 'cqi';
                marquee.style.fontFamily = m.fontFamily || "var(--font-content, sans-serif)";
                marquee.style.fontWeight = m.fontWeight || '600';

                const track = marquee.querySelector('.proy-marquee-track');
                marqueeTxt.textContent = m.text;

                track.style.animation = 'none';
                void track.offsetWidth;

                const speedPerCycle = parseFloat(m.speed) || 60;
                const value = parseFloat(m.durationValue) || 0;

                let totalSeconds = 0;
                if (m.durationMode === 'cycles') {
                    const iter = value > 0 ? Math.floor(value) : 'infinite';
                    track.style.animation = `proyMarqueeScroll ${speedPerCycle}s linear ${iter}`;
                    totalSeconds = value > 0 ? value * speedPerCycle : 0;
                } else {
                    track.style.animation = `proyMarqueeScroll ${speedPerCycle}s linear infinite`;
                    totalSeconds = value;
                }

                // Auto-detener con salida animada
                if (totalSeconds > 0) {
                    marquee._stopTimer = setTimeout(() => {
                        if (marquee.classList.contains('is-visible') && !marquee.classList.contains('is-leaving')) {
                            marquee.classList.add('is-leaving');
                            setTimeout(() => {
                                marquee.classList.remove('is-visible', 'is-leaving');
                                delete marquee.dataset.anim;
                            }, 400);
                        }
                        marquee._stopTimer = null;
                    }, totalSeconds * 1000);
                }
            },

            setSermon(cfg, visible, layoutSermon, extra) {
                if (!cfg || !cfg.text || !visible) {
                    sermon.classList.remove('is-visible');
                    sermonPanel.classList.remove('is-visible');
                    sermon.dataset.sig = '';
                    return;
                }

                // Misma config y ya visible → no repetir (evita reiniciar la animación)
                const sig = JSON.stringify([cfg, layoutSermon, extra]);
                if (sermon.dataset.sig === sig && sermon.classList.contains('is-visible')) return;
                sermon.dataset.sig = sig;

                sermonTxt.textContent = cfg.text;
                sermon.style.background = cfg.bgColor || 'transparent';

                if (layoutSermon && layoutSermon.x != null) {
                    // Posición del editor: esquina superior izquierda
                    applyPositionXY(sermon, { ...layoutSermon, stage: true });
                    sermon.style.fontSize = (layoutSermon.fs || 3) + 'cqi';
                    if (layoutSermon.maxWidth) sermon.style.maxWidth = layoutSermon.maxWidth + '%';
                    sermon.style.setProperty('--sx', '0%');     // las animaciones no deben recentrar
                    sermon.style.setProperty('--sy', '0%');
                    // pre-wrap SOLO en el span: en el contenedor conservaría los saltos y
                    // sangrías del HTML de la plantilla (líneas en blanco y texto desplazado)
                    sermon.style.whiteSpace = 'normal';
                    sermonTxt.style.whiteSpace = 'pre-wrap';     // igual que el editor
                    sermon.style.padding = '0.2em';              // igual que el editor
                } else {
                    sermon.style.left = '50%';
                    sermon.style.top = '85%';
                    sermon.style.transform = 'translate(-50%, -50%)';
                    sermon.style.fontSize = (cfg.fontSize || 2.5) + 'cqi';
                    sermon.style.maxWidth = '';
                    sermon.style.setProperty('--sx', '-50%');
                    sermon.style.setProperty('--sy', '-50%');
                    sermon.style.whiteSpace = '';
                    sermonTxt.style.whiteSpace = '';
                    sermon.style.padding = '';
                }

                // El editor guarda fuente, peso, color y sombra del sermón en contentStyles
                // (sermonFont / sermonWeight / sermonColor / textShadow.sermon); cfg queda de respaldo.
                const cs = (extra && extra.styles) || {};
                sermon.style.color      = cs.sermonColor  || cfg.color      || '#fff';
                sermon.style.fontFamily = cs.sermonFont   || cfg.fontFamily || "var(--font-content, sans-serif)";
                sermon.style.fontWeight = cs.sermonWeight || cfg.fontWeight || '600';
                const sh = (cs.textShadow && cs.textShadow.sermon) || cfg.textShadow;
                sermon.style.textShadow = sh ? buildShadow(sh) : 'none';

                const anim = cfg.animation || 'fade-up';
                sermon.className = 'proy-layer-sermon';          // reset
                if (anim !== 'none') {
                    void sermon.offsetWidth;                      // reinicia la animación
                    sermon.classList.add('sermon-anim-' + anim);
                }
                sermon.classList.add('is-visible');               // AL FINAL

                _applySermonPanel(extra, anim);
            },

            install(content, ctxOverride, opts) {
                const shouldFade = opts === true || !!(opts && opts.fade);

                wrapper.querySelectorAll('.media-controls').forEach(el => el.remove());
                safeArea.innerHTML = '';
                safeArea.dataset.renderMode = '';
                if (!content) { _lastContentType = null; return; }

                let obj;
                if (typeof content.run === 'function') {
                    obj = content;
                } else {
                    const builder = CONTENT_RENDERERS[content.type];
                    if (!builder) {
                        safeArea.innerHTML = '<div class="proy-empty">' + setLang('str261') + content.type + '</div>';
                        return;
                    }
                    obj = builder(content.data || content);
                }

                _lastContentType = obj.type;
                obj.run(safeArea, ctxOverride || {});

                // Aplicar animaciones independientes
                if (shouldFade) {
                    if (safeArea.dataset.renderMode === 'verse-single') {
                        const s = (ctxOverride && ctxOverride.styles) || {};
                        const refEl = safeArea.querySelector('.proy-verse-ref');
                        const bodyEl = safeArea.querySelector('.proy-verse-body');
                        const verEl = safeArea.querySelector('.proy-verse-version');

                        [refEl, bodyEl, verEl].forEach(el => {
                            if (el) el.classList.remove('anim-fade', 'anim-slide-up', 'anim-zoom');
                        });

                        if (refEl && s.refAnim !== 'none') refEl.classList.add('anim-' + (s.refAnim || 'fade'));
                        if (bodyEl && s.verseAnim !== 'none') bodyEl.classList.add('anim-' + (s.verseAnim || 'fade'));
                        if (verEl && s.versionAnim !== 'none') verEl.classList.add('anim-' + (s.versionAnim || 'fade'));
                    } else {
                        // Coros y Media
                        const c = (ctxOverride && ctxOverride.customLayers) || {};
                        const tChorus = (c.transitions && c.transitions.chorus && c.transitions.chorus.type) || 'fade';
                        const tMedia = (c.transitions && c.transitions.media && c.transitions.media.type) || 'fade';

                        const textEl = safeArea.querySelector('.proy-text');
                        const mediaEl = safeArea.querySelector('.proy-media');

                        [textEl, mediaEl].forEach(el => {
                            if (el) el.classList.remove('anim-fade', 'anim-slide-up', 'anim-zoom');
                        });

                        if (textEl && tChorus !== 'none') textEl.classList.add('anim-' + tChorus);
                        if (mediaEl && tMedia !== 'none') mediaEl.classList.add('anim-' + tMedia);

                        // Wordy: cada celda entra con la transición de los coros
                        safeArea.querySelectorAll('.proy-wordy-cell').forEach(el => {
                            el.classList.remove('anim-fade', 'anim-slide-up', 'anim-zoom');
                            if (tChorus !== 'none') el.classList.add('anim-' + tChorus);
                        });
                    }
                }

                // Ajustar panel al texto real (si está en modo auto)
                _refitPanel();
                // Segundo pase después de las animaciones (por si cambian el tamaño)
                setTimeout(_refitPanel, 550);
            },

            setZoom(scale, contentType) {
                const type = contentType || _lastContentType;
                const isTransformZoom = (type === 'media');

                if (isTransformZoom) {
                    conector.style.transform = 'scale(' + scale + ')';
                    conector.style.setProperty('--proy-zoom', 1);
                } else {
                    conector.style.setProperty('--proy-zoom', scale);
                    conector.style.transform = '';
                }

                // El zoom cambia el tamaño del texto, el panel debe seguirlo.
                // Medimos ahora y también después de la transition de font-size (0.2s).
                _refitPanel();
                setTimeout(_refitPanel, 250);
            },

            setPaused(bool) {
                if (pauseOverlay) pauseOverlay.classList.toggle('active', !!bool);
                wrapper.classList.toggle('is-paused', !!bool);
            },

            applyState(state) {
                if (!state) return;

                // ---- Capas (aisladas: si fallan, el texto sigue) ----
                try {
                    if (state.customLayers) {
                        this.setBackground(state.customLayers.background);
                        this.setMarquee(state.customLayers.marquee);
                        if (state.customLayers.sermon) {
                            this.setSermon(state.customLayers.sermon, !!state.customLayers.sermon.visible,
                            state.layout ? state.layout.sermon : null,
                            { panel:  state.layout ? state.layout.sermonPanel  : null,
                              margin: state.layout ? state.layout._sermonMargin : null,
                              style:  state.customLayers.panel,
                              styles: state.contentStyles });
                        }

                        const hasRealContent = state.pendingContent
                            && state.pendingContent.placeholder !== true;
                        const layoutPanel = (hasRealContent && state.layout && state.layout.panel) || null;
                        this.setPanel(layoutPanel, state.customLayers.panel);
                    }
                } catch (e) {
                    console.error('[ProyVisor] Error en capas:', e);
                    try { bgLayer.style.background = '#000'; } catch (_) {}
                }

                // ---- Margen interno (Safe Area) ----
                if (state.layout && state.layout._margin) {
                    // El editor visual manda un rectángulo de márgenes explícito
                    const m = state.layout._margin;
                    _SAFE = m;
                    conector.style.setProperty('--proy-safe-padding', '0px'); 
                    safeArea.style.left = m.x + '%';
                    safeArea.style.top = m.y + '%';
                    safeArea.style.width = m.width + '%';
                    safeArea.style.height = m.height + '%';
                    safeArea.style.right = 'auto';
                    safeArea.style.bottom = 'auto';
                } else if (state.contentStyles) {
                    // Fallback: usar el número simple del modal de capas
                    _SAFE = null;
                    safeArea.style.left = '';
                    safeArea.style.top = '';
                    safeArea.style.width = '';
                    safeArea.style.height = '';
                    safeArea.style.right = '';
                    safeArea.style.bottom = '';
                    const pad = state.contentStyles.contentPadding ?? 2;
                    conector.style.setProperty('--proy-safe-padding', pad + 'cqi');
                }

                const contentType = state.pendingContent ? state.pendingContent.type : null;
                const contentLayer = conector.parentElement;
                if (contentLayer) {
                    contentLayer.classList.toggle('is-media', contentType === 'media');
                }

                // ---- Contenido (fade solo si cambió) ----
                const contentSig = state.pendingContent
                    ? JSON.stringify(state.pendingContent)
                    : '';
                const prevContentSig = conector.dataset.lastContentSig || '';
                const contentChanged = contentSig !== prevContentSig;

                const stylesSig = state.contentStyles
                    ? JSON.stringify(state.contentStyles)
                    : '';
                const prevStylesSig = conector.dataset.lastStylesSig || '';
                const stylesChanged = stylesSig !== prevStylesSig;

                const layoutSig = state.layout
                    ? JSON.stringify(state.layout)
                    : '';
                const prevLayoutSig = conector.dataset.lastLayoutSig || '';
                const layoutChanged = layoutSig !== prevLayoutSig;

                const needsInstall = contentChanged || !conector.firstElementChild;

                if (needsInstall) {
                    conector.dataset.lastContentSig = contentSig;
                    conector.dataset.lastStylesSig = stylesSig;
                    conector.dataset.lastLayoutSig = layoutSig;

                    const install = () => {
                        try {
                            this.install(state.pendingContent, { 
                                                                    styles: state.contentStyles, 
                                                                    layout: state.layout, 
                                                                    customLayers: state.customLayers 
                                                                }, state.fade);
                            if (state.customLayers) {
                                this.setLogo(state.customLayers.logo, !!state.logoVisible, state.layout ? state.layout.logo : null);
                            }
                        } catch (e) {
                            console.error('[ProyVisor] Error en install:', e);
                            try {
                                safeArea.innerHTML = '<div class="proy-empty">Error al renderizar</div>';
                            } catch (_) {}
                        }
                    };

                    // El fade se maneja dentro de install() por elemento (refAnim, verseAnim, versionAnim).
                    install();
                } else if (stylesChanged || layoutChanged) {
                    conector.dataset.lastStylesSig = stylesSig;
                    conector.dataset.lastLayoutSig = layoutSig;
                    try {
                        applyStylesToExistingContent(conector, state.contentStyles, state.layout);
                        _refitPanel();
                    } catch (e) {
                        console.error('[ProyVisor] Error en applyStylesToExistingContent:', e);
                    }
                } else if (state.customLayers) {
                    try {
                        this.setLogo(state.customLayers.logo, !!state.logoVisible);
                        
                        // NUEVO: Forzar la actualización del sermón si cambió su visibilidad
                        if (state.customLayers.sermon) {
                            this.setSermon(state.customLayers.sermon, !!state.customLayers.sermon.visible,
                            state.layout ? state.layout.sermon : null,
                            { panel:  state.layout ? state.layout.sermonPanel  : null,
                              margin: state.layout ? state.layout._sermonMargin : null,
                              style:  state.customLayers.panel,
                              styles: state.contentStyles });
                        }
                        // NUEVO: Forzar la actualización de la marquesina si cambió
                        if (state.customLayers.marquee) {
                            this.setMarquee(state.customLayers.marquee);
                        }
                    } catch (e) {
                        console.error('[ProyVisor] Error en setLogo/setSermon:', e);
                    }
                }

                // ---- Audio output (aplicar a todos los videos) ----
                if (state.customLayers && state.customLayers.audioOutput !== undefined) {
                    setTimeout(() => {
                        try {
                            // Llamamos a la función local _applyAudioOutput
                            _applyAudioOutput(state.customLayers.audioOutput);
                        } catch (e) {
                            console.error('[ProyVisor] Error en setAudioOutput:', e);
                        }
                    }, 50);
                }

                // ---- Zoom ----
                if (typeof state.zoomLevel === 'number') {
                    try {
                        const type = state.pendingContent ? state.pendingContent.type : null;
                        this.setZoom(state.zoomLevel / 100, type);
                    } catch (e) {
                        console.error('[ProyVisor] Error en setZoom:', e);
                    }
                }

                // ---- Pausa ----
                if (typeof state.isPaused === 'boolean') {
                    try {
                        this.setPaused(state.isPaused);
                    } catch (e) {
                        console.error('[ProyVisor] Error en setPaused:', e);
                    }
                }
            },

            // Aquí conectamos la función local con el objeto público
            setAudioOutput: _applyAudioOutput,

            clear() {
                wrapper.querySelectorAll('.media-controls').forEach(el => el.remove());
                safeArea.innerHTML = '';
                marquee.classList.remove('is-visible');
                sermon.classList.remove('is-visible');
                logoLayer.style.display = 'none';
                _lastContentType = null;
            }
        }; 
    }

    global.ProyVisor = { create: createProyStage };
})(window);