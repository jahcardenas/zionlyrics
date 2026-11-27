// ==========================================================
// Editor de coros v2 — Tiptap
// ==========================================================
(function () {
    'use strict';

    let _editor = null;
    let _currentCoroId = null;
    let _currentTipo = 'Alabanza';
    let _currentTono = 'Do';
    let _currentNombre = '';
    let _currentAutor = null;
    let _currentActivo = true;
    let _notesMode = false;
    let _selectionDebounce = null;
    let _savedSelection = null;
    let _lastDismissedRange = null;

    function syncToolbar() {
        const draft = state.chorusEditorDraft || {};

        const tipoLabel = document.querySelector('.editor-tipo-label');
        if (tipoLabel) tipoLabel.textContent = getTipoLabel(draft.tipo || 'Alabanza');

        const tonoLabel = document.querySelector('.editor-tono-label');
        if (tonoLabel) tonoLabel.textContent = getTonoLabel(draft.tono || 'Do');

        const tipoBtn = $('editor-coro-tipo-btn');
        if (tipoBtn) tipoBtn.dataset.value = draft.tipo || 'Alabanza';

        const tonoBtn = $('editor-coro-tono-btn');
        if (tonoBtn) tonoBtn.dataset.value = draft.tono || 'Do';

        syncRepiteCounter();
        if (typeof createIcons === 'function') createIcons();
    }

    function syncRepiteCounter() {
        if (!_editor) return;
        const el = document.querySelector('.chorus-editor-repites .repites-count');
        if (!el) return;
        el.textContent = String(_editor.commands.getStanzaRepite());
    }

    function syncToolbarState() {
        syncRepiteCounter();
    }

    function initChorusEditorEvents() {
        const modal = $('editor-coro-modal');
        if (!modal) return;
        if (modal._chorusEditorEventsBound) return;
        modal._chorusEditorEventsBound = true;


        const tipoBtn = $('editor-coro-tipo-btn');
        if (tipoBtn) {
            tipoBtn.addEventListener('mousedown', (e) => e.preventDefault());
            tipoBtn.addEventListener('click', function () {
                MultiPicker.openSingle(this, 'tipo', (value) => {
                    _currentTipo = value;
                    state.chorusEditorDraft.tipo = value;
                    this.dataset.value = value;
                    const labelEl = this.querySelector('.editor-tipo-label');
                    if (labelEl) labelEl.textContent = getTipoLabel(value);
                });
            });
        }

        const tonoBtn = $('editor-coro-tono-btn');
        if (tonoBtn) {
            tonoBtn.addEventListener('mousedown', (e) => e.preventDefault());
            tonoBtn.addEventListener('click', function () {
                openChorusTonePicker(this, _currentTono, (tono) => {
                    _currentTono = tono;
                    state.chorusEditorDraft.tono = tono;
                    this.dataset.value = tono;
                    const labelEl = this.querySelector('.editor-tono-label');
                    if (labelEl) labelEl.textContent = getTonoLabel(tono);
                });
            });
        }

        const acordesBtn = $('editor-coro-acordes-btn');
        if (acordesBtn) {
            acordesBtn.addEventListener('mousedown', (e) => e.preventDefault());
            acordesBtn.addEventListener('click', toggleNotesMode);
        }

        modal.querySelectorAll('[data-editor-cmd]').forEach(btn => {
            btn.addEventListener('mousedown', (e) => e.preventDefault());
            btn.addEventListener('click', (e) => {
                if (!_editor) return;
                const cmd = btn.dataset.editorCmd;
                if (cmd === 'bold')   _editor.chain().focus().toggleBold().run();
                if (cmd === 'italic') _editor.chain().focus().toggleItalic().run();
                if (cmd === 'repite') cycleRepite();
                if (cmd === 'insertBreak') _editor.chain().focus().insertBreak().run();
            });
        });
    }

    function cycleRepite() {
        if (!_editor) return;
        const current = _editor.commands.getStanzaRepite();
        const next = current >= 10 ? 1 : current + 1;
        _editor.commands.setStanzaRepite(next);
        syncRepiteCounter();
    }

    function openChorusTonePicker(anchor, currentValue, onSelect, forcedNotation, onClose) {
        if (!anchor) return;

        const forced = (forcedNotation === 'latino' || forcedNotation === 'anglo')
            ? forcedNotation
            : null;
        const showSwitch = !forced;
        const isChordPicker = !!forced;

        const tonoProvider = SINGLE_PROVIDERS['tono']();
        const tonoLatino = tonoProvider.groups.find(g => g.id === 'latino').options;
        const tonoAnglo  = tonoProvider.groups.find(g => g.id === 'anglo').options;

        let notationMode = forced || zionLyricsObj.chorusFilterNotation || 'both';

        const renderNotes = (list) => list.map(o => `
            <button class="chorus-note ${o.value === currentValue ? 'is-on' : ''}"
                    data-value="${escapeHtml(o.value)}">
                <span class="chorus-note-label">${escapeHtml(o.label)}</span>
            </button>
        `).join('');

        const renderBody = () => {
            const showLat   = notationMode === 'latino' || notationMode === 'both';
            const showAnglo = notationMode === 'anglo'  || notationMode === 'both';
            return `
                ${showLat ? `
                    <div class="chorus-notes-col" data-group="latino">
                        <div class="chorus-notes-grid">${renderNotes(tonoLatino)}</div>
                        <div class="chorus-notes-label">LAT</div>
                    </div>
                ` : ''}
                ${showAnglo ? `
                    <div class="chorus-notes-col" data-group="anglo">
                        <div class="chorus-notes-grid">${renderNotes(tonoAnglo)}</div>
                        <div class="chorus-notes-label">EN</div>
                    </div>
                ` : ''}
            `;
        };

        const bothColumns = notationMode === 'both';
        const pickerWidth = bothColumns ? 480 : 240;

        let applied = false;
        const handleSelect = (val) => {
            applied = true;
            onSelect(val);
        };

        PickerBase.open(anchor, {
            className: 'chorus-filter-picker',
            minWidth: pickerWidth,
            placement: 'bottom',
            arrow: isChordPicker,
            content: `
                <div class="chorus-filter-inner">
                    ${showSwitch ? `
                        <div class="chorus-filter-header">
                            <div class="chorus-notation-switch">
                                <button data-notation="anglo"  class="${notationMode === 'anglo'  ? 'active' : ''}">EN</button>
                                <button data-notation="latino" class="${notationMode === 'latino' ? 'active' : ''}">LAT</button>
                                <button data-notation="both"   class="${notationMode === 'both'   ? 'active' : ''}">+</button>
                            </div>
                        </div>
                    ` : ''}
                    <div class="chorus-filter-body" data-notation="${notationMode}">
                        ${renderBody()}
                    </div>
                    ${isChordPicker ? `
                        <div class="chorus-custom-chord">
                            <input type="text"
                                   class="chorus-custom-chord-input"
                                   maxlength="12"
                                   placeholder="${setLang('str280')}">
                            <button class="chorus-custom-chord-apply" disabled>
                                ${setLang('str281')}
                            </button>
                        </div>
                    ` : ''}
                </div>
            `,
            onMount(el, closeFn) {
                el.addEventListener('mousedown', (e) => {
                    if (e.target.closest('.chorus-custom-chord-input')) return;
                    e.preventDefault();
                });

                const bodyEl = el.querySelector('.chorus-filter-body');

                bodyEl.addEventListener('click', (e) => {
                    const btn = e.target.closest('.chorus-note');
                    if (!btn) return;
                    handleSelect(btn.dataset.value);
                    closeFn();
                });

                if (showSwitch) {
                    el.querySelector('.chorus-notation-switch').addEventListener('click', (e) => {
                        const btn = e.target.closest('button');
                        if (!btn) return;
                        const mode = btn.dataset.notation;
                        if (mode === notationMode) return;
                        notationMode = mode;
                        zionLyricsObj.chorusFilterNotation = mode;
                        saveZionLyricsObj();
                        el.querySelectorAll('.chorus-notation-switch button').forEach(b =>
                            b.classList.toggle('active', b.dataset.notation === mode)
                        );
                        bodyEl.dataset.notation = mode;
                        bodyEl.innerHTML = renderBody();
                    });
                }

                if (isChordPicker) {
                    const customInput = el.querySelector('.chorus-custom-chord-input');
                    const customBtn   = el.querySelector('.chorus-custom-chord-apply');

                    customInput.addEventListener('input', () => {
                        customBtn.disabled = customInput.value.trim().length === 0;
                    });
                    customBtn.addEventListener('click', () => {
                        const val = customInput.value.trim();
                        if (!val) return;
                        handleSelect(val);
                        closeFn();
                    });
                    customInput.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            const val = customInput.value.trim();
                            if (val) { handleSelect(val); closeFn(); }
                        }
                    });
                }
            },
            onClose(reason) {
                if (!applied && typeof onClose === 'function') {
                    onClose(reason);
                }
            }
        });
    }

    function mountEditor(coro) {
        if (!window.Tiptap || !window.Tiptap.Editor) {
            console.error('Tiptap no disponible');
            return;
        }
        const content = $('chorus-editor-content');
        if (!content) return;

        const initialDoc = buildInitialDoc(coro);

        if (_editor) _editor.destroy();

        _editor = new window.Tiptap.Editor({
            element: content,
            extensions: [
                window.Tiptap.StarterKit.configure({ document: false }),
                window.Tiptap.StanzaDocument,
                window.Tiptap.Stanza,
                window.Tiptap.StanzaCommands,
                window.Tiptap.Note,
                window.Tiptap.NoteCommands
            ],
            content: initialDoc,
            editorProps: {
                attributes: {
                    class: 'chorus-editor-prosemirror',
                    spellcheck: 'false'
                },
                handleDOMEvents: {
                    mouseup: () => {
                        if (_notesMode && _editor) {
                            const sel = _editor.state.selection;
                            if (!sel.empty) {
                                _savedSelection = { from: sel.from, to: sel.to };
                                _lastDismissedRange = null;
                                setTimeout(() => {
                                    openPickerForCurrentSelection();
                                }, 10);
                            }
                        }
                        return false;
                    }
                }
            },
            onUpdate: () => {
                syncToolbarState();
            },
            onSelectionUpdate: () => {
                syncToolbarState();
            }
        });

        syncToolbarState();
    }

    function buildInitialDoc(coro) {
        if (!coro || !Array.isArray(coro.estrofas) || coro.estrofas.length === 0) {
            return {
                type: 'doc',
                content: [{
                    type: 'stanza',
                    attrs: { repite: 1, tipo: 'estrofa' },
                    content: [{ type: 'paragraph' }]
                }]
            };
        }

        return {
            type: 'doc',
            content: coro.estrofas.map(st => {
                const lines = (st.texto || '').split('\n');
                return {
                    type: 'stanza',
                    attrs: { 
                        repite: st.repite || 1,
                        tipo: st.tipo || 'estrofa'
                    },
                    content: lines.map(line => {
                        const content = parseNoteRuns(line);
                        return {
                            type: 'paragraph',
                            content: content.length > 0 ? content : undefined
                        };
                    })
                };
            })
        };
    }

    function parseNoteRuns(line) {
        const result = [];
        const regex = /\[([^\]]+)\](.*?)\[\/\1\]/g;
        let lastIndex = 0;
        let match;

        while ((match = regex.exec(line)) !== null) {
            if (match.index > lastIndex) {
                result.push({ type: 'text', text: line.slice(lastIndex, match.index) });
            }
            const noteValue = match[1];
            const noteText  = match[2];
            if (noteText) {
                result.push({
                    type: 'text',
                    text: noteText,
                    marks: [{ type: 'note', attrs: { note: noteValue } }]
                });
            }
            lastIndex = regex.lastIndex;
        }

        if (lastIndex < line.length) {
            result.push({ type: 'text', text: line.slice(lastIndex) });
        }

        return result;
    }

    function unmountEditor() {
        if (_editor) {
            _editor.destroy();
            _editor = null;
        }
    }

    async function openChorusEditor(coroId) {
        const loaded = await loadModalHtml('editor-coro-modal');
        if (!loaded) return;

        const modal = $('editor-coro-modal');
        if (!modal) return;

        modal.dataset.coroId = coroId || '';
        openModal(null, null, 'editor-coro-modal');
    }

    function closeChorusEditor() {
        closeModal(null, null, 'editor-coro-modal');
    }

    function saveChorusEditor() {
        if (!_editor) return;

        DataBinding.write('#editor-coro-modal', state.chorusEditorDraft);

        const draft = state.chorusEditorDraft;
        const nombre = (draft.nombre || '').trim();
        if (!nombre) {
            Tooltip.show($('editor-coro-nombre'), setLang('str1'));
            return;
        }

        const doc = _editor.getJSON();
        const estrofas = [];

        let seq = 1;
        (doc.content || []).forEach(node => {
            if (node.type !== 'stanza') return;

            const lines = [];
            (node.content || []).forEach(p => {
                if (p.type !== 'paragraph') return;
                let line = '';
                (p.content || []).forEach(child => {
                    if (child.type === 'text') {
                        const noteMark = (child.marks || []).find(m => m.type === 'note');
                        if (noteMark && noteMark.attrs.note) {
                            line += `[${noteMark.attrs.note}]${child.text || ''}[/${noteMark.attrs.note}]`;
                        } else {
                            line += child.text || '';
                        }
                    } else if (child.type === 'hardBreak') {
                        line += '\n';
                    }
                });
                lines.push(line);
            });
            const texto = lines.join('\n');

            estrofas.push({
                secuencia: seq++,
                tipo: node.attrs.tipo || 'estrofa',
                repite: node.attrs.repite || 1,
                texto
            });
        });

        if (estrofas.length === 0) {
            customAlert(setLang('str176'));
            return;
        }

        if (_currentCoroId === null) {
            const ultimo = _.maxBy(state.dataSource.choruses, 'id_coro');
            const nuevoId = (ultimo?.id_coro || 0) + 1;

            state.dataSource.choruses.push({
                id_coro: nuevoId,
                nombre: nombre,
                autor: draft.autor?.trim() || '',
                tono: draft.tono,
                tipo: draft.tipo,
                activo: draft.activo ? 'Yes' : 'No',
                estrofas: estrofas,
                pentagrama: null
            });
            adminSelectedId = nuevoId;
        } else {
            const coro = _.find(state.dataSource.choruses, { id_coro: _currentCoroId });
            if (!coro) {
                customAlert(setLang('str177'));
                return;
            }
            coro.nombre = nombre;
            coro.autor  = draft.autor?.trim() || '';
            coro.tono   = draft.tono;
            coro.tipo   = draft.tipo;
            coro.activo = draft.activo ? 'Yes' : 'No';
            coro.estrofas = estrofas;
            coro.pentagrama = null;

            const qi = state.queue.choruses.findIndex(c => c.id_coro === _currentCoroId);
            if (qi !== -1) {
                Object.assign(state.queue.choruses[qi], {
                    nombre: coro.nombre, 
                    autor: coro.autor, 
                    tono: coro.tono, 
                    tipo: coro.tipo,
                    activo: coro.activo, 
                    estrofas: coro.estrofas,
                    pentagrama: null
                });
            }
            if (state.selectedCanto?.id_coro === _currentCoroId) {
                Object.assign(state.selectedCanto, {
                    nombre: coro.nombre, 
                    autor: coro.autor, 
                    tono: coro.tono, 
                    tipo: coro.tipo,
                    activo: coro.activo, 
                    estrofas: coro.estrofas,
                    pentagrama: null
                });
                renderStanzas();
            }
            renderChorus();
        }

        DataBinding.commitEdit();
        DataBinding.unwatch();

        const adminText = $('admin-text-filter');
        if (adminText) adminText.value = '';

        renderAdminCoros();
        closeChorusEditor();
        saveChorusesToLocalStorage();
        syncChorusesToServer();
    }

    function openPickerForCurrentSelection() {
        if (!_editor) return;

        let sel = _editor.state.selection;
        if (sel.empty && _savedSelection) {
            _editor.chain().focus().setTextSelection(_savedSelection).run();
            sel = _editor.state.selection;
        }
        if (sel.empty) return;

        const { from, to } = sel;
        const range = { from, to };

        const startCoords = _editor.view.coordsAtPos(from);
        const endCoords   = _editor.view.coordsAtPos(to);
        const virtualAnchor = {
            getBoundingClientRect: () => ({
                x: startCoords.left,
                y: startCoords.top,
                top: startCoords.top,
                left: startCoords.left,
                right: endCoords.right,
                bottom: endCoords.bottom,
                width: endCoords.right - startCoords.left,
                height: endCoords.bottom - startCoords.top
            })
        };

        const forcedNotation = detectNotationFromTone(_currentTono);
        const currentNote = _editor.getAttributes('note').note || null;

        openChorusTonePicker(virtualAnchor, currentNote, (note) => {
            if (currentNote === note) {
                _editor.chain().focus().unsetMark('note').run();
            } else {
                _editor.chain().focus().setMark('note', { note }).run();
            }
            _savedSelection = null;
            _lastDismissedRange = null;
        }, forcedNotation, () => {
            _savedSelection = null;
            _lastDismissedRange = range;
        });
    }

    function toggleNotesMode() {
        _notesMode = !_notesMode;
        const btn = $('editor-coro-acordes-btn');
        if (btn) btn.classList.toggle('is-active', _notesMode);

        if (!_notesMode) {
            _savedSelection = null;
            return;
        }

        if (!_editor) return;

        const sel = _editor.state.selection;
        if (sel.empty) return;

        const r = { from: sel.from, to: sel.to };
        const dismissed = _lastDismissedRange &&
            _lastDismissedRange.from === r.from &&
            _lastDismissedRange.to === r.to;

        if (dismissed) return;

        _savedSelection = r;
        openPickerForCurrentSelection();
    }

    function detectNotationFromTone(tono) {
        if (!tono) return null;
        const provider = SINGLE_PROVIDERS['tono']();
        const latino = provider.groups.find(g => g.id === 'latino').options.map(o => o.value);
        const anglo  = provider.groups.find(g => g.id === 'anglo').options.map(o => o.value);
        if (latino.includes(tono)) return 'latino';
        if (anglo.includes(tono))  return 'anglo';
        return null;
    }

    window.chorusEditor = {
        setCoroId(id) { _currentCoroId = id; },
        setState({ tipo, tono, activo }) {
            _currentTipo   = tipo;
            _currentTono   = tono;
            _currentActivo = activo;
        },
        mount(coro)    { mountEditor(coro); },
        unmount()      { unmountEditor(); },
        syncToolbar()  { syncToolbar(); },
        tryFocus() {
            let attempts = 0;
            const tryFocus = () => {
                if (_editor) {
                    _editor.commands.focus('start');
                    syncToolbarState();
                    return;
                }
                if (++attempts < 20) setTimeout(tryFocus, 50);
            };
            tryFocus();
        },
        reset() {
            _currentCoroId = null;
            _notesMode = false;
            _savedSelection = null;
            _lastDismissedRange = null;
            if (_selectionDebounce) clearTimeout(_selectionDebounce);
            const btn = $('editor-coro-acordes-btn');
            if (btn) btn.classList.remove('is-active');
        },
        save() { saveChorusEditor(); }
    };

    window.initChorusEditorEvents = initChorusEditorEvents;
    window.openChorusEditor      = openChorusEditor;
    window.closeChorusEditor     = closeChorusEditor;
    window.saveChorusEditor      = saveChorusEditor;

    window.getEditor = () => _editor;
})();