let _bibleSelectedBookIdx   = null;
let _bibleSelectedChapter   = null;
let _bibleVerseStart        = null;
let _bibleVerseEnd          = null;


function getVerseText(verses, verseNumber) {
    if (!Array.isArray(verses) || verseNumber < 1 || verseNumber > verses.length) return '';
    const direct = verses[verseNumber - 1];
    if (typeof direct === 'string' && direct.trim() !== '') return direct;
    for (let i = verseNumber; i < verses.length; i++) {
        const next = verses[i];
        if (typeof next === 'string' && next.trim() !== '') return next;
    }
    return '';
}

function verseExists(verses, verseNumber) {
    return Array.isArray(verses) && verseNumber >= 1 && verseNumber <= verses.length;
}

function normalizeBible(data) {
    if (!data || typeof data !== 'object') return data;
    const books = Array.isArray(data.books) ? data.books : [];
    return {
        ...data,
        books: books.map(book => ({
            ...book,
            chapters: (Array.isArray(book.chapters) ? book.chapters : []).map(ch => {
                const raw = ch && ch.chapter;
                let num = 0;
                if (typeof raw === 'number') num = raw;
                else if (typeof raw === 'string') num = parseInt(raw, 10) || 0;
                return { ...ch, chapter: num };
            })
        }))
    };
}

async function loadBibleFromDisk(filename) {
    try {
        const result = await window.electronAPI.loadFile(`json/${filename}`);
        if (!result.success) {
            debugLog('BIBLE', `Failed to read from disk (${filename}):`, result.error);
            return null;
        }

        let data = result.data;
        if (Array.isArray(data) && data.length > 0) data = data[0];

        const v = validateJson(data, [isValidBible]);
        if (!v.ok) {
            debugLog('BIBLE', `Invalid bible structure on disk (${filename})`);
            return null;
        }

        return normalizeBible(data);
    } catch (err) {
        debugLog('BIBLE', `Exception loading bible from disk (${filename}):`, err.message);
        return null;
    }
}

function initBiblePicker() {
    const version = state.dataSource.bibles.find(v => v.bible === state.settings.bibleVersion)
                 || state.dataSource.bibles[0];

    if (!version) {
        const booksEl    = $('bible-books-list');
        const chaptersEl = $('bible-chapters-grid');
        const versesEl   = $('bible-verses-grid');
        if (booksEl) booksEl.innerHTML = `<div style="padding:12px;color:var(--text-muted);" data-i18n="str155"></div>`;
        if (chaptersEl) chaptersEl.innerHTML = '';
        if (versesEl) versesEl.innerHTML = '';
        return;
    }

    _bibleSelectedBookIdx = 0;
    _bibleSelectedChapter = version.books[0]?.chapters?.[0]?.chapter ?? null;

    renderBibleBooksList();
    renderBibleChaptersGrid();
    renderBibleVersesGrid();
}

function getCurrentBibleVersion() {
    const bible = state.dataSource.bibles.find(v => v.bible === state.settings.bibleVersion) 
               || state.dataSource.bibles[0] 
               || null;
               
    // Si no hay biblia o si es un cascarón vacío, retornar null para evitar fallos
    if (!bible || !bible.books || bible.books.length === 0) {
        return null;
    }
    return bible;
}

function renderBibleBooksList() {
    const container = $('bible-books-list');
    if (!container) return;
    const version = getCurrentBibleVersion();
    if (!version) return;

    container.innerHTML = '';
    version.books.forEach((book, idx) => {
        const item = document.createElement('div');
        item.className = 'bible-list-item';
        item.dataset.idx = idx;
        item.textContent = book.name;
        if (idx === _bibleSelectedBookIdx) item.classList.add('active');

        item.onclick = () => {
            if (_bibleSelectedBookIdx === idx) return;
            _bibleSelectedBookIdx = idx;
            _bibleSelectedChapter = version.books[idx]?.chapters?.[0]?.chapter ?? null;
            _bibleVerseStart = null;
            _bibleVerseEnd = null;

            renderBibleBooksList();
            renderBibleChaptersGrid();
            renderBibleVersesGrid();
        };

        container.appendChild(item);
    });

    if (_bibleSelectedBookIdx !== null) {
        const active = container.querySelector('.bible-list-item.active');
        if (active) {
            active.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
    }
}

function renderBibleChaptersGrid() {
    const container = $('bible-chapters-grid');
    if (!container) return;
    const version = getCurrentBibleVersion();
    if (!version || _bibleSelectedBookIdx === null) {
        container.innerHTML = '';
        return;
    }

    const book = version.books[_bibleSelectedBookIdx];
    if (!book) return;

    container.innerHTML = '';
    book.chapters.forEach(ch => {
        const cell = document.createElement('div');
        cell.className = 'bible-cell';
        cell.dataset.chapter = ch.chapter;
        cell.textContent = ch.chapter;
        if (ch.chapter === _bibleSelectedChapter) cell.classList.add('active');

        cell.onclick = () => {
            if (_bibleSelectedChapter === ch.chapter) return;
            _bibleSelectedChapter = ch.chapter;
            _bibleVerseStart = null;
            _bibleVerseEnd = null;

            container.querySelectorAll('.bible-cell').forEach(c => {
                c.classList.toggle('active', parseInt(c.dataset.chapter) === ch.chapter);
            });

            renderBibleVersesGrid();
            renderBibleSelectedList();
        };

        container.appendChild(cell);
    });

    if (window.Anim) {
        const cells = [...container.querySelectorAll('.bible-cell')];
        window.Anim.cellsLayoutEnter(cells, {
            stagger: 30,
            duration: 380,
            from: 'first'
        });
    }

    if (_bibleSelectedChapter !== null) {
        const active = container.querySelector('.bible-cell.active');
        if (active) {
            active.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
    }
}

function renderBibleVersesGrid() {
    const container = $('bible-verses-grid');
    if (!container) return;
    const version = getCurrentBibleVersion();
    if (!version || _bibleSelectedBookIdx === null || _bibleSelectedChapter === null) {
        container.innerHTML = '';
        return;
    }

    const book = version.books[_bibleSelectedBookIdx];
    const chapter = book?.chapters.find(ch => ch.chapter === _bibleSelectedChapter);
    if (!chapter) return;

    container.innerHTML = '';

    // En el nuevo esquema, el número de versículo es el índice + 1.
    // Las celdas se dibujan por índice, no por valor de "v".
    chapter.verses.forEach((_text, idx) => {
        const verseNum = idx + 1;
        const cell = document.createElement('div');
        cell.className = 'bible-cell';
        cell.dataset.verse = verseNum;
        cell.textContent = verseNum;

        cell.onclick = () => handleBibleVerseClick(verseNum, chapter);
        container.appendChild(cell);
    });

    updateBibleVerseRangeClasses();

    if (_bibleVerseStart !== null) {
        const target = container.querySelector(`[data-verse="${_bibleVerseStart}"]`);
        if (target) target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }

    if (window.Anim) {
        const cells = [...container.querySelectorAll('.bible-cell')];
        window.Anim.cellsLayoutEnter(cells, {
            stagger: 22,
            duration: 380,
            from: 'center'
        });
    }
}

function handleBibleVerseClick(verseNum, chapter) {
    if (_bibleVerseStart === null) {
        _bibleVerseStart = verseNum;
        _bibleVerseEnd = null;
    } else if (_bibleVerseEnd === null) {
        _bibleVerseEnd = verseNum;
    } else {
        _bibleVerseStart = verseNum;
        _bibleVerseEnd = null;
    }

    updateBibleVerseRangeClasses();
    renderBibleSelectedList();
}

function updateBibleVerseRangeClasses() {
    const container = $('bible-verses-grid');
    if (!container) return;

    let rangeFrom = null, rangeTo = null;
    if (_bibleVerseStart !== null && _bibleVerseEnd === null) {
        rangeFrom = rangeTo = _bibleVerseStart;
    } else if (_bibleVerseStart !== null && _bibleVerseEnd !== null) {
        rangeFrom = Math.min(_bibleVerseStart, _bibleVerseEnd);
        rangeTo   = Math.max(_bibleVerseStart, _bibleVerseEnd);
    }

    container.querySelectorAll('.bible-cell').forEach(cell => {
        const v = parseInt(cell.dataset.verse);
        cell.classList.remove('range-start', 'range-end', 'range-middle');

        if (rangeFrom === null || rangeTo === null) return;
        if (v === rangeFrom && rangeFrom === rangeTo) {
            cell.classList.add('range-start', 'range-end');
        } else if (v === rangeFrom) {
            cell.classList.add('range-start');
        } else if (v === rangeTo) {
            cell.classList.add('range-end');
        } else if (v > rangeFrom && v < rangeTo) {
            cell.classList.add('range-middle');
        }
    });
}

function renderBibleSelectedList() {
    const container = $('bible-selected-list');
    const box = $('bible-selected-box');
    if (!container || !box) return;

    const fromH = box.offsetHeight;

    container.innerHTML = '';
    const version = getCurrentBibleVersion();

    let rangeFrom = null, rangeTo = null;
    let chapter = null;
    let book = null;

    if (version && _bibleSelectedBookIdx !== null && _bibleSelectedChapter !== null) {
        book = version.books[_bibleSelectedBookIdx];
        chapter = book?.chapters.find(ch => ch.chapter === _bibleSelectedChapter);

        if (_bibleVerseStart !== null && _bibleVerseEnd === null) {
            rangeFrom = rangeTo = _bibleVerseStart;
        } else if (_bibleVerseStart !== null && _bibleVerseEnd !== null) {
            rangeFrom = Math.min(_bibleVerseStart, _bibleVerseEnd);
            rangeTo   = Math.max(_bibleVerseStart, _bibleVerseEnd);
        }
    }

    if (!chapter || rangeFrom === null) {
        container.innerHTML = '<div class="bible-selected-empty">' + setLang('str156') + '</div>';
    } else {
        for (let n = rangeFrom; n <= rangeTo; n++) {
            if (!verseExists(chapter.verses, n)) continue;
            const text = getVerseText(chapter.verses, n);

            const card = document.createElement('div');
            card.className = 'bible-selected-card app-card';

            const num = document.createElement('div');
            num.className = 'bible-selected-num';
            num.textContent = n;

            const textEl = document.createElement('div');
            textEl.className = 'bible-selected-text';
            textEl.textContent = text || '—';   // versículo vacío o fusionado

            card.appendChild(num);
            card.appendChild(textEl);
            container.appendChild(card);
        }

        if (window.Anim) {
            const cards = [...container.querySelectorAll('.bible-selected-card')];
            if (cards.length > 0) {
                window.Anim.cellsEnter(cards, { style: 'slide-up', stagger: 30, duration: 200 });
            }
        }
    }

    if (!window.Anim) return;
    const toH = box.offsetHeight;
    if (Math.abs(toH - fromH) < 2) return;

    box.style.overflow = 'hidden';
    box.style.height = fromH + 'px';
    void box.offsetHeight;
    window.Anim.animateHeight(box, fromH, toH, 260);
}

function performBibleSearch() {
    const input = $('bible-text-filter');
    if (!input) return;

    const raw = input.value.trim();
    if (!raw) return;

    const version = getCurrentBibleVersion();
    if (!version) return;

    // Regex: acepta "Juan 3:16", "1 Juan 3:16", "gn 10:1", "1 jn 2:7".
    // El prefijo [1-3] opcional cubre libros numerados. El nombre puede
    // contener letras y espacios (no dígitos).
    const match = raw.match(/^\s*((?:[1-3]\s+)?[^\d]+?)\s+(\d+)(?::(\d+)(?:-(\d+))?)?\s*$/);
    if (!match) return;

    const parsedBook    = match[1].trim();
    const parsedChapter = parseInt(match[2], 10);
    const parsedStart   = match[3] ? parseInt(match[3], 10) : null;
    const parsedEnd     = match[4] ? parseInt(match[4], 10) : null;

    const norm = s => (s || '').toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/ς/g, 'σ')          // unifica sigma final (ς) con normal (σ)
        .replace(/[ª°]/g, '')
        .replace(/^i+\s+/i, m => `${m.trim().length} `)
        .replace(/\s+/g, ' ').trim();

    const normParsed = norm(parsedBook);

    // Prioridad: abbv exacto → name exacto → name startsWith → name includes.
    // abbv primero porque "gn" es más corto y específico.
    let bookIdxNorm = version.books.findIndex(b => b.abbv && norm(b.abbv) === normParsed);
    if (bookIdxNorm === -1) bookIdxNorm = version.books.findIndex(b => norm(b.name) === normParsed);
    if (bookIdxNorm === -1) bookIdxNorm = version.books.findIndex(b => norm(b.name).startsWith(normParsed));
    if (bookIdxNorm === -1) bookIdxNorm = version.books.findIndex(b => norm(b.name).includes(normParsed));
    if (bookIdxNorm === -1) return;

    _bibleSelectedBookIdx = bookIdxNorm;
    const book = version.books[bookIdxNorm];
    const validChapter = book.chapters.some(ch => ch.chapter === parsedChapter);
    _bibleSelectedChapter = validChapter ? parsedChapter : (book.chapters[0]?.chapter ?? null);

    // Si el versículo no existe, no es error: no seleccionar nada.
    if (parsedStart !== null) {
        const chapter = book.chapters.find(ch => ch.chapter === _bibleSelectedChapter);
        if (!chapter || !verseExists(chapter.verses, parsedStart)) {
            _bibleVerseStart = null;
            _bibleVerseEnd = null;
            renderBibleBooksList();
            renderBibleChaptersGrid();
            renderBibleVersesGrid();
            renderBibleSelectedList();
            return;
        }
    }

    _bibleVerseStart = parsedStart;
    _bibleVerseEnd   = parsedEnd !== null ? parsedEnd : null;

    renderBibleBooksList();
    renderBibleChaptersGrid();
    renderBibleVersesGrid();
    renderBibleSelectedList();
}

async function confirmAddBible() {
    if (!state.queue) state.queue = { choruses: [], bibles: [] };
    if (!state.queue.bibles) state.queue.bibles = [];

    createSessionIfNeeded();

    if (_bibleSelectedBookIdx === null || _bibleSelectedChapter === null || _bibleVerseStart === null) {
        customAlert(setLang('str156'))
        return;
    }

    const version = getCurrentBibleVersion();
    if (!version) return;

    const book = version.books[_bibleSelectedBookIdx];
    const chapter = book?.chapters.find(ch => ch.chapter === _bibleSelectedChapter);
    if (!chapter) return;

    const startVerse = _bibleVerseStart;
    const endVerse   = _bibleVerseEnd !== null ? _bibleVerseEnd : _bibleVerseStart;
    const sortedStart = Math.min(startVerse, endVerse);
    const sortedEnd   = Math.max(startVerse, endVerse);

    const bookName = book.name;
    let ref = `${bookName} ${_bibleSelectedChapter}:${sortedStart}`;
    if (sortedStart !== sortedEnd) ref += `-${sortedEnd}`;

    const alreadyInQueue = state.queue.bibles.some(b => b.ref === ref);
    if (alreadyInQueue) {
        customAlert(setLang('str157').replace('{ref}', ref));
        return;
    }

    // Extraer los strings del rango. Los versículos vacíos se incluyen igual
    // (el usuario verá "—" en la lista). getVerseText no se usa acá: el queue
    // guarda el string tal cual, y el render decide qué mostrar.
    const verses = chapter.verses.slice(sortedStart - 1, sortedEnd);

    const nuevoId = Date.now() + Math.random();
    state.queue.bibles.push({
        id: nuevoId,
        ref: ref,
        acronym: version.abbrev,
        lang: version.lang,
        verses: verses,
        targetDisplayId: targetDisplayId
    });

    renderBibles();
    const newBible = state.queue.bibles.find(b => b.id === nuevoId);
    if (newBible) selectBible(newBible.id);
    persistSession();

    _bibleVerseStart = null;
    _bibleVerseEnd   = null;
    updateBibleVerseRangeClasses();
    renderBibleSelectedList();
}

function getBibleListTracker() {
    if (!_bibleListTracker && window.Anim?.makeListTracker) {
        _bibleListTracker = window.Anim.makeListTracker();
    }
    return _bibleListTracker;
}

function getBibleVerseTracker() {
    if (!_bibleVerseTracker && window.Anim?.makeListTracker) {
        _bibleVerseTracker = window.Anim.makeListTracker();
    }
    return _bibleVerseTracker;
}

function syncBibleSelection() {
    const selected = new Set([..._bibleSelectedIds].map(String));
    document.querySelectorAll('#list-bibles-top .bible-card').forEach(card => {
        card.classList.toggle('active', selected.has(String(card.dataset.id)));
    });
}

function handleBibleCardClick(id, e) {
    const idStr = String(id);
    const entry = state.queue.bibles.find(b => String(b.id) === idStr);
    if (!entry) return;

    const isCtrl  = e.ctrlKey || e.metaKey;
    const isShift = e.shiftKey;
    const isSimpleClick = !isCtrl && !isShift;
    const isSelected = _bibleSelectedIds.has(idStr);
    const keepSelection = isSimpleClick && isSelected && _bibleSelectedIds.size > 1;

    if (keepSelection) {
        _bibleAnchorId    = idStr;
        _bibleLastClicked = idStr;
        state.selectedBible = entry;
        syncBibleSelection();
        renderVerses();
        ProyController.refreshOnAirIndicators();
        return;
    }

    if (isSimpleClick) {
        const card = $$(`#list-bibles-top .bible-card[data-id="${idStr}"]`);
        if (card) clearAllSelections(card);
        _bibleSelectedIds.clear();
        _bibleSelectedIds.add(idStr);
        _bibleAnchorId    = idStr;
        _bibleLastClicked = idStr;
        state.selectedBible = entry;
    } else if (isShift && _bibleAnchorId !== null) {
        const visibleIds = [...document.querySelectorAll('#list-bibles-top .bible-card')]
            .map(c => c.dataset.id)
            .filter(Boolean);
        const anchorIdx = visibleIds.indexOf(_bibleAnchorId);
        const clickIdx  = visibleIds.indexOf(idStr);
        if (anchorIdx !== -1 && clickIdx !== -1) {
            const [from, to] = anchorIdx < clickIdx ? [anchorIdx, clickIdx] : [clickIdx, anchorIdx];
            _bibleSelectedIds.clear();
            for (let i = from; i <= to; i++) _bibleSelectedIds.add(visibleIds[i]);
        } else {
            _bibleSelectedIds.clear();
            _bibleSelectedIds.add(idStr);
        }
        _bibleAnchorId    = idStr;
        _bibleLastClicked = idStr;
        state.selectedBible = entry;
    } else if (isCtrl) {
        if (isSelected) {
            _bibleSelectedIds.delete(idStr);
            if (_bibleLastClicked === idStr) {
                const remaining = [..._bibleSelectedIds];
                _bibleLastClicked = remaining.length > 0 ? remaining[remaining.length - 1] : null;
                state.selectedBible = _bibleLastClicked !== null
                    ? state.queue.bibles.find(b => String(b.id) === _bibleLastClicked)
                    : null;
            }
        } else {
            _bibleSelectedIds.add(idStr);
            _bibleLastClicked = idStr;
            state.selectedBible = entry;
        }
        _bibleAnchorId = idStr;
    }

    syncBibleSelection();
    renderVerses();
    ProyController.refreshOnAirIndicators();
}

function renderBibles() {
    const top = $('list-bibles-top');
    top.innerHTML = '';

    const tracker = getBibleListTracker();
    const currentIds = state.queue.bibles.map(b => String(b.id));
    const newIds = tracker ? tracker.diff(currentIds) : new Set();

    state.queue.bibles.forEach(b => {
        const card = document.createElement('div');
        card.className = 'bible-card app-card';
        card.dataset.id = b.id;

        const play = document.createElement('div');
        play.className = 'canto-card-play';
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

        const body = document.createElement('div');
        body.className = 'bible-card-body';

        const title = document.createElement('div');
        title.className = 'bible-card-title';
        title.textContent = b.ref;

        const meta = document.createElement('div');
        meta.className = 'bible-card-meta';
        meta.textContent = b.acronym || '—';

        body.appendChild(title);
        body.appendChild(meta);

        const actions = document.createElement('div');
        actions.className = 'bible-card-actions';

        const removeBtn = document.createElement('div');
        removeBtn.className = 'code-btn code-btn-danger';
        removeBtn.innerHTML = '<span data-i18n="str4">Quitar</span>';
        removeBtn.onclick = (e) => {
            e.stopPropagation();
            removeBibleById(b.id);
        };
        actions.appendChild(removeBtn);

        card.appendChild(play);
        card.appendChild(body);
        card.appendChild(actions);
        card.onclick = (e) => handleBibleCardClick(b.id, e);

        top.appendChild(card);

        if (newIds.has(String(b.id)) && window.Anim) {
            window.Anim.cardEnter(card);
        }
    });

    syncBibleSelection();
    applyTranslations(top);

    if (window.Anim) {
        window.Anim.makeSortable(
            '#list-bibles-top',
            '.bible-card',
            {
                multiDrag: true,
                selectedClass: 'active',
                getSelectedIds: () => _bibleSelectedIds,
                onReorder: (order) => {
                    const byId = new Map(state.queue.bibles.map(b => [String(b.id), b]));
                    const seen = new Set();
                    const result = [];
                    order.forEach(id => {
                        const key = String(id);
                        if (!byId.has(key) || seen.has(key)) return;
                        seen.add(key);
                        result.push(byId.get(key));
                    });
                    state.queue.bibles.forEach(b => {
                        const key = String(b.id);
                        if (!seen.has(key)) result.push(b);
                    });
                    state.queue.bibles = result;

                    _bibleAnchorId    = null;
                    _bibleLastClicked = null;
                    persistSession();
                }
            }
        );
    }

    if (tracker) tracker.commit(currentIds);

    if (window.ProyController?.refreshOnAirIndicators) {
        ProyController.refreshOnAirIndicators();
    }
}

function renderVerses() {
    const bottom = $('list-bibles-bottom');
    bottom.innerHTML = '';
    if (!state.selectedBible) {
        if (_bibleVerseTracker) _bibleVerseTracker.reset();
        return;
    }

    const baseRef = state.selectedBible.ref;
    const acronimo = state.selectedBible.acronym || '';
    const ownerId = String(state.selectedBible.id);

    const tracker = getBibleVerseTracker();
    const currentIds = state.selectedBible.verses.map((_, i) => String(i));
    const newIds = tracker ? tracker.diff(currentIds, ownerId) : new Set();

    state.selectedBible.verses.forEach((v, idx) => {
        const card = document.createElement('div');
        card.className = 'bible-verse-card app-card';

        const num = document.createElement('div');
        num.className = 'bible-verse-num';
        num.textContent = String(idx + 1);

        const text = document.createElement('div');
        text.className = 'bible-verse-text';
        text.textContent = v || '—';   // versículo vacío (fusionado) → muestra guion

        card.appendChild(num);
        card.appendChild(text);

        card.onclick = function() {
            clearAllSelections(card);
            bottom.querySelectorAll('.bible-verse-card').forEach(el => el.classList.remove('active'));
            card.classList.add('active');

            const top = $('list-bibles-top');
            const topItem = top && state.selectedBible
                ? top.querySelector(`.bible-card[data-id="${state.selectedBible.id}"]`)
                : null;
            if (topItem) {
                top.querySelectorAll('.bible-card.active').forEach(el => el.classList.remove('active'));
                topItem.classList.add('active');
            }

            const parts = baseRef.split(' ');
            const bookName = parts.slice(0, -1).join(' ');
            const chapterVerse = parts[parts.length - 1];
            const [chapterStr, rangeStr] = chapterVerse.split(':');
            const chapterNum = parseInt(chapterStr, 10);
            const verseStart = parseInt(rangeStr.split('-')[0], 10);
            const realVerse  = verseStart + idx;

            const specificRef = `${bookName} ${chapterNum}:${realVerse}`;

            if (state.outputTargets.bibles.length === 0) {
                Tooltip.show($('col-2').querySelector('[data-function="toggleDropdown"]'),
                    setLang('str158'));
                return;
            }

            const targets = state.outputTargets.bibles;
            if (targets.length === 0) return;

            // Si el versículo encolado está vacío (fusionado), mostrar vacío.
            // No se busca el siguiente: el usuario ve lo que hay en el queue.
            ProyController.projectContent(
                targets,
                { type: 'verse', ref: specificRef, text: v || '—', version: acronimo, lang: state.selectedBible.lang },
                null,
                {
                    type: 'verse',
                    queueId: state.selectedBible.id,
                    bookName: bookName,
                    chapter: chapterNum,
                    verse: realVerse,
                    lang: state.selectedBible.lang
                }
            );
        };

        bottom.appendChild(card);

        if (newIds.has(String(idx)) && window.Anim) {
            window.Anim.cardEnter(card);
        }
    });

    if (tracker) tracker.commit(currentIds, ownerId);
    ProyController.refreshOnAirIndicators();
}

function removeBibleById(id) {
    const cita = state.queue.bibles.find(b => String(b.id) === String(id));
    if (!cita) return;

    const card = $$(`#list-bibles-top .bible-card[data-id="${id}"]`);

    const finishRemove = () => {
        ProyController.clear(state.outputTargets.bibles);
        state.queue.bibles = state.queue.bibles.filter(b => String(b.id) !== String(id));

        if (_bibleListTracker) _bibleListTracker.forget(String(id));

        if (state.selectedBible && String(state.selectedBible.id) === String(id)) {
            state.selectedBible = null;
            $('list-bibles-bottom').innerHTML = '';
            if (_bibleVerseTracker) _bibleVerseTracker.reset();
        }

        if (card && card.parentNode) card.remove();
    };

    if (card && window.Anim) {
        window.Anim.cardLeave(card, finishRemove);
    } else {
        finishRemove();
    }
}

function removeBible(el, ev) {
    closeAllDropdowns();

    if (_bibleSelectedIds.size === 0) {
        customAlert(setLang('str212'));
        return;
    }

    if (_bibleSelectedIds.size === 1) {
        removeBibleById([..._bibleSelectedIds][0]);
        return;
    }

    customConfirm(setLang('str309').replace('{n}', _bibleSelectedIds.size)).then(confirmed => {
        if (!confirmed) return;
        const ids = [..._bibleSelectedIds];
        ids.forEach(id => removeBibleById(id));
        _bibleSelectedIds.clear();
        _bibleLastClicked = null;
        _bibleAnchorId    = null;
        syncBibleSelection();
    });
}

async function exportBibles() {
    if (!canOpenFilePicker()) {
        customAlert(setLang('str159'));
        return;
    }

    const indices = [..._bibleAdminSelectedIdx].sort((a, b) => a - b);
    if (indices.length === 0) {
        customAlert(setLang('str306'));
        return;
    }

    try {
        let dataToExport;
        let suggestedName;

        if (indices.length === 1) {
            const selected = state.dataSource.bibles[indices[0]];
            suggestedName = (selected.abbrev || selected.bible) + '.json';

            // Si la biblia no está cargada en memoria (es un cascarón), la leemos del disco
            if (!selected.books || selected.books.length === 0) {
                const loaded = await loadBibleFromDisk(selected.filename);
                if (loaded) {
                    dataToExport = loaded; // Usamos la data temporal del disco
                } else {
                    customAlert(setLang('str163') + 'No se pudo leer la biblia del disco.');
                    return;
                }
            } else {
                dataToExport = selected;
            }
        } else {
            // Para múltiples biblias, cargamos todas las que sean cascarones
            const multipleData = [];
            for (const i of indices) {
                const selected = state.dataSource.bibles[i];
                if (!selected.books || selected.books.length === 0) {
                    const loaded = await loadBibleFromDisk(selected.filename);
                    if (loaded) multipleData.push(loaded);
                } else {
                    multipleData.push(selected);
                }
            }
            dataToExport = multipleData;
            suggestedName = setLang('str302') + '.json';
        }

        const data = JSON.stringify(dataToExport, null, 2);

        if (!window.showSaveFilePicker) {
            const blob = new Blob([data], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = suggestedName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            customAlert(setLang('str160').replace('{n}', suggestedName));
            return;
        }

        const handle = await window.showSaveFilePicker({
            suggestedName: suggestedName,
            types: [{ description: setLang('str161'), accept: { 'application/json': ['.json'] } }]
        });
        const writable = await handle.createWritable();
        await writable.write(data);
        await writable.close();
        customAlert(setLang('str162').replace('{n}', handle.name));

        _bibleAdminSelectedIdx.clear();
        renderAdminBibles();
    } catch (err) {
        if (err.name !== 'AbortError') {
            customAlert(setLang('str163') + err.message);
        }
    }
}

async function importBibles() {
    if (!canOpenFilePicker()) {
        customAlert(setLang('str159'));
        return;
    }

    try {
        const [handle] = await window.showOpenFilePicker({
            types: [{ description: setLang('str161'), accept: { 'application/json': ['.json'] } }],
            multiple: false
        });
        const file = await handle.getFile();
        const text = await file.text();
        const data = JSON.parse(text);

        const incoming = Array.isArray(data) ? data : [data];

        const valid = incoming.filter(b => window.isValidBible(b)).map(b => normalizeBible(b));

        if (valid.length === 0) {
            customAlert(setLang('str164'));
            return;
        }

        const existing = state.dataSource.bibles;
        // Comparamos limpiando espacios y pasando a minúsculas para evitar duplicados invisibles
        const toImport = valid.filter(b => {
            const nameToMatch = (b.bible || '').trim().toLowerCase();
            return !existing.some(e => (e.bible || '').trim().toLowerCase() === nameToMatch);
        });

        if (toImport.length === 0) {
            customAlert(setLang('str165').replace('{n}', valid[0].bible));
            return;
        }

        for (const b of toImport) {
            try {
                await saveSingleBibleToServer(b);
            } catch (saveErr) {
                customAlert(setLang('str167') + saveErr.message);
                return;
            }
        }

        // En lugar de guardar los libros completos, creamos los cascarones
        const newShells = toImport.map(b => ({
            bible: b.bible,
            abbrev: b.abbrev,
            lang: b.lang,
            copyright: b.copyright || "",
            canon: b.canon || "",
            filename: (b.abbrev || b.bible) + '.json',
            books: [] // Cascarón
        }));

        state.dataSource.bibles.push(...newShells);

        // Si no había ninguna biblia (primera importación), la cargamos por completo
        if (state.dataSource.bibles.length === newShells.length) {
            const first = state.dataSource.bibles[0];
            const loaded = await loadBibleFromDisk(first.filename);
            if (loaded) {
                first.books = loaded.books;
                zionLyricsObj.bibleVersion = first.bible;
                saveZionLyricsObj();
            }
        }

        state.dataSource.bibles.push(...toImport);

        _bibleAdminSelectedIdx.clear();
        renderAdminBibles();

        const names = toImport.map(b => b.bible).join(', ');
        customAlert(setLang('str166').replace('{n}', names));
    } catch (err) {
        if (err.name !== 'AbortError') {
            customAlert(setLang('str167') + err.message);
        }
    }
}

function selectBible(id) {
    clearGroupSelection(['cantos', 'multimedia']);
    const idStr = String(id);
    _bibleSelectedIds.clear();
    _bibleSelectedIds.add(idStr);
    _bibleAnchorId    = idStr;
    _bibleLastClicked = idStr;
    state.selectedBible = state.queue.bibles.find(b => String(b.id) === idStr);
    syncBibleSelection();
    renderVerses();
    persistSession();
}

async function saveSingleBibleToServer(bible) {
    const filename = (bible.abbrev || bible.bible) + '.json';
    const result = await window.electronAPI.saveFile('json/' + filename, bible);
    if (!result.success) {
        throw new Error(setLang('str170') + (result.error ? ' ' + result.error : ''));
    }
    return result;
}

function isValidBible(data) {
    if (typeof data !== 'object' || data === null) {
        console.error('[isValidBible] El dato raíz no es un objeto válido:', data);
        return false;
    }
    if (typeof data.bible !== 'string' || data.bible.length === 0) {
        console.error('[isValidBible] Falta o es inválido "bible" (debe ser string no vacío):', data.bible);
        return false;
    }
    if (!Array.isArray(data.books) || data.books.length === 0) {
        console.error(`[isValidBible] En "${data.bible}", "books" no es un arreglo o está vacío:`, data.books);
        return false;
    }

    for (let bIdx = 0; bIdx < data.books.length; bIdx++) {
        const book = data.books[bIdx];
        const bookLabel = book && typeof book.name === 'string' && book.name ? book.name : `[índice ${bIdx}]`;

        if (!book || typeof book !== 'object') {
            console.error(`[isValidBible] En "${data.bible}" -> Libro ${bookLabel}: no es un objeto válido.`, book);
            return false;
        }
        if (typeof book.name !== 'string' || book.name.length === 0) {
            console.error(`[isValidBible] En "${data.bible}" -> Libro ${bookLabel}: "name" inválido:`, book.name);
            return false;
        }
        if (!Array.isArray(book.chapters) || book.chapters.length === 0) {
            console.error(`[isValidBible] En "${data.bible}" -> Libro "${book.name}": "chapters" no es un arreglo o está vacío:`, book.chapters);
            return false;
        }

        for (let cIdx = 0; cIdx < book.chapters.length; cIdx++) {
            const chap = book.chapters[cIdx];
            const chapLabel = chap && chap.chapter !== undefined ? chap.chapter : `[índice ${cIdx}]`;

            if (!chap || typeof chap !== 'object') {
                console.error(`[isValidBible] En "${data.bible}" -> Libro "${book.name}" -> Capítulo ${chapLabel}: no es un objeto válido.`, chap);
                return false;
            }

            // Acepta number o string numérico. NO muta.
            const raw = chap.chapter;
            let num = NaN;
            if (typeof raw === 'number') num = raw;
            else if (typeof raw === 'string' && raw.trim() !== '') num = parseInt(raw, 10);

            if (!isFinite(num) || isNaN(num)) {
                console.error(`[isValidBible] En "${data.bible}" -> Libro "${book.name}" -> Capítulo ${chapLabel}: "chapter" inválido (${typeof raw}):`, raw);
                return false;
            }

            if (!Array.isArray(chap.verses)) {
                console.error(`[isValidBible] En "${data.bible}" -> Libro "${book.name}" -> Capítulo ${num} (índice ${cIdx}): "verses" no es un arreglo:`, chap.verses);
                return false;
            }
        }
    }

    return true;
};

function renderAdminBibles() {
    const container = $('admin-bibles-rows');
    if (!container) return;
    container.innerHTML = '';

    const bibles = state.dataSource.bibles;
    if (!bibles || bibles.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'app-card-empty';
        empty.textContent = setLang('str172');
        container.appendChild(empty);
        return;
    }

    const currentDefault = zionLyricsObj.bibleVersion;

    bibles.forEach((b, idx) => {
        const isDefault = currentDefault === b.bible;
        const isSelected = _bibleAdminSelectedIdx.has(idx);

        const card = document.createElement('div');
        card.className = 'chorus-card app-card';
        if (isSelected) card.classList.add('active');

        const check = document.createElement('div');
        check.className = 'bible-admin-check';
        if (isDefault) {
            check.innerHTML = '<i data-lucide="check-circle" style="width:18px; height:18px;"></i>';
        }
        card.appendChild(check);

        const body = document.createElement('div');
        body.className = 'chorus-card-body';

        const title = document.createElement('div');
        title.className = 'chorus-card-title';
        title.style.marginRight = '8px';
        title.textContent = b.bible || '—';

        const meta = document.createElement('div');
        meta.className = 'chorus-card-meta';
        meta.textContent = [b.lang, b.abbrev].filter(Boolean).join(' · ');

        if (b.canon) {
            const canonTag = document.createElement('span');
            canonTag.className = 'monitor-type-badge';
            
            // Colores por canon
            const canonColors = {
                'protestant': { bg: 'rgba(37, 99, 235, 0.13)', color: '#2563eb', label: 'Protestante' },
                'catholic':   { bg: 'rgba(22, 163, 74, 0.13)',  color: '#16a34a', label: 'Católica' },
                'orthodox':   { bg: 'rgba(147, 51, 234, 0.13)', color: '#9333ea', label: 'Ortodoxa' },
                'ethiopian':  { bg: 'rgba(217, 119, 6, 0.13)',  color: '#d97706', label: 'Etíope' },
                'samaritan':  { bg: 'rgba(234, 88, 12, 0.13)',  color: '#ea580c', label: 'Samaritana' },
                'judaism':    { bg: 'rgba(100, 116, 139, 0.15)', color: '#64748b', label: 'Judaísmo' }
            };
            
            const cfg = canonColors[b.canon] || canonColors['protestant'];
            canonTag.style.background = cfg.bg;
            canonTag.style.color = cfg.color;
            canonTag.style.marginLeft = '8px'; // Separación del texto anterior
            canonTag.textContent = cfg.label;
            
            // Insertar el tag dentro del meta (o al lado del título)
            meta.appendChild(canonTag);
        }

        body.appendChild(title);
        body.appendChild(meta);

        const actions = document.createElement('div');
        actions.style.cssText = 'display:flex; align-items:center; gap:8px; flex-shrink:0;';

        if (!isDefault) {
            const makeDefaultBtn = document.createElement('div');
            makeDefaultBtn.className = 'code-btn code-btn-primary chorus-card-add';
            makeDefaultBtn.innerHTML = '<span data-i18n="str304">Hacer predeterminada</span>';
            makeDefaultBtn.onclick = (e) => {
                e.stopPropagation();
                setDefaultBible(b.bible);
            };
            actions.appendChild(makeDefaultBtn);
        }

        const removeBtn = document.createElement('div');
        removeBtn.className = 'code-btn code-btn-danger chorus-card-add';
        removeBtn.innerHTML = '<span data-i18n="str4">Quitar</span>';
        removeBtn.onclick = async (e) => {
            e.stopPropagation();
            await deleteBibleFromLibrary(b.bible);
        };
        actions.appendChild(removeBtn);

        card.appendChild(body);
        card.appendChild(actions);

        card.onclick = (e) => {
            if (e.target.closest('.chorus-card-add')) return;
            const isMod = e.ctrlKey || e.metaKey;
            if (isMod) {
                if (isSelected) _bibleAdminSelectedIdx.delete(idx);
                else            _bibleAdminSelectedIdx.add(idx);
            } else {
                _bibleAdminSelectedIdx.clear();
                _bibleAdminSelectedIdx.add(idx);
            }
            renderAdminBibles();
        };

        container.appendChild(card);
    });

    if (typeof createIcons === 'function') createIcons();
    applyTranslations(container);
}

async function setDefaultBible(bibleName) {
    if (bibleName === zionLyricsObj.bibleVersion) return;

    const newDefault = state.dataSource.bibles.find(b => b.bible === bibleName);
    const oldDefault = state.dataSource.bibles.find(b => b.bible === zionLyricsObj.bibleVersion);

    if (!newDefault) return;

    // 1. Si la nueva biblia es un cascarón (no tiene libros), la cargamos de disco
    if (!newDefault.books || newDefault.books.length === 0) {
        debugLog('BIBLE', `Loading books for new default: ${newDefault.bible}`);
        const loaded = await loadBibleFromDisk(newDefault.filename);
        
        if (loaded) {
            newDefault.books = loaded.books;
        } else {
            customAlert(setLang('str802').replace('{n}', 'No se pudo cargar la biblia desde el disco.'));
            return;
        }
    }

    // 2. Vaciar los libros de la biblia que antes era la predeterminada (liberar memoria)
    if (oldDefault) {
        debugLog('BIBLE', `Unloading books from previous default: ${oldDefault.bible}`);
        oldDefault.books = [];
    }

    // 3. Guardar el cambio y re-renderizar
    zionLyricsObj.bibleVersion = bibleName;
    await saveZionLyricsObj();
    
    // Refrescar UI
    renderAdminBibles();
    DataBinding.read('#opciones-modal', zionLyricsObj);

    // Refrescar el buscador de biblias si está abierto
    if (typeof initBiblePicker === 'function') {
        initBiblePicker();
    }
}

async function deleteBibleFromLibrary(bibleName) {
    const bible = state.dataSource.bibles.find(b => b.bible === bibleName);
    if (!bible) return;

    const confirmed = await customConfirm(setLang('str307'));
    if (!confirmed) return;

    const fileBase = bible.abbrev || bible.bible;
    try {
        const result = await window.electronAPI.deleteFile('json/' + fileBase + '.json');
        if (!result.success) {
            console.warn('Failed deleting bible file:', result.error);
        }
    } catch (e) {
        console.warn('Failed deleting bible file:', e.message);
    }

    state.dataSource.bibles = state.dataSource.bibles.filter(b => b.bible !== bibleName);

    if (zionLyricsObj.bibleVersion === bibleName) {
        zionLyricsObj.bibleVersion = state.dataSource.bibles[0]?.bible || '';
        saveZionLyricsObj();
    }

    _bibleAdminSelectedIdx.clear();
    renderAdminBibles();
}

function initBibleEvents() {
    const modal = $('agregar-biblia-modal');
    if (!modal) return;
    if (modal._bibleEventsBound) return;
    modal._bibleEventsBound = true;

    const filter = $('bible-text-filter');
    if (filter) {
        filter.addEventListener('input', () => {
            const raw = filter.value.trim();
            if (/^\s*(?:[1-3]\s+)?[^\d]+?\s+\d+/.test(raw)) performBibleSearch();
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        if (!window.ModalManager.isOpen('agregar-biblia-modal')) return;
        if (e.target.tagName === 'TEXTAREA') return;
        e.preventDefault();
        confirmAddBible();
    });
}

async function loadBiblesFromJson() {
    try {
        // 1. Obtener solo las cabeceras (metadata) de disco
        const headers = await window.electronAPI.loadJsonHeaders();
        if (!headers || headers.length === 0) {
            debugLog('LOAD', 'No bible headers found on disk.');
            return;
        }

        // 2. Crear los cascarones
        const newShells = headers.map(h => ({
            bible: h.bible,
            abbrev: h.abbrev,
            lang: h.lang,
            copyright: h.copyright,
            canon: h.canon || "",
            filename: h.filename,
            books: [] // Cascarón vacío
        }));
        // 3. Sincronizar con el estado actual (conservar la activa si ya estaba cargada)
        const prevActive = state.dataSource.bibles.find(b => b.bible === state.settings.bibleVersion);
        const prevActiveBooks = prevActive ? prevActive.books : null;

        state.dataSource.bibles = newShells;

        // 4. Determinar e identificar la biblia por defecto
        let defaultBible = state.dataSource.bibles.find(b => b.bible === state.settings.bibleVersion);
        
        // Si la biblia guardada ya no existe en disco, usar la primera
        if (!defaultBible && state.dataSource.bibles.length > 0) {
            defaultBible = state.dataSource.bibles[0];
            state.settings.bibleVersion = defaultBible.bible;
            saveZionLyricsObj();
        }

        // 5. Cargar los libros de la biblia predeterminada
        if (defaultBible) {
            // Si era la misma que ya estaba cargada, reusar los libros en memoria (optimización)
            if (prevActiveBooks && prevActiveBooks.length > 0) {
                defaultBible.books = prevActiveBooks;
            } else {
                const fullBible = await loadBibleFromDisk(defaultBible.filename);
                if (fullBible) {
                    defaultBible.books = fullBible.books;
                } else {
                    debugLog('LOAD', `Could not load books for default bible: ${defaultBible.bible}`);
                }
            }
        }

        debugLog('LOAD', `Synchronized ${state.dataSource.bibles.length} bible shells. Active: ${state.settings.bibleVersion}`);
        
        renderAdminBibles();
        DataBinding.read('#opciones-modal', zionLyricsObj);

    } catch (err) {
        debugLog('LOAD', 'Error in loadBiblesFromJson:', err.message);
    }
}

function openMultiVerseModal(el, ev) {
    openModal(el, ev, 'multi-verse-add-modal');
}

function initMultiVerseModal() {
    const filter = $('multi-verse-filter');
    if (!filter) return;
    
    // Evitar doble bind
    if (filter._bound) return;
    filter._bound = true;

    filter.addEventListener('input', () => {
        const raw = filter.value.trim();
        if (raw.length > 3) {
            performMultiVerseSearch(raw);
        } else {
            const list = $('multi-verse-list');
            if (list) list.innerHTML = `<div class="app-card-empty">${setLang('str381')}</div>`;
        }
    });
}

function performMultiVerseSearch(rawQuery) {
    const list = $('multi-verse-list');
    if (!list) return;

    // 1. Parsear la referencia (ej: "Juan 3:16")
    // Mismo regex que performBibleSearch
    const match = rawQuery.match(/^\s*((?:[1-3]\s+)?[^\d]+?)\s+(\d+)(?::(\d+)(?:-(\d+))?)?\s*$/);
    if (!match) {
        list.innerHTML = `<div class="app-card-empty">${setLang('str383')}</div>`;
        return;
    }

    const parsedBook    = match[1].trim();
    const parsedChapter = parseInt(match[2], 10);
    const parsedStart   = match[3] ? parseInt(match[3], 10) : 1;

    // 2. Encontrar el código OSIS usando el catálogo
    const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    const normBook = norm(parsedBook);
    
    let targetCode = null;
    for (const [code, entry] of Object.entries(window.BIBLE_BOOK_CATALOG || {})) {
        // Buscar en los nombres (es/en) o en el defaultAbbv
        const matchName = Object.values(entry.names || {}).some(n => norm(n) === normBook);
        const matchAbbv = norm(entry.defaultAbbv) === normBook;
        
        if (matchName || matchAbbv) {
            targetCode = code;
            break;
        }
    }

    if (!targetCode) {
        list.innerHTML = `<div class="app-card-empty">${setLang('str383')}</div>`;
        return;
    }

    // 3. Buscar ese código en todas las biblias
    const availableBibles = state.dataSource.bibles || [];
    const results = [];

    availableBibles.forEach(bible => {
        // Solo buscar en biblias que tengan libros cargados o intentar leerlas (simplificamos asumiendo que si no tiene libros, no la mostramos por ahora para no hacer lento el modal)
        if (!bible.books || bible.books.length === 0) return; 

        // Buscar el libro por el code
        const book = bible.books.find(b => b.code === targetCode);
        if (!book) return;

        const chapter = book.chapters.find(c => c.chapter === parsedChapter);
        if (!chapter) return;

        const verseText = chapter.verses[parsedStart - 1];
        if (verseText === undefined) return;

        results.push({
            bibleName: bible.bible,
            abbrev: bible.abbrev,
            lang: bible.lang,
            text: verseText || '—'
        });
    });

    // 4. Renderizar la lista
    if (results.length === 0) {
        list.innerHTML = `<div class="app-card-empty">${setLang('str383')}</div>`;
        return;
    }

    list.innerHTML = '';
    results.forEach((res, idx) => {
        const label = document.createElement('label');
        label.className = 'chk-custom';
        label.style.padding = '8px 10px';
        label.style.borderRadius = '6px';
        label.style.width = '100%';
        label.style.cursor = 'pointer';
        
        label.innerHTML = `
            <input type="checkbox" class="multi-verse-checkbox" data-idx="${idx}">
            <span class="chk-box"></span>
            <span class="chk-label" style="display: flex; flex-direction: column; gap: 2px;">
                <span style="font-weight: 600; font-size: 13px;">${escapeHtml(res.bibleName)} (${escapeHtml(res.abbrev)})</span>
                <span style="font-size: 12px; color: var(--text-muted);">${escapeHtml(res.text)}</span>
            </span>
        `;
        
        // Al hacer clic, limitar a 3
        label.querySelector('input').addEventListener('change', (e) => {
            const checked = list.querySelectorAll('.multi-verse-checkbox:checked');
            if (checked.length > 3) {
                e.target.checked = false;
                customAlert(setLang('str385'));
            }
        });

        list.appendChild(label);
    });
    
    applyTranslations(list);
}