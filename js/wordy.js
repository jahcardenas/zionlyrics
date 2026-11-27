// ==========================================================
// WORDY — modal, CRUD y preview en vivo
// - rows: 1-3 filas × 2-3 columnas de texto
// - fonts: 1 fuente por columna (wordy1/2/3)
// - preview: ProyVisor con layout del editor de escenas
// ==========================================================

function defaultWordyDraft() {
    return {
        rows: [['', '', '']],
        fonts: { wordy1: '', wordy2: '', wordy3: '' }
    };
}

function openWordyModal(el, ev) {
    if (ModalManager.isOpen('wordy-add-modal')) {
        ModalManager.close(null, null, 'wordy-add-modal');
    }
    openModal(el, ev, 'wordy-add-modal');
}

function renderWordyModalRows() {
    const container = $('wordy-rows-container');
    if (!container || !state.wordyDraft) return;

    const rows = state.wordyDraft.rows || [];
    const placeholders = ['Palabra', 'Significado', 'Referencias'];
    let html = '';

    rows.forEach((row, r) => {
        html += `<div class="wordy-row" style="display:flex; gap:6px; margin-bottom:6px; align-items:center;">`;
        [0, 1, 2].forEach(c => {
            const val = String(row[c] || '').replace(/"/g, '&quot;');
            html += `<input type="text" class="wordy-input opciones-select"
                data-row="${r}" data-col="${c}" value="${val}"
                placeholder="${placeholders[c]}" dir="auto" style="flex:1;">`;
        });
        if (rows.length > 1) {
            html += `<div class="code-btn code-btn-danger" data-function="removeWordyRow" data-function-arg1="${r}" style="flex-shrink:0;"><i data-lucide="x"></i></div>`;
        }
        html += `</div>`;
    });

    container.innerHTML = html;
    if (typeof createIcons === 'function') createIcons();

    const addBtn = $('wordy-add-row-btn');
    if (addBtn) addBtn.style.display = rows.length >= 3 ? 'none' : '';

    // Renderizar labels de fuentes
    ['wordy1', 'wordy2', 'wordy3'].forEach(k => {
        const btn = $('wordy-font-' + k.slice(-1));
        if (!btn) return;
        const labelEl = btn.querySelector('.cc-multi-btn-label');
        if (!labelEl) return;
        const val = state.wordyDraft.fonts?.[k] || '';
        if (val) {
            const opts = SINGLE_PROVIDERS['fonts']();
            const found = opts.find(o => o.value === val);
            labelEl.textContent = found ? found.label : val;
        } else {
            labelEl.textContent = setLang('str265');
        }
    });
}

function addWordyRow() {
    if (!state.wordyDraft) return;
    if (state.wordyDraft.rows.length >= 3) return;
    state.wordyDraft.rows.push(['', '', '']);
    renderWordyModalRows();
    previewWordy();
}

function removeWordyRow(el, ev, index) {
    if (!state.wordyDraft) return;
    if (state.wordyDraft.rows.length <= 1) return;
    state.wordyDraft.rows.splice(parseInt(index, 10), 1);
    renderWordyModalRows();
    previewWordy();
}

function resetWordyDraft() {
    state.wordyDraft = defaultWordyDraft();
    state.wordySourceId = null;
    renderWordyModalRows();
    previewWordy();
    // Reset queue highlight
    document.querySelectorAll('#wordy-queue-list .mrc-queue-item').forEach(it => it.classList.remove('active'));
}

function openWordyFontPicker(el, ev, key) {
    el.dataset.value = state.wordyDraft.fonts[key] || '';
    MultiPicker.openSingle(el, 'fonts', (val, picked) => {
        state.wordyDraft.fonts[key] = val || '';
        const labelEl = el.querySelector('.cc-multi-btn-label');
        if (labelEl) labelEl.textContent = picked ? picked.label : setLang('str265');
        previewWordy();
    });
}

function previewWordy() {
    const previewEl = $('wordy-preview');
    if (!previewEl || !window.PROY_TEMPLATE_HTML) return;

    const display = state.settings.connectedDisplays.find(d => !d.isPrimary);
    if (!display) {
        previewEl.innerHTML = '<div style="padding:20px;color:#aaa;text-align:center;font-size:14px;">Sin monitores extendidos</div>';
        return;
    }

    let stage = previewEl._wordyStage;
    if (!stage || stage.root !== previewEl) {
        previewEl.innerHTML = '';
        stage = ProyVisor.create(previewEl, window.PROY_TEMPLATE_HTML);
        previewEl._wordyStage = stage;
    }

    const payload = ProyController.previewWordyPayload(display.id, state.wordyDraft);
    if (!payload) {
        stage.applyState({ pendingContent: null });
        return;
    }
    stage.applyState(payload);
}

function renderWordyQueue() {
    const list = $('wordy-queue-list');
    if (!list) return;

    const wordies = (state.session && Array.isArray(state.session.wordies)) ? state.session.wordies : [];
    if (wordies.length === 0) {
        list.innerHTML = '<div class="mrc-queue-empty">Sin palabras de estudio guardadas</div>';
        return;
    }

    const activeId = state.wordySourceId;
    list.innerHTML = wordies.slice().reverse().map(w => {
        const firstWord = (w.rows?.[0]?.[0] || '').trim() || '—';
        const nRows = w.rows?.length || 0;
        const nCols = w.rows?.[0]?.[2] || w.rows?.[1]?.[2] || w.rows?.[2]?.[2] ? 3 : 2;
        const active = w.id === activeId ? ' active' : '';
        return `
            <div class="mrc-queue-item app-card${active}" data-wordy-id="${w.id}" data-function="loadWordyIntoDraft" data-function-arg1="${w.id}">
                <div class="mrc-queue-item-text">${escapeHtml(firstWord)}</div>
                <div class="mrc-queue-item-meta">
                    <span>${nRows} fila${nRows !== 1 ? 's' : ''} · ${nCols} col${nCols !== 1 ? 's' : ''}</span>
                </div>
                <div class="mrc-queue-item-actions">
                    <div class="code-btn code-btn-danger" data-function="deleteWordyFromQueue" data-function-arg1="${w.id}"><span data-i18n="str4">Quitar</span></div>
                </div>
            </div>
        `;
    }).join('');
    applyTranslations();
}

function loadWordyIntoDraft(el, ev, id) {
    const wordy = (state.session?.wordies || []).find(w => String(w.id) === String(id));
    if (!wordy) return;

    state.wordyDraft = {
        rows: wordy.rows.map(r => [...r]),
        fonts: { wordy1: '', wordy2: '', wordy3: '', ...(wordy.fonts || {}) }
    };
    state.wordySourceId = wordy.id;

    renderWordyModalRows();
    renderWordyQueue();
    previewWordy();
}

async function deleteWordyFromQueue(el, ev, id) {
    if (!state.session || !Array.isArray(state.session.wordies)) return;
    const confirmed = await customConfirm('¿Eliminar esta palabra de estudio?');
    if (!confirmed) return;

    // Si estaba al aire, detenerla primero
    if (ProyController.isOnAir('wordy', id)) {
        const displays = state.settings.connectedDisplays.filter(d =>
            d.currentlyProjectingItem?.type === 'wordy' &&
            String(d.currentlyProjectingItem.queueId) === String(id)
        );
        if (displays.length) ProyController.clear(displays.map(d => d.id));
    }

    state.session.wordies = state.session.wordies.filter(w => String(w.id) !== String(id));
    if (String(state.wordySourceId) === String(id)) {
        resetWordyDraft();
    }
    persistSession();
    renderMedia();
    renderWordyQueue();
}

function saveWordyFromModal() {
    if (!state.wordyDraft) return;

    const content = ProyController.makeWordyContent(state.wordyDraft);
    if (!content) {
        customAlert('Debes escribir al menos una palabra');
        return;
    }

    createSessionIfNeeded();
    if (!Array.isArray(state.session.wordies)) state.session.wordies = [];

    // Normalizar rows al tamaño final (columns)
    const rows = content.rows.map(r => [...r]);
    const fonts = {};
    ['wordy1', 'wordy2', 'wordy3'].forEach(k => {
        if (state.wordyDraft.fonts?.[k]) fonts[k] = state.wordyDraft.fonts[k];
    });

    let wordy;
    if (state.wordySourceId) {
        wordy = state.session.wordies.find(w => String(w.id) === String(state.wordySourceId));
        if (!wordy) {
            // sourceId obsoleto, crear nueva
            wordy = null;
        } else {
            wordy.rows = rows;
            wordy.fonts = fonts;
        }
    }

    if (!wordy) {
        wordy = {
            id: 'wordy-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
            rows,
            fonts
        };
        state.session.wordies.push(wordy);
    }

    state.wordySourceId = wordy.id;
    persistSession();
    renderMedia();
    renderWordyQueue();

    // Si la card está al aire, reproyectar con los nuevos datos
    if (ProyController.isOnAir('wordy', wordy.id)) {
        const displays = state.settings.connectedDisplays.filter(d =>
            d.currentlyProjectingItem?.type === 'wordy' &&
            String(d.currentlyProjectingItem.queueId) === String(wordy.id)
        );
        const ids = displays.map(d => d.id);
        if (ids.length) {
            ProyController.projectWordy(ids, wordy, { fade: true }, { type: 'wordy', queueId: wordy.id });
        }
    }
}

function initWordyModalEvents() {
    const modal = $('wordy-add-modal');
    if (!modal || modal._wordyEventsBound) return;
    modal._wordyEventsBound = true;

    // Input en rows (delegación)
    modal.addEventListener('input', e => {
        const t = e.target;
        if (!t.classList || !t.classList.contains('wordy-input')) return;
        const r = parseInt(t.dataset.row, 10);
        const c = parseInt(t.dataset.col, 10);
        if (state.wordyDraft && state.wordyDraft.rows[r]) {
            state.wordyDraft.rows[r][c] = t.value;
            previewWordy();
        }
    });
}

window.openWordyModal        = openWordyModal;
window.addWordyRow           = addWordyRow;
window.removeWordyRow        = removeWordyRow;
window.resetWordyDraft       = resetWordyDraft;
window.openWordyFontPicker   = openWordyFontPicker;
window.saveWordyFromModal    = saveWordyFromModal;
window.loadWordyIntoDraft    = loadWordyIntoDraft;
window.deleteWordyFromQueue  = deleteWordyFromQueue;