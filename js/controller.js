const ProyController = (function () {
    'use strict';

    const channels = new Map();

    function getChannel(displayId) {
        if (!channels.has(displayId)) {
            const ch = new BroadcastChannel(`zionlyrics-proyector-${displayId}`);

            // El proyector manda 'sync-request' cuando su stage está listo.
            // Si no respondemos, el mensaje 'apply' original se pierde porque
            // BroadcastChannel no encola para futuros listeners.
            ch.addEventListener('message', (e) => {
                if (e.data?.action === 'sync-request') {
                    debugLog('CTRL', 'sync-request from projector:', displayId);
                    applyOne(displayId, { fade: false });
                }
            });

            channels.set(displayId, ch);
        }
        return channels.get(displayId);
    }

    function findDisplay(displayId) {
        return state.settings.connectedDisplays.find(d => d.id === displayId);
    }

    function isWindowOpen(displayId) {
        const w = state.projectorWindows && state.projectorWindows[displayId];
        return !!(w && !w.closed);
    }

    function isOpen(displayId) {
        return isWindowOpen(displayId);
    }

    function getWrapper(displayId) {
        return $$(`.projector-thumb-wrapper[data-display-id="${displayId}"]`);
    }

    function getStage(displayId) {
        const w = getWrapper(displayId);
        return w ? w._proyStage : null;
    }

    function computeLogoVisibility(display, contentType) {
        const entry = getDisplayLayers(display);
        const logo = entry && entry.customLayers && entry.customLayers.logo;
        if (!logo || !logo.url) return false;
        if (!contentType) return false;
        const ctx = logo.contexts || { coros: false, citas: false, multimedia: false };
        let key = null;
        if (contentType === 'text') key = 'coros';
        else if (contentType === 'verse') key = 'citas';
        else if (contentType === 'wordy') key = 'citas';      // estudio de palabras: mismo contexto que las citas
        else if (contentType === 'media') key = 'multimedia';
        return key ? !!ctx[key] : false;
    }

    // ---- Sermón: estado de ejecución por monitor (en memoria; no se persiste) ----
    // visible: si el título se está mostrando · count: versículos proyectados desde la última vez que se ocultó
    const _sermonRT = new Map();
    function sermonRT(displayId) {
        let r = _sermonRT.get(displayId);
        if (!r) { r = { visible: false, count: 0 }; _sermonRT.set(displayId, r); }
        return r;
    }
    const sermonTitle = () => ((state.session && state.session.sermonTitle) || '').trim();

    // Aparición automática "cada N versículos": con N=3 se muestra en el 3.º, se oculta en el 4.º,
    // y vuelve en el 7.º (tras ocultarse deben pasar N versículos más).
    function sermonAutoTick(display, content) {
        if (!content || content.type !== 'verse') return;
        if (!sermonTitle()) return;
        const cfg = (getDisplayLayers(display).customLayers || {}).sermon || {};
        const trg = cfg.trigger || { type: 'verses', value: 3 };     // mismo valor por defecto que muestra el editor
        if (trg.type !== 'verses') return;
        const n = Math.max(1, parseInt(trg.value, 10) || 3);
        const rt = sermonRT(display.id);
        if (rt.visible) { rt.visible = false; rt.count = 0; }
        else if (++rt.count >= n) { rt.visible = true; rt.count = 0; }
    }

    function flattenLayout(entryLayout, contentType, pendingContent) {
        // Wordy: aunque el monitor nunca haya guardado el layout (o lo guardara antes de existir las
        // escenas wordy), el visor usa sus valores por defecto, así que no se devuelve null.
        if (!entryLayout && contentType === 'wordy') entryLayout = { scenes: {}, margins: {} };
        if (!entryLayout) return null;

        // Si el layout ya es plano (legacy), devolverlo tal cual
        if (!entryLayout.scenes) return entryLayout;

        let sceneKey = (contentType === 'text') ? 'coro' : 'verse';
        
        // Detectar si es multi-versículo para usar la escena correcta
        if (pendingContent && pendingContent.type === 'verse' && pendingContent.versions) {
            const len = pendingContent.versions.length;
            if (len === 2) sceneKey = 'multi2';
            if (len >= 3) sceneKey = 'multi3';
        }

        // Wordy: { type:'wordy', columns: 2|3, rows: [[c1, c2, c3?], ...] } → escena wordy2 / wordy3
        if (pendingContent && pendingContent.type === 'wordy') {
            sceneKey = pendingContent.columns === 3 ? 'wordy3' : 'wordy2';
        }

        const sceneMissing = !entryLayout.scenes[sceneKey];
        const scene = entryLayout.scenes[sceneKey] || (contentType === 'wordy' ? {} : null);
        if (!scene) return null;

        const flat = {};
        
        for (const [key, val] of Object.entries(scene)) {
            flat[key] = { ...val };
            if (flat[key].x != null && flat[key].y != null) {
                flat[key].anchor = 'top-left'; 
            }
        }
        
        // NUEVO: Aseguramos que el layout del sermón (posición y tamaño) se envíe siempre
        const sermonScene = entryLayout.scenes && entryLayout.scenes.sermon;
        if (sermonScene) {
            if (sermonScene.sermon) {
                flat.sermon = { ...sermonScene.sermon };
                if (flat.sermon.x != null && flat.sermon.y != null) flat.sermon.anchor = 'top-left';
            }
            // Rectángulo propio del título del sermón (escena "sermon" del editor)
            if (sermonScene.panel) flat.sermonPanel = { ...sermonScene.panel };
        }
        if (entryLayout.margins && entryLayout.margins.sermon) {
            flat._sermonMargin = { ...entryLayout.margins.sermon };
        }

        if (entryLayout.margins && entryLayout.margins[sceneKey]) {
            flat._margin = entryLayout.margins[sceneKey];
        } else if (entryLayout.margin) {
            flat._margin = entryLayout.margin; // Fallback legacy
        }
        // Wordy sin escena guardada: mismos valores por defecto del editor (margen y rectángulo de fondo)
        if (contentType === 'wordy') {
            if (!flat._margin) flat._margin = { x: 4, y: 4, width: 92, height: 92 };
            if (sceneMissing && !flat.panel) flat.panel = { x: 4, y: 26, width: 92, height: 24, auto: true, pad: 2 };
        }

        return flat;
    }

    function getThemeFor(sourceInfo, display) {
        if (!sourceInfo || !state.themes.length) return null;
        const a = zionLyricsObj.themeAssignments || {};
        const find = id => state.themes.find(t => t.id === id) || null;

        // 1. Singles por elemento
        if (sourceInfo.type === 'chorus' && sourceInfo.chorusId != null) {
            const id = a.chorus?.singles?.[String(sourceInfo.chorusId)];
            if (id) return find(id);
        }
        if (sourceInfo.type === 'verse' && sourceInfo.ref) {
            const id = a.verse?.singles?.[sourceInfo.ref];
            if (id) return find(id);
        }

        // 2. Grupos / rangos
        if (sourceInfo.type === 'chorus' && sourceInfo.chorusId != null) {
            const g = (a.chorus?.groups || []).find(g => g.ids.includes(sourceInfo.chorusId));
            if (g) return find(g.themeId);
        }
        if (sourceInfo.type === 'verse' && sourceInfo.ref) {
            // bookName (string, p.ej. "Juan") tiene prioridad; bookId queda como
            // fallback legacy para configs no migradas. Con biblias de orden
            // distinto (Septuaginta, TR ampliado), bookId apuntaría al libro
            // equivocado, por eso el lookup principal es por nombre.
            const bookKey = sourceInfo.bookName || sourceInfo.bookId;
            if (bookKey != null && a.verse?.books?.[String(bookKey)]) return find(a.verse.books[String(bookKey)]);
            const r = (a.verse?.ranges || []).find(r =>
                String(r.book) === String(bookKey) && r.chapter === sourceInfo.chapter &&
                sourceInfo.verse >= r.from && sourceInfo.verse <= r.to);
            if (r) return find(r.themeId);
        }

        // 3. All
        if (sourceInfo.type === 'chorus' && a.chorus?.all) return find(a.chorus.all);
        if (sourceInfo.type === 'verse'  && a.verse?.all)  return find(a.verse.all);

        // 4. Display
        if (display?.label && a.displays?.[display.label]) {
            return find(a.displays[display.label]);
        }
        return null;
    }

    function resolveLayout(theme, display) {
        const t = theme?.layout, d = display?.layout;
        if (!t && !d) return null;
        if (!t) return d;
        if (!d) return t;
        const out = {};
        ['coro','ref','verse','version','logo','panel','bg'].forEach(k => {
            if (t[k] && d[k]) out[k] = { ...d[k], ...t[k] };   // theme wins
            else if (t[k])    out[k] = { ...t[k] };
            else if (d[k])    out[k] = { ...d[k] };
        });
        return out;
    }

    function buildPayload(display, opts) {
        const entry = getDisplayLayers(display);
        const contentType = display.pendingContent ? display.pendingContent.type : null;

        // Resuelve el label guardado al deviceId actual
        const audioLabel = (entry.customLayers && entry.customLayers.audioOutputLabel) || '';
        const audioDeviceId = audioLabel ? (_audioDevicesMap[audioLabel] || '') : '';

        const theme = getThemeFor(display.pendingSourceInfo, display);
        const resolvedLayers  = theme ? { ...entry.customLayers,  ...theme.customLayers  } : entry.customLayers;
        const resolvedStyles  = theme ? { ...entry.contentStyles, ...theme.contentStyles } : entry.contentStyles;

        // El layout vive en `entry.layout` con formato { scenes, margin }.
        // Aplanamos primero el del monitor, luego el del tema (si existe), y mergeamos.
        const entryFlat = flattenLayout(entry.layout, contentType, display.pendingContent);
        const themeFlat = theme?.layout ? flattenLayout(theme.layout, contentType, display.pendingContent) : null;
        const resolvedLayout = themeFlat
            ? { ...(entryFlat || {}), ...themeFlat }
            : entryFlat;

        const styles = Object.assign({}, resolvedStyles, {
            logoPosition: (resolvedLayers && resolvedLayers.logo && resolvedLayers.logo.position) || 'left'
        });

        // --- NUEVO: Resolución automática de fuentes para versículos ---
        if (display.pendingContent && display.pendingContent.type === 'verse') {
            const lang = display.pendingContent.lang;
            const abbrev = display.pendingContent.version;

            if (window.Fonts && Fonts.resolveContentFont) {
                const autoFont = Fonts.resolveContentFont(abbrev, lang);
                // Aplicamos la fuente de la biblia y creamos el fallback con las fuentes disponibles
                if (autoFont) {
                    const stack = `"${autoFont}", var(--font-content)`;
                    if (!styles.verseFont || styles.verseFont === '')   styles.verseFont = stack;
                    if (!styles.refFont || styles.refFont === '')       styles.refFont = stack;
                    if (!styles.versionFont || styles.versionFont === '') styles.versionFont = stack;
                }
            }
        }
        // -------------------------------------------------------------
        // -------------------------------------------------------------

        // --- Resolución automática de fuentes para todos los elementos ---
        if (window.Fonts) {
            // 1. Fuente por defecto para contenido (Coros, Sermón, Marquesina, Wordy)
            const type = zionLyricsObj.typography || {};
            const defaultContentStack = (type.defaultContentFont && type.defaultContentFont !== 'auto')
                ? `"${type.defaultContentFont}", var(--font-content)`
                : `var(--font-content)`;

            ['coroFont', 'sermonFont', 'marqueeFont', 'wordy1Font', 'wordy2Font', 'wordy3Font'].forEach(k => {
                if (!styles[k] || styles[k] === '') styles[k] = defaultContentStack;
            });

            // 2. Fuente específica para Versículos (puede depender del idioma o la biblia)
            if (display.pendingContent && display.pendingContent.type === 'verse') {
                const lang = display.pendingContent.lang;
                const abbrev = display.pendingContent.version;
                const autoFont = Fonts.resolveContentFont(abbrev, lang);
                
                // Si la función devuelve una fuente (por idioma/biblia), la usamos; si no, la de contenido por defecto
                const verseStack = autoFont ? `"${autoFont}", var(--font-content)` : defaultContentStack;

                if (!styles.verseFont || styles.verseFont === '')   styles.verseFont = verseStack;
                if (!styles.refFont || styles.refFont === '')       styles.refFont = verseStack;
                if (!styles.versionFont || styles.versionFont === '') styles.versionFont = verseStack;
            }
        }
        // -------------------------------------------------------------------------

        return {
            customLayers:   Object.assign({}, resolvedLayers, {
                audioOutput: audioDeviceId,
                sermon: Object.assign({}, resolvedLayers && resolvedLayers.sermon, {
                    visible: sermonRT(display.id).visible && !!sermonTitle(),
                    text:    sermonTitle()
                })
            }),
            contentStyles:  styles,
            layout:         resolvedLayout,
            pendingContent: display.pendingContent,
            zoomLevel:      display.zoomLevel || 100,
            isPaused:       !!display.isPaused,
            logoVisible:    computeLogoVisibility(display, contentType),
            fade:           !!(opts && opts.fade)
        };
    }

    function applyToThumbnail(displayId, payload) {
        const stage = getStage(displayId);
        debugLog('CTRL', 'applyToThumbnail:', displayId, '| stage found: ', !!stage);

        if (stage && typeof stage.applyState === 'function') {
            stage.applyState(payload);
        }
    }

    function applyToProjector(displayId, payload) {
        const isOpen = isWindowOpen(displayId);
        debugLog('CTRL', 'applyToProjector:', displayId, '| window opened: ', isOpen);

        if (!isOpen) return;
        getChannel(displayId).postMessage({ action: 'apply', payload });
    }

    function applyOne(displayId, opts) {
        const display = findDisplay(displayId);
        if (!display) {
            debugLog('CTRL', 'applyOne: display not found', displayId);
            return;
        }
        debugLog('CTRL', 'applyOne:', displayId, '| pendingContent:', display.pendingContent && display.pendingContent.type);

        const payload = buildPayload(display, opts);
        applyToThumbnail(displayId, payload);
        applyToProjector(displayId, payload);
    }

    function getExtendedDisplays() {
        return (state.settings.connectedDisplays || []).filter(d => !d.isPrimary);
    }

    function validate(displayId) {
        const display = findDisplay(displayId);
        if (!display)                       return { ok: false, reason: setLang('str189') };
        if (display.isPrimary)              return { ok: false, reason: setLang('str190') };
        return { ok: true };
    }

    function attachVideoSync(displayId) {
        setTimeout(() => {
            const videoEl = $$(
                `.projector-thumb-wrapper[data-display-id="${displayId}"] #projected-media`
            );
            if (!videoEl || videoEl.tagName !== 'VIDEO') return;

            if (videoEl._handlers) {
                videoEl.removeEventListener('play',   videoEl._handlers.play);
                videoEl.removeEventListener('pause',  videoEl._handlers.pause);
                videoEl.removeEventListener('seeked', videoEl._handlers.seek);
            }

            const playH  = () => videoSync(displayId, 'play');
            const pauseH = () => videoSync(displayId, 'pause');
            const seekH  = () => videoSync(displayId, 'seek', videoEl.currentTime);

            videoEl.addEventListener('play',   playH);
            videoEl.addEventListener('pause',  pauseH);
            videoEl.addEventListener('seeked', seekH);
            videoEl._handlers = { play: playH, pause: pauseH, seek: seekH };

            videoSync(displayId, videoEl.paused ? 'pause' : 'play');
            videoSync(displayId, 'seek', videoEl.currentTime);
        }, 300);
    }

    function createThumbnail(display) {
        // Host temporal — ProyVisor inyecta visor.html completo dentro
        const host = document.createElement('div');
        const stage = ProyVisor.create(host, window.PROY_TEMPLATE_HTML);
        const wrapper = stage.wrapper;

        // Configurar wrapper
        wrapper.dataset.displayId = display.id;
        wrapper.style.setProperty('--proy-aspect', `${display.width} / ${display.height}`);
        wrapper._proyStage = stage;

        // Etiqueta
        if (stage.labelEl) stage.labelEl.textContent = display.label;

        // Estado inicial completo
        const payload = buildPayload(display, { fade: false });
        stage.applyState(payload);

        // Zoom display
        const c = stage.controlsEl;
        const zoomLevel = c ? c.querySelector('.thumb-zoom-level') : null;
        if (zoomLevel) zoomLevel.textContent = display.zoomLevel || 100;

        // Handlers
        if (c) {
            const gear  = c.querySelector('.code-btn');
            const audioBtn = c.querySelector('.thumb-audio');
            const zm    = c.querySelector('.thumb-zoom-minus');
            const zp    = c.querySelector('.thumb-zoom-plus');
            const pp    = c.querySelector('.thumb-playpause');
            const stop  = c.querySelector('.thumb-stop');

            // Ahora el engrane abre el Stage Editor visual, no el modal de capas viejo
            if (gear)  gear.onclick  = (e) => { e.stopPropagation(); window.openStageEditor(display.id); };
            if (zm) zm.onclick = (e) => { e.stopPropagation(); incrementZoom(display.id, -10); };
            if (zp) zp.onclick = (e) => { e.stopPropagation(); incrementZoom(display.id, +10); };
            if (pp)    pp.onclick    = async (e) => {
                e.stopPropagation();
                if (!isWindowOpen(display.id)) {
                    await openDisplay(display.id);
                } else {
                    togglePause(display.id);
                }
            };
            if (audioBtn) audioBtn.onclick = async (e) => {
                e.stopPropagation();
                await populateAudioOutputs();
                const entry = getDisplayLayers(display);
                const currentDevice = entry.customLayers.audioOutput || '';
                
                audioBtn.dataset.value = currentDevice;

                MultiPicker.openSingle(audioBtn, 'audio-output', (val) => {
                    const label = Object.keys(_audioDevicesMap).find(k => _audioDevicesMap[k] === val) || '';
                    entry.customLayers.audioOutput = val;
                    entry.customLayers.audioOutputLabel = label;
                    saveZionLyricsObj();
                    ProyController.applyLayers([display.id], entry.customLayers);
                }, 'audio-picker-custom');
            };
            if (stop)  stop.onclick  = (e) => { e.stopPropagation(); stopDisplay(display.id); };
        }

        return wrapper;
    }

    function renderThumbnails() {
        debugLog('CTRL', 'renderThumbnails — displays extended:', getExtendedDisplays().length);

        const container = $('projection-container');
        if (!container) return;

        // Detach handlers de videos existentes antes de destruir
        container.querySelectorAll('video').forEach(v => {
            if (v._handlers) {
                v.removeEventListener('play',   v._handlers.play);
                v.removeEventListener('pause',  v._handlers.pause);
                v.removeEventListener('seeked', v._handlers.seek);
                v._handlers = null;
            }
        });

        const extended = getExtendedDisplays();

        if (extended.length === 0) {
            container.innerHTML = `<div style="color:#aaa; text-align:center; padding:20px; font-size:14px;" data-i18n="str187"></div>`;
            return;
        }

        container.innerHTML = '';
        extended.forEach(display => {
            container.appendChild(createThumbnail(display));
        });
    }

    async function openDisplay(displayId) {
        const stack = new Error().stack.split('\n').slice(2, 6).join(' | ');
        debugLog('CTRL', 'openDisplay:', displayId, '|| STACK:', stack);

        const v = validate(displayId);
        if (!v.ok) { customAlert(v.reason); return false; }

        const display = findDisplay(displayId);

        // Confirmar si el proyector está abierto
        if (isWindowOpen(displayId)) {
            const reallyOpen = await window.electronAPI.isProjectorOpen(displayId);
            if (reallyOpen) {
                await window.electronAPI.focusProjectorWindow(displayId);
                applyOne(displayId, { fade: false });
                return true;
            }
            // Estado local desincronizado — autocorrige y sigue para reabrir
            debugLog('CTRL', 'openDisplay: local flag unsynced, autocorrected', displayId);
            if (state.projectorWindows) delete state.projectorWindows[displayId];
        }

        const result = await window.electronAPI.openProjectorWindow({
            electronInternalId: display.electronInternalId,
            displayId: display.id,
            label: display.label
        });

        if (!result || !result.success) {
            customAlert(setLang('str188'));
            return false;
        }

        if (!state.projectorWindows) state.projectorWindows = {};
        state.projectorWindows[displayId] = { isElectron: true };

        setTimeout(() => {
            // Aplica el estado actual al proyector
            applyOne(displayId, { fade: false });

            // Ahora que la ventana está abierta, promueve el pendingSourceInfo
            // a currentlyProjectingItem para activar el ripple.
            const display = findDisplay(displayId);
            if (display && display.pendingSourceInfo && !display.currentlyProjectingItem) {
                display.currentlyProjectingItem = display.pendingSourceInfo;
            }
            refreshOnAirIndicators();
        }, 300);

        return true;
    }

    async function stopDisplay(displayId) {
        const stack = new Error().stack.split('\n').slice(2, 6).join(' | ');
        debugLog('CTRL', 'stopDisplay:', displayId, '|| STACK:', stack);

        const display = findDisplay(displayId);
        const wasOpen = isWindowOpen(displayId);

        // Limpia la miniatura solo si había contenido
        if (display) {
            display.pendingContent = null;
            display.isPaused = false;
            display.currentlyProjectedMediaIndex = -1;
            display.currentlyProjectingItem = null;
            sermonRT(displayId).visible = false;
            sermonRT(displayId).count = 0;
            const ph = (display.customLayers && display.customLayers.placeholder) || null;
            display.pendingContent = (ph && ph.type === 'image' && ph.value)
                ? { type: 'media', html: `<div style="width:100%;height:100%;background:${ph.bgColor || 'transparent'};display:flex;justify-content:center;align-items:center;"><img src="${ph.value}" style="max-width:70%;max-height:70%;object-fit:contain;"></div>` }
                : { type: 'text', text: (ph && ph.value) || setLang('str136'), placeholder: true };
            applyOne(displayId, { fade: false });
        }

        // Cierra solo si había ventana
        if (wasOpen) {
            getChannel(displayId).postMessage({ action: 'close' });
            try { await window.electronAPI.closeProjectorWindow(displayId); } catch (e) {}
            if (state.projectorWindows) delete state.projectorWindows[displayId];
        }
        refreshOnAirIndicators();
    }

    async function startAll() {
        const extended = getExtendedDisplays();
        for (const disp of extended) {
            await openDisplay(disp.id);
        }
    }

    async function stopAll() {
        const ids = getExtendedDisplays()
            .filter(d => isWindowOpen(d.id))
            .map(d => d.id);
        for (const id of ids) await stopDisplay(id);
    }

    async function clearAll() {
        const ids = getExtendedDisplays().map(d => d.id);
        clear(ids);
    }

    function projectContent(displayIds, content, opts, sourceInfo) {
        debugLog('CTRL', 'projectContent:', displayIds, '| type:', content && content.type);

        const ids = Array.isArray(displayIds) ? displayIds : [displayIds];
        if (ids.length === 0) return;

        ids.forEach(displayId => {
            const display = findDisplay(displayId);
            if (!display) return;

            display.pendingContent = content;
            display.zoomLevel = 100;
            display.isPaused = false;
            display.pendingSourceInfo = sourceInfo || null;
            display.currentlyProjectingItem = isWindowOpen(displayId) ? (sourceInfo || null) : null;
            sermonAutoTick(display, content);

            const wrapper = getWrapper(displayId);
            if (wrapper) {
                const lvl = wrapper.querySelector('.thumb-zoom-level');
                if (lvl) lvl.textContent = 100;
            }

            applyOne(displayId, { fade: true });

            if (content && content.type === 'media' && /<video/i.test(content.html || '')) {
                attachVideoSync(displayId);
            }
        });

        refreshOnAirIndicators();
    }

    // ---- Wordy ----
    // Contrato del contenido (lo que debe producir la interfaz de captura):
    //   { type: 'wordy', columns: 2 | 3, rows: [ [col1, col2, col3?], ... ] }     // 1 a 3 filas
    //   col1 = palabra (hebreo / arameo / griego) · col2 = significado · col3 = referencias (opcional)
    // makeWordyContent limpia y valida: recorta espacios, descarta filas vacías, máximo 3 filas,
    // y fija 2 o 3 columnas (si no se indica, 3 solo cuando alguna fila trae la 3.ª columna).
    function makeWordyContent(data) {
        const d = data || {};
        let rows = (Array.isArray(d.rows) ? d.rows : [])
            .map(r => (Array.isArray(r) ? r : []).map(cell => String(cell == null ? '' : cell).trim()))
            .filter(r => r.some(Boolean))
            .slice(0, 3);
        if (!rows.length) return null;
        const columns = (d.columns === 2 || d.columns === 3)
            ? d.columns
            : (rows.some(r => r[2]) ? 3 : 2);
        rows = rows.map(r => Array.from({ length: columns }, (_, i) => r[i] || ''));
        const out = { type: 'wordy', columns, rows };
        if (d.fonts && typeof d.fonts === 'object') {
            const f = {};
            ['wordy1', 'wordy2', 'wordy3'].forEach(k => {
                if (typeof d.fonts[k] === 'string' && d.fonts[k]) f[k] = d.fonts[k];
            });
            if (Object.keys(f).length) out.fonts = f;
        }
        return out;
    }

    function projectWordy(displayIds, data, opts, sourceInfo) {
        const content = makeWordyContent(data);
        if (!content) return false;
        projectContent(displayIds, content, opts, sourceInfo);
        return true;
    }

    function previewWordyPayload(displayId, wordyData) {
        const display = findDisplay(displayId);
        if (!display) return null;

        const content = makeWordyContent(wordyData);
        if (!content) return null;

        const entry = getDisplayLayers(display);
        const entryFlat = flattenLayout(entry.layout, 'wordy', content);

        const styles = Object.assign({}, entry.contentStyles, {
            logoPosition: (entry.customLayers && entry.customLayers.logo && entry.customLayers.logo.position) || 'left'
        });

        if (window.Fonts) {
            Fonts.FONT_KEYS.forEach(k => {
                if (styles[k] !== undefined) styles[k] = Fonts.resolve(styles[k]);
            });
        }

        return {
            customLayers: entry.customLayers,
            contentStyles: styles,
            layout: entryFlat,
            pendingContent: content,
            zoomLevel: 100,
            isPaused: false,
            logoVisible: false,
            fade: false
        };
    }

    function pause(displayIds) { 
        setPausedState(displayIds, true);
    }

    function resume(displayIds) {
        setPausedState(displayIds, false);
    }

    function togglePause(displayIds) {
        const stack = new Error().stack.split('\n').slice(2, 6).join(' | ');
        debugLog('CTRL', 'togglePause:', displayIds, '|| STACK:', stack);

        const ids = Array.isArray(displayIds) ? displayIds : [displayIds];
        ids.forEach(displayId => {
            const display = findDisplay(displayId);
            if (!display) return;

            display.isPaused = !display.isPaused;
            applyOne(displayId, { fade: false });

            // Sincronizar el video de la miniatura con el estado de pausa.
            // Al pausar/reanudar el video de la miniatura, se dispara el evento
            // play/pause → attachVideoSync lo propaga al proyector.
            const wrapper = getWrapper(displayId);
            if (!wrapper) return;

            const video = wrapper.querySelector('#projected-media');
            if (!video || video.tagName !== 'VIDEO') return;

            if (display.isPaused && !video.paused) {
                video.pause();
            } else if (!display.isPaused && video.paused) {
                video.play().catch(() => {});
            }
        });
        refreshOnAirIndicators();
    }

    function setPausedState(displayIds, paused) {
        debugLog('CTRL', 'setPausedState:', displayIds, '→', paused);

        const ids = Array.isArray(displayIds) ? displayIds : [displayIds];
        ids.forEach(displayId => {
            const display = findDisplay(displayId);
            if (!display) return;
            display.isPaused = paused;
            applyOne(displayId, { fade: false });
        });
        refreshOnAirIndicators();
    }

    function clear(displayIds) {
        const ids = Array.isArray(displayIds) ? displayIds : [displayIds];
        ids.forEach(displayId => {
            const display = findDisplay(displayId);
            if (!display) return;
            const ph = display.customLayers && display.customLayers.placeholder;
            display.pendingContent = (ph && ph.type === 'image' && ph.value)
                ? { type: 'media', html: `<img src="${ph.value}" style="max-width:70%;max-height:70%;object-fit:contain;">` }
                : { type: 'text', text: (ph && ph.value) || setLang('str136'), placeholder: true };
            display.zoomLevel = 100;
            display.isPaused = false;
            display.currentlyProjectingItem = null;   // ← nuevo
            applyOne(displayId, { fade: true });
        });
        refreshOnAirIndicators();
    }

    function applyLayers(displayIds, layers) {
        const ids = Array.isArray(displayIds) ? displayIds : [displayIds];
        ids.forEach(displayId => {
            const display = findDisplay(displayId);
            if (!display) return;
            const entry = getDisplayLayers(display);
            entry.customLayers = Object.assign({}, entry.customLayers || {}, layers || {});
            ['background', 'logo', 'placeholder', 'marquee', 'sermon', 'audioOutput', 'audioOutputLabel'].forEach(k => {
                if (layers && layers[k] !== undefined) entry.customLayers[k] = layers[k];
            });
            applyOne(displayId, { fade: false });
        });
    }

    function applyStyles(displayIds, styles) {
        const ids = Array.isArray(displayIds) ? displayIds : [displayIds];
        ids.forEach(displayId => {
            const display = findDisplay(displayId);
            if (!display) return;
            const entry = getDisplayLayers(display);
            entry.contentStyles = Object.assign({}, entry.contentStyles || {}, styles || {});
            applyOne(displayId, { fade: false });
        });
    }

    function incrementZoom(displayId, delta) {
        const display = findDisplay(displayId);
        if (!display) return;
        setZoom(displayId, (display.zoomLevel || 100) + delta);
    }

    function setZoom(displayId, level) {
        const display = findDisplay(displayId);
        if (!display) return;
        let lvl = level;
        if (lvl < 10) lvl = 10;
        if (lvl > 500) lvl = 500;
        display.zoomLevel = lvl;
        applyOne(displayId, { fade: false });
        const wrapper = getWrapper(displayId);
        if (wrapper) {
            const lvlEl = wrapper.querySelector('.thumb-zoom-level');
            if (lvlEl) lvlEl.textContent = lvl;
        }
    }

    function videoSync(displayId, action, value) {
        if (!isWindowOpen(displayId)) return;
        getChannel(displayId).postMessage({
            action: 'video-sync',
            payload: { action, time: value, value }
        });

        // Si es play/pause desde los controles del video, sincroniza el estado
        // del display para que el indicador on-air refleje el cambio.
        if (action === 'play' || action === 'pause') {
            const display = findDisplay(displayId);
            if (display) {
                display.isPaused = (action === 'pause');
            }
            refreshOnAirIndicators();
        }
    }

    function getOnAirInfo(type) {
        const map = new Map();
        if (type === 'sermon') {
            (state.settings.connectedDisplays || []).forEach(d => {
                if (!sermonRT(d.id).visible) return;
                if (!map.has('sermon-card')) map.set('sermon-card', { monitors: [], paused: false });
                const e = map.get('sermon-card');
                e.monitors.push(d.id);
                if (d.isPaused) e.paused = true;
            });
            return map;
        }
        (state.settings.connectedDisplays || []).forEach(d => {
            const item = d.currentlyProjectingItem;
            if (!item || item.type !== type) return;
            const key = String(item.queueId);      // ← normalizar a string
            if (!map.has(key)) {
                map.set(key, { monitors: [], paused: false });
            }
            const entry = map.get(key);
            entry.monitors.push(d.id);
            if (d.isPaused) entry.paused = true;
        });
        return map;
    }

    function isOnAir(type, queueId) {
        if (type === 'sermon') {
            return (state.settings.connectedDisplays || []).some(d => sermonRT(d.id).visible);
        }
        const key = String(queueId);
        return (state.settings.connectedDisplays || []).some(d =>
            d.currentlyProjectingItem &&
            d.currentlyProjectingItem.type === type &&
            String(d.currentlyProjectingItem.queueId) === key
        );
    }

    function isPausedOnAir(type, queueId) {
        if (type === 'sermon') {
            return (state.settings.connectedDisplays || []).some(d => sermonRT(d.id).visible && d.isPaused);
        }
        const key = String(queueId);
        return (state.settings.connectedDisplays || []).some(d =>
            d.currentlyProjectingItem &&
            d.currentlyProjectingItem.type === type &&
            String(d.currentlyProjectingItem.queueId) === key &&
            d.isPaused
        );
    }

    function refreshPlayPauseButtons() {
        document.querySelectorAll('.projector-thumb-wrapper').forEach(wrapper => {
            const displayId = wrapper.dataset.displayId;
            if (!displayId) return;
            const btn = wrapper.querySelector('.thumb-playpause');
            if (!btn) return;

            const display = findDisplay(displayId);
            const isPlaying = isWindowOpen(displayId) && display && !display.isPaused;
            const mode = isPlaying ? 'pause' : 'play';

            if (btn.dataset.mode !== mode) {
                btn.dataset.mode = mode;
                const label = setLang(isPlaying ? 'str260' : 'str257');
                btn.dataset.tooltip = label;
                // Si el tooltip está visible para este botón, lo refresca
                if (window.Tooltip?.init) Tooltip.init();
            }
        });
    }

    function refreshPlayPauseButtons() {
        document.querySelectorAll('.projector-thumb-wrapper').forEach(wrapper => {
            const displayId = wrapper.dataset.displayId;
            if (!displayId) return;
            const btn = wrapper.querySelector('.thumb-playpause');
            if (!btn) return;

            const display = findDisplay(displayId);
            const isPlaying = isWindowOpen(displayId) && display && !display.isPaused;
            const mode = isPlaying ? 'pause' : 'play';

            if (btn.dataset.mode !== mode) {
                btn.dataset.mode = mode;
                const label = setLang(isPlaying ? 'str260' : 'str257');
                btn.dataset.tooltip = label;
                // Si el tooltip está visible para este botón, lo refresca
                if (window.Tooltip?.init) Tooltip.init();
            }
        });
    }

    function refreshOnAirIndicators() {
        const chorusMap = getOnAirInfo('chorus');
        const verseMap  = getOnAirInfo('verse');
        const mediaMap  = getOnAirInfo('media');
        const sermonMap = getOnAirInfo('sermon');
        const wordyMap  = getOnAirInfo('wordy');

        document.querySelectorAll('#list-cantos-top .canto-card').forEach(card => {
            const id = String(card.dataset.id);
            applyOnAirClasses(card, chorusMap.get(id));
        });

        document.querySelectorAll('#list-bibles-top .bible-card').forEach(card => {
            const id = String(card.dataset.id);
            applyOnAirClasses(card, verseMap.get(id));
        });

        document.querySelectorAll('#list-media .media-card').forEach(card => {
            const id = String(card.dataset.id);
            if (id === 'sermon-card') {
                applyOnAirClasses(card, sermonMap.get('sermon-card'));
            } else if (card.classList.contains('wordy-card')) {
                applyOnAirClasses(card, wordyMap.get(id));
            } else {
                applyOnAirClasses(card, mediaMap.get(id));
            }
        });

        refreshPlayPauseButtons();
    }

    function applyOnAirClasses(card, info) {
        card.classList.toggle('is-on-air', !!info);
        card.classList.toggle('is-paused', !!(info && info.paused));
    }

    function isProjecting() {
        return Object.values(state.projectorWindows || {})
            .some(w => w && !w.closed);
    }

    function toggleSermon(displayIds, show) {
        const ids = Array.isArray(displayIds) ? displayIds : [displayIds];
        ids.forEach(displayId => {
            const display = findDisplay(displayId);
            if (!display) return;
            const rt = sermonRT(displayId);
            rt.visible = !!show;
            rt.count = 0;                       // el conteo automático reinicia desde aquí
            applyOne(displayId, { fade: true });
        });
        refreshOnAirIndicators();
    }

    return {
        validate,
        getExtendedDisplays,
        renderThumbnails,
        isOpen,
        openDisplay,
        stopDisplay,
        startAll,
        stopAll,
        clearAll,
        projectContent,
        makeWordyContent,
        projectWordy,
        clear,
        pause,
        resume,
        togglePause,
        applyLayers,
        applyStyles,
        setZoom,
        incrementZoom,
        videoSync,
        getOnAirInfo,
        isOnAir,
        isPausedOnAir,
        refreshOnAirIndicators,
        isProjecting,
        toggleSermon,
        previewWordyPayload
    };
})();

window.ProyController = ProyController;