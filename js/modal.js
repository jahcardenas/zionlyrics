const MODAL_HANDLERS = {
    'opciones-modal': {
        _file: 'settings-app',
        onOpen() {
            if (typeof initOptionsChorusEvents === 'function') initOptionsChorusEvents();

            switchTab(null, null, 'tab-opciones');

            populateLocaleDropdown($('locale-select'));

            DataBinding.beginEdit(zionLyricsObj);
            DataBinding.read('#opciones-modal', zionLyricsObj);

            // Sesiones: mostrar/ocultar la fila del picker según el checkbox.
            // DataBinding.read ya seteó el checkbox y el picker; esto solo
            // controla la visibilidad de la fila.
            const rowAutoDel = $('session-auto-delete-row');
            if (rowAutoDel) rowAutoDel.style.display = zionLyricsObj.sessionAutosave ? '' : 'none';

            DataBinding.read('#opciones-modal', zionLyricsObj);
            DataBinding.watch('#opciones-modal', zionLyricsObj, {
                onChange: () => window.electronAPI.setDebugLogging(!!zionLyricsObj.debugLogging),
            });
        },
        onClose() {
            stopAdminMonitorsTimer();
            const before = zionLyricsObj.currentLocale;
            DataBinding.cancelEdit();
            DataBinding.unwatch();
            const after = zionLyricsObj.currentLocale;
            if (before !== after) {
                applyDocumentDir();
                applyTranslations();
                saveZionLyricsObj();
            }
        }
    },

    'acerca-de-modal': {
        _file: 'about-app',
        onOpen() {
            populateAboutModal();
        }
    },

    'custom-confirm-template': {
        _file: 'custom-alert'
    },

    'configurar-marquesina': {
        _file: 'setup-marquee',
        onOpen() {
            Object.assign(state.marqueeDraft, defaultMarqueeDraft());
            state.marqueeSourceId = null;

            renderMarqueeMonitorList();

            DataBinding.beginEdit(state.marqueeDraft);
            DataBinding.read('#configurar-marquesina', state.marqueeDraft);
            DataBinding.watch('#configurar-marquesina', state.marqueeDraft, {
                onChange: () => previewMarqueeSettings(),
                onCommit: () => autosaveActiveMarquee()
            });

            renderMarqueeQueue();
            previewMarqueeSettings();
            applyTranslations();
        },
        onClose() {
            if (state.marqueeSourceId) autosaveActiveMarquee();
            DataBinding.cancelEdit();
            DataBinding.unwatch();
            state.marqueeSourceId = null;
        }
    },

    'stage-editor-modal': {
        _file: 'stage-editor',
        onOpen(el, ev, modalEl) {
            const displayId = modalEl.dataset.displayId;
            const applyToAll = modalEl.dataset.applyToAll === 'true';
            setTimeout(() => window.StageEditor.mount(displayId, applyToAll), 50);
        },
        onClose() {
            if (window.StageEditor) window.StageEditor.unmount();
        }
    },

    'editor-coro-modal': {
        _file: 'chorus-editor',
        onOpen(el, ev, modalEl) {
            if (typeof initChorusEditorEvents === 'function') initChorusEditorEvents();
            const coroId = modalEl.dataset.coroId ? parseInt(modalEl.dataset.coroId) : null;
            const coro = coroId ? _.find(state.dataSource.choruses, { id_coro: coroId }) : null;

            const titleEl = $('editor-coro-title');
            if (titleEl) titleEl.textContent = coro ? setLang('str28') : setLang('str18');

            window.chorusEditor.setCoroId(coroId);
            window.chorusEditor.setState({
                tipo:   coro?.tipo   || 'Alabanza',
                tono:   coro?.tono   || 'Do',
                activo: coro ? (coro.activo === 'Yes') : true
            });

            state.chorusEditorDraft = {
                nombre: coro?.nombre || '',
                autor:  coro?.autor  || '',
                tipo:   coro?.tipo   || 'Alabanza',
                tono:   coro?.tono   || 'Do',
                activo: coro ? (coro.activo === 'Yes') : true
            };

            DataBinding.beginEdit(state.chorusEditorDraft);

            setTimeout(() => {
                DataBinding.read('#editor-coro-modal', state.chorusEditorDraft);
                DataBinding.watch('#editor-coro-modal', state.chorusEditorDraft, {});
                window.chorusEditor.mount(coro);
                window.chorusEditor.syncToolbar();
            }, 30);
        },
        onVisible() {
            window.chorusEditor.tryFocus();
        },
        onClose() {
            DataBinding.cancelEdit();
            DataBinding.unwatch();
            window.chorusEditor.unmount();
            window.chorusEditor.reset();
        }
    },

    'agregar-coro-modal': {
        _file: 'chorus-add',
        onOpen() {
            if (typeof initChorusAddEvents === 'function') initChorusAddEvents();
            initChorusGlobalEvents();
            _chorusModalSelectedIds.clear();
            _chorusModalAnchorId = null;
            _chorusModalLastClicked = null;
            _chorusFilterTipos.clear();
            _chorusFilterTonos.clear();
            renderChorusFilterTags();
            renderModalChorus();
            $('preview-text').innerHTML = '';
            $('agregar-coro-filter').value = '';
            setTimeout(() => $('agregar-coro-filter')?.focus(), 351);
        },
        onClose() {
            _chorusModalSelectedIds.clear();
            _chorusModalAnchorId = null;
            _chorusModalLastClicked = null;
            _chorusFilterTipos.clear();
            _chorusFilterTonos.clear();
        }
    },

    'agregar-biblia-modal': {
        _file: 'verse-add',
        onOpen() {
            if (typeof initBibleEvents === 'function') initBibleEvents();
            _bibleSelectedBookIdx = null;
            _bibleSelectedChapter = null;
            _bibleVerseStart      = null;
            _bibleVerseEnd        = null;

            initBiblePicker();

            setTimeout(() => {
                const filter = $('bible-text-filter');
                $('bible-selected-list').innerHTML = '';
                filter.value = '';
                if (filter) filter.focus();
            }, 351);
        },
        onClose() {
            _bibleSelectedBookIdx = null;
            _bibleSelectedChapter = null;
            _bibleVerseStart      = null;
            _bibleVerseEnd        = null;
        }
    },

    'media-library-modal': {
        _file: 'media-library',
        onOpen(el, ev, modalEl) {
            if (typeof initMediaEvents === 'function') initMediaEvents();

            document.querySelectorAll('#media-library-modal .mlib-chip').forEach(chip => {
                chip.classList.toggle('active', chip.dataset.filter === 'all');
            });

            const titleEl = $$('#media-library-modal .media-library-title');
            if (titleEl) {
                titleEl.textContent = (_mlibCurrentContext === 'manage')
                    ? setLang('str196')
                    : setLang('str197');
            }

            dedupeMediaLibrary();
            renderMediaLibrary();

            // Extraer thumbs de videos de la galería que aún no tienen uno cacheado.
            // La cola serial (enqueueLibraryThumb) los procesa uno por uno en background.
            state.settings.mediaLibrary
                .filter(e => e.type === 'video' && !state.mediaThumbs.has(e.file))
                .forEach(e => enqueueLibraryThumb(e.file));
        },
        onClose() {
            window._mediaLibraryCallback = null;
        }
    },

    'wordy-add-modal': {
        _file: 'wordy-add',
        onOpen(el, ev, modalEl) {
            state.wordyDraft = defaultWordyDraft();
            state.wordySourceId = null;
            if (typeof initWordyModalEvents === 'function') initWordyModalEvents();
            if (typeof renderWordyModalRows === 'function') renderWordyModalRows();
            if (typeof renderWordyQueue === 'function') renderWordyQueue();
            if (typeof previewWordy === 'function') previewWordy();
            applyTranslations();
        },
        onClose() {
            state.wordyDraft = null;
            state.wordySourceId = null;
            const previewEl = $('wordy-preview');
            if (previewEl) { previewEl.innerHTML = ''; previewEl._wordyStage = null; }
        }
    },

    'multi-verse-add-modal': {
        _file: 'multi-verse-add',
        onOpen() {
            if (typeof initMultiVerseModal === 'function') initMultiVerseModal();
            // Limpiar estado previo
            const filter = $('multi-verse-filter');
            if (filter) filter.value = '';
            const list = $('multi-verse-list');
            if (list) list.innerHTML = `<div class="app-card-empty">${setLang('str381')}</div>`;
            setTimeout(() => { if (filter) filter.focus(); }, 350);
        }
    }
};

async function loadModalHtml(id) {
    if ($(id)) return true;

    const fileName = MODAL_HANDLERS[id]?._file || id;

    if (!_modalHtmlCache.has(fileName)) {
        const result = await window.electronAPI.loadFile(`templates/${fileName}.html`);
        if (!result.success || result.isDirectory) {
            console.error(`[ModalsLoader] Failed to load modals/${fileName}.html: ${result.error || 'not found'}`);
            return false;
        }
        _modalHtmlCache.set(fileName, result.data);
    }

    document.body.insertAdjacentHTML('beforeend', _modalHtmlCache.get(fileName));
    if (typeof createIcons === 'function') createIcons();

    // Los modales son lazy-loaded: no existían cuando applyTranslations() corrió
    // al final del boot. Traducimos el HTML recién insertado.
    const modalEl = document.body.lastElementChild;
    if (modalEl && typeof applyTranslations === 'function') {
        applyTranslations(modalEl);
    }

    return true;
}

async function openModal(el, ev, id, extraHandlers) {
    const loaded = await loadModalHtml(id);
    if (!loaded) {
        console.error(`[openModal] Failed to load modal: ${id}`);
        if (id !== 'custom-confirm-template') {
            customAlert(setLang('str283'));
        }
        return false;
    }

    const merged = Object.assign({}, MODAL_HANDLERS[id] || {}, extraHandlers || {});
    return window.ModalManager.open(el, ev, id, merged);
}

function closeModal(el, ev, id) {
    ModalManager.close(el, ev, id);
}

function resolveCustomConfirm(el, ev, value) {
    const top = ModalManager.getTop();
    if (!top) return;

    const modalEl = top.modalEl;
    if (typeof modalEl._customResolve !== 'function') return;

    const resolve = modalEl._customResolve;
    modalEl._customResolve = null;

    closeModal(el, ev, top.id);

    if (value === 'no') resolve('no');
    else if (value === 'yes' || value === true || value === 'true') resolve(true);
    else resolve(false);
}

function showCustomModal(message, options = {}) {
    // Compat con la firma vieja: showCustomModal(message, true/false)
    if (typeof options === 'boolean') options = { showCancel: options };

    const showCancel  = options.showCancel !== false;
    const triple      = options.triple === true;
    const yesLabel    = options.yesLabel;
    const noLabel     = options.noLabel;
    const cancelLabel = options.cancelLabel;

    return new Promise((resolve) => {
        openModal(null, null, 'custom-confirm-template', {
            onOpen(el, ev, modalEl) {
                // 1. Traducir primero el HTML del modal (pone los textos por defecto de data-i18n)
                if (typeof applyTranslations === 'function') applyTranslations(modalEl);

                // 2. Setear el mensaje
                modalEl.querySelector('.custom-confirm-msg').textContent = message;

                // 3. Configurar visibilidad de botones
                const btnYes    = modalEl.querySelector('.custom-confirm-ok');
                const btnNo     = modalEl.querySelector('.custom-confirm-no');
                const btnCancel = modalEl.querySelector('.custom-confirm-cancel');

                btnNo.style.display     = triple     ? '' : 'none';
                btnCancel.style.display = showCancel ? '' : 'none';

                // 4. Sobrescribir textos y QUITAR el data-i18n para que no se vuelvan a sobreescribir en el futuro
                const setBtnLabel = (btn, text, fallbackKey) => {
                    if (!btn) return;
                    const span = btn.querySelector('span');
                    if (!span) return;
                    span.removeAttribute('data-i18n'); // <--- CLAVE: Evita que futuras traducciones lo pisen
                    span.textContent = text || setLang(fallbackKey);
                };

                setBtnLabel(btnYes, yesLabel, 'str26');           // "Aceptar" o el custom
                if (triple) setBtnLabel(btnNo, noLabel, 'str324'); // "No" o el custom
                setBtnLabel(btnCancel, cancelLabel, 'str27');     // "Cancelar" o el custom

                modalEl._customResolve = resolve;
            },
            onClose(el, ev, modalEl) {
                if (typeof modalEl._customResolve === 'function') {
                    const r = modalEl._customResolve;
                    modalEl._customResolve = null;
                    r(false);   // Esc/overlay → cancel
                }
            }
        }).then((result) => {
            if (result === false) resolve(false);
        });
    });
}

function customAlert(message) {
    if (window.ProyController?.isProjecting?.()) {
        showAppToast(message, TOAST_DURATION);
        return Promise.resolve(true);
    }
    return showCustomModal(message, { showCancel: false });
}

function customConfirm(message, options = {}) {
    return showCustomModal(message, { ...options, showCancel: true });
}
