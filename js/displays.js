
function getDisplayLayers(display) {
    if (!display || !display.label) return null;
    if (!zionLyricsObj.displays) zionLyricsObj.displays = {};

    let entry = zionLyricsObj.displays[display.label];

    // Si el monitor no tiene configuración, hereda la de __ALL__
    if (!entry) {
        const allEntry = zionLyricsObj.displays['__ALL__'];
        if (allEntry) {
            entry = structuredClone(allEntry);
            // Conservamos la propiedad types si existiera en el original
            if (!entry.types) entry.types = [];
        } else {
            entry = {
                customLayers:  defaultCustomLayers(),
                contentStyles: defaultContentStyles(),
                types: []
            };
        }
        zionLyricsObj.displays[display.label] = entry;
        return entry;
    }

    // Merge de defaults con lo existente: cualquier campo nuevo (panel, transitions,
    // campos futuros) se agrega sin pisar lo que el usuario ya configuró.
    const clDefaults = defaultCustomLayers();
    const csDefaults = defaultContentStyles();

    entry.customLayers  = Object.assign({}, clDefaults, entry.customLayers  || {});
    entry.contentStyles = Object.assign({}, csDefaults, entry.contentStyles || {});
    if (!entry.types) entry.types = [];

    // Sub-objetos que también necesitan merge profundo (si no, un campo nuevo
    // dentro de panel/transitions no aparecería si el objeto ya existía)
    if (!entry.customLayers.panel)         entry.customLayers.panel = clDefaults.panel;
    if (!entry.customLayers.transitions)   entry.customLayers.transitions = clDefaults.transitions;

    return entry;
}

function getDisplayFingerprint(displays) {
    return displays.map(d => `${d.id}-${d.width}x${d.height}-${d.label}-${d.isPrimary}`).join('|');
}

const buildStableId = (label) =>
    'display-' + label
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

async function scanDisplays() {
    const data = await window.electronAPI.getDisplays();
    return { screens: data.displays, primaryDisplay: data.primaryDisplay };
}

function buildFallbackScan() {
    const availWidth  = window.screen.availWidth;
    const availHeight = window.screen.availHeight;
    return {
        screens: [{
            id: 0,
            label: setLang('str192'),
            bounds: { x: 0, y: 0, width: availWidth, height: availHeight }
        }],
        primaryDisplay: { id: 0 }
    };
}

function mergeDisplays(oldDisplays, rawData) {
    const { screens, primaryDisplay } = rawData;

    const newDisplays = screens.map((screen, index) => {
        const screenLabel = screen.label || setLang('str191') + ` ${index + 1}`;
        const stableId = buildStableId(screenLabel);
        const isPrimary = screen.id === primaryDisplay.id;
        const oldDisplay = oldDisplays.find(d => d.id === stableId);

        if (!zionLyricsObj.displays[screenLabel]) {
            zionLyricsObj.displays[screenLabel] = {
                customLayers:  defaultCustomLayers(),
                contentStyles: defaultContentStyles()
            };
        }

        return {
            id: stableId,
            electronInternalId: screen.id,
            label: screenLabel,
            isPrimary,
            left:   screen.bounds.x,
            top:    screen.bounds.y,
            width:  screen.bounds.width,
            height: screen.bounds.height,

            // Estado runtime — copiar TODO campo nuevo aquí en el futuro
            queue:   oldDisplay?.queue || { choruses: [], bibles: [], media: [] },
            zoomLevel: oldDisplay?.zoomLevel || 100,
            isPaused: oldDisplay?.isPaused !== undefined ? oldDisplay.isPaused : false,
            pendingContent: oldDisplay?.pendingContent || null,
            currentlyProjectedMediaIndex: oldDisplay?.currentlyProjectedMediaIndex || -1,
            clonedFromId: oldDisplay?.clonedFromId || null,
            currentlyProjectingItem: oldDisplay?.currentlyProjectingItem || null,
            pendingSourceInfo:       oldDisplay?.pendingSourceInfo || null
        };
    });

    const newIds = new Set(newDisplays.map(d => d.id));
    const removedDisplays = oldDisplays.filter(d => !newIds.has(d.id));

    return { newDisplays, removedDisplays };
}

function applyDisplays(newDisplays, removedDisplays) {
    const newFingerprint = getDisplayFingerprint(newDisplays);
    const hasChanged = (newFingerprint !== lastDisplayFingerprint);

    state.settings.connectedDisplays = newDisplays;

    removedDisplays.forEach(handleRemovedDisplay);

    if (hasChanged) {
        debugLog('DISP', 'Displays change detected | fingerprint:', newFingerprint);
        ProyController.renderThumbnails();
        lastDisplayFingerprint = newFingerprint;
    }

    Tooltip.init();
}

function refreshDisplays() {
    if (isRefreshingMonitors) return Promise.resolve();
    isRefreshingMonitors = true;

    return scanDisplays()
        .catch(err => {
            console.warn('scanDisplays failed, using fallback:', err);
            return buildFallbackScan();
        })
        .then(raw => {
            const old = state.settings.connectedDisplays || [];
            const { newDisplays, removedDisplays } = mergeDisplays(old, raw);
            applyDisplays(newDisplays, removedDisplays);
        })
        .finally(() => {
            isRefreshingMonitors = false;
        });
}

function renderAdminMonitors() {
    const container = $('admin-monitors-rows');
    if (!container) return;
    container.innerHTML = '';

    const displays = state.settings.connectedDisplays || [];
    if (displays.length === 0) {
        const empty = document.createElement('div');
        empty.style.cssText = 'grid-column: 1 / -1; padding: 20px; text-align: center; color: var(--text-muted); font-size: 13px;';
        empty.textContent = setLang('str187');
        container.appendChild(empty);
        return;
    }

    const typeLabels = Object.fromEntries(
        SINGLE_PROVIDERS['monitor-types']().map(o => [o.value, o.label])
    );

    displays.forEach(d => {
        const entry = getDisplayLayers(d);
        const types = entry.types || [];

        const card = document.createElement('div');
        card.className = 'monitor-card app-card';

        const iconWrap = document.createElement('div');
        iconWrap.className = 'monitor-card-icon';
        iconWrap.innerHTML = MONITOR_ICON_SVGS[getMonitorIconType(d.label)] || MONITOR_ICON_SVGS.monitor;

        const body = document.createElement('div');
        body.className = 'chorus-card-body';

        const title = document.createElement('div');
        title.className = 'chorus-card-title';
        title.textContent = d.label;

        const meta = document.createElement('div');
        meta.className = 'chorus-card-meta';

        if (types.length === 0) {
            const empty = document.createElement('span');
            empty.style.cssText = 'font-size: 11px; color: var(--text-muted);';
            empty.textContent = setLang('str293');
            meta.appendChild(empty);
        } else {
            types.forEach(t => {
                const badge = document.createElement('span');
                badge.className = 'monitor-type-badge';
                badge.dataset.value = t;
                badge.textContent = typeLabels[t] || t;
                meta.appendChild(badge);
            });
        }

        const addBtn = document.createElement('button');
        addBtn.className = 'monitor-card-add';
        addBtn.textContent = '+';
        addBtn.title = setLang('str294');
        addBtn.onclick = (e) => {
            e.stopPropagation();
            openMonitorTypesPicker(addBtn, d.label);
        };
        meta.appendChild(addBtn);

        body.appendChild(title);
        body.appendChild(meta);

        card.appendChild(iconWrap);
        card.appendChild(body);
        container.appendChild(card);
    });

    if (typeof createIcons === 'function') createIcons();
    _lastAdminMonitorsSig = getAdminMonitorsSignature();
    applyTranslations(container); 
}

function getAdminMonitorsSignature() {
    return (state.settings.connectedDisplays || [])
        .map(d => `${d.id}::${d.label}`)
        .join('|');
}

function startAdminMonitorsTimer() {
    if (_adminMonitorsTimer) return;   // ya hay uno, no acumular
    _lastAdminMonitorsSig = getAdminMonitorsSignature();
    _adminMonitorsTimer = setInterval(() => {
        if (!_adminMonitorsTimer) return;
        const sig = getAdminMonitorsSignature();
        if (sig !== _lastAdminMonitorsSig) {
            _lastAdminMonitorsSig = sig;
            renderAdminMonitors();
        }
    }, 2000);
}

function stopAdminMonitorsTimer() {
    if (_adminMonitorsTimer) {
        clearInterval(_adminMonitorsTimer);
        _adminMonitorsTimer = null;
    }
    _lastAdminMonitorsSig = null;
}

function openMonitorTypesPicker(anchor, displayLabel) {
    const display = state.settings.connectedDisplays.find(d => d.label === displayLabel);
    if (!display) return;
    const entry = getDisplayLayers(display);
    const types = SINGLE_PROVIDERS['monitor-types']();
    const current = new Set(entry.types || []);

    const content = `
        <div class="cc-mp-title">${escapeHtml(setLang('str294'))}</div>
        <div class="cc-mp-options">
            ${types.map(t => `
                <label class="chk-custom">
                    <input type="checkbox" data-value="${escapeHtml(t.value)}" ${current.has(t.value) ? 'checked' : ''}>
                    <span class="chk-box"></span>
                    <span class="chk-label">${escapeHtml(t.label)}</span>
                </label>
            `).join('')}
        </div>
        <div class="cc-mp-actions modal-footer-right">
            <div class="code-btn code-btn-primary monitor-types-save">${escapeHtml(setLang('str57'))}</div>
            <div class="code-btn code-btn-cancel monitor-types-cancel">${escapeHtml(setLang('str38'))}</div>
        </div>
    `;

    PickerBase.open(anchor, {
        className: 'multi-picker',
        minWidth: 220,
        content,
        onMount(el, closeFn) {
            el.querySelector('.monitor-types-save').addEventListener('click', () => {
                const checked = [...el.querySelectorAll('input[type="checkbox"]:checked')]
                    .map(c => c.dataset.value);
                entry.types = checked;
                saveZionLyricsObj();
                closeFn();
                renderAdminMonitors();
            });
            el.querySelector('.monitor-types-cancel').addEventListener('click', closeFn);
        }
    });
}

function startMonitorPolling() {
    debugLog('DISP', 'startMonitorPolling — starting');

    if (monitorPollingInterval) {
        clearInterval(monitorPollingInterval);
        monitorPollingInterval = null;
    }

    lastDisplayFingerprint = '';
    refreshDisplays();

    monitorPollingInterval = setInterval(() => {
        if (!isRefreshingMonitors) {
            refreshDisplays();
        }
    }, 4000);
}

async function startAllProjectors(el, ev) {
    closeAllDropdowns();
    debugLog('GLOBAL', 'startAllProjectors');

    const extended = state.settings.connectedDisplays.filter(d => !d.isPrimary);
    if (extended.length === 0) {
        customAlert(setLang('str134'));
        return;
    }
    await ProyController.startAll();
}

async function stopAllProjectors(el, ev) {
    closeAllDropdowns();
    debugLog('GLOBAL', 'stopAllProjectors');

    const extended = state.settings.connectedDisplays.filter(d => !d.isPrimary);
    if (extended.length === 0) {
        customAlert(setLang('str134'));
        return;
    }
    await ProyController.stopAll();
}

function pauseAllProjectors(el, ev) {
    closeAllDropdowns();
    debugLog('GLOBAL', 'pauseAllProjectors');

    const ids = Object.keys(state.projectorWindows || {});
    if (ids.length === 0) {
        customAlert(setLang('str193'));
        return;
    }
    ProyController.togglePause(ids);
}

function clearAllProjectors(el, ev) {
    closeAllDropdowns();
    debugLog('GLOBAL', 'clearAllProjectors');

    const extended = state.settings.connectedDisplays.filter(d => !d.isPrimary);
    if (extended.length === 0) {
        customAlert(setLang('str187'));
        return;
    }
    ProyController.clearAll();
}

function guessMonitorIcon(label) {
    const l = (label || '').toLowerCase();
    if (/proyect|projector|epson|benq|optoma|viewsonic|hitachi\s?proj/.test(l)) return 'projector';
    if (/\btv\b|samsung|lg\b|sony|roku|apple\s?tv|airplay|philips|panasonic|hisense|tcl|smart\s?tv/.test(l)) return 'tv';
    return 'monitor';
}

function getMonitorIconType(label) {
    const saved = zionLyricsObj.displays && zionLyricsObj.displays[label];
    if (saved && saved.iconType && MONITOR_ICON_SVGS[saved.iconType]) {
        return saved.iconType;
    }
    return guessMonitorIcon(label);
}

async function handleRemovedDisplay(display) {
    debugLog('DISP', 'Display disconnected: ', display.label, '| id:', display.id);

    if (ProyController.isOpen(display.id)) {
        try {
            await window.electronAPI.closeProjectorWindow(display.id);
        } catch (e) {
            debugLog('DISP', 'Error while closing disconnected display projector: ', e.message);
        }
    }

    if (state.projectorWindows) delete state.projectorWindows[display.id];

    ['choruses', 'bibles', 'media'].forEach(group => {
        const arr = state.outputTargets[group];
        if (!Array.isArray(arr)) return;
        const idx = arr.indexOf(display.id);
        if (idx > -1) arr.splice(idx, 1);
    });

    if (typeof targetDisplayId    !== 'undefined' && targetDisplayId === display.id)    targetDisplayId = null;
    if (typeof activeMonitorId    !== 'undefined' && activeMonitorId === display.id)    activeMonitorId = null;
    if (typeof currentLayerDisplayId !== 'undefined' && currentLayerDisplayId === display.id) currentLayerDisplayId = null;

    if (typeof populateOutputLists === 'function') populateOutputLists();
}