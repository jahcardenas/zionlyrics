let _mediaSelectedIds  = new Set();
let _mediaAnchorId     = null;
let _mediaLastClicked  = null;
let _mediaListTracker  = null;
let _videoLoadQueue = Promise.resolve();
let _libraryThumbQueue = Promise.resolve();

function getMediaListTracker() {
    if (!_mediaListTracker && window.Anim?.makeListTracker) {
        _mediaListTracker = window.Anim.makeListTracker();
    }
    return _mediaListTracker;
}

function getMediaVisibleIds() {
    return [...document.querySelectorAll('#list-media .media-card')]
        .map(c => c.dataset.id)
        .filter(Boolean);
}

function selectMediaCardReplace(id) {
    const idStr = String(id);
    _mediaSelectedIds.clear();
    _mediaSelectedIds.add(idStr);
    _mediaAnchorId = idStr;
    _mediaLastClicked = idStr;
    syncMediaSelection();
}

function syncMediaSelection() {
    document.querySelectorAll('#list-media .media-card').forEach(card => {
        card.classList.toggle('active', _mediaSelectedIds.has(card.dataset.id));
    });
}

// Convierte path absoluto a URL file:// con encoding seguro
function toFileUrl(p) {
    if (!p) return '';
    const norm = p.replace(/\\/g, '/');
    return 'file://' + encodeURI(norm).replace(/#/g, '%23').replace(/\?/g, '%3F');
}

// Hidrata items de state.queue.media al cargar sesión:
// - Marca missing los legacy con blob:/sin path
// - Recomputa url desde path
// - Chequea existencia en disco (opción A)
async function hydrateMediaItems() {
    if (!state.queue?.media || state.queue.media.length === 0) return;
    let changed = false;

    for (const item of state.queue.media) {
        // Legacy: sin path o blob URL → missing
        if (!item.path || (typeof item.url === 'string' && item.url.startsWith('blob:'))) {
            if (item.url && item.url.startsWith('blob:')) {
                try { URL.revokeObjectURL(item.url); } catch (_) {}
            }
            item.url = '';
            item.missing = true;
            changed = true;
            continue;
        }

        // Recomputar URL desde path
        const expected = toFileUrl(item.path);
        if (item.url !== expected) {
            item.url = expected;
            changed = true;
        }

        // Chequeo de existencia
        const exists = await window.electronAPI.fileExists(item.path);
        if (item.missing !== !exists) {
            item.missing = !exists;
            changed = true;
        }
    }

    // Re-extraer thumbnails de videos que perdieron el suyo (Map in-memory).
    // Se encola serial; cada extracción llama renderMedia() al terminar.
    state.queue.media.forEach(item => {
        if (item.type === 'video' && !item.missing && item.url && !state.mediaThumbs.has(String(item.id))) {
            enqueueVideoLoad(item.url, item.id);
        }
    });

    if (changed) renderMedia();
}

function formatBytes(bytes) {
    if (!bytes || bytes < 0) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
}

function formatDuration(seconds) {
    if (!isFinite(seconds) || seconds <= 0) return '';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatMediaKind(type, mimeType, ext) {
    // Devuelve "Vídeo WEBM" o "Imagen PNG"
    const isVideo = type === 'video';
    const kindLabel = isVideo ? 'Vídeo' : 'Imagen';
    const extLabel  = (ext || '').toUpperCase()
        || (mimeType ? mimeType.split('/').pop().toUpperCase() : '');
    return extLabel ? `${kindLabel} ${extLabel}` : kindLabel;
}

function openMediaLibrary(el, ev, context, callback) {
    if (ModalManager.isOpen('media-library-modal')) {
        ModalManager.close(null, null, 'media-library-modal');
    }
    window._mediaLibraryCallback = typeof callback === 'function' ? callback : null;
    _mlibCurrentContext = context || 'background';
    _mlibCurrentFilter = 'all';
    openModal(el, ev, 'media-library-modal');
}

function getMediaLibrary() {
    if (!state.settings.mediaLibrary) state.settings.mediaLibrary = [];
    // Filtrar entradas corruptas (file undefined/null) que dejó el bug de result.file
    const before = state.settings.mediaLibrary.length;
    state.settings.mediaLibrary = state.settings.mediaLibrary.filter(e =>
        e && typeof e.file === 'string' && e.file.length > 0
    );
    if (state.settings.mediaLibrary.length !== before) {
        debugLog('MEDIA', `Cleaned ${before - state.settings.mediaLibrary.length} corrupt entries from mediaLibrary`);
    }
    return state.settings.mediaLibrary;
}

function dedupeMediaLibrary() {
    const lib = state.settings.mediaLibrary || [];
    if (lib.length === 0) return 0;

    const seen = new Map();
    const clean = [];

    lib.forEach(e => {
        if (!e || typeof e.file !== 'string') return;   // descarta corruptas
        const key = e.category + '::' + e.name;
        const prev = seen.get(key);
        if (!prev) {
            seen.set(key, e);
            clean.push(e);
            return;
        }
        // Si ya hay una entrada con el mismo nombre+categoría, conservar
        // la que tenga metadata real (size > 0 o lastModified > 0).
        if ((prev.size === 0 || prev.lastModified === 0) &&
            (e.size > 0 || e.lastModified > 0)) {
            const idx = clean.indexOf(prev);
            clean[idx] = e;
            seen.set(key, e);
        }
        // Si ambas son válidas o ambas corruptas, se queda la primera (no toca)
    });

    const removed = lib.length - clean.length;
    if (removed > 0) {
        state.settings.mediaLibrary = clean;
        saveZionLyricsObj();
        debugLog('MEDIA', `dedupeMediaLibrary: removed ${removed} duplicates`);
    }
    return removed;
}

function addToMediaLibrary(filePath, originalName, category, type, size, lastModified) {
    const lib = getMediaLibrary();
    const exists = lib.some(e => e.file === filePath);
    if (exists) return;
    lib.push({
        file: filePath,
        name: originalName || filePath.split('/').pop(),
        category: category,
        type: type,
        size: size || 0,
        lastModified: lastModified || 0,
        addedAt: Date.now()
    });
}

function addColorToLibrary(el, ev) {
    ColorPicker.open(el, (hex) => {
        addToMediaLibrary(hex, hex, 'background', 'color');
        saveLibraryToConfig();
        renderMediaLibrary();

        // Si el modal de Capas está abierto, refleja el color en el thumb
        if (ModalManager.isOpen('configurar-capas-modal')) {
            const thumb = $('cc-bg-thumb');
            if (thumb) DataBinding.commit(thumb, hex);
        }
    }, '#ffffff');
}


function enqueueLibraryThumb(path) {
    _libraryThumbQueue = _libraryThumbQueue
        .then(async () => {
            try {
                const url = await VideoThumb.extractUrl(path);
                const old = state.mediaThumbs.get(path);
                if (old) URL.revokeObjectURL(old);
                state.mediaThumbs.set(path, url);
                renderMediaLibrary();
            } catch (err) {
                debugLog('THUMB', 'library thumb failed:', err.message);
            }
        })
        .catch(() => {});
    return _libraryThumbQueue;
}

function renderMediaLibrary() {
    const lib = getMediaLibrary();
    const categories = ['background', 'logo', 'placeholder'];

    categories.forEach(cat => {
        const grid = $('mlib-grid-' + cat);
        if (!grid) return;
        grid.innerHTML = '';

        // Filtrar por categoría y tipo
        let items = lib.filter(e => e.category === cat);
        if (_mlibCurrentFilter !== 'all') {
            items = items.filter(e => e.type === _mlibCurrentFilter);
        }
        items.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));

        // Ocultar sección completa si el filtro deja la sección vacía Y no es la del contexto
        const sectionEl = grid.closest('.mlib-section');
        const hasAnyItemsForThisCategory = lib.some(e => e.category === cat);
        if (_mlibCurrentFilter !== 'all' && !hasAnyItemsForThisCategory) {
            sectionEl.classList.add('hidden');
        } else {
            sectionEl.classList.remove('hidden');
        }

        // Tile "agregar" siempre primero
        const addCard = document.createElement('div');
        addCard.className = 'mlib-card mlib-card-add';
        addCard.dataset.tooltip = setLang('str198');
        addCard.innerHTML = `
            <svg class="mlib-card-add-icon" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
                <path d="M6 14a4 4 0 0 1 4-4h14l4 5h26a4 4 0 0 1 4 4v28a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4z"
                      fill="#f9c84b" stroke="#c99a1f" stroke-width="2.5" stroke-linejoin="round"/>
                <path d="M6 22h52" stroke="#c99a1f" stroke-width="2.5"/>
                <path d="M32 32v12M26 38h12" stroke="#7a5a10" stroke-width="3.5" stroke-linecap="round"/>
            </svg>`;
        addCard.onclick = () => pickMediaFileForCategory(cat);
        grid.appendChild(addCard);

        if (cat === 'background') {
            const colorCard = document.createElement('div');
            colorCard.className = 'mlib-card mlib-card-add';
            colorCard.dataset.tooltip = setLang('str199');
            colorCard.innerHTML = `
                <svg class="mlib-card-add-icon" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="32" cy="32" r="22" fill="#d94f4f" stroke="#7a2626" stroke-width="2.5"/>
                </svg>`;
            colorCard.setAttribute('data-function', 'addColorToLibrary');
            grid.appendChild(colorCard);
        }

        // Tarjetas existentes
        items.forEach(item => {
            const card = document.createElement('div');
            card.className = 'mlib-card';

            const fileUrl = item.file;
            const isVideo = item.type === 'video';
            const isColor = item.type === 'color';

            if (isColor) {
                const swatch = document.createElement('div');
                swatch.style.cssText = 'width:100%; height:100%; background:' + fileUrl + ';';
                card.appendChild(swatch);
            } else if (isVideo && state.mediaThumbs.has(fileUrl)) {
                // Thumbnail estático (frame random, extraído al importar)
                const img = document.createElement('img');
                img.src = state.mediaThumbs.get(fileUrl);
                img.alt = '';
                card.appendChild(img);
            } else if (isVideo) {
                // Fallback visual mientras el thumbnail se extrae en background
                // Evita que el video se reproduzca y parpadee a negro
                const placeholder = document.createElement('div');
                placeholder.style.cssText = 'width:100%; height:100%; display:flex; align-items:center; justify-content:center; background:#1a1a1a; color:var(--text-muted);';
                placeholder.innerHTML = '<i data-lucide="play-circle" style="width:24px;height:24px;opacity:0.5;"></i>';
                card.appendChild(placeholder);
            } else {
                const mediaEl = document.createElement('img');
                mediaEl.src = fileUrl;
                if (isVideo) {
                    mediaEl.muted = true;
                    mediaEl.playsInline = true;
                    mediaEl.autoplay = true;
                    mediaEl.loop = true;
                    mediaEl.disablePictureInPicture = true;
                    mediaEl.setAttribute('disablePictureInPicture', '');
                    mediaEl.setAttribute('controlsList', 'nodownload noplaybackrate nofullscreen');
                }
                mediaEl.onerror = () => {
                    card.classList.add('mlib-card-missing');
                    mediaEl.remove();
                    const overlay = document.createElement('div');
                    overlay.className = 'mlib-card-missing-overlay';
                    overlay.textContent = '✕';
                    overlay.setAttribute('data-tooltip', setLang('str200'));
                    card.appendChild(overlay);
                };
                card.appendChild(mediaEl);
            }

            // Nombre
            const nameEl = document.createElement('div');
            nameEl.className = 'mlib-card-name';
            nameEl.textContent = item.name || '';
            card.appendChild(nameEl);

            // Botón ✕ (no en la sección del contexto actual si es la activa)
            const removeBtn = document.createElement('div');
            removeBtn.className = 'mlib-card-remove';
            removeBtn.textContent = '✕';
            removeBtn.setAttribute('data-tooltip', setLang('str201'));
            removeBtn.onclick = (e) => {
                e.stopPropagation();
                removeFromMediaLibrary(item.file);
            };
            card.appendChild(removeBtn);

            // Click en la tarjeta → seleccionar para el contexto actual
            card.onclick = () => {
                if (card.classList.contains('mlib-card-missing')) {
                    customAlert(setLang('str202'));
                    return;
                }
                selectLibraryItem(item);
            };

            grid.appendChild(card);
        });
    });

    if (typeof createIcons === 'function') createIcons();
    if (typeof applyTranslations === 'function') applyTranslations($('media-library-modal') || document);
}

function selectLibraryItem(item) {
    if (typeof window._mediaLibraryCallback === 'function') {
        const cb = window._mediaLibraryCallback;
        window._mediaLibraryCallback = null;
        closeModal(null, null, 'media-library-modal');
        cb(item.file, item);
        return;
    }

    const cat = _mlibCurrentContext;
    if (cat === 'manage') return;

    const thumbId = cat === 'background' ? 'cc-bg-thumb'
                  : cat === 'logo'       ? 'cc-logo-thumb'
                  : 'cc-ph-thumb';
    const thumb = $(thumbId);

    if (thumb) {
        // Commit dispara 'input' → watch escribe al entry → onChange re-renderiza
        DataBinding.commit(thumb, item.file);
    }

    if (cat === 'background') updateBgUI();

    closeModal(null, null, 'media-library-modal');
}

async function pickMediaFileForCategory(category) {
    if (!canOpenFilePicker()) {
        customAlert(setLang('str159'));
        return;
    }

    try {
        if (!window.showOpenFilePicker) {
            customAlert(setLang('str203'));
            return;
        }
        const accept = category === 'background'
            ? { 'image/*': ['.png','.jpg','.jpeg','.gif','.webp','.svg'], 'video/*': ['.mp4','.webm','.mov','.mkv','.avi'] }
            : { 'image/*': ['.png','.jpg','.jpeg','.gif','.webp','.svg'] };

        const handles = await window.showOpenFilePicker({
            types: [{ description: 'Medios', accept }],
            multiple: true
        });

        const files = await Promise.all(handles.map(h => h.getFile()));
        await processFilesForLibrary(files, category);

    } catch (err) {
        if (err.name !== 'AbortError') {
            customAlert(setLang('str806') + err.message);
        }
    }
}

async function processFilesForLibrary(files, category) {
   if (!files || files.length === 0) return;

    const lib = getMediaLibrary();
    let addedCount = 0;
    let skippedCount = 0;
    let duplicateCount = 0;
    let lastFile = null;
    let lastType = null;

    const videoExts = ['mp4','webm','mov','mkv','avi'];
    const imageExts = ['png','jpg','jpeg','gif','webp','svg'];

    for (const file of files) {
        const ext = (file.name.split('.').pop() || '').toLowerCase();
        const isVideo = file.type.startsWith('video/') || videoExts.includes(ext);
        const isImage = file.type.startsWith('image/') || imageExts.includes(ext);

        if (!isVideo && !isImage) { skippedCount++; continue; }
        if (category !== 'background' && !isImage) { skippedCount++; continue; }

        const existing = lib.find(e =>
            e.category === category &&
            e.name === file.name &&
            (
                // Si la entrada existente tiene metadata vacía (reconstruida desde disco),
                // solo el nombre basta para considerarla duplicada.
                (e.size === 0 && e.lastModified === 0) ||
                ((e.size || 0) === file.size && (e.lastModified || 0) === file.lastModified)
            )
        );

        if (existing) {
            duplicateCount++;
            lastFile = existing.file;
            lastType = existing.type;
            continue;
        }

        const type = isVideo ? 'video' : 'image';
        const finalName = generateUniqueFileName(file.name, lib);
        const arrayBuffer = await file.arrayBuffer();

        const result = await window.electronAPI.saveFile('media/' + finalName, arrayBuffer);
        if (!result.success) {
            console.warn('Error saving file to media library.', file.name);
            skippedCount++;
            continue;
        }

        addToMediaLibrary(result.path, file.name, category, type, file.size, file.lastModified);
        addedCount++;
        lastFile = result.path;
        lastType = type;

        if (type === 'video') {
            enqueueLibraryThumb(result.path);
        }
    }

    if ((addedCount > 0 || duplicateCount > 0) && lastFile) {
        if (typeof window._mediaLibraryCallback === 'function') {
            const cb = window._mediaLibraryCallback;
            window._mediaLibraryCallback = null;
            closeModal(null, null, 'media-library-modal');
            cb(lastFile, { file: lastFile, type: lastType });
            return;
        }

        if (category === 'background') {
            $('cc-bg-thumb').dataset.persistentPath = lastFile;
            updateBgUI();
        } else if (category === 'logo') {
            $('cc-logo-thumb').dataset.persistentPath = lastFile;
        } else if (category === 'placeholder') {
            $('cc-ph-thumb').dataset.persistentPath = lastFile;
        }
        updateModalThumb(category);
        previewLayerSettings();
        renderMediaLibrary();
        await saveLibraryToConfig();
    }

    const msgs = [];
    if (addedCount > 0)     msgs.push(setLang('str204').replace('{n}', addedCount));
    if (duplicateCount > 0) msgs.push(setLang('str205').replace('{n}', duplicateCount));
    if (skippedCount > 0)   msgs.push(setLang('str206').replace('{n}', skippedCount));
    if (msgs.length > 0 && (duplicateCount > 0 || skippedCount > 0)) {
        customAlert(msgs.join('. ') + '.');
    }
}

function removeFromMediaLibrary(filePath) {
    const isColor = filePath.startsWith('#');

    const msg = isColor ? setLang('str207') : setLang('str264');

    customConfirm(msg).then(async confirmed => {
        if (!confirmed) return;

        // 1) Borrar el archivo físico del disco local (si no es un color)
        if (!isColor) {
            try {
                const result = await window.electronAPI.deleteFile(filePath);
                
                if (!result.success) {
                    console.warn('Failed deleting file ' + filePath + ' ' + result.error);
                    // Seguimos con la eliminación del índice aunque el borrado físico falle.
                }
            } catch (e) {
                console.warn('Failed deleting file from disk: ', e.message);
            }
        }

        // 2) Quitar del índice
        const lib = getMediaLibrary();
        state.settings.mediaLibrary = lib.filter(e => e.file !== filePath);

        // 2b) Revocar thumbnail cacheado (si existe)
        const thumbUrl = state.mediaThumbs.get(filePath);
        if (thumbUrl) {
            URL.revokeObjectURL(thumbUrl);
            state.mediaThumbs.delete(filePath);
        }

        renderMediaLibrary();
        saveLibraryToConfig();

        // 3) Si era el archivo asignado al contexto actual, limpiar el thumb
        ['background','logo','placeholder'].forEach(cat => {
            const inputId = cat === 'background' ? 'cc-bg-thumb' : (cat === 'logo' ? 'cc-logo-thumb' : 'cc-ph-thumb');
            const input = $(inputId);
            if (input && input.dataset.persistentPath === filePath) {
                input.dataset.persistentPath = '';
                updateModalThumb(cat);
            }
        });
    });
}

function updateModalThumb(category) {
    let thumbId, defaultText;
    if (category === 'background') {
        thumbId = 'cc-bg-thumb'; defaultText = setLang('str208');
    } else if (category === 'logo') {
        thumbId = 'cc-logo-thumb'; defaultText = setLang('str209');
    } else {
        thumbId = 'cc-ph-thumb'; defaultText = setLang('str210');
    }

    const thumb = $(thumbId);
    if (!thumb) return;

    const filePath = thumb.dataset.persistentPath || '';
    thumb.innerHTML = '';
    thumb.style.background = '';

    // Solo se considera ruta válida si empieza por media/, blob:, data:, http o es un color (#)
    const isMediaPath = /^(media\/|blob:|data:|https?:\/\/|#)/.test(filePath);

    if (!filePath || !isMediaPath) {
        const span = document.createElement('span');
        span.className = 'cc-media-thumb-empty';
        span.textContent = filePath || defaultText;
        thumb.appendChild(span);
        return;
    }

    const type = detectMediaType(filePath);
    if (type === 'color') {
        thumb.style.background = filePath;
        return;
    }

    if (type === 'video') {
        const v = document.createElement('video');
        v.src = filePath;
        v.muted = true;
        v.loop = true;
        v.autoplay = true;
        v.playsInline = true;
        v.disablePictureInPicture = true;
        v.setAttribute('disablePictureInPicture', '');
        v.setAttribute('controlsList', 'nodownload noplaybackrate nofullscreen');
        thumb.appendChild(v);
    } else {
        const img = document.createElement('img');
        img.src = filePath;
        img.onerror = () => {
            thumb.innerHTML = '';
            const span = document.createElement('span');
            span.className = 'cc-media-thumb-empty';
            span.innerHTML = '<i data-lucide="alert-triangle"></i> ' + setLang('str211');
            thumb.appendChild(span);
            createIcons();
        };
        thumb.appendChild(img);
    }
}

async function saveLibraryToConfig() {
    saveZionLyricsObj();
}

function renderMedia() {
    const list = $('list-media');
    if (!list) return;

    list.innerHTML = '';

    // Wordy cards virtuales (una por cada session.wordies[i])
    if (state.session && Array.isArray(state.session.wordies) && state.session.wordies.length > 0) {
        state.session.wordies.forEach(w => {
            const firstWord = (w.rows?.[0]?.[0] || '').trim();
            const nRows = w.rows?.length || 0;
            const hasCol3 = w.rows?.some(r => r[2]);
            const nCols = hasCol3 ? 3 : 2;

            const card = document.createElement('div');
            card.className = 'media-card app-card wordy-card';
            card.dataset.id = w.id;

            const play = document.createElement('div');
            play.className = 'media-card-play canto-card-play';
            play.innerHTML = `
                <svg class="cp-icon cp-icon-play" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3"/></svg>
                <svg class="cp-icon cp-icon-pause" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
                <span class="cp-ripple"></span><span class="cp-ripple cp-ripple-2"></span>
            `;
            play.onclick = (e) => {
                e.stopPropagation();
                playWordyById(w.id);
            };

            const thumb = document.createElement('div');
            thumb.className = 'media-card-thumb';
            thumb.innerHTML = '<i data-lucide="grid-3x3" style="width:24px;height:24px;color:var(--text-muted);"></i>';

            const body = document.createElement('div');
            body.className = 'media-card-body';
            const title = document.createElement('div');
            title.className = 'media-card-title';
            title.textContent = firstWord || '—';
            const meta = document.createElement('div');
            meta.className = 'media-card-meta';
            meta.textContent = `${nRows} fila${nRows !== 1 ? 's' : ''} · ${nCols} col${nCols !== 1 ? 's' : ''}`;
            body.appendChild(title);
            body.appendChild(meta);

            const actions = document.createElement('div');
            actions.className = 'media-card-actions';
            const editBtn = document.createElement('div');
            editBtn.className = 'code-btn';
            editBtn.innerHTML = '<span data-i18n="str376">Editar</span>';
            editBtn.onclick = (e) => {
                e.stopPropagation();
                openWordyModal(null, null);
                setTimeout(() => loadWordyIntoDraft(null, null, w.id), 50);
            };
            const removeBtn = document.createElement('div');
            removeBtn.className = 'code-btn code-btn-danger';
            removeBtn.innerHTML = '<span data-i18n="str4">Quitar</span>';
            removeBtn.onclick = (e) => {
                e.stopPropagation();
                removeWordyById(w.id);
            };
            actions.appendChild(editBtn);
            actions.appendChild(removeBtn);

            card.appendChild(play);
            card.appendChild(thumb);
            card.appendChild(body);
            card.appendChild(actions);
            card.onclick = (e) => handleMediaCardClick(w.id, e);

            list.appendChild(card);
        });
    }

    list.classList.add('media-list');   // marca para el layout vertical

    const mediaList = state.queue.media || [];

    if (state.session?.sermonTitle) {
        // Buscamos el trigger en cualquier display extendido que lo tenga configurado
        let trigger = { type: 'verses', value: 3 }; // default
        for (const d of state.settings.connectedDisplays) {
            if (d.isPrimary) continue;
            const entry = getDisplayLayers(d);
            if (entry.customLayers?.sermon?.trigger) {
                trigger = entry.customLayers.sermon.trigger;
                break; // Tomamos el primero que encontremos
            }
        }
        
        let triggerLabel = '';
        if (trigger.type === 'verses') triggerLabel = setLang('str351').replace('{n}', trigger.value);
        else if (trigger.type === 'time') triggerLabel = setLang('str352').replace('{n}', trigger.value);
        else triggerLabel = setLang('str219'); // Ninguna

        const sermonCard = document.createElement('div');
        sermonCard.className = 'media-card app-card sermon-card';
        sermonCard.dataset.id = 'sermon-card';

        const play = document.createElement('div');
        play.className = 'media-card-play canto-card-play';
        play.innerHTML = `
            <svg class="cp-icon cp-icon-play" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3"/></svg>
            <svg class="cp-icon cp-icon-pause" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
            <span class="cp-ripple"></span><span class="cp-ripple cp-ripple-2"></span>
        `;

        play.onclick = (e) => {
            e.stopPropagation();
            const targets = state.outputTargets.media;
            if (targets.length === 0) {
                Tooltip.show($('col-3').querySelector('[data-function="toggleDropdown"]'), setLang('str158'));
                return;
            }
            const isOnAir = ProyController.isOnAir('sermon', 'sermon-card');
            ProyController.toggleSermon(targets, !isOnAir);
        };

        const thumb = document.createElement('div');
        thumb.className = 'media-card-thumb';
        thumb.innerHTML = '<i data-lucide="text" style="width:24px;height:24px;color:var(--text-muted);"></i>';

        const body = document.createElement('div');
        body.className = 'media-card-body';
        const title = document.createElement('div');
        title.className = 'media-card-title';
        title.textContent = state.session.sermonTitle;
        const meta = document.createElement('div');
        meta.className = 'media-card-meta';
        meta.innerHTML = `<span>${setLang('str353')} · ${triggerLabel}</span>`;

        body.appendChild(title);
        body.appendChild(meta);
        sermonCard.appendChild(play);
        sermonCard.appendChild(thumb);
        sermonCard.appendChild(body);

        // Lógica de selección
        sermonCard.onclick = (e) => {
            handleMediaCardClick('sermon-card', e);
            // Si es un click simple (no ctrl/shift), simula la proyección para que el operador no tenga que darle play manual
            if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
                play.click();
            }
        };

        list.appendChild(sermonCard);
    }

    if (mediaList.length === 0) return;

    const tracker = getMediaListTracker();
    const currentIds = mediaList.map(m => String(m.id));
    const newIds = tracker ? tracker.diff(currentIds) : new Set();

    mediaList.forEach((m, index) => {
        const card = document.createElement('div');
        card.className = 'media-card app-card';
        card.dataset.id = String(m.id);
        card.dataset.index = index;

        // --- Slot del play ---
        const play = document.createElement('div');
        play.className = 'media-card-play canto-card-play';   // reusamos la misma clase base
        play.innerHTML = `
            <svg class="cp-icon cp-icon-play" xmlns="http://www.w3.org/2000/svg"
                 viewBox="0 0 24 24" fill="currentColor">
                <polygon points="6 3 20 12 6 21 6 3"/>
            </svg>
            <svg class="cp-icon cp-icon-pause" xmlns="http://www.w3.org/2000/svg"
                 viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" rx="1"/>
                <rect x="14" y="4" width="4" height="16" rx="1"/>
            </svg>
            <span class="cp-ripple"></span>
            <span class="cp-ripple cp-ripple-2"></span>
        `;
        play.onclick = (e) => {
            e.stopPropagation();
            playMediaById(m.id);
        };

        // --- Miniatura ---
        const thumb = document.createElement('div');
        thumb.className = 'media-card-thumb';
        if (m.missing) {
            thumb.classList.add('is-missing');
            thumb.style.position = 'relative';
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:absolute; inset:0; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.7); color:#ff5555; font-size:28px; font-weight:bold; pointer-events:none;';
            overlay.textContent = '✕';
            thumb.appendChild(overlay);
        } else  if (m.type === 'video') {
            const thumbUrl = state.mediaThumbs.get(String(m.id));
            if (thumbUrl) {
                const img = document.createElement('img');
                img.src = thumbUrl;
                img.alt = '';
                thumb.appendChild(img);
            } else {
                // Fallback mientras se extrae (o si falló): <video> en vivo
                const v = document.createElement('video');
                v.src = m.url;
                v.muted = true;
                v.playsInline = true;
                v.preload = 'metadata';
                v.disablePictureInPicture = true;
                v.onerror = () => thumb.classList.add('is-missing');
                thumb.appendChild(v);
            }
        } else {
            const img = document.createElement('img');
            img.src = m.url;
            img.loading = 'lazy';
            img.onerror = () => thumb.classList.add('is-missing');
            thumb.appendChild(img);
        }

        // --- Cuerpo: título + meta ---
        const body = document.createElement('div');
        body.className = 'media-card-body';

        const title = document.createElement('div');
        title.className = 'media-card-title';
        title.textContent = m.name;

        const meta = document.createElement('div');
        meta.className = 'media-card-meta';

        const ext = (m.name.split('.').pop() || '').toLowerCase();
        const kindEl = document.createElement('span');
        kindEl.textContent = formatMediaKind(m.type, m.mimeType, ext);
        meta.appendChild(kindEl);

        if (m.size) {
            const sizeEl = document.createElement('span');
            sizeEl.className = 'media-card-meta-sep';
            sizeEl.textContent = formatBytes(m.size);
            meta.appendChild(sizeEl);
        }

        if (m.type === 'video' && m.duration) {
            const durEl = document.createElement('span');
            durEl.className = 'media-card-meta-sep';
            durEl.textContent = formatDuration(m.duration);
            meta.appendChild(durEl);
        }

        body.appendChild(title);
        body.appendChild(meta);

        // --- Acciones hover-only ---
        const actions = document.createElement('div');
        actions.className = 'media-card-actions';

        const removeBtn = document.createElement('div');
        removeBtn.className = 'code-btn code-btn-danger';
        removeBtn.innerHTML = '<span data-i18n="str4">Quitar</span>';
        removeBtn.onclick = (e) => {
            e.stopPropagation();
            removeMediaById(m.id);
        };
        actions.appendChild(removeBtn);

        card.appendChild(play);
        card.appendChild(thumb);
        card.appendChild(body);
        card.appendChild(actions);

        // --- Click: multiselección ---
        card.onclick = (e) => {
            handleMediaCardClick(m.id, e);
        };

        list.appendChild(card);

        if (newIds.has(String(m.id)) && window.Anim) {
            window.Anim.cardEnter(card);
        }
    });

    applyTranslations(list);

    if (window.Anim) {
        window.Anim.makeSortable(
            '#list-media',
            '.media-card',
            {
                multiDrag: true,
                selectedClass: 'active',
                getSelectedIds: () => _mediaSelectedIds,
                onReorder: (order) => {
                    const byId = new Map(state.queue.media.map(m => [String(m.id), m]));
                    const seen = new Set();
                    const result = [];
                    order.forEach(id => {
                        const key = String(id);
                        if (!byId.has(key) || seen.has(key)) return;
                        seen.add(key);
                        result.push(byId.get(key));
                    });
                    state.queue.media.forEach(m => {
                        const key = String(m.id);
                        if (!seen.has(key)) result.push(m);
                    });
                    state.queue.media = result;

                    _mediaAnchorId    = null;
                    _mediaLastClicked = null;
                    persistSession();
                }
            }
        );
    }

    if (tracker) tracker.commit(currentIds);
    ProyController.refreshOnAirIndicators();
}

function playWordyById(id) {
    const wordy = (state.session?.wordies || []).find(w => String(w.id) === String(id));
    if (!wordy) return;

    const targets = state.outputTargets.media;
    if (!targets || targets.length === 0) {
        Tooltip.show($('col-3').querySelector('[data-function="toggleDropdown"]'), setLang('str158'));
        return;
    }

    const onAir = ProyController.isOnAir('wordy', id);
    if (onAir) {
        // Toggle: si ya está al aire, detener
        const displays = state.settings.connectedDisplays.filter(d =>
            d.currentlyProjectingItem?.type === 'wordy' &&
            String(d.currentlyProjectingItem.queueId) === String(id)
        );
        if (displays.length) ProyController.clear(displays.map(d => d.id));
        return;
    }

    ProyController.projectWordy(targets, wordy, null, { type: 'wordy', queueId: id });
}

async function removeWordyById(id) {
    if (!state.session || !Array.isArray(state.session.wordies)) return;
    const confirmed = await customConfirm('¿Eliminar esta palabra de estudio?');
    if (!confirmed) return;

    if (ProyController.isOnAir('wordy', id)) {
        const displays = state.settings.connectedDisplays.filter(d =>
            d.currentlyProjectingItem?.type === 'wordy' &&
            String(d.currentlyProjectingItem.queueId) === String(id)
        );
        if (displays.length) ProyController.clear(displays.map(d => d.id));
    }

    state.session.wordies = state.session.wordies.filter(w => String(w.id) !== String(id));
    persistSession();
    renderMedia();
}

function handleMediaCardClick(id, e) {
    const idStr = String(id);
    const visibleIds = getMediaVisibleIds();
    const isCtrl  = e.ctrlKey || e.metaKey;
    const isShift = e.shiftKey;
    const isSimpleClick = !isCtrl && !isShift;
    const isSelected = _mediaSelectedIds.has(idStr);
    const keepSelection = isSimpleClick && isSelected && _mediaSelectedIds.size > 1;

    if (keepSelection) {
        // Mantener el bloque. Sí limpia otras columnas (es simple click
        // en la columna media). Actualiza el anchor.
        if (!zionLyricsObj.keepPreviousSelection) {
            clearGroupSelection(['cantos', 'citas']);
        }
        _mediaAnchorId    = idStr;
        _mediaLastClicked = idStr;
        syncMediaSelection();
        return;
    }

    if (isSimpleClick) {
        if (!zionLyricsObj.keepPreviousSelection) {
            clearGroupSelection(['cantos', 'citas']);
        }
        selectMediaCardReplace(idStr);
        return;
    }

    if (isShift && _mediaAnchorId !== null) {
        const anchorIdx = visibleIds.indexOf(_mediaAnchorId);
        const clickIdx  = visibleIds.indexOf(idStr);
        if (anchorIdx !== -1 && clickIdx !== -1) {
            const [from, to] = anchorIdx < clickIdx ? [anchorIdx, clickIdx] : [clickIdx, anchorIdx];
            _mediaSelectedIds.clear();
            for (let i = from; i <= to; i++) _mediaSelectedIds.add(visibleIds[i]);
        } else {
            selectMediaCardReplace(idStr);
            return;
        }
    } else if (isCtrl) {
        if (_mediaSelectedIds.has(idStr)) {
            _mediaSelectedIds.delete(idStr);
        } else {
            _mediaSelectedIds.add(idStr);
        }
        _mediaAnchorId = idStr;
    }

    _mediaLastClicked = _mediaSelectedIds.has(idStr) ? idStr : null;
    syncMediaSelection();
}

function playMediaById(id) {
    const m = state.queue.media.find(x => String(x.id) === String(id));
    if (!m) return;

    if (m.missing) {
        customAlert(setLang('str202'));
        return;
    }

    const targetIds = state.outputTargets.media;
    if (targetIds.length === 0) {
        Tooltip.show($('col-3').querySelector('[data-function="toggleDropdown"]'), setLang('str158'));
        return;
    }

    const contentHtml = m.type === 'video'
        ? `<video src="${m.url}" id="projected-media" muted playsinline disablepictureinpicture style="max-width:100%;max-height:100%;object-fit:contain;"></video>`
        : `<img src="${m.url}" id="projected-media" style="max-width:100%;max-height:100%;object-fit:contain;">`;

    ProyController.projectContent(targetIds, { type: 'media', html: contentHtml }, null, { type: 'media', queueId: m.id });
}

function removeMediaById(id) {
    const idx = state.queue.media.findIndex(m => String(m.id) === String(id));
    if (idx === -1) return;

    const m = state.queue.media[idx];
    const card = $$(`#list-media .media-card[data-id="${id}"]`);

    const finishRemove = () => {
        // Limpiar monitores que estén mostrando ese archivo
        const affected = state.outputTargets.media.filter(displayId => {
            const d = state.settings.connectedDisplays.find(x => x.id === displayId);
            return d && d.pendingContent && d.pendingContent.type === 'media'
                && d.pendingContent.html.includes(m.url);
        });
        if (affected.length > 0) ProyController.clear(affected);

        if (m.url && m.url.startsWith('blob:')) {
            URL.revokeObjectURL(m.url);
        }

        const thumbKey = String(m.id);
        const thumbUrl = state.mediaThumbs.get(thumbKey);
        if (thumbUrl) {
            URL.revokeObjectURL(thumbUrl);
            state.mediaThumbs.delete(thumbKey);
        }

        state.queue.media.splice(idx, 1);
        _mediaSelectedIds.delete(String(id));
        if (_mediaLastClicked === String(id)) _mediaLastClicked = null;
        if (_mediaAnchorId === String(id)) _mediaAnchorId = null;
        if (_mediaListTracker) _mediaListTracker.forget(String(id));

        if (card && card.parentNode) card.remove();
        syncMediaSelection();
        persistSession();
    };

    if (card && window.Anim) {
        window.Anim.cardLeave(card, finishRemove);
    } else {
        finishRemove();
    }
}

function removeMedia(el, ev) {
    closeAllDropdowns();
    if (_mediaSelectedIds.size === 0) {
        customAlert(setLang('str212'));
        return;
    }
    // Quitar todos los seleccionados (uno por uno, con animación)
    [..._mediaSelectedIds].forEach(id => removeMediaById(id));
}

function setupDragAndDrop() {
    const container = $('media-container');
    if (!container) return;

    const isExternalFileDrag = (e) => {
        if (!e.dataTransfer) return false;
        // Cuando se arrastran archivos desde Finder/Explorer, types incluye 'Files'.
        // Cuando SortableJS mueve una card interna, types NO incluye 'Files'.
        return Array.from(e.dataTransfer.types || []).includes('Files');
    };

    container.addEventListener('dragover', (e) => {
        if (!isExternalFileDrag(e)) return;
        e.preventDefault();
        container.classList.add('drag-over');
    });

    container.addEventListener('dragleave', (e) => {
        if (!isExternalFileDrag(e)) return;
        // Solo quitar la clase si el drag salió del container (no si entró en un hijo)
        if (e.relatedTarget && container.contains(e.relatedTarget)) return;
        container.classList.remove('drag-over');
    });

    container.addEventListener('drop', async (e) => {
        if (!isExternalFileDrag(e)) return;
        e.preventDefault();
        container.classList.remove('drag-over');
        await handleMediaFiles(Array.from(e.dataTransfer.files));
    });
}

/*async function addMedia(el, ev) {
    closeAllDropdowns();

    if (!canOpenFilePicker()) {
        customAlert(setLang('str159'));
        return;
    }

    try {
        if (!window.showOpenFilePicker) {
            customAlert(setLang('str203'));
            return;
        }
        const handles = await window.showOpenFilePicker({
            types: [{ description: setLang('str213'), accept: { 'image/*': ['.png', '.jpg', '.gif'], 'video/*': ['.mp4', '.avi', '.mkv'] } }],
            multiple: true
        });

        if (!state.queue.media) state.queue.media = [];
        createSessionIfNeeded();

        for (const handle of handles) {
            const file = await handle.getFile();
            const type = file.type.startsWith('video/') ? 'video' : 'image';
            const alreadyAdded = state.queue.media.some(m => m.name === file.name);
            if (alreadyAdded) {
                customAlert(setLang('str214').replace('{n}',file.name));
                continue;
            }

            const buffer = await file.arrayBuffer();
            const blob   = new Blob([buffer], { type: file.type || '' });
            const blobUrl = URL.createObjectURL(blob);

            const item = {
                id: Date.now() + Math.random(),
                name: file.name,
                url: blobUrl,
                type: type,
                size: file.size,
                mimeType: file.type || '',
                duration: null
            };
            state.queue.media.push(item);

            if (type === 'video') {
                enqueueVideoLoad(blobUrl, item.id);
            }
        }

        renderMedia();
        persistSession();
    } catch (err) {
        if (err.name !== 'AbortError') {
            customAlert('Error: ' + err.message);
        }
    }
}*/

async function addMedia(el, ev) {
    closeAllDropdowns();

    if (!canOpenFilePicker()) {
        customAlert(setLang('str159'));
        return;
    }

    try {
        const result = await window.electronAPI.openFileDialog();
        if (!result.success) {
            customAlert('Error: ' + (result.error || 'unknown'));
            return;
        }
        const paths = result.paths || [];
        if (paths.length === 0) return;

        if (!state.queue.media) state.queue.media = [];
        createSessionIfNeeded();

        for (const absPath of paths) {
            const name = absPath.split(/[\\/]/).pop() || absPath;
            const ext = (name.split('.').pop() || '').toLowerCase();
            const isVideo = ['mp4','webm','mov','mkv','avi'].includes(ext);
            const isImage = ['png','jpg','jpeg','gif','webp','svg'].includes(ext);
            if (!isVideo && !isImage) continue;

            const alreadyAdded = state.queue.media.some(m => m.path === absPath);
            if (alreadyAdded) {
                customAlert(setLang('str214').replace('{n}', name));
                continue;
            }

            const item = {
                id: Date.now() + Math.random(),
                name,
                path: absPath,
                url: toFileUrl(absPath),
                type: isVideo ? 'video' : 'image',
                size: 0,
                mimeType: '',
                duration: null,
                missing: false
            };
            state.queue.media.push(item);

            if (isVideo) enqueueVideoLoad(item.url, item.id);
        }

        renderMedia();
        persistSession();
    } catch (err) {
        if (err.name !== 'AbortError') {
            customAlert('Error: ' + err.message);
        }
    }
}

/*async function handleMediaFiles(files) {
    if (!state.queue.media) state.queue.media = [];
    createSessionIfNeeded();

    for (const file of files) {
        if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) continue;

        const type = file.type.startsWith('video/') ? 'video' : 'image';
        const alreadyAdded = state.queue.media.some(m => m.name === file.name);
        if (alreadyAdded) {
            customAlert(setLang('str214').replace('{n}',file.name));
            continue;
        }

        // Copiar el contenido del File a un Blob propio del renderer.
        // Sin esto, el blob URL original se invalida cuando el File de
        // Finder pierde su referencia y el recolector se lo lleva.
        const buffer = await file.arrayBuffer();
        const blob   = new Blob([buffer], { type: file.type || '' });
        const blobUrl = URL.createObjectURL(blob);

        const item = {
            id: Date.now() + Math.random(),
            name: file.name,
            url: blobUrl,
            type: type,
            size: file.size,
            mimeType: file.type || '',
            duration: null
        };
        state.queue.media.push(item);

        if (type === 'video') {
            enqueueVideoLoad(blobUrl, item.id);
        }
    }

    renderMedia();
    persistSession();
}*/

async function handleMediaFiles(files) {
    if (!state.queue.media) state.queue.media = [];
    createSessionIfNeeded();

    for (const file of files) {
        if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) continue;

        const type = file.type.startsWith('video/') ? 'video' : 'image';

        // Obtener path real vía webUtils (preload)
        const absPath = window.electronAPI.getPathForFile(file);
        if (!absPath) {
            customAlert(setLang('str214').replace('{n}', file.name + ' (sin ruta)'));
            continue;
        }

        const alreadyAdded = state.queue.media.some(m => m.path === absPath);
        if (alreadyAdded) {
            customAlert(setLang('str214').replace('{n}', file.name));
            continue;
        }

        const item = {
            id: Date.now() + Math.random(),
            name: file.name,
            path: absPath,
            url: toFileUrl(absPath),
            type,
            size: file.size,
            mimeType: file.type || '',
            duration: null,
            missing: false
        };
        state.queue.media.push(item);

        if (type === 'video') enqueueVideoLoad(item.url, item.id);
    }

    renderMedia();
    persistSession();
}

function enqueueVideoLoad(blobUrl, mediaId) {
    _videoLoadQueue = _videoLoadQueue
        .then(() => loadVideoInfo(blobUrl, mediaId))
        .catch(err => debugLog('THUMB', 'queue failed:', err.message));
    return _videoLoadQueue;
}

async function loadVideoInfo(blobUrl, mediaId) {
    const item = state.queue.media.find(m => String(m.id) === String(mediaId));
    if (!item) return;

    const v = document.createElement('video');
    v.preload = 'auto';
    v.muted = true;
    v.playsInline = true;

    const cleanup = () => {
        v.removeAttribute('src');
        v.load();
    };

    try {
        await new Promise((resolve, reject) => {
            v.onloadedmetadata = resolve;
            v.onerror = () => reject(new Error('video load failed'));
            v.src = blobUrl;
        });

        const duration = v.duration;
        if (isFinite(duration) && duration > 0) {
            item.duration = duration;
            const t = Math.max(0.1, duration * (0.10 + Math.random() * 0.80));
            v.currentTime = Math.min(t, duration - 0.05);
            await new Promise(resolve => { v.onseeked = resolve; });
        }

        if (v.videoWidth > 0 && v.videoHeight > 0) {
            const canvas = document.createElement('canvas');
            canvas.width = v.videoWidth;
            canvas.height = v.videoHeight;
            canvas.getContext('2d').drawImage(v, 0, 0);

            const blob = await new Promise(resolve =>
                canvas.toBlob(resolve, 'image/jpeg', 0.85)
            );

            if (blob) {
                const key = String(item.id);
                const old = state.mediaThumbs.get(key);
                if (old) URL.revokeObjectURL(old);
                state.mediaThumbs.set(key, URL.createObjectURL(blob));
            }
        }
    } catch (err) {
        debugLog('THUMB', 'loadVideoInfo failed:', err.message);
    } finally {
        cleanup();
        renderMedia();
    }
}

function openMediaPlaylistModal(el, ev) {
    closeAllDropdowns();
    if (_mediaSelectedIds.size === 0) {
        customAlert(setLang('str212'));
        return;
    }
    customAlert(setLang('str999'));
}

function initMediaEvents() {
    const modal = $('media-library-modal');
    if (!modal) return;
    if (modal._mediaEventsBound) return;
    modal._mediaEventsBound = true;

    // Chips de filtro
    document.querySelectorAll('#media-library-modal .mlib-chip').forEach(chip => {
        chip.addEventListener('click', function() {
            document.querySelectorAll('#media-library-modal .mlib-chip').forEach(c => c.classList.remove('active'));
            this.classList.add('active');
            _mlibCurrentFilter = this.dataset.filter;
            renderMediaLibrary();
        });
    });

    // Drag & drop en secciones
    document.querySelectorAll('#media-library-modal .mlib-section').forEach(section => {
        const cat = section.dataset.category;

        section.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            section.classList.add('mlib-drop-active');
        });

        section.addEventListener('dragleave', (e) => {
            if (e.relatedTarget && section.contains(e.relatedTarget)) return;
            section.classList.remove('mlib-drop-active');
        });

        section.addEventListener('drop', async (e) => {
            e.preventDefault();
            section.classList.remove('mlib-drop-active');
            const files = Array.from(e.dataTransfer.files || []);
            if (files.length === 0) return;
            await processFilesForLibrary(files, cat);
        });
    });

    // Prevenir drop fuera
    ['dragover', 'drop'].forEach(evt => {
        $('media-library-modal').addEventListener(evt, (e) => {
            if (e.target.closest('.mlib-section')) return;
            e.preventDefault();
        });
    });
}

function preloadLibraryThumbs() {
    const lib = getMediaLibrary();
    if (!lib || lib.length === 0) return;

    const missingThumbs = lib.filter(e => e.type === 'video' && !state.mediaThumbs.has(e.file));
    if (missingThumbs.length === 0) return;

    debugLog('MEDIA', `Preloading ${missingThumbs.length} library thumbnails in background...`);
    
    // enqueueLibraryThumb ya tiene su propia cola serial para no saturar el CPU
    missingThumbs.forEach(e => enqueueLibraryThumb(e.file));
}

async function reconstructMediaLibraryIfEmpty() {
    if (getMediaLibrary().length > 0) return;

    const r = await window.electronAPI.loadFile('media');
    if (!r.success || !r.isDirectory) {
        debugLog('MEDIA', `Reconstruct failed: ${r.error || 'not a directory'}`);
        return;
    }

    const valid = r.contents.filter(f => {
        if (f.fileName.startsWith('.')) return false;
        const mt = f.mimeType || '';
        return mt.startsWith('image/') || mt.startsWith('video/');
    });

    if (valid.length === 0) return;

    valid.forEach(f => {
        const type = (f.mimeType || '').startsWith('video/') ? 'video' : 'image';
        const relPath = 'media/' + f.fileName;
        addToMediaLibrary(relPath, f.fileName, 'background', type, f.size || 0, f.lastModified || 0);
        if (type === 'video') {
            enqueueLibraryThumb(relPath);
        }
    });

    await saveLibraryToConfig();
    debugLog('MEDIA', `Reconstructed ${valid.length} files from media/`);
}


