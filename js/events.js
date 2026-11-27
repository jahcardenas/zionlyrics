document.addEventListener('DOMContentLoaded', async () => {
    try {
        // ---------- 1. Tema ----------
        toggleTheme(null, null, false);

        // ---------- 2. Template del visor ----------
        const visorResult = await window.electronAPI.loadFile('templates/visor.html');
        window.PROY_TEMPLATE_HTML = visorResult.success ? visorResult.data : null;

        // ---------- 3. Localización ----------
        initI18n();

        // ---------- 4. Config + displays + thumbnails ----------
        await loadSettings();
        await reconstructMediaLibraryIfEmpty();
        
        // Lanzar precarga de thumbnails en segundo plano para evitar flasheos
        if (typeof preloadLibraryThumbs === 'function') {
            setTimeout(preloadLibraryThumbs, 2000);
        }
        if (typeof Fonts !== 'undefined') {
            if (Fonts.migrateLegacyValues()) {
                await saveZionLyricsObj();
            }
            await Fonts.reconcile();
            Fonts.applyFontVariables(); // <-- Inyecta las variables CSS globales
        }
        applyTranslations();

        // ---------- 5. Estado inicial runtime ----------
        if (!state.marqueeDraft) state.marqueeDraft = defaultMarqueeDraft();


        // ---------- 6. Datos locales (sync) ----------
        loadChorusesFromLocalStorage();
        
        // Limpiar basura de biblias del esquema anterior (solo se ejecuta una vez)
        localStorage.removeItem('zion_bibles');

        // ---------- 7. Datos desde disco (async) ----------
        await Promise.all([
            loadChorusesFromJson(),
            loadBiblesFromJson()
        ]);

        // ---------- 8. UI setup ----------
        setupDragAndDrop();

        // ---------- 10. Monitoreo + sesión ----------
        startMonitorPolling();
        await loadCurrentSession();
        if (zionLyricsObj.sessionAutosave) {
            await cleanOldSessions();
        }
        if (typeof renderTitlebarSermon === 'function') renderTitlebarSermon();

        // Hidratar items de media (marcar missing, recomputar URLs)
        if (typeof hydrateMediaItems === 'function') {
            await hydrateMediaItems();
        }

        // Re-renderizar columnas con la sesión cargada.
        // Sin esto, state.queue se restaura pero el DOM queda vacío.
        if (state.session) {
            renderChorus();
            renderBibles();
            renderMedia();
            if (state.selectedCanto) renderStanzas();
            if (state.selectedBible) renderVerses();
        }

        // ---------- 11. Listeners globales ----------
        initWindowControls();
        initGlobalListeners();

        // ---------- 12. Iconos y fuentes ----------
        applyTranslations();
        createIcons();

        await Promise.race([
            document.fonts.ready,
            new Promise(r => setTimeout(r, 1500))
        ]);
        await new Promise(r => setTimeout(r, 150));
    } catch (err) {
        console.error('Error during startup: ', err);
    } finally {
        const app = $('app');

        // Aplicar orden guardado (si no hay columnOrder, queda el orden natural del HTML)
        if (app && zionLyricsObj.columnOrder) {
            zionLyricsObj.columnOrder.forEach(id => {
                const el = $(id);
                if (el) app.appendChild(el);
            });
        }

        // Aplicar modo de proyección: 'inline' | 'bottom' | 'top'
        if (app) {
            const pos = zionLyricsObj.projectionPosition || 'inline';
            app.classList.toggle('layout-projection-bottom', pos === 'bottom');
            app.classList.toggle('layout-projection-top',    pos === 'top');
            
            // Restaurar la altura guardada de la fila de proyección
            if (zionLyricsObj.projectionHeight) {
                document.documentElement.style.setProperty('--layout-projection-row', zionLyricsObj.projectionHeight);
            }
        }

        // Recrear resizers en el orden actual (idempotente)
        if (typeof refreshResizers === 'function') {
            refreshResizers();
        }

        hideSplash();
    }
});


// ==========================================================
// Controles de ventana (una sola vez)
// ==========================================================
function initWindowControls() {
    const tbMin = $('tb-minimize');
    const tbMax = $('tb-maximize');
    const tbClose = $('tb-close');

    if (tbMin)   tbMin.addEventListener('click',   () => window.electronAPI.windowMinimize());
    if (tbMax)   tbMax.addEventListener('click',   () => window.electronAPI.windowMaximize());
    if (tbClose) tbClose.addEventListener('click', () => requestQuit());

    // Doble clic en la barra
    const titlebar = $('custom-titlebar');
    if (titlebar) {
        titlebar.addEventListener('dblclick', (e) => {
            if (e.target.closest('.titlebar-btn, .code-btn, .dropdown-menu')) return;
            window.electronAPI.windowMaximize();
        });
    }

    // Plataforma
    if (window.electronAPI?.platform === 'darwin') {
        document.documentElement.classList.add('is-mac');
    }
}

// ==========================================================
// Listeners globales (una sola vez)
// ==========================================================
function initGlobalListeners() {
    // ---------- Tema  ----------
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', (e) => {
        const root = document.documentElement;
        const isDark = e.matches;
        root.setAttribute('data-theme', isDark ? 'dark' : 'light');
        updateThemeIcon(isDark);
    });

    // ---------- Cierre de menús: UN solo listener ----------
    document.addEventListener('click', (e) => {
        if (e.target.closest('.dropdown-menu'))   return;
        if (e.target.closest('.header-actions'))  return;
        if (e.target.closest('#custom-titlebar')) return;
        if (e.target.closest('.picker-popup'))    return;
        closeAllDropdowns();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeAllDropdowns();
    });

    // ---------- Menú contextual ----------
    document.addEventListener('contextmenu', (e) => {
        if (e.target.closest('input, textarea, select, [contenteditable="true"]')) return;

        // macOS: Ctrl+left-click NO dispara `click`, solo `contextmenu`.
        // En cards de las 3 columnas, redirigimos a la selección (multiselect)
        // en lugar de abrir el menú global.
        if (e.ctrlKey) {
            const card = e.target.closest('.canto-card, .bible-card, .media-card');
            if (card) {
                e.preventDefault();
                if (card.classList.contains('canto-card')) {
                    handleChorusCardClick(card.dataset.id, e);
                } else if (card.classList.contains('bible-card')) {
                    handleBibleCardClick(card.dataset.id, e);
                } else if (card.classList.contains('media-card')) {
                    handleMediaCardClick(card.dataset.id, e);
                }
                return;
            }
        }

        e.preventDefault();
        openAppMenu({ x: e.clientX, y: e.clientY });
    });

    // ---------- Cierre nativo (macOS: semáforo, Cmd+Q, Cmd+W) ----------
    // El renderer recibe el pedido, corre requestQuit (que ya maneja DataBinding.hasChanges + sesión + confirm de 3 botones), y si
    // procede, avisa a main.js para que deje cerrar.
    if (window.electronAPI.onBeforeCloseRequest) {
        window.electronAPI.onBeforeCloseRequest(() => {
            // requestQuit hace _quitInProgress check + todo el flujo
            requestQuit(null, null, false);
        });
    }

    // ---------- Cierre de proyector ----------
    window.electronAPI.onProjectorClosed((displayId) => {
        if (state.projectorWindows) delete state.projectorWindows[displayId];
        ProyController.clear(displayId);
        ProyController.refreshOnAirIndicators();
    });

    // ---------- Cierre de proyector inesperada ----------
    window.electronAPI.onProjectorFallbackWarning(({ label, chosenLabel }) => {
        customAlert(setLang('str194').replace('{n}',label).replace('{m}',chosenLabel));
    });

    // ---------- Cambio de dispositivos de audio ----------
    if (navigator.mediaDevices?.addEventListener) {
        navigator.mediaDevices.addEventListener('devicechange', () => populateAudioOutputs());
    }

    // ---------- Delegación global data-function ----------
    document.addEventListener('click', (e) => {
        const el = e.target.closest('[data-function]');
        if (!el) return;
        if (el.matches('[type="checkbox"]')) return;
        setupDataFunction(e);
    }, true);

    document.addEventListener('change', (e) => {
        const el = e.target.closest('[data-function]');
        if (!el) return;
        if (!el.matches('[type="checkbox"]')) return;
        setupDataFunction(e);
    }, true);

    // ---------- Errores del proyector ----------
    window.electronAPI.onProjectorError(({ displayId, message }) => {
        const display = state.settings.connectedDisplays.find(d => d.id === displayId);
        const label = display ? display.label : displayId;
        
        // customAlert muta a popover si ProyController.isProjecting() es true
        customAlert(setLang('str299').replace('{n}', label).replace('{m}', message));
    });

    // ---------- Re-sincronizar selección tras cada click ----------
    // MultiDrag deselecciona en clicks fuera del contenedor sortable.
    // El Set (_chorusSelectedIds, _bibleSelectedIds, _mediaSelectedIds)
    // es la fuente de verdad. Después de que MultiDrag complete su
    // deselect interno (bubble phase), restauramos el estado visual
    // desde el Set con setTimeout(0).
    document.addEventListener('click', () => {
        setTimeout(() => {
            if (typeof syncChorusSelection === 'function') syncChorusSelection();
            if (typeof syncBibleSelection  === 'function') syncBibleSelection();
            if (typeof syncMediaSelection  === 'function') syncMediaSelection();
        }, 0);
    });
}

// ==========================================
// Bloqueo de teclas no deseadas
// ==========================================
document.addEventListener('keydown', function (e) {
    if (!e || typeof e.key !== 'string') return;

    const blockedKeys = ['F5', 'F12', 'F11', 'F3', 'F7', 'F1'];

    let combo = e.key;
    if (e.ctrlKey || e.metaKey) combo = 'MOD+' + combo;
    if (e.shiftKey && e.key !== 'Shift') {
        if (combo.startsWith('MOD+')) combo = combo.replace('MOD+', 'MOD+Shift+');
        else                          combo = 'Shift+' + combo;
    }
    combo = combo.toUpperCase();

    const blockedCombos = [
        'MOD+R', 'MOD+SHIFT+R', 'MOD+SHIFT+I', 'MOD+SHIFT+J',
        'MOD+U', 'MOD+SHIFT+U', 'MOD+O', 'MOD+P', 'MOD+S',
    ];

    if (e.key === 'F12' || blockedKeys.includes(combo) || blockedCombos.includes(combo)) {
        e.preventDefault();
        e.stopPropagation();
        return false;
    }
});