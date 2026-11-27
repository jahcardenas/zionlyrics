
window.zionLyricsObj = {
    appVersion:            '',
    bibleVersion:          '',
    showInactive:          false,
    showTooltips:          true,
    keepPreviousSelection: false,
    selectedDisplayIndex:  0,
    columnWidths:          [18, 30, 20, 31],
    projectionHeight:      '40%',
    columnOrder:           null,
    projectionPosition:    'inline',
    mediaLibrary:          [],
    displays:              {},
    lastModified:          0,
    debugLogging:          false,
    connectedDisplays:     [],
    currentLocale:         { id: 'es' },
    sessionAutosave:       true,
    sessionAutoDelete:     7,
    marquees:              [],
    tonoSystem:            'latino',
    chorusFilterNotation:  'both',
    defaultFont:    null,
    availableFonts: [],
    themeAssignments: {
        chorus:   { all: null, groups: [], singles: {} },
        verse:    { all: null, books: {}, ranges: [], singles: {} },
        displays: {}
    },
    typography: {
        uiFont: 'auto',
        defaultContentFont: 'auto',
        languageFonts: {}, // Ej: { 'Ελληνικά': 'Noto Sans', 'עברית': 'Soto Sans Hebrew' }
        bibleFonts: {}     // Ej: { 'RVR1960': 'auto', 'SBLGNT': 'Gentium Plus' }
    },
};

window.state = {
    dataSource: { choruses: [], bibles: [] },
    settings: zionLyricsObj,
    selectedCanto: null,
    selectedBible: null,
    projectorWindows: {},
    queue: { choruses: [], bibles: [], media: [] },
    outputTargets: { choruses: [], bibles: [], media: [] },
    marqueeDraft: null,
    marqueeSourceId: null,
    wordyDraft: null,
    wordySourceId: null,
    session: null,
    sessionFileName: null,
    chorusEditId: null,
    availableLocales:      [],
    themes:                [],
};

window.state.mediaThumbs = new Map();

let adminSelectedId = null;
let resizerData = null;
let monitorPollingInterval = null;
let isRefreshingMonitors = false;
let lastDisplayFingerprint = '';
let targetDisplayId = null;
let _bibleAdminSelectedIdx = new Set();
let _mlibCurrentContext = 'background';
let _mlibCurrentFilter = 'all';
let _allowUnload = false;
let _quitInProgress = false;
let _adminMonitorsTimer = null;
let _lastAdminMonitorsSig = null;
let _audioDevicesMap = {};
let _chorusModalSelectedIds = new Set();
let _chorusModalAnchorId = null;
let _chorusModalLastClicked = null;
let _chorusFilterTipos = new Set();
let _chorusFilterTonos = new Set();
let _lastRenderedChorusIds = new Set();
let _lastRenderedStanzaIds = new Set();
let _lastRenderedChips = new Set();
let _lastStanzaOwnerId = null;
let _bibleListTracker = null;
let _bibleVerseTracker = null;
let _fontPreviewSample = null;
let _chorusSelectedIds = new Set();
let _chorusAnchorId = null;
let _chorusLastClicked = null;
let _bibleSelectedIds = new Set();
let _bibleAnchorId = null;
let _bibleLastClicked  = null;

const _modalHtmlCache = new Map();
const DROP_ZONES = { top: 0.20, bottom: 0.20 };
const CONFIG_STORAGE_KEY = 'zion_lyrics_obj';
const MONITOR_ICON_SVGS = {
    monitor:   '<i data-lucide="monitor"></i>',
    tv:        '<i data-lucide="tv"></i>',
    projector: '<i data-lucide="projector"></i>'
};
const GRID_HEIGHTS = {
    projectionTopRow:    'minmax(180px, 40%)',   // fila de proyección (top/bottom)
    mainRowMin:          '1fr'                   // fila de las 3 columnas
};


// PROVIDERS DE OPCIONES PARA SINGLE PICKER
const SINGLE_PROVIDERS = {
    'bible-versions': () => (state.dataSource.bibles || []).map(b => ({
        value: b.bible,
        label: b.bible + (b.abbrev ? ` (${b.abbrev})` : '')
    })),

    'fonts': () => {
        const opts = [{ value: '', label: setLang('str265') }];
        (zionLyricsObj.availableFonts || []).forEach(f => {
            opts.push({ value: f.family, label: f.family });
        });
        return opts;
    },

    'coro-valign': () => [
        { value: 'center', label: setLang('str238') },
        { value: 'top',    label: setLang('str239') },
        { value: 'bottom', label: setLang('str240') }
    ],

    'logo-position': () => [
        { value: 'left',  label: setLang('str241') },
        { value: 'right', label: setLang('str242') }
    ],

    'logo-animation': () => [
        { value: 'none',  label: setLang('str219') },
        { value: 'pulse', label: setLang('str243') },
        { value: 'float', label: setLang('str244') }
    ],

    'bg-speed': () => [
        { value: '0.25', label: '0.25x' },
        { value: '0.5',  label: '0.5x' },
        { value: '0.75', label: '0.75x' },
        { value: '1',    label: '1x' },
        { value: '1.5',  label: '1.5x' },
        { value: '2',    label: '2x' }
    ],

    'audio-output': () => {
        const opts = [];// = [{ value: '', label: setLang('str263') }];
        Object.keys(_audioDevicesMap).forEach(label => {
            opts.push({ value: _audioDevicesMap[label], label });
        });
        return opts;
    },

    'tipo': () => [
        { value: 'Alabanza',  label: setLang('str245') },
        { value: 'Adoración', label: setLang('str246') }
    ],

    'tono': () => ({
        groups: [
            {
                id: 'latino',
                label: 'Latino',
                options: [
                    { value: 'Do',   label: 'Do'  },
                    { value: 'Do#',  label: 'Do#' },
                    { value: 'Reb',  label: 'Reb' },
                    { value: 'Re',   label: 'Re'  },
                    { value: 'Re#',  label: 'Re#' },
                    { value: 'Mib',  label: 'Mib' },
                    { value: 'Mi',   label: 'Mi'  },
                    { value: 'Fa',   label: 'Fa'  },
                    { value: 'Fa#',  label: 'Fa#' },
                    { value: 'Solb', label: 'Solb'},
                    { value: 'Sol',  label: 'Sol' },
                    { value: 'Sol#', label: 'Sol#'},
                    { value: 'Lab',  label: 'Lab' },
                    { value: 'La',   label: 'La'  },
                    { value: 'La#',  label: 'La#' },
                    { value: 'Sib',  label: 'Sib' },
                    { value: 'Si',   label: 'Si'  }
                ]
            },
            {
                id: 'anglo',
                label: 'Anglosajón',
                options: [
                    { value: 'C',  label: 'C'  },
                    { value: 'C#', label: 'C#' },
                    { value: 'Db', label: 'Db' },
                    { value: 'D',  label: 'D'  },
                    { value: 'D#', label: 'D#' },
                    { value: 'Eb', label: 'Eb' },
                    { value: 'E',  label: 'E'  },
                    { value: 'F',  label: 'F'  },
                    { value: 'F#', label: 'F#' },
                    { value: 'Gb', label: 'Gb' },
                    { value: 'G',  label: 'G'  },
                    { value: 'G#', label: 'G#' },
                    { value: 'Ab', label: 'Ab' },
                    { value: 'A',  label: 'A'  },
                    { value: 'A#', label: 'A#' },
                    { value: 'Bb', label: 'Bb' },
                    { value: 'B',  label: 'B'  }
                ]
            }
        ],
        persistKey: 'tonoSystem',
        activeGroup: zionLyricsObj.tonoSystem || 'latino'
    }),

    'marquee-position': () => [
        { value: 'top',    label: setLang('str239') },
        { value: 'bottom', label: setLang('str240') }
    ],

    'marquee-duration-mode': () => [
        { value: 'cycles',  label: setLang('str247') },
        { value: 'seconds', label: setLang('str248') }
    ],

    'marquee-animation': () => [
        { value: 'none',   label: setLang('str219') },
        { value: 'fade',   label: setLang('str249') },
        { value: 'slide',  label: setLang('str250') },
        { value: 'zoom',   label: setLang('str251') },
        { value: 'bounce', label: setLang('str252') }
    ],

    'font-weight': () => [
        { value: '300', label: 'Light' },
        { value: '400', label: 'Regular' },
        { value: '500', label: 'Medium' },
        { value: '600', label: 'Semibold' },
        { value: '700', label: 'Bold' },
        { value: '800', label: 'Extrabold' },
        { value: '900', label: 'Black' }
    ],

    'anim-type': () => [
        { value: 'none',      label: setLang('str219') },
        { value: 'fade',      label: 'Fade' },
        { value: 'slide-up',  label: 'Slide Up' },
        { value: 'zoom',      label: 'Zoom' }
    ],

    'panel-border': () => [
        { value: '0',   label: setLang('str219') }, // Ninguna
        { value: '0.5', label: setLang('str337') }, // Pequeño
        { value: '1.2', label: setLang('str338') }, // Mediano
        { value: '2',   label: setLang('str339') }, // Grande
        { value: '4',   label: setLang('str340') }  // Redondo
    ],

    'monitor-types': () => [
        { value: 'coros',        label: setLang('str2')  },
        { value: 'versiculos',   label: setLang('str7')  },
        { value: 'multimedia',   label: setLang('str9')  },
        { value: 'anuncios',     label: setLang('str290') },
        { value: 'staff-musica', label: setLang('str291') },
        { value: 'predicador',   label: setLang('str292') },
        { value: 'controlador',  label: setLang('str295') }
    ],

    'sermon-anim': () => [
        { value: 'none',      label: setLang('str219') }, // Ninguna
        { value: 'fade-up',   label: setLang('str347') }, // Desvanecer hacia arriba
        { value: 'fade-down', label: setLang('str348') }, // Desvanecer hacia abajo
        { value: 'zoom',      label: setLang('str251') }, // Zoom suave
        { value: 'slide-left',label: setLang('str349') }  // Deslizar desde la izquierda
    ],

    'session-auto-delete': () => [
        { value: '0',  label: setLang('str216') },
        { value: '7',  label: setLang('str313') },
        { value: '14', label: setLang('str314') },
        { value: '28', label: setLang('str315') }
    ],
};

function defaultTheme() {
    return {
        id: `theme-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: '',
        customLayers: defaultCustomLayers(),
        contentStyles: defaultContentStyles()
    };
}

// DEFAULTS DE CONFIGURACIÓN POR MONITOR
function defaultCustomLayers() {
    return {
        background:  { 
            type: 'color', 
            value: '#000000', 
            speed: 1 
        },
        logo: { 
            url: '', 
            position: 'left', 
            animation: 'none',
            opacity: 1,
            contexts: { 
                coros: true, 
                citas: true, 
                multimedia: true 
            } 
        },
        placeholder: { 
            type: 'text', 
            value: setLang('str136'),
            bgColor: '#000000'
        },
        marquee:     {
            visible: false,
            text: '',
            position: 'bottom',
            bgColor: '#000000',
            color: '#ffffff',
            fontSize: 3,
            fontWeight: '600',
            speed: 60,
            fontFamily: "",
            durationMode: 'cycles',
            durationValue: 3,
            animation: 'slide'
        },
        sermon:      { 
            visible: false, 
            text: '', 
            color: '#ffffff', 
            bgColor: 'transparent', 
            fontSize: 2.5,
            animation: 'fade-up',
            trigger: { type: 'verses', value: 3 }
        },
        panel: {
            visible: false,
            position: { x: 50, y: 50 },
            size: { 
                width: 60, 
                height: 40 
            },
            color: '#000000',
            opacity: 0.5,
            borderRadius: '1.2',
            animation: 'none',
            shadow: { 
                enabled: false, 
                color: '#000000', 
                opacity: 0.9, 
                blur: 15, 
                offsetX: 0, 
                offsetY: 0 
            }
        },
        transitions: {
            chorus: { type: 'fade', duration: 300 },
            verse:  { type: 'fade', duration: 300 },
            media:  { type: 'fade', duration: 300 }
        },
        audioOutput: ''
    };
}

function migrateContentStylesPositions() {
    let changed = false;

    const CO_CELL = {
        'top-left':      [0,   0  ],
        'top-center':    [50,  0  ],
        'top-right':     [100, 0  ],
        'middle-left':   [0,   50 ],
        'middle-center': [50,  50 ],
        'middle-right':  [100, 50 ],
        'bottom-left':   [0,   100],
        'bottom-center': [50,  100],
        'bottom-right':  [100, 100]
    };

    const CV_CELL = {
        'top':    [50, 0,   'top-center'],
        'center': [50, 50,  'middle-center'],
        'bottom': [50, 100, 'bottom-center']
    };

    function toXY(v, table) {
        if (v && typeof v === 'object') return v;   // ya migrado
        if (typeof v !== 'string') return null;
        const a = table[v];
        if (!a) return null;
        return { x: a[0], y: a[1], anchor: a[2] || v };
    }

    Object.values(zionLyricsObj.displays || {}).forEach(entry => {
        const s = entry.contentStyles;
        if (!s) return;

        ['verseRefPos', 'verseTextPos', 'verseVersionPos'].forEach(k => {
            const xy = toXY(s[k], CO_CELL);
            if (xy && s[k] !== xy) {
                s[k] = xy;
                changed = true;
            }
        });

        if (typeof s.coroVAlign === 'string') {
            const xy = toXY(s.coroVAlign, CV_CELL);
            if (xy) {
                s.coroPos = xy;
                delete s.coroVAlign;
                changed = true;
            }
        }
    });

    return changed;
}

function defaultContentStyles() {
    return {
        contentPadding:   2,
        useEditorLayout:  true,
        refSize:          3,
        verseSize:        5,
        versionSize:      2.5,
        coroSize:         5,
        coroPos:         { x: 50, y: 50,  anchor: 'middle-center' },
        verseVAlign:      'center',
        verseAlign:       'center',
        verseNumberColor: '#ff5555',
        verseOrder:       ['ref', 'text', 'version'],
        verseRefPos:     { x: 50, y: 0,   anchor: 'top-center' },
        verseTextPos:    { x: 50, y: 50,  anchor: 'middle-center' },
        verseVersionPos: { x: 50, y: 100, anchor: 'bottom-center' },
        refColor:         '#ffffff',
        refShadow:        false,
        versionColor:     '#ffffff',
        versionShadow:    false,
        verseColor:       '#ffffff',
        verseShadow:      false,
        coroColor:        '#ffffff',
        coroShadow:       false,
        refFont:          null,
        versionFont:      null,
        verseFont:        null,
        coroFont:         null,
        marqueeFont:      null,
        sermonFont:       null,
        wordyFont:        null,
        coroWeight:       '600',
        refAnim:          'fade',
        verseAnim:        'fade',
        versionAnim:      'fade',
        refWeight:        '400',
        verseWeight:      '400',
        versionWeight:    '400',
        textShadow: {
            coro:    { enabled: false, color: '#000000', opacity: 0.9, blur: 5, offsetX: 0, offsetY: 0 },
            ref:     { enabled: false, color: '#000000', opacity: 0.9, blur: 5, offsetX: 0, offsetY: 0 },
            verse:   { enabled: false, color: '#000000', opacity: 0.9, blur: 5, offsetX: 0, offsetY: 0 },
            version: { enabled: false, color: '#000000', opacity: 0.9, blur: 5, offsetX: 0, offsetY: 0 }
        }
    };
}

function defaultMarqueeDraft() {
    return {
        text: '',
        fontFamily: '',
        fontWeight: '600',
        fontSize: 3,
        color: '#ffffff',
        bgColor: '#000000',
        position: 'bottom',
        speed: 60,
        durationMode: 'cycles',
        durationValue: 3,
        animation: 'slide',
        targetDisplays: []
    };
}

function getTipoLabel(value) {
    const opts = SINGLE_PROVIDERS['tipo']();
    const found = opts.find(o => o.value === value);
    return found ? found.label : (value || '—');
}

function getTonoLabel(value) {
    const raw = SINGLE_PROVIDERS['tono']();
    const flat = raw.groups ? raw.groups.flatMap(g => g.options) : raw;
    const found = flat.find(o => o.value === value);
    return found ? found.label : (value || '—');
}

function getFontPreviewSample() {
    if (_fontPreviewSample) return _fontPreviewSample;

    // Con lazy-loading, solo la biblia activa tiene libros en memoria.
    // Usamos la función getCurrentBibleVersion() que ya valida esto.
    const activeBible = typeof getCurrentBibleVersion === 'function' ? getCurrentBibleVersion() : null;
    
    // Fallback por si getCurrentBibleVersion no está disponible (retrocompatibilidad)
    const bible = activeBible || (state.dataSource.bibles || []).find(b => b.books && b.books.length > 0);
    
    const book = bible?.books?.[Math.floor(Math.random() * (bible?.books?.length || 0))];
    const chapter = book?.chapters?.[Math.floor(Math.random() * (book?.chapters?.length || 0))];
    const verse = chapter?.verses?.[Math.floor(Math.random() * (chapter?.verses?.length || 0))];

    if (verse && typeof verse === 'string' && verse.trim()) {
        const text = verse.trim();
        _fontPreviewSample = text.length > 90 ? text.slice(0, 87) + '…' : text;
        return _fontPreviewSample;
    }

    const choruses = state.dataSource.choruses || [];
    const chorus = choruses[Math.floor(Math.random() * choruses.length)];
    const stanza = chorus?.estrofas?.[Math.floor(Math.random() * (chorus?.estrofas?.length || 0))];

    if (stanza?.texto) {
        const text = stanza.texto.replace(/\[[^\]]+\]/g, '').replace(/\n/g, ' ').trim();
        if (text) {
            _fontPreviewSample = text.length > 90 ? text.slice(0, 87) + '…' : text;
            return _fontPreviewSample;
        }
    }

    _fontPreviewSample = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz 0123456789';
    return _fontPreviewSample;
}

function openFontRolePicker(anchorEl, fontFamily) {
    const typography = zionLyricsObj.typography || {};
    const uiFont = typography.uiFont || 'auto';
    const contentFont = typography.defaultContentFont || 'auto';
    const isUI = uiFont === fontFamily;
    const isContent = contentFont === fontFamily;

    const content = `
        <div class="cc-mp-title">${setLang('str365')}"${escapeHtml(fontFamily)}"</div>
        <div class="cc-mp-options">
            <label class="chk-custom" style="margin-bottom: 8px;">
                <input type="checkbox" id="role-ui" ${isUI ? 'checked' : ''}>
                <span class="chk-box"></span>
                <span class="chk-label">${setLang('str358')}</span>
            </label>
            <label class="chk-custom">
                <input type="checkbox" id="role-content" ${isContent ? 'checked' : ''}>
                <span class="chk-box"></span>
                <span class="chk-label">${setLang('str359')}</span>
            </label>
        </div>
        <div class="cc-mp-actions modal-footer-right">
            <div class="code-btn code-btn-primary font-roles-save">${setLang('str57')}</div>
            <div class="code-btn code-btn-cancel font-roles-cancel">${setLang('str38')}</div>
        </div>
    `;

    PickerBase.open(anchorEl, {
        className: 'multi-picker',
        minWidth: 280,
        content,
        onMount(el, closeFn) {
            el.querySelector('.font-roles-save').addEventListener('click', () => {
                const wantUI = el.querySelector('#role-ui').checked;
                const wantContent = el.querySelector('#role-content').checked;

                if (!zionLyricsObj.typography) zionLyricsObj.typography = {};
                
                if (wantUI) zionLyricsObj.typography.uiFont = fontFamily;
                else if (zionLyricsObj.typography.uiFont === fontFamily) zionLyricsObj.typography.uiFont = 'auto';

                if (wantContent) zionLyricsObj.typography.defaultContentFont = fontFamily;
                else if (zionLyricsObj.typography.defaultContentFont === fontFamily) zionLyricsObj.typography.defaultContentFont = 'auto';

                saveZionLyricsObj();
                Fonts.applyFontVariables();
                closeFn();
                renderAdminFonts();
            });
            el.querySelector('.font-roles-cancel').addEventListener('click', closeFn);
        }
    });
}

function renderAdminFonts() {
    const container = $('admin-fonts-rows');
    if (!container) return;
    container.innerHTML = '';

    const fonts = zionLyricsObj.availableFonts || [];
    if (fonts.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'app-card-empty';
        empty.textContent = setLang('str288');
        container.appendChild(empty);
        return;
    }

    const sample = getFontPreviewSample();
    
    // Asegurar que el objeto typography exista
    if (!zionLyricsObj.typography) {
        zionLyricsObj.typography = { uiFont: 'auto', defaultContentFont: 'auto', languageFonts: {}, bibleFonts: {} };
    }
    const typography = zionLyricsObj.typography;

    fonts.forEach(f => {
        const isUI = typography.uiFont === f.family;
        const isContent = typography.defaultContentFont === f.family;

        const card = document.createElement('div');
        card.className = 'chorus-card app-card';

        const body = document.createElement('div');
        body.className = 'chorus-card-body';

        const title = document.createElement('div');
        title.className = 'lang-card-title';
        title.textContent = f.family;

        const meta = document.createElement('div');
        meta.className = 'chorus-card-meta';
        meta.style.fontFamily = `'${f.family}', ${f.type === 'serif' ? 'serif' : 'sans-serif'}`;
        meta.style.fontSize = '13px';
        meta.textContent = sample;

        // Badges de roles activos
        if (isUI) {
            const b = document.createElement('span');
            b.className = 'monitor-type-badge';
            b.style.background = 'rgba(37, 99, 235, 0.13)';
            b.style.color = '#2563eb';
            b.textContent = setLang('str360');
            meta.appendChild(b);
        }
        if (isContent) {
            const b = document.createElement('span');
            b.className = 'monitor-type-badge';
            b.style.background = 'rgba(22, 163, 74, 0.13)';
            b.style.color = '#16a34a';
            b.textContent = setLang('str55');
            meta.appendChild(b);
        }

        body.appendChild(title);
        body.appendChild(meta);

        const actions = document.createElement('div');
        actions.style.cssText = 'display:flex; align-items:center; gap:8px; flex-shrink:0;';

        const btn = document.createElement('div');
        btn.className = 'monitor-card-add'; // Reusamos el estilo del botón "+"
        btn.textContent = '+';
        btn.title = 'Asignar roles a esta fuente';
        btn.onclick = (e) => {
            e.stopPropagation();
            openFontRolePicker(btn, f.family);
        };
        actions.appendChild(btn);

        card.appendChild(body);
        card.appendChild(actions);
        container.appendChild(card);
    });

    if (typeof createIcons === 'function') createIcons();
    applyTranslations(container);
}

function setDefaultFont(family) {
    zionLyricsObj.defaultFont = family;
    saveZionLyricsObj();
    renderAdminFonts();
}

async function refreshFonts() {
    await Fonts.reconcile();
    _fontPreviewSample = null;
    renderAdminFonts();
}

