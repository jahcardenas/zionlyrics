
function coerceArg(val) {
    if (val === 'true') return true;
    if (val === 'false') return false;
    if (val === 'null') return null;
    if (val === 'undefined') return undefined;
    return val;
}

function getFunction(path) {
    const parts = path.split('.');
    const fnName = parts.pop();

    const context = parts.reduce(
        (obj, key) => obj?.[key],
        window
    );

    const fn = context?.[fnName];

    return {
        fn,
        context
    };
}

function setupDataFunction(e) {
    const el = e.target.closest('[data-function]');
    if (!el) return;

    const fnName = el.dataset.function;
    const { fn, context } = getFunction(fnName);

    if (typeof fn !== 'function') {
        console.warn('data-function: function not found:', fnName);
        return;
    }

    // Recoger argumentos en orden: data-function-arg1, arg2, arg3...
    const args = [];
    let i = 1;
    while (el.dataset['functionArg' + i] !== undefined) {
        args.push(coerceArg(el.dataset['functionArg' + i]));
        i++;
    }

    try {
        if (fnName.includes('.')) {
            fn.call(context, el, e, ...args);
        } else {
            fn(el, e, ...args);
        }
    } catch (err) {
        console.error('data-function: error in', fnName, err);
        return;
    }

    // Callbacks opcionales secuenciales (data-callback-function, data-callback-function2, data-callback-function3...)
    let cbIndex = '';
    let counter = 1;

    // Bucle para iterar mientras exista data-callback-function, data-callback-function2, etc.
    while (true) {
        // El primer intento busca 'callbackFunction', el segundo 'callbackFunction2', luego 'callbackFunction3', etc.
        const datasetKey = counter === 1 ? 'callbackFunction' : 'callbackFunction' + counter;
        const cbName = el.dataset[datasetKey];

        // Si ya no hay más callbacks definidos con este índice, rompemos el ciclo
        if (!cbName) break;

        const { fn: cb, context: cbContext } = getFunction(cbName);

        if (typeof cb === 'function') {
            const cbArgs = [];
            let j = 1;

            // Soporta argumentos específicos por callback (ej: data-callback-arg1 o data-callback2-arg1)
            // Aquí evaluamos el prefijo de argumentos correspondiente al índice actual
            const argPrefix = counter === 1 ? 'callbackArg' : `callback${counter}Arg`;
            
            while (el.dataset[argPrefix + j] !== undefined) {
                cbArgs.push(coerceArg(el.dataset[argPrefix + j]));
                j++;
            }

            try {
                if (cbName.includes('.')) {
                    cb.call(cbContext, el, e, ...cbArgs);
                } else {
                    cb(el, e, ...cbArgs);
                }
            } catch (err) {
                console.error(`data-function: error in callback (${datasetKey})`, cbName, err);
            }
        } else {
            console.warn(`data-function: callback function not found (${datasetKey}):`, cbName);
        }

        counter++;
    }
}

function openExternal(url) {
    if (!url) return;
    if (window.electronAPI && window.electronAPI.openExternal) {
        window.electronAPI.openExternal(url);
    } else {
        window.open(url, '_blank');
    }
}

function canOpenFilePicker() {
    if (window.electronAPI || !window.ProyController?.isProjecting?.()) {
        return true;
    }
    return false;
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);
}

function sanitizeFileName(name) {
    // Limpia caracteres problemáticos para URLs, Windows y sistemas de archivos.
    return name
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')   // prohibidos en Windows
        .replace(/#/g, '_')                        // '#' rompe las URLs (fragmento)
        .replace(/%/g, '_')                        // '%' también da problemas al no ir escaped
        .replace(/\s+/g, ' ')                      // colapsa espacios múltiples
        .trim() || 'archivo';
}

function generateUniqueFileName(originalName, lib) {
    // La biblioteca conoce los nombres ya en uso en media/.
    // Reutiliza ese índice para evitar colisiones dentro de la categoría.
    const used = new Set(lib.map(e => e.file.replace(/^media\//, '')));
    const clean = sanitizeFileName(originalName);
    if (!used.has(clean)) return clean;

    const dotIdx = clean.lastIndexOf('.');
    const base = dotIdx > 0 ? clean.substring(0, dotIdx) : clean;
    const ext  = dotIdx > 0 ? clean.substring(dotIdx)    : '';

    let counter = 1;
    let candidate;
    do {
        candidate = `${base} (${counter})${ext}`;
        counter++;
    } while (used.has(candidate));
    return candidate;
}

function detectMediaType(value) {
    if (!value) return 'color';
    if (value.startsWith('#')) return 'color';
    if (/\.(mp4|webm|mov|mkv|avi)$/i.test(value)) return 'video';
    return 'image';
}

function clearAllSelections(activeElement) {
    const panels = [
        { sel: '#list-cantos-top',    col: 'cantos' },
        { sel: '#list-cantos-bottom', col: 'cantos' },
        { sel: '#list-bibles-top',    col: 'citas'  },
        { sel: '#list-bibles-bottom', col: 'citas'  },
        { sel: '#list-media',         col: 'media'  }
    ];

    if (!activeElement) return;

    const active = panels.find(p => activeElement.closest(p.sel));
    if (!active) return;

    const clearPanel = (sel) => {
        document.querySelectorAll(
            sel + ' .media-card.active, ' +
            sel + ' .canto-card.active, ' +
            sel + ' .canto-stanza-card.active, ' +
            sel + ' .bible-card.active, ' +
            sel + ' .bible-verse-card.active'
        ).forEach(el => el.classList.remove('active'));
    };

    // 1) SIEMPRE limpiar el mismo panel (uno activo por panel)
    clearPanel(active.sel);

    // 2) Si el check está OFF, limpiar paneles de OTRAS columnas
    if (!zionLyricsObj.keepPreviousSelection) {
        panels.forEach(p => {
            if (p.col === active.col) return;
            clearPanel(p.sel);
        });
    }

    activeElement.classList.add('active');
}

function clearGroupSelection(groups) {
    if (groups.includes('cantos')) {
        document.querySelectorAll(
            '#list-cantos-top .canto-card, ' +
            '#list-cantos-bottom .canto-stanza-card'
        ).forEach(el => el.classList.remove('active'));
    }
    if (groups.includes('citas')) {
        document.querySelectorAll(
            '#list-bibles-top .bible-card, ' +
            '#list-bibles-bottom .bible-verse-card'
        ).forEach(el => el.classList.remove('active'));
    }
    if (groups.includes('multimedia')) {
        document.querySelectorAll('#list-media .media-card')
            .forEach(el => el.classList.remove('active'));
    }
}

function updateRemoveLabels() {
    const setLabel = (fnName, count) => {
        const el = document.querySelector(`[data-function="${fnName}"] span`);
        if (!el) return;
        if (count > 1) {
            el.textContent = setLang('str308').replace('{n}', count);
        } else {
            el.textContent = setLang('str4');
        }
    };

    setLabel('removeChorus', _chorusSelectedIds.size);
    setLabel('removeBible',  _bibleSelectedIds.size);
    setLabel('removeMedia',  _mediaSelectedIds.size);
}

function toggleDropdown(btn, ev) {
    const menu = btn.nextElementSibling;
    if (!menu) return;

    const current = PickerBase.getDropdown();
    const isCurrentlyOpen = current && current.menu === menu;

    closeAllDropdowns();
    if (isCurrentlyOpen) return;

    menu.classList.add('show');
    btn.classList.add('active');
    populateOutputLists();
    updateRemoveLabels();

    let arrowEl = menu.querySelector(':scope > .floating-arrow');
    if (!arrowEl) {
        arrowEl = document.createElement('div');
        arrowEl.className = 'floating-arrow';
        menu.appendChild(arrowEl);
    }

    const cleanup = PickerBase.position(btn, menu, {
        placement: 'bottom-end',
        offset: 2,
        arrow: true
    });

    PickerBase.setDropdown({ menu, anchor: btn, cleanup });
}

function closeAllDropdowns() {
    PickerBase.closeDropdowns();

    // Red de seguridad por si algún dropdown quedó huérfano
    document.querySelectorAll('.dropdown-menu.show').forEach(m => {
        m.classList.remove('show', 'arrow-top', 'arrow-bottom', 'arrow-left', 'arrow-right');
    });
    const tbBtn = $('titlebar-menu-btn');
    if (tbBtn) tbBtn.classList.remove('active');
}

function initColumnResizers() {
    const app = $('app');
    if (!app) {
        return;
    }

    app.querySelectorAll('.col-resizer').forEach((resizer) => {
        if (resizer._bound) {
            return;
        }
        resizer._bound = true;

        resizer.addEventListener('pointerdown', (e) => {
            if (e.button !== 0) return;
            const leftCol = $(resizer.dataset.left);
            const rightCol = $(resizer.dataset.right);
            if (!leftCol || !rightCol) return;

            e.preventDefault();
            resizer.setPointerCapture(e.pointerId);     // el arrastre sigue aunque el puntero salga del divisor

            // Todo en px: el par de columnas conserva su ancho total, así no hay saltos por
            // diferencias entre el % de flex-basis y el ancho real (padding, divisores, gap).
            const leftW  = leftCol.getBoundingClientRect().width;
            const rightW = rightCol.getBoundingClientRect().width;
            const total  = leftW + rightW;
            const min    = Math.max(140, app.clientWidth * 0.10);
            const startX = e.clientX;

            leftCol.style.flex  = `0 0 ${leftW}px`;
            rightCol.style.flex = `0 0 ${rightW}px`;

            resizer.classList.add('active');
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';

            const onMove = (ev) => {
                const w = Math.min(Math.max(leftW + (ev.clientX - startX), min), total - min);
                leftCol.style.flex  = `0 0 ${w}px`;
                rightCol.style.flex = `0 0 ${total - w}px`;
            };

            const onEnd = () => {
                resizer.removeEventListener('pointermove', onMove);
                resizer.removeEventListener('pointerup', onEnd);
                resizer.removeEventListener('pointercancel', onEnd);
                resizer.classList.remove('active');
                document.body.style.cursor = '';
                document.body.style.userSelect = '';

                // Pesos: solo las columnas de la MISMA fila se reparten el 100 %.
                // Con la proyección en fila aparte (arriba/abajo), col-4 conserva su peso.
                const pos  = zionLyricsObj.projectionPosition || 'inline';
                const all  = [...app.querySelectorAll('.col-panel')];
                const row  = all.filter(c => pos === 'inline' || c.id !== 'col-4');
                const widths = row.map(c => c.getBoundingClientRect().width);
                const sum = widths.reduce((a, b) => a + b, 0);
                const shares = widths.map(w => Math.round((w / sum) * 100));
                shares[shares.length - 1] += 100 - shares.reduce((a, b) => a + b, 0);

                const prev = zionLyricsObj.columnWidths || [];
                const weights = all.map((c, i) => {
                    const k = row.indexOf(c);
                    return k >= 0 ? shares[k] : (parseFloat(c.style.flex) || prev[i] || 23);
                });

                zionLyricsObj.columnWidths = weights;
                saveZionLyricsObj();
                all.forEach((col, i) => { col.style.flex = String(weights[i]); });
            };

            resizer.addEventListener('pointermove', onMove);
            resizer.addEventListener('pointerup', onEnd);
            resizer.addEventListener('pointercancel', onEnd);
        });
    });
}

function refreshResizers() {
    debugLog('LAYOUT', 'refreshResizers() called');
    const app = $('app');
    if (!app) return;

    // Limpiar resizers viejos
    app.querySelectorAll('.col-resizer, .row-resizer').forEach(r => r.remove());

    const pos = zionLyricsObj.projectionPosition || 'inline';
    const cols = [...app.querySelectorAll('.col-panel')];

    // 1. Crear resizers verticales
    // Se emparejan las columnas de la MISMA fila. Con la proyección en fila aparte (arriba/abajo),
    // col-4 se excluye de la lista: así, aunque su posición en el DOM quede en medio de las otras
    // (por cómo la deja el drag and drop), siempre hay un divisor entre cada par de columnas vecinas.
    const rowCols = pos === 'inline' ? cols : cols.filter(c => c.id !== 'col-4');
    rowCols.forEach((col, i) => {
        if (i < rowCols.length - 1) {
            const nextCol = rowCols[i + 1];
            const resizer = document.createElement('div');
            resizer.className = 'col-resizer';
            resizer.dataset.left = col.id;
            resizer.dataset.right = nextCol.id;
            resizer.setAttribute('data-i18n-tooltip', 'str296');
            col.after(resizer);
        }
    });

    // 2. Crear resizer horizontal (solo en modos bottom/top)
    if (pos !== 'inline') {
        const rowResizer = document.createElement('div');
        rowResizer.className = 'row-resizer';
        
        // Insertarlo exactamente entre las 3 columnas y la columna 4
        if (pos === 'bottom') {
            const col3 = $('col-3');
            if (col3) col3.after(rowResizer);
        } else if (pos === 'top') {
            const col4 = $('col-4');
            if (col4) col4.after(rowResizer);
        }

        // Eventos de arrastre del divisor horizontal
        rowResizer.addEventListener('pointerdown', (e) => {
            if (e.button !== 0) return;
            const col4 = $('col-4');
            if (!col4) return;
            e.preventDefault();
            rowResizer.setPointerCapture(e.pointerId);

            // El % de --layout-projection-row es del ÁREA ÚTIL de #app (sin su padding)
            const cs = getComputedStyle(app);
            const H  = app.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
            const rz = rowResizer.getBoundingClientRect().height;
            const startY  = e.clientY;
            const startPx = col4.getBoundingClientRect().height;
            const minPx   = Math.max(120, H * 0.15);        // alto mínimo de cada fila
            const maxPx   = H - rz - minPx;
            const sign    = pos === 'bottom' ? -1 : 1;

            rowResizer.classList.add('active');
            document.body.style.cursor = 'row-resize';
            document.body.style.userSelect = 'none';

            const onMove = (ev) => {
                const px = Math.min(Math.max(startPx + sign * (ev.clientY - startY), minPx), maxPx);
                document.documentElement.style.setProperty('--layout-projection-row', (px / H * 100) + '%');
            };
            const onEnd = () => {
                rowResizer.removeEventListener('pointermove', onMove);
                rowResizer.removeEventListener('pointerup', onEnd);
                rowResizer.removeEventListener('pointercancel', onEnd);
                rowResizer.classList.remove('active');
                document.body.style.cursor = '';
                document.body.style.userSelect = '';

                // Guardar la nueva altura en el objeto persistente
                const currentPct = document.documentElement.style.getPropertyValue('--layout-projection-row') || '40%';
                zionLyricsObj.projectionHeight = currentPct;
                saveZionLyricsObj();
            };
            rowResizer.addEventListener('pointermove', onMove);
            rowResizer.addEventListener('pointerup', onEnd);
            rowResizer.addEventListener('pointercancel', onEnd);
        });
    }

    initColumnResizers();
    
    if (typeof applyTranslations === 'function') applyTranslations(app);
    if (window.Tooltip && typeof Tooltip.init === 'function') Tooltip.init();
}

function applyThemeChange(shouldToggle) {
    const root = document.documentElement;
    let isDark;

    if (shouldToggle === true) {
        // Toggle manual: cambia el tema actual, pero NO se persiste.
        // El próximo cambio del sistema lo sobreescribe.
        isDark = root.getAttribute('data-theme') !== 'dark';
    } else {
        // Arranque: siempre sigue al sistema
        isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    }

    root.setAttribute('data-theme', isDark ? 'dark' : 'light');
    updateThemeIcon(isDark);
}

function rippleToggleTheme(el, ev) {
    const rect = el?.getBoundingClientRect?.() || null;
    const cx = rect
        ? rect.left + rect.width  / 2
        : (typeof ev?.clientX === 'number' ? ev.clientX : window.innerWidth  / 2);
    const cy = rect
        ? rect.top  + rect.height / 2
        : (typeof ev?.clientY === 'number' ? ev.clientY : window.innerHeight / 2);

    const maxRadius = Math.hypot(
        Math.max(cx, window.innerWidth  - cx),
        Math.max(cy, window.innerHeight - cy)
    );

    const root = document.documentElement;
    const targetIsDark = root.getAttribute('data-theme') !== 'dark';

    // Detectar modal abierto (top del stack). Si lo hay, le damos nombre
    // propio para que participe en la transición. Si no, solo titlebar+app.
    const topModal = window.ModalManager?.getTop?.();
    const modalOverlay = topModal ? topModal.modalEl : null;
    if (modalOverlay) modalOverlay.classList.add('theme-ripple-active');

    root.classList.add('theme-transitioning');
    void document.body.offsetHeight;

    const transition = document.startViewTransition(() => {
        root.setAttribute('data-theme', targetIsDark ? 'dark' : 'light');
        //localStorage.setItem('zion_theme', targetIsDark ? 'dark' : 'light');
    });

    transition.ready.then(() => {
        const keyframes = {
            clipPath: [
                `circle(0px at ${cx}px ${cy}px)`,
                `circle(${maxRadius}px at ${cx}px ${cy}px)`
            ]
        };
        const options = {
            duration: 600,
            easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
            fill: 'forwards'
        };

        document.documentElement.animate(keyframes, {
            ...options,
            pseudoElement: '::view-transition-new(theme-titlebar)'
        });
        document.documentElement.animate(keyframes, {
            ...options,
            pseudoElement: '::view-transition-new(theme-app)'
        });
        if (modalOverlay) {
            document.documentElement.animate(keyframes, {
                ...options,
                pseudoElement: '::view-transition-new(theme-modal-open)'
            });
        }
    });

    transition.finished.finally(() => {
        root.classList.remove('theme-transitioning');
        if (modalOverlay) modalOverlay.classList.remove('theme-ripple-active');
        updateThemeIcon(targetIsDark);
    });
}

function updateThemeIcon(isDark) {
    const icon = $$('#app-menu [data-lucide], #app-menu > div > svg');
    if (icon) icon.setAttribute('data-lucide', isDark ? 'moon' : 'sun');
    if (typeof createIcons === 'function') createIcons();
}

function toggleTheme(el, ev, shouldToggle = true) {
    if (shouldToggle === true && document.startViewTransition && ev) {
        rippleToggleTheme(el, ev);
        return;
    }
    applyThemeChange(shouldToggle);
    updateThemeIcon(document.documentElement.getAttribute('data-theme') === 'dark');
}

function openAppMenu(el, ev) {
    const menu = $('app-menu');
    const isOpen = menu.classList.contains('show');
    const fromTitlebar = el && el.id === 'titlebar-menu-btn';
    const alreadyFromTitlebar = menu.dataset.openedFrom === 'titlebar';

    if (isOpen && fromTitlebar === alreadyFromTitlebar) {
        closeAllDropdowns();
        return;
    }

    closeAllDropdowns();

    let arrowEl = menu.querySelector(':scope > .floating-arrow');
    if (!arrowEl) {
        arrowEl = document.createElement('div');
        arrowEl.className = 'floating-arrow';
        menu.appendChild(arrowEl);
    }

    menu.classList.add('show');

    if (fromTitlebar) {
        menu.dataset.openedFrom = 'titlebar';
        el.classList.add('active');
        arrowEl.style.display = '';

        const cleanup = PickerBase.position(el, menu, {
            placement: 'bottom-end',
            offset: 8,
            arrowEl
        });
        PickerBase.setAppMenu({ menu, anchor: el, cleanup });
    } else {
        menu.dataset.openedFrom = 'context';
        arrowEl.style.display = 'none';

        const virtualAnchor = {
            getBoundingClientRect: () => ({
                width: 0, height: 0,
                x: el.x, y: el.y,
                top: el.y, left: el.x,
                right: el.x, bottom: el.y
            })
        };

        // Detectar si el cursor está en la mitad derecha de la pantalla.
        // Si sí, alinear el menú por la derecha (extendiéndolo hacia la izquierda).
        const isRightSide = el.x > (window.innerWidth / 2);
        const placement   = isRightSide ? 'bottom-end' : 'bottom-start';

        const cleanup = PickerBase.position(virtualAnchor, menu, {
            placement,
            offset: 0,
            arrowEl: null,
            fallbackPlacements: ['top-end', 'top-start', 'top']
        });
        PickerBase.setAppMenu({ menu, anchor: null, cleanup });
    }
}

function checkForUpdates(el, ev) {
    closeAllDropdowns();
    customAlert(setLang('str999'));
}

async function requestQuit(el, ev, reloadOnly = false) {
    closeAllDropdowns();
    if (_quitInProgress) return;
    _quitInProgress = true;

    try {
        // 1) Cambios pendientes en modales (DataBinding)
        if (window.DataBinding && DataBinding.hasChanges()) {
            const response = await customConfirm(
                setLang('str253').replace('{n}', reloadOnly ? setLang('str254') : setLang('str255'))
            );
            if (response) {
                DataBinding.commitEdit();
                DataBinding.unwatch();
                saveZionLyricsObj();
            } else {
                DataBinding.cancelEdit();
                DataBinding.unwatch();
                saveZionLyricsObj();
            }
        }

        // 2) Sesión con contenido
        const queueCount = state.session
            ? (state.session.queue.choruses.length
             + state.session.queue.bibles.length
             + state.session.queue.media.length)
            : 0;

        const hasSermon   = !!(state.session?.sermonTitle && state.session.sermonTitle.trim());
        const hasWordies  = !!(state.session?.wordies && state.session.wordies.length > 0);

        // itemCount: solo "ítems" (coros/citas/media) para el mensaje con conteo.
        // hasContent: cualquier cosa que amerite preguntar (ítems + título + wordies).
        const itemCount  = queueCount;
        const hasContent = queueCount > 0 || hasSermon || hasWordies;

        if (hasContent) {
            const message = queueCount > 0
                ? setLang(reloadOnly ? 'str316' : 'str317').replace('{n}', queueCount)
                : setLang(reloadOnly ? 'str325' : 'str326');

            const choice = await customConfirm(
                message,
                {
                    triple:      true,
                    yesLabel:    setLang('str318'), // "Guardar"
                    noLabel:     setLang('str319'), // "No guardar"
                    cancelLabel: setLang('str27')   // "Cancelar"
                }
            );

            if (choice === false) {           // Cancelar → no salir / no recargar
                _quitInProgress = false;
                return;
            }

            if (choice === true) {            // Sí, guardar y salir → flush + persistir
                await forceFlushSession();
            } else if (choice === 'no') {     // No, no guardar nada → limpiar la sesión
                await clearActiveSession();
            }
        } else {
            await forceFlushSession();
        }

        _allowUnload = true;
        if (reloadOnly === false) {
            if (window.electronAPI && window.electronAPI.quitApp) {
                window.electronAPI.quitApp();
            } else {
                window.close();
            }
        } else {
            window.electronAPI.reloadApp();
        }
    } catch (err) {
        // Si algo falla, resetea el flag para no bloquear futuros intentos
        _quitInProgress = false;
        console.error('requestQuit failed:', err);
    }
}

function populateOutputLists() {
    document.querySelectorAll('.dd-output-list').forEach(el => el.innerHTML = '');
    
    const displays = state.settings.connectedDisplays.filter(d => !d.isPrimary);
    if (displays.length === 0) {
        document.querySelectorAll('.dd-output-list').forEach(el => {
            el.innerHTML = '<div class="dd-item dd-disabled" style="opacity:0.5; pointer-events:none;">No hay monitores extendidos</div>';
        });
        return;
    }

    displays.forEach(d => {
        const iconType = getMonitorIconType(d.label);
        const iconSvg = MONITOR_ICON_SVGS[iconType] || MONITOR_ICON_SVGS.monitor;
        
        const itemHTML = `
            <div class="dd-item dd-output-item" data-display-id="${d.id}" data-function="toggleOutputTarget" data-function-arg1="${d.id}">
                ${iconSvg}
                <span style="flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(d.label)}</span>
                <span class="dd-output-check" style="display:none; color:var(--active-border);"><i data-lucide="check"></i></span>
            </div>
        `;
        
        ['choruses', 'bibles', 'media'].forEach(group => {
            const listEl = $(`${group}-output-list`);
            if (!listEl) return;
            listEl.insertAdjacentHTML('beforeend', itemHTML);
            
            // Marcar si ya estaba seleccionado
            if (state.outputTargets[group] && state.outputTargets[group].includes(d.id)) {
                const lastItem = listEl.lastElementChild;
                lastItem.querySelector('.dd-output-check').style.display = 'block';
                lastItem.classList.add('active');
            }
        });
    });
    if (typeof createIcons === 'function') createIcons();
}

function toggleOutputTarget(el, ev, displayId) {
    if (!el) return;
    const list = el.closest('.dd-output-list');
    if (!list) return;

    const group = list.id.replace('-output-list', '');
    if (!state.outputTargets[group]) state.outputTargets[group] = [];

    const idx = state.outputTargets[group].indexOf(displayId);
    const check = el.querySelector('.dd-output-check');

    if (idx > -1) {
        state.outputTargets[group].splice(idx, 1);
        el.classList.remove('active');
        if (check) check.style.display = 'none';
    } else {
        state.outputTargets[group].push(displayId);
        el.classList.add('active');
        if (check) check.style.display = 'block';
    }
    persistSession();
}

function switchTab(el, ev, tabId) {
    document.querySelectorAll('#opciones-modal .modal-tab').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('#opciones-modal .tab-content').forEach(el => el.classList.remove('active'));

    const tabEl = document.querySelector(`#opciones-modal .modal-tab[data-tab="${tabId}"]`);
    if (tabEl) tabEl.classList.add('active');
    const contentEl = document.getElementById(tabId);
    if (contentEl) contentEl.classList.add('active');

    // Timer del grid de monitores: solo activo mientras el tab está visible
    if (tabId === 'tab-monitores') {
        renderAdminMonitors();
        startAdminMonitorsTimer();
    } else {
        stopAdminMonitorsTimer();
    }
    if (tabId === 'tab-opciones') {
        DataBinding.read('#opciones-modal', zionLyricsObj);
    }
    if (tabId === 'tab-cantos') {
        _chorusFilterTipos.clear();
        _chorusFilterTonos.clear();
        const filterInput = $('admin-text-filter');
        if (filterInput) filterInput.value = '';
        renderAdminFilterTags();
        adminSelectedId = null;
        renderAdminCoros();
    }
    if (tabId === 'tab-biblias') {
        renderAdminBibles();
    }
    if (tabId === 'tab-fuentes') {
        renderAdminFonts();
    }
    if (tabId === 'tab-idiomas') {
        renderAdminLanguages();
    }
}

async function populateAboutModal() {
    const info = await window.electronAPI.getPackageInfo();

    // Versión
    $('about-version').textContent = info.version || '';

    // Descripción
    if (info.description) {
        $('about-description').textContent = info.description;
    }

    // Autor
    const authorName = typeof info.author === 'string'
        ? info.author
        : (info.author && info.author.name) || '';
    $('about-author-name').textContent = authorName || 'Anónimo';

    // Copyright (año actual)
    const year = new Date().getFullYear();
    $('about-copyright').textContent = `© ${year} ${authorName}`;

    // Links
    const links = {
        license:    info.license ? `https://polyformproject.org/licenses/noncommercial/1.0.0` : null,
        repository: info.repository && info.repository.url ? info.repository.url.replace(/\.git$/, '') : null,
        bugs:       info.bugs && info.bugs.url ? info.bugs.url : null,
        funding:    info.funding && info.funding.url ? info.funding.url : null
    };

    document.querySelectorAll('.about-link').forEach(el => {
        const key = el.dataset.link;
        const url = links[key];
        if (!url) {
            el.style.display = 'none';
            return;
        }
        el.onclick = (e) => {
            e.stopPropagation();
            openExternal(url);
        };
    });
}

function hideSplash() {
    const splash = $('splash-screen');

    // El atributo se quita SIEMPRE, con o sin splash en el DOM
    document.documentElement.removeAttribute('data-loading');

    if (!splash) return;

    splash.classList.add('hiding');
    //splash.style.display = 'none';

    // Elimina del DOM tras la animación (con red de seguridad)
    setTimeout(() => {
        const el = $('splash-screen');
        if (el) el.remove();
    }, 1500);
}

function validateJson(data, validators) {
    for (const fn of validators) {
        if (typeof fn === 'function' && fn(data)) {
            return { ok: true, matchedBy: fn };
        }
    }
    return { ok: false };
}

function toggleLayoutEditMode() {
    const isEditing = document.body.classList.toggle('is-editing-layout');
    
    if (isEditing) {
        initLayoutDragging();
    } else {
        saveLayoutOrder();
        
        // Destruir la instancia de Sortable para que no siga interceptando
        // el mousedown izquierdo de los resizers.
        const app = $('app');
        if (app && app._sortable) {
            app._sortable.destroy();
            app._sortable = null;
            debugLog('LAYOUT', 'Sortable instance destroyed');
        }
        
        refreshResizers();
    }
}

function toggleLayoutOrientation() {
    const app = $('app');
    const isVerticalNow = app.classList.contains('layout-vertical');
    
    if (isVerticalNow) {
        app.classList.remove('layout-vertical');
        zionLyricsObj.layoutOrientation = 'horizontal';
    } else {
        app.classList.add('layout-vertical');
        zionLyricsObj.layoutOrientation = 'vertical';
    }
    saveZionLyricsObj();
}

function restoreDefaultLayout() {
    // 1. Restaurar orden horizontal predeterminado
    zionLyricsObj.columnOrder = ['col-1', 'col-2', 'col-3', 'col-4'];
    
    // 2. Restaurar anchos proporcionales por defecto (aprox 25% cada uno)
    zionLyricsObj.columnWidths = [25, 25, 25, 25];

    // 3. Restaurar modo de proyección (inline)
    zionLyricsObj.projectionPosition = 'inline';
    const app = $('app');
    if (app) {
        app.classList.remove('layout-projection-bottom', 'layout-projection-top');
    }

    // 4. Reordenar el DOM real
    if (app) {
        zionLyricsObj.columnOrder.forEach(id => {
            const el = $(id);
            if (el) app.appendChild(el);
        });

        // 5. Reaplicar los flex inline a las columnas
        const cols = app.querySelectorAll('.col-panel');
        cols.forEach((col, i) => {
            col.style.flex = String(zionLyricsObj.columnWidths[i]);
        });
    }

    // 6. Guardar en disco y notificar
    saveZionLyricsObj();
    
    // 7. (Opcional) Reiniciar la instancia de Sortable para que tome el nuevo orden
    if (app && app._sortable) {
        app._sortable.destroy();
        app._sortable = null;
        initLayoutDragging();
    }
    
    debugLog('LAYOUT', 'Default layout restored');
}

function initLayoutDragging() {
    const app = $('app');
    if (app._sortable) return; // Evitar doble instancia

    if (!window.Anim?.Sortable) {
        console.warn('initLayoutDragging: SortableJS no disponible');
        return;
    }

    app._sortable = window.Anim.Sortable.create(app, {
        animation: 150,
        handle: '.drag-grip',
        filter: '.col-resizer',
        ghostClass: 'col-ghost',
        forceFallback: true,
        fallbackClass: 'col-drag-fallback',
        fallbackOnBody: true,
        fallbackTolerance: 5,
        
        onStart: (evt) => {
            app._prevPos = zionLyricsObj.projectionPosition || 'inline';
            // Detectar posición en toda la ventana si estamos arrastrando col-4
            if (evt.item.id === 'col-4') {
                app._onDragMove = (e) => {
                    const rect = app.getBoundingClientRect();
                    const y = e.clientY - rect.top;
                    const zoneTop = rect.height * 0.20;
                    const zoneBottom = rect.height * 0.80;

                    if (y < zoneTop) {
                        app.classList.add('layout-projection-top');
                        app.classList.remove('layout-projection-bottom');
                    } else if (y > zoneBottom) {
                        app.classList.add('layout-projection-bottom');
                        app.classList.remove('layout-projection-top');
                    } else {
                        app.classList.remove('layout-projection-top', 'layout-projection-bottom');
                    }
                };
                document.addEventListener('mousemove', app._onDragMove);
            }
        },

        onMove: (evt) => {
            // Solo evaluamos zonas verticales si estamos arrastrando la columna 4
            if (evt.dragged.id !== 'col-4') return true;

            const rect = app.getBoundingClientRect();
            const y = evt.originalEvent ? evt.originalEvent.clientY : evt.clientY;
            const relY = y - rect.top;
            
            const zoneTopPx = rect.height * 0.20;
            const zoneBottomPx = rect.height * 0.80;

            // Aplicamos clases en vivo para que la columna haga el "hueco"
            if (relY < zoneTopPx) {
                app.classList.add('layout-projection-top');
                app.classList.remove('layout-projection-bottom');
            } else if (relY > zoneBottomPx) {
                app.classList.add('layout-projection-bottom');
                app.classList.remove('layout-projection-top');
            } else {
                app.classList.remove('layout-projection-top', 'layout-projection-bottom');
            }
            return true;
        },

        onEnd: (evt) => {
            if (app._onDragMove) {
                document.removeEventListener('mousemove', app._onDragMove);
                app._onDragMove = null;
            }

            let finalPos = app._prevPos;
            if (evt.item.id === 'col-4' && !evt.canceled) {
                if (app.classList.contains('layout-projection-top')) finalPos = 'top';
                else if (app.classList.contains('layout-projection-bottom')) finalPos = 'bottom';
                else finalPos = 'inline';
            }

            if (evt.canceled) {
                app.classList.remove('layout-projection-top', 'layout-projection-bottom');
                if (app._prevPos === 'top') app.classList.add('layout-projection-top');
                if (app._prevPos === 'bottom') app.classList.add('layout-projection-bottom');
            } else {
                app.classList.toggle('layout-projection-bottom', finalPos === 'bottom');
                app.classList.toggle('layout-projection-top', finalPos === 'top');
                zionLyricsObj.projectionPosition = finalPos;
            }

            const resizers = app.querySelectorAll('.col-resizer');
            resizers.forEach(r => r.remove());
            
            const newOrder = [...app.querySelectorAll('.col-panel')].map(c => c.id);
            zionLyricsObj.columnOrder = newOrder;
            
            saveZionLyricsObj();
            refreshResizers();
        }
    });
}

function saveLayoutOrder() {
    if (typeof createIcons === 'function') createIcons();
}

/*function renderAdminLanguages() {
    const container = $('admin-languages-rows');
    if (!container) return;
    container.innerHTML = '';

    const locales = state.availableLocales || [];
    if (locales.length === 0) {
        container.innerHTML = `<div class="app-card-empty">${setLang('str362')}</div>`; // "No hay idiomas cargados."
        return;
    }

    if (!zionLyricsObj.typography) {
        zionLyricsObj.typography = { uiFont: 'auto', defaultContentFont: 'auto', languageFonts: {}, bibleFonts: {} };
    }
    const typography = zionLyricsObj.typography;
    const currentLangId = zionLyricsObj.currentLocale.id;

    locales.forEach(loc => {
        const isDefault = loc.id === currentLangId;
        const assignedFont = typography.languageFonts[loc.label] || 'auto';
        //const langLabel = state.availableLocales.find(l => l.id === localeId);

        const card = document.createElement('div');
        card.className = 'monitor-card app-card';

        const iconWrap = document.createElement('div');
        iconWrap.className = 'monitor-card-icon';
        iconWrap.innerHTML = '<i data-lucide="languages"></i>';

        const body = document.createElement('div');
        body.className = 'chorus-card-body';

        const title = document.createElement('div');
        title.className = 'lang-card-title';
        title.textContent = loc.label;

        const meta = document.createElement('div');
        meta.className = 'chorus-card-meta';
        
        const fontBtn = document.createElement('div');
        fontBtn.className = 'code-btn code-btn-primary';
        fontBtn.style.height = '24px';
        
        const btnText = assignedFont === 'auto' ? setLang('str363') : escapeHtml(assignedFont); // "Fuente Automática"
        fontBtn.innerHTML = `<i data-lucide="type" style="width:14px;height:14px;"></i> <span>${btnText}</span>`;
        
        fontBtn.onclick = (e) => {
            e.stopPropagation();
            openLanguageFontPicker(fontBtn, loc.label);
        };
        meta.appendChild(fontBtn);

        const setDefault = document.createElement('div');
        setDefault.className = 'lang-card-add';
        setDefault.innerHTML = `<i data-lucide="circle-check"></i>`;
        setDefault.setAttribute('data-tooltip', setLang('str368'));
        setDefault.onclick = (e) => {
            e.stopPropagation();
            setLocale(loc.id);
            isDefault = true;
        };


        body.appendChild(title);
        body.appendChild(meta);
        body.appendChild(setDefault);

        const actions = document.createElement('div');
        actions.style.cssText = 'display:flex; align-items:center; gap:8px; flex-shrink:0;';

        if (!isDefault) {
            const makeDefaultBtn = document.createElement('div');
            makeDefaultBtn.className = 'code-btn code-btn-primary chorus-card-add';
            makeDefaultBtn.innerHTML = `<span>${setLang('str304')}</span>`; // "Hacer predeterminada"
            makeDefaultBtn.onclick = async (e) => {
                e.stopPropagation();
                await setLanguage(loc.id); 
                renderAdminLanguages(); 
                DataBinding.read('#opciones-modal', zionLyricsObj);
            };
            actions.appendChild(makeDefaultBtn);
        } else {
            const badge = document.createElement('div');
            badge.style.cssText = 'color: var(--active-border); display:flex; align-items:center;';
            badge.innerHTML = '<i data-lucide="check-circle" style="width:18px; height:18px;"></i>';
            actions.appendChild(badge);
        }

        card.appendChild(iconWrap);
        card.appendChild(body);
        card.appendChild(actions);
        container.appendChild(card);
    });

    createIcons();
    applyTranslations(container);
}*/

function renderAdminLanguages() {
    const container = $('admin-languages-rows');
    if (!container) return;
    container.innerHTML = '';

    const locales = state.availableLocales || [];
    if (locales.length === 0) {
        container.innerHTML = `<div class="app-card-empty">${setLang('str362')}</div>`;
        return;
    }

    if (!zionLyricsObj.typography) {
        zionLyricsObj.typography = { uiFont: 'auto', defaultContentFont: 'auto', languageFonts: {}, bibleFonts: {} };
    }
    const typography = zionLyricsObj.typography;
    
    // AHORA currentLocale es un string directo
    const currentLangId = zionLyricsObj.currentLocale;

    locales.forEach(loc => {
        const isDefault = loc.id === currentLangId;
        const assignedFont = typography.languageFonts[loc.label] || 'auto';

        const card = document.createElement('div');
        card.className = 'chorus-card app-card';

        const iconWrap = document.createElement('div');
        iconWrap.className = 'monitor-card-icon';
        iconWrap.innerHTML = '<i data-lucide="languages"></i>';

        const body = document.createElement('div');
        body.className = 'chorus-card-body';

        const title = document.createElement('div');
        title.className = 'lang-card-title';
        title.textContent = loc.label;

        const meta = document.createElement('div');
        meta.className = 'chorus-card-meta';
        
        // Tag verde si es predeterminado
        /*if (isDefault) {
            const b = document.createElement('span');
            b.className = 'monitor-type-badge';
            b.style.background = 'rgba(22, 163, 74, 0.13)';
            b.style.color = '#16a34a';
            b.textContent = setLang('str265'); // "Predeterminada"
            meta.appendChild(b);
        }*/

        // Botón de fuente
        const fontBtn = document.createElement('div');
        fontBtn.className = 'code-btn code-btn-primary';
        fontBtn.style.height = '24px';
        const btnText = assignedFont === 'auto' ? setLang('str363') : escapeHtml(assignedFont);
        fontBtn.innerHTML = `<i data-lucide="type" style="width:14px;height:14px;"></i> <span>${btnText}</span>`;
        fontBtn.onclick = (e) => {
            e.stopPropagation();
            openLanguageFontPicker(fontBtn, loc.label);
        };
        meta.appendChild(fontBtn);

        body.appendChild(title);
        body.appendChild(meta);

        const actions = document.createElement('div');
        actions.style.cssText = 'display:flex; align-items:center; gap:8px; flex-shrink:0;';

        // Lógica de los Checks
        if (isDefault) {
            // Check azul fijo
            const defaultCheck = document.createElement('div');
            defaultCheck.style.cssText = 'color: var(--active-border); display: flex; align-items: center; padding: 4px;';
            defaultCheck.innerHTML = '<i data-lucide="check-circle" style="width:22px; height:22px;"></i>';
            actions.appendChild(defaultCheck);
        } else {
            // Check gris hover-only (sin fondo ni bordes)
            const setDefaultBtn = document.createElement('div');
            setDefaultBtn.className = 'chorus-card-add';
            // Forzamos que el fondo sea transparente y no tenga bordes
            setDefaultBtn.style.cssText = 'color: var(--text-muted); display: flex; align-items: center; padding: 4px; background: transparent !important; border: none !important; box-shadow: none !important; cursor: pointer;';
            setDefaultBtn.innerHTML = '<i data-lucide="check-circle" style="width:22px; height:22px;"></i>';
            setDefaultBtn.setAttribute('data-i18n-tooltip', 'str368'); // "Hacer predeterminado"
            
            setDefaultBtn.onclick = (e) => {
                e.stopPropagation();
                setLocale(loc.id); 
                renderAdminLanguages(); 
                DataBinding.read('#opciones-modal', zionLyricsObj);
            };
            actions.appendChild(setDefaultBtn);
        }

        card.appendChild(iconWrap);
        card.appendChild(body);
        card.appendChild(actions);
        container.appendChild(card);
    });

    if (typeof createIcons === 'function') createIcons();
    applyTranslations(container);
}

function openLanguageFontPicker(anchorEl, languageLabel) {
    const typography = zionLyricsObj.typography || {};
    const current = typography.languageFonts[languageLabel] || 'auto';

    let itemsHtml = `<div class="sp-item ${current === 'auto' ? 'is-selected' : ''}" data-value="auto">${setLang('str364')}</div>`; // "Automática (usar default)"
    
    (zionLyricsObj.availableFonts || []).forEach(f => {
        itemsHtml += `<div class="sp-item ${current === f.family ? 'is-selected' : ''}" data-value="${escapeHtml(f.family)}">${escapeHtml(f.family)}</div>`;
    });

    PickerBase.open(anchorEl, {
        className: 'multi-picker single-mode',
        minWidth: 220,
        content: `<div class="sp-list">${itemsHtml}</div>`,
        onMount(el, closeFn) {
            el.querySelectorAll('.sp-item').forEach(item => {
                item.addEventListener('click', () => {
                    const val = item.dataset.value;
                    if (!zionLyricsObj.typography) zionLyricsObj.typography = { uiFont: 'auto', defaultContentFont: 'auto', languageFonts: {}, bibleFonts: {} };
                    
                    if (val === 'auto') {
                        delete zionLyricsObj.typography.languageFonts[languageLabel];
                    } else {
                        zionLyricsObj.typography.languageFonts[languageLabel] = val;
                    }
                    
                    saveZionLyricsObj();
                    closeFn();
                    renderAdminLanguages();
                });
            });
        }
    });
}

async function importFontFile() {
    if (!window.showOpenFilePicker) {
        customAlert(setLang('str203'));
        return;
    }

    try {
        const [handle] = await window.showOpenFilePicker({
            types: [{
                description: setLang('str284'),
                accept: { 'font/*': ['.ttf', '.otf', '.woff', '.woff2'] }
            }],
            multiple: false
        });

        const file = await handle.getFile();
        const buffer = await file.arrayBuffer();
        
        const result = await window.electronAPI.saveFile(`fonts/${file.name}`, buffer);
        
        if (!result.success) {
            customAlert(setLang('str810') + result.error);
            return;
        }

        customAlert(setLang('str361'));
        
        if (typeof Fonts !== 'undefined') {
            await Fonts.reconcile();
            Fonts.applyFontVariables();
            renderAdminFonts();
            renderAdminLanguages();
        }
    } catch (err) {
        if (err.name !== 'AbortError') {
            customAlert(setLang('str811') + err.message);
        }
    }
}

async function importLangFile() {
    if (!window.showOpenFilePicker) {
        customAlert(setLang('str203'));
        return;
    }


    try {
        const [handle] = await window.showOpenFilePicker({
            types: [{
                description: setLang('str137'),
                accept: { 'application/json': ['.json'] }
            }],
            multiple: false
        });

        const file = await handle.getFile();
        const rawText = await file.text();

        let parsed;
        try {
            parsed = JSON.parse(rawText);
        } catch (parseErr) {
            customAlert(setLang('str813') + parseErr.message);
            return;
        }

        // Validación básica de estructura de idioma
        const hasValidHeader =
            parsed &&
            typeof parsed === 'object' &&
            !Array.isArray(parsed) &&
            typeof parsed.id === 'string' && parsed.id.trim() &&
            typeof parsed.label === 'string' && parsed.label.trim() &&
            parsed.strings && typeof parsed.strings === 'object' && !Array.isArray(parsed.strings);

        if (!hasValidHeader) {
            customAlert(setLang('str813') + 'Invalid language JSON structure.');
            return;
        }

        const result = await window.electronAPI.saveFile(`lang/${file.name}`, parsed);
        
        if (!result || !result.success) {
            customAlert(setLang('str813') + (result?.error || 'Unknown error'));
            return;
        }

        // Refrescar lista de idiomas en memoria si existe la función
        if (typeof window.electronAPI.loadLocalesSync === 'function' && Array.isArray(state.availableLocales)) {
            const updatedLocales = window.electronAPI.loadLocalesSync();
            if (Array.isArray(updatedLocales)) {
                state.availableLocales = updatedLocales;
            }
        }

        customAlert(setLang('str367').replace('{n}', file.name));

        if (typeof Fonts !== 'undefined') {
            await Fonts.reconcile();
            Fonts.applyFontVariables();
            renderAdminFonts();
            renderAdminLanguages();
        }
    } catch (err) {
        if (err.name !== 'AbortError') {
            customAlert(setLang('str813') + err.message);
        }
    }
}