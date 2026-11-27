let _sessionSaveTimer = null;
let _sessionSavePending = null;

const SESSION_AUTOSAVE_DEBOUNCE_MS = 500;

function readFromLocalStorage() {
    try {
        const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        console.warn('Corrupted localStorage, ignoring: ', e.message);
        return null;
    }
}

async function readFromServer() {
    try {
        const result = await window.electronAPI.loadConfig();
        if (result && result.data) {
            if (result.error) {
                console.warn('config.json:', result.error);
            }
            return result.data;
        }
    } catch (e) {
        console.warn('Failed to read config.json: ', e.message);
    }
    return null;
}

async function saveZionLyricsObj(options = {}) {
    zionLyricsObj.lastModified = Date.now();

    const toSave = _.omit(zionLyricsObj, ['connectedDisplays']);

    try {
        localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(toSave));
    } catch (e) {
        console.warn('Failed to save to localStorage: ', e.message);
    }

    try {
        const result = await window.electronAPI.saveConfig(toSave, options);
        if (!result.success) {
            customAlert(setLang('str807') + result.error);
        }
    } catch (e) {
        customAlert(setLang('str808') + e.message);
    }
}

async function loadZionLyricsObj() {
    const [fromLS, fromServer] = await Promise.all([
        readFromLocalStorage(),
        readFromServer()
    ]);

    let source = null;
    let isFirstRun = false;

    if (fromLS && fromServer) {
        source = (fromLS.lastModified >= fromServer.lastModified) ? fromLS : fromServer;
    } else if (fromLS) {
        source = fromLS;
    } else if (fromServer) {
        source = fromServer;
    } else {
        isFirstRun = true;
        source = {};
    }

    // Aplicar SOLO las claves que zionLyricsObj YA tiene.
    // Esto es lo que evita la contaminación: si el source trae app_version,
    // img_path, backgroundLibrary, etc., se ignoran automáticamente.
    Object.keys(zionLyricsObj).forEach(key => {
        if (key === 'connectedDisplays') return;      // runtime, se preserva
        if (source[key] !== undefined) {
            zionLyricsObj[key] = source[key];
        }
    });

    // Eliminar claves residuales que no deben persistirse
    delete zionLyricsObj.availableLocales;

    // Saneo: la marquesina es runtime, no debe arrancar visible al cargar la config
    if (zionLyricsObj.displays) {
        Object.values(zionLyricsObj.displays).forEach(entry => {
            if (entry.customLayers?.marquee) {
                entry.customLayers.marquee.visible = false;
            }
        });
    }

    // Sincronizar ambos lados. El archivo se reescribe limpio (solo claves
    // de zionLyricsObj), así que las legacy desaparecen en este primer guardado.
    saveZionLyricsObj();

    return { isFirstRun };
}

async function loadThemes() {
    try {
        // loadFile ya se encarga de leer el .json, validar el path y parsearlo
        const result = await window.electronAPI.loadFile('themes.json');
        if (result && result.success && Array.isArray(result.data)) {
            state.themes = result.data;
        } else if (result && !result.success && result.error !== 'Not found') {
            console.warn('Failed to load themes.json:', result.error);
            state.themes = [];
        } else {
            // Archivo no existe aún → array vacío
            state.themes = [];
        }
    } catch (e) {
        console.warn('Error loading themes:', e.message);
        state.themes = [];
    }
}

async function saveThemes() {
    try {
        const current = await window.electronAPI.loadFile('themes.json');
        if (current.success && Array.isArray(current.data) && current.data.length > 0) {
            // Serializar el backup como string JSON antes de escribir.
            // El handler save-file no reconoce la extensión .bak y cae al branch
            // de Buffer, que no serializa objetos correctamente.
            await window.electronAPI.saveFile(
                'themes.json.bak',
                JSON.stringify(current.data, null, 2)
            );
        }
        const result = await window.electronAPI.saveFile('themes.json', state.themes);
        if (!result.success) {
            customAlert(setLang('str807') + result.error);
        }
    } catch (e) {
        customAlert(setLang('str808') + e.message);
    }
}

async function loadSettings() {
    const { isFirstRun } = await loadZionLyricsObj();

    if (migrateContentStylesPositions()) {
        await saveZionLyricsObj();
    }

    await loadThemes();

    DataBinding.read('#opciones-modal', zionLyricsObj);
    window.electronAPI.setDebugLogging(!!zionLyricsObj.debugLogging);

    if (Array.isArray(zionLyricsObj.columnWidths)) {
        const cols = document.querySelectorAll('.col-panel');
        if (zionLyricsObj.columnWidths.length === cols.length) {
            cols.forEach((col, i) => {
                col.style.flex = String(zionLyricsObj.columnWidths[i]);
            });
        }
    }

    await refreshDisplays();
    await new Promise(r => setTimeout(r, 50));   // un tick de DOM
    ProyController.renderThumbnails();

    if (isFirstRun) {
        openModal(null, null, 'opciones-modal');
    }
}

function saveOptions() {
    DataBinding.write('#opciones-modal', zionLyricsObj);
    window.electronAPI.setDebugLogging(zionLyricsObj.debugLogging);

    DataBinding.unwatch();
    DataBinding.commitEdit();
    saveZionLyricsObj();
    closeModal(null, null, 'opciones-modal');
}

async function exportOptions() {
    if (!canOpenFilePicker()) {
        customAlert(setLang('str159'));
        return;
    }

    try {
        // Exporta zionLyricsObj completo, excepto connectedDisplays (runtime)
        const toExport = _.omit(zionLyricsObj, ['connectedDisplays']);
        const data = JSON.stringify(toExport, null, 2);

        if (!window.showSaveFilePicker) {
            const blob = new Blob([data], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'config.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            customAlert(setLang('str229'));
            return;
        }

        const handle = await window.showSaveFilePicker({
            suggestedName: 'config.json',
            types: [{ description: setLang('str230'), accept: { 'application/json': ['.json'] } }]
        });
        const writable = await handle.createWritable();
        await writable.write(data);
        await writable.close();
        customAlert(setLang('str231') + handle.name);
    } catch (err) {
        if (err.name !== 'AbortError') {
            customAlert(setLang('str808') + err.message);
        }
    }
}

async function importOptions() {
    if (!canOpenFilePicker()) {
        customAlert(setLang('str159'));
        return;
    }

    try {
        if (!window.showOpenFilePicker) {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            input.onchange = (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = async (ev) => {
                    try {
                        const settings = JSON.parse(ev.target.result);
                        await applySettings(settings);
                    } catch (err) {
                        customAlert(setLang('str232'));
                    }
                };
                reader.readAsText(file);
            };
            input.click();
            return;
        }

        const [handle] = await window.showOpenFilePicker({
            types: [{ description: setLang('str230'), accept: { 'application/json': ['.json'] } }],
            multiple: false
        });

        const file = await handle.getFile();
        const text = await file.text();
        const settings = JSON.parse(text);
        await applySettings(settings);
    } catch (err) {
        if (err.name !== 'AbortError') {
            customAlert(setLang('str809') + err.message);
        }
    }
}

async function applySettings(settings) {
    Object.assign(zionLyricsObj, _.omit(settings, ['connectedDisplays']));
    DataBinding.read('#opciones-modal', zionLyricsObj);
    ProyController.renderThumbnails();

    // Reaplica layers y styles a los proyectores abiertos
    const extended = state.settings.connectedDisplays.filter(d => !d.isPrimary);
    extended.forEach(d => {
        const entry = getDisplayLayers(d);
        ProyController.applyLayers([d.id], entry.customLayers);
        ProyController.applyStyles([d.id], entry.contentStyles);
    });

    // Persiste sincronizando config.json y bak con el nuevo contenido
    await saveZionLyricsObj({ mirrorToBackup: true });

    // Reinicia el snapshot: la importación es el nuevo punto de partida.
    // "Cancelar" ahora solo revierte cambios posteriores a la importación.
    DataBinding.commitEdit();
    DataBinding.beginEdit(zionLyricsObj);

    customAlert(setLang('str233'));
}

function buildSessionId() {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `session-${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}-${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

async function loadCurrentSession() {
    if (!state.sessionId) return null;
    const result = await window.electronAPI.loadFile(`sessions/${state.sessionId}.json`);
    if (result.success && result.data) {
        state.session = result.data;
    } else {
        state.session = { createdAt: Date.now(), marquees: [] };
    }
    return state.session;
}

/*async function persistSession() {
    if (!state.sessionId) return;
    await window.electronAPI.saveFile(`sessions/${state.sessionId}.json`, state.session);
}*/

function todayFileName() {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `session-${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}.json`;
}

function newSessionId() {
    const rand = Math.random().toString(36).slice(2, 6);
    return `${Date.now()}-${rand}`;
}

function createEmptySession() {
    return {
        id: newSessionId(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        queue: { choruses: [], bibles: [], media: [] },
        sermonTitle: '',
        wordies: [],
        selectedCantoId: null,
        selectedBibleId: null,
        outputTargets: { choruses: [], bibles: [], media: [] }
    };
}

async function findLatestSessionFile() {
    try {
        const result = await window.electronAPI.loadFile('sessions');
        if (!result.success || !result.isDirectory) return null;

        const re = /^session-(\d{2})-(\d{2})-(\d{4})\.json$/;
        const candidates = [];
        for (const item of result.contents) {
            const m = item.fileName.match(re);
            if (!m) continue;
            const [, dd, mm, yyyy] = m;
            candidates.push({ fileName: item.fileName, sortKey: Number(`${yyyy}${mm}${dd}`) });
        }
        if (candidates.length === 0) return null;
        candidates.sort((a, b) => b.sortKey - a.sortKey);
        return candidates[0].fileName;
    } catch (err) {
        debugLog('SESSION', 'findLatestSessionFile failed:', err.message);
        return null;
    }
}

async function loadCurrentSession() {
    const fileName = await findLatestSessionFile();
    if (!fileName) {
        state.session = null;
        state.sessionFileName = null;
        return null;
    }

    try {
        const result = await window.electronAPI.loadFile(`sessions/${fileName}`);
        if (!result.success || !result.data) {
            state.session = null;
            state.sessionFileName = null;
            return null;
        }

        const sessions = Array.isArray(result.data.sessions) ? result.data.sessions : [];
        if (sessions.length === 0) {
            state.session = null;
            state.sessionFileName = fileName;
            return null;
        }

        sessions.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        state.session = sessions[0];
        state.sessionFileName = fileName;

        // Hidratar runtime desde la sesión
        if (state.session.queue) {
            state.queue = state.session.queue;
        }
        if (state.session.outputTargets) {
            state.outputTargets = state.session.outputTargets;
        }

        if (state.session.selectedCantoId != null) {
            state.selectedCanto = state.queue.choruses.find(c => String(c.id) === String(state.session.selectedCantoId)) || null;
            if (state.selectedCanto) {
                _chorusSelectedIds.clear();
                _chorusSelectedIds.add(String(state.selectedCanto.id));
                _chorusAnchorId    = String(state.selectedCanto.id);
                _chorusLastClicked = String(state.selectedCanto.id);
            }
        }
        if (state.session.selectedBibleId != null) {
            state.selectedBible = state.queue.bibles.find(b => String(b.id) === String(state.session.selectedBibleId)) || null;
            if (state.selectedBible) {
                _bibleSelectedIds.clear();
                _bibleSelectedIds.add(String(state.selectedBible.id));
                _bibleAnchorId    = String(state.selectedBible.id);
                _bibleLastClicked = String(state.selectedBible.id);
            }
        }

        debugLog('SESSION', 'loaded', state.session.id, 'from', fileName);
        return state.session;
    } catch (err) {
        debugLog('SESSION', 'loadCurrentSession failed:', err.message);
        state.session = null;
        state.sessionFileName = null;
        return null;
    }
}

function createSessionIfNeeded() {
    if (state.session) return state.session;
    state.session = createEmptySession();
    if (!state.sessionFileName) state.sessionFileName = todayFileName();
    debugLog('SESSION', 'created', state.session.id);
    return state.session;
}

async function forceFlushSession() {
    if (_sessionSaveTimer) {
        clearTimeout(_sessionSaveTimer);
        _sessionSaveTimer = null;
    }
    if (_sessionSavePending) {
        const p = _sessionSavePending;
        _sessionSavePending = null;
        try { await p; } catch (_) {}
    }
    return _saveSessionNow();
}

function persistSession(opts = {}) {
    if (!state.session) return Promise.resolve();
    if (!zionLyricsObj.sessionAutosave && !opts.force) return Promise.resolve();

    if (_sessionSaveTimer) clearTimeout(_sessionSaveTimer);

    _sessionSavePending = new Promise((resolve) => {
        _sessionSaveTimer = setTimeout(async () => {
            _sessionSaveTimer = null;
            _sessionSavePending = null;
            try { await _saveSessionNow(); } finally { resolve(); }
        }, SESSION_AUTOSAVE_DEBOUNCE_MS);
    });

    return _sessionSavePending;
}

async function _saveSessionNow() {
    if (!state.session) return;
    if (!state.sessionFileName) state.sessionFileName = todayFileName();

    const session = state.session;
    session.updatedAt = Date.now();

    // Sincronizar runtime → sesión (por si algo mutó state.queue sin pasar por session)
    session.queue = state.queue;
    session.outputTargets = state.outputTargets;
    session.selectedCantoId = state.selectedCanto?.id ?? session.selectedCantoId;
    session.selectedBibleId = state.selectedBible?.id ?? session.selectedBibleId;

    let fileData = { date: state.sessionFileName.replace(/^session-|\.json$/g, ''), sessions: [] };
    try {
        const result = await window.electronAPI.loadFile(`sessions/${state.sessionFileName}`);
        if (result.success && result.data && Array.isArray(result.data.sessions)) {
            fileData = result.data;
        }
    } catch (_) {}

    const idx = fileData.sessions.findIndex(s => s.id === session.id);
    if (idx >= 0) fileData.sessions[idx] = session;
    else fileData.sessions.push(session);

    try {
        await window.electronAPI.saveFile(`sessions/${state.sessionFileName}`, fileData);
        debugLog('SESSION', 'saved', session.id, 'to', state.sessionFileName);
    } catch (err) {
        debugLog('SESSION', 'save failed:', err.message);
    }
}

async function clearActiveSession() {
    const session = state.session;
    const fileName = state.sessionFileName;
    state.session = null;
    state.sessionFileName = null;

    if (!session || !fileName) return;

    try {
        const result = await window.electronAPI.loadFile(`sessions/${fileName}`);
        if (result.success && result.data && Array.isArray(result.data.sessions)) {
            const remaining = result.data.sessions.filter(s => s.id !== session.id);
            if (remaining.length === 0) {
                await window.electronAPI.deleteFile(`sessions/${fileName}`);
                debugLog('SESSION', 'deleted', fileName, '(empty after clear)');
            } else {
                await window.electronAPI.saveFile(`sessions/${fileName}`, { ...result.data, sessions: remaining });
                debugLog('SESSION', 'removed', session.id, 'from', fileName);
            }
        }
    } catch (err) {
        debugLog('SESSION', 'clearActiveSession failed:', err.message);
    }
}

async function cleanOldSessions() {
    const days = Number(zionLyricsObj.sessionAutoDelete) || 0;
    if (days <= 0) return;

    try {
        const result = await window.electronAPI.loadFile('sessions');
        if (!result.success || !result.isDirectory) return;

        const re = /^session-(\d{2})-(\d{2})-(\d{4})\.json$/;
        const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

        for (const item of result.contents) {
            const m = item.fileName.match(re);
            if (!m) continue;
            const [, dd, mm, yyyy] = m;
            const fileDate = new Date(Number(yyyy), Number(mm) - 1, Number(dd)).getTime();
            if (fileDate < cutoff) {
                try {
                    await window.electronAPI.deleteFile(`sessions/${item.fileName}`);
                    debugLog('SESSION', 'auto-deleted old file:', item.fileName);
                } catch (_) {}
            }
        }
    } catch (err) {
        debugLog('SESSION', 'cleanOldSessions failed:', err.message);
    }
}