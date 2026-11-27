
function getVisibleChorusIds() {
    return [...document.querySelectorAll('#agregar-coro-rows .chorus-card')]
        .map(c => parseInt(c.dataset.id))
        .filter(id => !isNaN(id));
}

// ==========================================================
// FORMATEO DE PREVIEWS (con notas y highlight)
// ==========================================================
function formatChorusPreview(text, textFilter = '') {
    if (!text) return '';

    // 1. Escapar HTML (prevenir inyección)
    let html = escapeHtml(text);

    // 2. Parsear [Nota]Texto[/Nota] → <span data-note>
    html = html.replace(/\[([^\]]+)\](.*?)\[\/\1\]/g, (match, note, content) => {
        return `<span class="chorus-preview-note" data-note="${note}">${content}</span>`;
    });

    // 3. Resaltar coincidencias del filtro (solo dentro del texto, no en tags)
    if (textFilter && textFilter.trim()) {
        const normFilter = textFilter.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        html = html.replace(/>([^<]+)</g, (fullMatch, content) => {
            const normContent = content.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            const idx = normContent.indexOf(normFilter);
            if (idx === -1) return fullMatch;

            const before = content.substring(0, idx);
            const match  = content.substring(idx, idx + textFilter.length);
            const after  = content.substring(idx + textFilter.length);
            return `>${before}<span class="highlight">${match}</span>${after}<`;
        });
    }

    // 4. Convertir saltos de línea reales en <br>
    return html.replace(/\n/g, '<br>');
}

function updateChorusPreview(chorusId, textFilter) {
    const previewContainer = $('preview-text');
    if (!previewContainer) return;
    previewContainer.innerHTML = '';
    if (!chorusId) return;

    const c = state.dataSource.choruses.find(x => x.id_coro === chorusId);
    if (!c) return;

    const stanzasHtml = c.estrofas.map(st => {
        return formatChorusPreview(st.texto, textFilter);
    }).join('<br><br>');

    // Asignación directa con innerHTML (no buildRowFromTemplate)
    previewContainer.innerHTML = stanzasHtml;
    previewContainer.classList.remove('is-entering');
    void previewContainer.offsetWidth;
    previewContainer.classList.add('is-entering');
}

function refreshChorusPreviewFromSet(textFilter) {
    // Prioridad: el último clickeado si sigue seleccionado.
    // Fallback: el último del Set por orden de inserción.
    let id = null;
    if (_chorusModalLastClicked !== null && _chorusModalSelectedIds.has(_chorusModalLastClicked)) {
        id = _chorusModalLastClicked;
    } else if (_chorusModalSelectedIds.size > 0) {
        id = [..._chorusModalSelectedIds].pop();
    }
    updateChorusPreview(id, textFilter);
}

function openEditCoro() {
    if (!adminSelectedId) {
        customAlert(setLang('str173'));
        return;
    }
    openChorusEditor(adminSelectedId);
}

async function confirmAddCoro() {
    if (_chorusModalSelectedIds.size === 0) {
        customAlert(setLang('str173'));
        return;
    }

    // Ordenar por el orden visible actual, para que se agreguen en el orden
    // que el usuario ve, no en orden de inserción del Set.
    const visibleIds = getVisibleChorusIds();
    const ids = [..._chorusModalSelectedIds].sort(
        (a, b) => visibleIds.indexOf(a) - visibleIds.indexOf(b)
    );

    addChorusesByIds(ids);
    closeModal(null, null, 'agregar-coro-modal');
}


async function syncChorusesToServer() {
    try {
        const result = await window.electronAPI.saveFile('json/chorus.json', state.dataSource.choruses);
        if (!result.success) {
            console.warn(setLang('str178'));
        }
    } catch (err) {
        console.warn(setLang('str179') + err.message);
    }
}

async function exportChoruses() {
    if (!canOpenFilePicker()) {
        customAlert(setLang('str159'));
        return;
    }

    try {
        const data = JSON.stringify(state.dataSource.choruses, null, 2);
        if (!window.showSaveFilePicker) {
            const blob = new Blob([data], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'chorus.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            customAlert( setLang('str160').replace('{n}','chorus.json'));
            return;
        }
        const handle = await window.showSaveFilePicker({
            suggestedName: 'chorus.json',
            types: [{ description: setLang('str180'), accept: { 'application/json': ['.json'] } }]
        });
        const writable = await handle.createWritable();
        await writable.write(data);
        await writable.close();
        customAlert(setLang('str181').replace('{n}',handle.name));
    } catch (err) {
        if (err.name !== 'AbortError') {
            customAlert(setLang('str163') + err.message);
        }
    }
}

async function importChoruses() {
    if (!canOpenFilePicker()) {
        customAlert(setLang('str159'));
        return;
    }

    try {
        const [handle] = await window.showOpenFilePicker({
            types: [{ description: setLang('str180'), accept: { 'application/json': ['.json'] } }],
            multiple: false
        });
        const file = await handle.getFile();
        const text = await file.text();
        const data = JSON.parse(text);

        if (!isValidChorus(data)) {
            customAlert(setLang('str182'));
            return;
        }

        const incoming = Array.isArray(data) ? data : [data];

        // Filtrar los que ya existen (por id o por nombre)
        const existing = state.dataSource.choruses;
        const toAdd = incoming.filter(coro =>
            !existing.some(c => c.id_coro === coro.id_coro || c.nombre === coro.nombre)
        );

        if (toAdd.length === 0) {
            customAlert(setLang('str183'));
            return;
        }

        // Escribir PRIMERO en disco con el estado actual + los nuevos.
        // Si falla, no tocamos la memoria: la app queda consistente.
        const merged = [...existing, ...toAdd];
        try {const result = await window.electronAPI.saveFile('json/chorus.json', merged);
            
            if (!result.success) throw new Error(result.error || 'save failed');
        } catch (saveErr) {
            customAlert(setLang('str167') + saveErr.message);
            return;
        }

        // Disco OK → actualizar estado en memoria + localStorage
        state.dataSource.choruses = merged;
        saveChorusesToLocalStorage();

        renderAdminCoros();
        customAlert(setLang('str184').replace('{n}', toAdd.length));
    } catch (err) {
        if (err.name !== 'AbortError') {
            customAlert(setLang('str167') + err.message);
        }
    }
}

window.isValidChorus = function(data) {
    // Un coro válido tiene 'id_coro' y 'estrofas' (array)
    if (typeof data !== 'object' || data === null) return false;
    if (Array.isArray(data)) {
        // Si es un array, debe tener al menos un elemento con la estructura esperada
        return data.length > 0 && data.every(item => typeof item.id_coro === 'number' && Array.isArray(item.estrofas));
    } else {
        // Si es un objeto individual, validar estructura
        return typeof data.id_coro === 'number' && Array.isArray(data.estrofas);
    }
}

function toggleAdminChorusFilterBox(anchorEl) {
    const anchor = anchorEl || $('admin-filter-funnel');
    openChorusFilterPicker(anchor, () => {
        renderAdminFilterTags();
        renderAdminCoros();
    });
}

function renderAdminFilterTags() {
    const container = $('admin-filter-chips');
    if (!container) return;
    container.innerHTML = '';

    const buildTag = (value, category) => {
        const tag = document.createElement('span');
        tag.className = 'chorus-filter-tag';
        tag.dataset.value = value;
        tag.dataset.category = category;

        const label = document.createElement('span');
        label.textContent = category === 'tipo' ? getTipoLabel(value) : getTonoLabel(value);

        const x = document.createElement('span');
        x.className = 'chorus-filter-tag-x';
        x.textContent = '×';
        x.onclick = (e) => {
            e.stopPropagation();
            if (category === 'tipo') _chorusFilterTipos.delete(value);
            else                     _chorusFilterTonos.delete(value);
            renderAdminFilterTags();
            renderAdminCoros();
        };

        tag.appendChild(label);
        tag.appendChild(x);
        return tag;
    };

    [..._chorusFilterTipos].forEach(v => container.appendChild(buildTag(v, 'tipo')));
    [..._chorusFilterTonos].forEach(v => container.appendChild(buildTag(v, 'tono')));
}

function openChorusFilterPicker(anchor, onChange) {
    if (!anchor) return;

    const tipoOptions = SINGLE_PROVIDERS['tipo']();
    const tonoProvider = SINGLE_PROVIDERS['tono']();
    const tonoLatino = tonoProvider.groups.find(g => g.id === 'latino').options;
    const tonoAnglo  = tonoProvider.groups.find(g => g.id === 'anglo').options;

    let notationMode = zionLyricsObj.chorusFilterNotation || 'both';

    const renderNotes = (list) => list.map(o => `
        <button class="chorus-note ${_chorusFilterTonos.has(o.value) ? 'is-on' : ''}"
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

    PickerBase.open(anchor, {
        className: 'chorus-filter-picker',
        minWidth: 540,
        placement: 'top',
        content: `
            <div class="chorus-filter-inner">
                <div class="chorus-filter-header">
                    <div class="chorus-tipos">
                        ${tipoOptions.map(o => `
                            <button class="chorus-tipo-btn ${_chorusFilterTipos.has(o.value) ? 'is-on' : ''}"
                                    data-value="${escapeHtml(o.value)}">
                                ${escapeHtml(o.label)}
                            </button>
                        `).join('')}
                    </div>
                    <div class="chorus-notation-switch">
                        <button data-notation="anglo"  class="${notationMode === 'anglo'  ? 'active' : ''}">EN</button>
                        <button data-notation="latino" class="${notationMode === 'latino' ? 'active' : ''}">LAT</button>
                        <button data-notation="both"   class="${notationMode === 'both'   ? 'active' : ''}">+</button>
                    </div>
                </div>
                <div class="chorus-filter-body" data-notation="${notationMode}">
                    ${renderBody()}
                </div>
            </div>
        `,
        onMount(el) {
            const bodyEl = el.querySelector('.chorus-filter-body');
            const fire = () => { if (typeof onChange === 'function') onChange(); };

            el.querySelector('.chorus-tipos').addEventListener('click', (e) => {
                const btn = e.target.closest('.chorus-tipo-btn');
                if (!btn) return;
                const v = btn.dataset.value;
                if (_chorusFilterTipos.has(v)) _chorusFilterTipos.delete(v);
                else                            _chorusFilterTipos.add(v);
                btn.classList.toggle('is-on', _chorusFilterTipos.has(v));
                fire();
            });

            bodyEl.addEventListener('click', (e) => {
                const btn = e.target.closest('.chorus-note');
                if (!btn) return;
                const v = btn.dataset.value;
                if (_chorusFilterTonos.has(v)) _chorusFilterTonos.delete(v);
                else                            _chorusFilterTonos.add(v);
                btn.classList.toggle('is-on', _chorusFilterTonos.has(v));
                fire();
            });

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
        },
        onClose() {
            setTimeout(() => {
                const input = $('agregar-coro-filter') || $('admin-text-filter');
                if (input) input.focus();
            }, 0);
        }
    });
}

function toggleChorusFilterBox(anchorEl) {
    const anchor = anchorEl || $('chorus-filter-funnel');
    openChorusFilterPicker(anchor, () => {
        renderChorusFilterTags();
        renderModalChorus($('agregar-coro-filter')?.value || '');
    });
}

function renderChorusFilterTags() {
    const container = $('chorus-filter-chips');
    if (!container) return;
    container.innerHTML = '';

    const buildTag = (value, category) => {
        const tag = document.createElement('span');
        tag.className = 'chorus-filter-tag';
        tag.dataset.value = value;
        tag.dataset.category = category;

        const label = document.createElement('span');
        label.textContent = value;

        const x = document.createElement('span');
        x.className = 'chorus-filter-tag-x';
        x.textContent = '×';
        x.onclick = (e) => {
            e.stopPropagation();

            // 1) Quitar del estado (para que no vuelva a renderizarse)
            if (category === 'tipo') _chorusFilterTipos.delete(value);
            else                     _chorusFilterTonos.delete(value);

            // 2) Quitar del tracking de "últimos chips renderizados"
            _lastRenderedChips.delete(`${category}:${value}`);

            // 3) Animar salida y después re-renderizar
            const afterRemove = () => {
                renderChorusFilterTags();
                renderModalChorus($('agregar-coro-filter')?.value || '');
            };

            if (window.Anim) {
                window.Anim.chipLeave(tag, afterRemove);
            } else {
                afterRemove();
            }
        };

        tag.appendChild(label);
        tag.appendChild(x);
        return tag;
    };

    // Set que va a quedar como "últimos chips renderizados" al final
    const currentChips = new Set();

    const appendAndMaybeAnimate = (value, category) => {
        const key = `${category}:${value}`;
        const tag = buildTag(value, category);
        container.appendChild(tag);

        // Solo animar si es un chip nuevo (no estaba en el render anterior)
        if (!_lastRenderedChips.has(key) && window.Anim) {
            window.Anim.chipEnter(tag);
        }

        currentChips.add(key);
    };

    [..._chorusFilterTipos].forEach(v => appendAndMaybeAnimate(v, 'tipo'));
    [..._chorusFilterTonos].forEach(v => appendAndMaybeAnimate(v, 'tono'));

    _lastRenderedChips = currentChips;
}

/*function getChorusTipoOptions() {
    const set = new Set();
    (state.dataSource.choruses || []).forEach(c => { if (c.tipo) set.add(c.tipo); });
    return [...set].sort((a, b) => a.localeCompare(b, 'es'));
}

function getChorusTonoOptions() {
    const set = new Set();
    (state.dataSource.choruses || []).forEach(c => { if (c.tono) set.add(c.tono); });
    return [...set].sort((a, b) => a.localeCompare(b, 'es'));
}*/

function renderChorus() {
    const top = $('list-cantos-top');
    const currentIds = new Set(state.queue.choruses.map(c => c.id));
    const newIds = new Set([...currentIds].filter(id => !_lastRenderedChorusIds.has(id)));

    top.innerHTML = '';
    state.queue.choruses.forEach(c => {
        const card = document.createElement('div');
        card.className = 'canto-card app-card';
        card.dataset.id = c.id;

        // Slot del play (vacío hasta el sistema on-air)
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

        // Cuerpo: título + meta
        const body = document.createElement('div');
        body.className = 'canto-card-body';

        const title = document.createElement('div');
        title.className = 'canto-card-title';
        title.textContent = c.nombre;

        const meta = document.createElement('div');
        meta.className = 'canto-card-meta';
        meta.textContent = `${c.tipo || '—'} · ${c.tono || '—'}`;

        body.appendChild(title);
        body.appendChild(meta);

        // Acciones hover-only
        const actions = document.createElement('div');
        actions.className = 'canto-card-actions';

        // Placeholder del monitor (Tanda D). Dejamos el hueco, sin botón.
        // const monitorBtn = document.createElement('div'); ...

        const removeBtn = document.createElement('div');
        removeBtn.className = 'code-btn code-btn-danger';
        removeBtn.innerHTML = '<span data-i18n="str4">Quitar</span>';
        removeBtn.onclick = (e) => {
            e.stopPropagation();
            removeChorusById(c.id);
        };
        actions.appendChild(removeBtn);

        card.appendChild(play);
        card.appendChild(body);
        card.appendChild(actions);
        card.onclick = (e) => handleChorusCardClick(c.id, e);

        top.appendChild(card);

        if (newIds.has(c.id) && window.Anim) {
            window.Anim.cardEnter(card);
        }
    });

    syncChorusSelection();
    applyTranslations(top);

    if (window.Anim) {
        window.Anim.makeSortable(
            '#list-cantos-top',
            '.canto-card',
            {
                multiDrag: true,
                selectedClass: 'active',
                getSelectedIds: () => _chorusSelectedIds,
                onReorder: (order) => {
                    const byId = new Map(state.queue.choruses.map(c => [String(c.id), c]));
                    const seen = new Set();
                    const result = [];
                    order.forEach(id => {
                        const key = String(id);
                        if (!byId.has(key) || seen.has(key)) return;
                        seen.add(key);
                        result.push(byId.get(key));
                    });
                    // Si faltó alguno (ghost escondió uno), agregarlo al final
                    state.queue.choruses.forEach(c => {
                        const key = String(c.id);
                        if (!seen.has(key)) result.push(c);
                    });
                    state.queue.choruses = result;
                    _chorusAnchorId    = null;
                    _chorusLastClicked = null;
                    persistSession();
                }
            }
        );
    }

    _lastRenderedChorusIds = currentIds;
    ProyController.refreshOnAirIndicators();
}

function renderStanzas() {
    const bottom = $('list-cantos-bottom');
    bottom.innerHTML = '';

    if (!state.selectedCanto) {
        _lastRenderedStanzaIds = new Set();
        _lastStanzaOwnerId = null;
        return;
    }

    // Si cambió el canto seleccionado, todas las estrofas se consideran
    // nuevas. Sin esto, los índices del canto viejo "contaminan" el
    // tracking del canto nuevo y la animación se salta.
    if (_lastStanzaOwnerId !== state.selectedCanto.id) {
        _lastRenderedStanzaIds = new Set();
        _lastStanzaOwnerId = state.selectedCanto.id;
    }

    const currentIds = new Set(state.selectedCanto.estrofas.map((_, i) => i));
    const newIds = new Set([...currentIds].filter(id => !_lastRenderedStanzaIds.has(id)));

    const cardsToAnimate = [];

    state.selectedCanto.estrofas.forEach((st, idx) => {
        const rawText = st.texto || '';
        // Elimina los corchetes y su contenido: [Do] y [/Do] desaparecen.
        const cleanText = rawText.replace(/\[[^\]]+\]/g, '').trim(); 
        
        const repeat = st.repite || 1;

        const card = document.createElement('div');
        card.className = 'canto-stanza-card app-card';

        const title = document.createElement('div');
        title.className = 'canto-stanza-title';
        title.textContent = cleanText; // ← Usa el texto limpio

        const meta = document.createElement('div');
        meta.className = 'canto-stanza-meta';
        const key = repeat === 1 ? 'str147' : 'str148';
        meta.textContent = setLang(key).replace('{n}', repeat);

        card.appendChild(title);
        card.appendChild(meta);

        card.onclick = function() {
            clearAllSelections(card);
            bottom.querySelectorAll('.canto-stanza-card').forEach(el => el.classList.remove('active'));
            card.classList.add('active');

            const top = $('list-cantos-top');
            const topItem = top && state.selectedCanto
                ? top.querySelector(`.canto-card[data-id="${state.selectedCanto.id}"]`)
                : null;
            if (topItem) {
                top.querySelectorAll('.canto-card.active').forEach(el => el.classList.remove('active'));
                topItem.classList.add('active');
            }

            if (state.outputTargets.choruses.length === 0) {
                Tooltip.show($('col-1').querySelector('[data-function="toggleDropdown"]'), setLang('str158'));
                return;
            }

            const targets = state.outputTargets.choruses;
            if (targets.length === 0) return;

            // Envía el texto limpio al proyector
            ProyController.projectContent(targets, { type: 'text', text: cleanText }, null, { 
                type: 'chorus', 
                queueId: state.selectedCanto.id,
                chorusId: state.selectedCanto.id_coro
            });
        };

        bottom.appendChild(card);

        if (newIds.has(idx)) {
            cardsToAnimate.push(card);
        }
    });

    // Animar después de que TODAS las cards estén en el DOM, con doble rAF
    // para que el navegador ya haya calculado el layout. Sin esto, el
    // offsetHeight de la primera card puede ser 0 o incorrecto, y cardEnter
    // sale sin animar.
    if (cardsToAnimate.length > 0 && window.Anim) {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                cardsToAnimate.forEach(c => window.Anim.cardEnter(c));
            });
        });
    }

    _lastRenderedStanzaIds = currentIds;
    ProyController.refreshOnAirIndicators();
}


function buildChorusCard(c, opts = {}) {
    const mode = opts.mode || 'add';
    const textFilter = opts.textFilter || '';
    const isSelected = opts.isSelected || false;

    const highlightText = (text, filter) => {
        if (!filter.trim()) return text;
        const normText = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const index = normText.toLowerCase().indexOf(filter);
        if (index === -1) return text;
        const before = text.substring(0, index);
        const match  = text.substring(index, index + filter.length);
        const after  = text.substring(index + filter.length);
        return `${before}<span class="highlight">${match}</span>${after}`;
    };

    const card = document.createElement('div');
    card.className = 'chorus-card app-card';
    card.dataset.id = c.id_coro;
    if (isSelected) card.classList.add('active');

    const body = document.createElement('div');
    body.className = 'chorus-card-body';

    const title = document.createElement('div');
    title.className = 'chorus-card-title';
    title.innerHTML = highlightText(c.nombre, textFilter);

    const meta = document.createElement('div');
    meta.className = 'chorus-card-meta';

    const tipoBadge = document.createElement('span');
    tipoBadge.className = 'chorus-badge';
    tipoBadge.dataset.value = c.tipo || '';
    tipoBadge.textContent = getTipoLabel(c.tipo);

    const tonoBadge = document.createElement('span');
    tonoBadge.className = 'chorus-badge';
    tonoBadge.dataset.value = c.tono || '';
    tonoBadge.textContent = getTonoLabel(c.tono);

    meta.appendChild(tipoBadge);
    meta.appendChild(tonoBadge);

    body.appendChild(title);
    body.appendChild(meta);

    const actionBtn = document.createElement('div');
    actionBtn.className = 'code-btn code-btn-primary chorus-card-add';
    actionBtn.innerHTML = mode === 'admin'
        ? `<span data-i18n="str53">Editar</span>`
        : `<span data-i18n="str3">Agregar</span>`;

    card.appendChild(body);
    card.appendChild(actionBtn);

    return { card, actionBtn };
}

function renderModalChorus(filterText) {
    const rowsContainer = $('agregar-coro-rows');
    rowsContainer.innerHTML = '';

    const tipoFilterSet = _chorusFilterTipos;
    const tonoFilterSet = _chorusFilterTonos;
    const showInactive = zionLyricsObj.showInactive === true;
    const rawFilter = filterText || '';
    const textFilter = rawFilter.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    let chorusList = state.dataSource.choruses;
    if (!showInactive) chorusList = chorusList.filter(c => c.activo && c.activo.trim() === "Yes");
    if (tipoFilterSet.size > 0) chorusList = chorusList.filter(c => tipoFilterSet.has(c.tipo));
    if (tonoFilterSet.size > 0) chorusList = chorusList.filter(c => tonoFilterSet.has(c.tono));
    if (textFilter.trim() !== '') {
        chorusList = chorusList.filter(c => {
            const nameNorm = c.nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            const stanzasNorm = c.estrofas.some(st => st.texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(textFilter));
            return nameNorm.includes(textFilter) || stanzasNorm;
        });
    }

    const previewContainer = $('preview-text');
    previewContainer.innerHTML = '';

    chorusList.forEach(c => {
        const { card, actionBtn } = buildChorusCard(c, {
            mode: 'add',
            textFilter,
            isSelected: _chorusModalSelectedIds.has(c.id_coro)
        });

        actionBtn.onclick = (e) => {
            e.stopPropagation();
            addChorusesByIds([c.id_coro]);
        };

        card.onclick = function(e) {
            const clickedId  = c.id_coro;
            const visibleIds = getVisibleChorusIds();
            const filterVal  = $('agregar-coro-filter')?.value || '';

            if (e.shiftKey && _chorusModalAnchorId !== null) {
                const anchorIdx = visibleIds.indexOf(_chorusModalAnchorId);
                const clickIdx  = visibleIds.indexOf(clickedId);
                if (anchorIdx !== -1 && clickIdx !== -1) {
                    const [from, to] = anchorIdx < clickIdx ? [anchorIdx, clickIdx] : [clickIdx, anchorIdx];
                    _chorusModalSelectedIds.clear();
                    for (let i = from; i <= to; i++) _chorusModalSelectedIds.add(visibleIds[i]);
                } else {
                    _chorusModalSelectedIds.clear();
                    _chorusModalSelectedIds.add(clickedId);
                    _chorusModalAnchorId = clickedId;
                }
            } else if (e.ctrlKey || e.metaKey) {
                if (_chorusModalSelectedIds.has(clickedId)) {
                    _chorusModalSelectedIds.delete(clickedId);
                } else {
                    _chorusModalSelectedIds.add(clickedId);
                }
                _chorusModalAnchorId = clickedId;
            } else {
                _chorusModalSelectedIds.clear();
                _chorusModalSelectedIds.add(clickedId);
                _chorusModalAnchorId = clickedId;
            }

            _chorusModalLastClicked = _chorusModalSelectedIds.has(clickedId) ? clickedId : null;

            syncChorusModalSelection();
            refreshChorusPreviewFromSet(filterVal);
        };

        card.ondblclick = function() {
            _chorusModalSelectedIds.clear();
            _chorusModalSelectedIds.add(c.id_coro);
            confirmAddCoro();
        };

        rowsContainer.appendChild(card);
    });

    syncChorusModalSelection();
    applyTranslations(rowsContainer);
}

function renderAdminCoros() {
    const rowsContainer = $('admin-coros-rows');
    if (!rowsContainer) return;

    const rawFilter = $('admin-text-filter')?.value || '';
    const textFilter = rawFilter.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const tipoFilterSet = _chorusFilterTipos;
    const tonoFilterSet = _chorusFilterTonos;
    const showInactive = $('chk-inactive').checked;

    rowsContainer.innerHTML = '';

    let filteredCoros = state.dataSource.choruses;
    if (!showInactive) {
        filteredCoros = filteredCoros.filter(c => c.activo && c.activo.trim() === "Yes");
    }
    if (tipoFilterSet.size > 0) filteredCoros = filteredCoros.filter(c => tipoFilterSet.has(c.tipo));
    if (tonoFilterSet.size > 0) filteredCoros = filteredCoros.filter(c => tonoFilterSet.has(c.tono));
    if (textFilter.trim() !== '') {
        filteredCoros = filteredCoros.filter(c => {
            const nameNorm = c.nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            const stanzasNorm = c.estrofas.some(st =>
                st.texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(textFilter)
            );
            return nameNorm.includes(textFilter) || stanzasNorm;
        });
    }

    const previewDiv = $('admin-preview-text');
    if (previewDiv) previewDiv.innerHTML = '';

    const highlightText = (text, filter) => {
        if (!filter.trim()) return text;
        const normText = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const index = normText.toLowerCase().indexOf(filter);
        if (index === -1) return text;
        const before = text.substring(0, index);
        const match = text.substring(index, index + filter.length);
        const after = text.substring(index + filter.length);
        return `${before}<span class="highlight">${match}</span>${after}`;
    };

    filteredCoros.forEach(c => {
        const { card, actionBtn } = buildChorusCard(c, {
            mode: 'admin',
            textFilter,
            isSelected: adminSelectedId === c.id_coro
        });

        actionBtn.onclick = (e) => {
            e.stopPropagation();
            adminSelectedId = c.id_coro;
            openChorusEditor(c.id_coro);
        };

        // Botón "Quitar" flotante junto a "Editar"
        const removeBtn = document.createElement('div');
        removeBtn.className = 'code-btn code-btn-danger chorus-card-add';
        removeBtn.innerHTML = '<span data-i18n="str4">Quitar</span>';
        removeBtn.onclick = async (e) => {
            e.stopPropagation();
            await deleteChorusFromLibrary(c.id_coro);
        };
        card.appendChild(removeBtn);

        card.onclick = function() {
            rowsContainer.querySelectorAll('.chorus-card').forEach(el => el.classList.remove('active'));
            card.classList.add('active');
            adminSelectedId = c.id_coro;

            if (previewDiv) {
                previewDiv.innerHTML = '';
                const stanzasHtml = c.estrofas.map(st => {
                    let text = st.stanza || st.texto;
                    return formatChorusPreview(text, textFilter);
                }).join('<br><br>');

                // Asignación directa con innerHTML (no buildRowFromTemplate)
                previewDiv.innerHTML = stanzasHtml;
                previewDiv.classList.remove('is-entering');
                void previewDiv.offsetWidth;
                previewDiv.classList.add('is-entering');
            }
        };

        card.ondblclick = function() {
            adminSelectedId = c.id_coro;
            openChorusEditor(c.id_coro);
        };

        rowsContainer.appendChild(card);
    });

    applyTranslations(rowsContainer);

    if (previewDiv && adminSelectedId != null) {
        const selected = filteredCoros.find(c => c.id_coro === adminSelectedId);
        if (selected) {
            previewDiv.innerHTML = selected.estrofas.map(st => {
                const text = st.stanza || st.texto;
                return formatChorusPreview(text, textFilter);
            }).join('<br><br>');

            previewDiv.classList.remove('is-entering');
            void previewDiv.offsetWidth;
            previewDiv.classList.add('is-entering');
        }
    }
}

function selectCanto(id) {
    clearGroupSelection(['citas', 'multimedia']);
    const idStr = String(id);
    _chorusSelectedIds.clear();
    _chorusSelectedIds.add(idStr);
    _chorusAnchorId    = idStr;
    _chorusLastClicked = idStr;
    state.selectedCanto = state.queue.choruses.find(c => String(c.id) === idStr);
    syncChorusSelection();
    renderStanzas();
    persistSession();
}

function removeChorusById(id) {
    const idStr = String(id);
    const canto = state.queue.choruses.find(c => String(c.id) === idStr);
    if (!canto) return;

    const card = $$(`#list-cantos-top .canto-card[data-id="${idStr}"]`);

    const finishRemove = () => {
        ProyController.clear(state.outputTargets.choruses);

        state.queue.choruses = state.queue.choruses.filter(c => String(c.id) !== idStr);
        _lastRenderedChorusIds.delete(canto.id);

        _chorusSelectedIds.delete(idStr);
        if (_chorusLastClicked === idStr) _chorusLastClicked = null;
        if (_chorusAnchorId === idStr)    _chorusAnchorId = null;

        if (state.selectedCanto && String(state.selectedCanto.id) === idStr) {
            state.selectedCanto = null;
            $('list-cantos-bottom').innerHTML = '';
            _lastRenderedStanzaIds = new Set();
            _lastStanzaOwnerId = null;
        }

        if (card && card.parentNode) card.remove();
        persistSession();
    };

    if (card && window.Anim) {
        window.Anim.cardLeave(card, finishRemove);
    } else {
        finishRemove();
    }
}

function removeChorus(el, ev) {
    closeAllDropdowns();

    if (_chorusSelectedIds.size === 0) {
        customAlert(setLang('str173'));
        return;
    }

    if (_chorusSelectedIds.size === 1) {
        removeChorusById([..._chorusSelectedIds][0]);
        return;
    }

    customConfirm(setLang('str309').replace('{n}', _chorusSelectedIds.size)).then(confirmed => {
        if (!confirmed) return;
        const ids = [..._chorusSelectedIds];
        ids.forEach(id => removeChorusById(id));
        _chorusSelectedIds.clear();
        _chorusLastClicked = null;
        _chorusAnchorId    = null;
        syncChorusSelection();
    });
}

function syncChorusSelection() {
    const selected = new Set([..._chorusSelectedIds].map(String));
    document.querySelectorAll('#list-cantos-top .canto-card').forEach(card => {
        card.classList.toggle('active', selected.has(String(card.dataset.id)));
    });
}

function handleChorusCardClick(id, e) {
    const idStr = String(id);
    const entry = state.queue.choruses.find(c => String(c.id) === idStr);
    if (!entry) return;

    const isCtrl  = e.ctrlKey || e.metaKey;
    const isShift = e.shiftKey;
    const isSimpleClick = !isCtrl && !isShift;
    const isSelected = _chorusSelectedIds.has(idStr);
    const keepSelection = isSimpleClick && isSelected && _chorusSelectedIds.size > 1;

    // Click simple sobre card ya seleccionada con otras:
    // mantener el bloque, actualizar el activo y el anchor.
    if (keepSelection) {
        _chorusAnchorId    = idStr;
        _chorusLastClicked = idStr;
        state.selectedCanto = entry;
        syncChorusSelection();
        renderStanzas();
        ProyController.refreshOnAirIndicators();
        return;
    }

    // Click simple en otra card: limpiar otras columnas y resetear
    if (isSimpleClick) {
        const card = $$(`#list-cantos-top .canto-card[data-id="${idStr}"]`);
        if (card) clearAllSelections(card);
        _chorusSelectedIds.clear();
        _chorusSelectedIds.add(idStr);
        _chorusAnchorId    = idStr;
        _chorusLastClicked = idStr;
        state.selectedCanto = entry;
    } else if (isShift && _chorusAnchorId !== null) {
        const visibleIds = [...document.querySelectorAll('#list-cantos-top .canto-card')]
            .map(c => c.dataset.id)
            .filter(Boolean);
        const anchorIdx = visibleIds.indexOf(_chorusAnchorId);
        const clickIdx  = visibleIds.indexOf(idStr);
        if (anchorIdx !== -1 && clickIdx !== -1) {
            const [from, to] = anchorIdx < clickIdx ? [anchorIdx, clickIdx] : [clickIdx, anchorIdx];
            _chorusSelectedIds.clear();
            for (let i = from; i <= to; i++) _chorusSelectedIds.add(visibleIds[i]);
        } else {
            _chorusSelectedIds.clear();
            _chorusSelectedIds.add(idStr);
        }
        _chorusAnchorId    = idStr;
        _chorusLastClicked = idStr;
        state.selectedCanto = entry;
    } else if (isCtrl) {
        if (isSelected) {
            _chorusSelectedIds.delete(idStr);
            if (_chorusLastClicked === idStr) {
                const remaining = [..._chorusSelectedIds];
                _chorusLastClicked = remaining.length > 0 ? remaining[remaining.length - 1] : null;
                state.selectedCanto = _chorusLastClicked !== null
                    ? state.queue.choruses.find(c => String(c.id) === _chorusLastClicked)
                    : null;
            }
        } else {
            _chorusSelectedIds.add(idStr);
            _chorusLastClicked = idStr;
            state.selectedCanto = entry;
        }
        _chorusAnchorId = idStr;
    }

    syncChorusSelection();
    renderStanzas();
    ProyController.refreshOnAirIndicators();
}

function saveChorusesToLocalStorage() {
    try {
        const data = JSON.stringify(state.dataSource.choruses);
        localStorage.setItem('zion_choruses', data);
    } catch (e) {
        customAlert(setLang('str185'));
    }
}

function loadChorusesFromLocalStorage() {
    try {
        const raw = localStorage.getItem('zion_choruses');
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length > 0) {
                state.dataSource.choruses = parsed;
                return true;
            }
        }
    } catch (e) {
        customAlert(setLang('str186'));
    }
    return false;
}

async function deleteChorusFromLibrary(idCoro) {
    const coro = state.dataSource.choruses.find(c => c.id_coro === idCoro);
    if (!coro) return;

    const confirmed = await customConfirm(setLang('str305'));
    if (!confirmed) return;

    // Filtrar del estado (y del queue si estuviera, por id_coro)
    const merged = state.dataSource.choruses.filter(c => c.id_coro !== idCoro);

    // Escribir PRIMERO en disco. Si falla, no tocamos la memoria.
    try {
        const result = await window.electronAPI.saveFile('json/chorus.json', merged);
        if (!result.success) throw new Error(result.error || 'save failed');
    } catch (saveErr) {
        customAlert(setLang('str167') + saveErr.message);
        return;
    }

    // Disco OK → actualizar estado en memoria
    state.dataSource.choruses = merged;
    saveChorusesToLocalStorage();

    // El coro eliminado NO se elimina del queue (los items son copias).
    // Pero si era el seleccionado en el tab admin, limpiar la selección.
    if (adminSelectedId === idCoro) {
        adminSelectedId = null;
        const previewDiv = $('admin-preview-text');
        if (previewDiv) previewDiv.innerHTML = '';
    }

    renderAdminCoros();
    renderChorus();
}

function initChorusGlobalEvents() {
    if (document._chorusGlobalBound) return;
    document._chorusGlobalBound = true;

    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        if (!window.ModalManager.isOpen('agregar-coro-modal')) return;
        if (e.target.tagName === 'TEXTAREA') return;
        e.preventDefault();
        confirmAddCoro();
    });

    document.addEventListener('keydown', (e) => {
        if (!window.ModalManager.isOpen('agregar-coro-modal')) return;
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;

        e.preventDefault();
        const cards = [...document.querySelectorAll('#agregar-coro-rows .chorus-card')];
        if (cards.length === 0) return;

        let currentIdx = -1;
        if (_chorusModalSelectedIds.size > 0) {
            const currentId = [..._chorusModalSelectedIds][0];
            currentIdx = cards.findIndex(c => parseInt(c.dataset.id) === currentId);
        }

        let nextIdx;
        if (e.key === 'ArrowDown') {
            nextIdx = currentIdx < 0 ? 0 : Math.min(currentIdx + 1, cards.length - 1);
        } else {
            nextIdx = currentIdx < 0 ? cards.length - 1 : Math.max(currentIdx - 1, 0);
        }

        const nextCard = cards[nextIdx];
        const nextId = parseInt(nextCard.dataset.id);
        const filterValue = $('agregar-coro-filter')?.value || '';

        _chorusModalSelectedIds.clear();
        _chorusModalSelectedIds.add(nextId);
        _chorusModalAnchorId = nextId;
        _chorusModalLastClicked = nextId;
        syncChorusModalSelection();
        refreshChorusPreviewFromSet(filterValue);
        nextCard.scrollIntoView({ block: 'nearest' });
    });
}

// Listeners del modal "agregar-coro". Se llama en su onOpen.
function initChorusAddEvents() {
    const modal = $('agregar-coro-modal');
    if (!modal) return;
    if (modal._chorusAddEventsBound) return;
    modal._chorusAddEventsBound = true;

    const filter = $('agregar-coro-filter');
    if (filter) {
        filter.addEventListener('input', function() { renderModalChorus(this.value); });
    }
}

// Listeners de opciones-modal (tab Cantos + checkbox inactivos). Se llama en su onOpen.
function initOptionsChorusEvents() {
    const modal = $('opciones-modal');
    if (!modal) return;
    if (modal._optionsChorusEventsBound) return;
    modal._optionsChorusEventsBound = true;

    const adminText = $('admin-text-filter');
    if (adminText) adminText.addEventListener('input', renderAdminCoros);

    const chkInactive = $('chk-inactive');
    if (chkInactive) {
        chkInactive.addEventListener('change', function() {
            renderAdminCoros();
            renderModalChorus($('agregar-coro-filter')?.value || '');
        });
    }
}

async function loadChorusesFromJson() {
    if (state.dataSource.choruses.length > 0) return;

    try {
        const result = await window.electronAPI.loadFile('json/chorus.json');
        if (!result.success || result.isDirectory) {
            debugLog('LOAD', setLang('str804'));
            return;
        }

        const v = validateJson(result.data, [isValidChorus]);
        if (!v.ok) {
            debugLog('LOAD', setLang('str804'));
            return;
        }

        const data = result.data;
        if (Array.isArray(data) && data.length > 0) {
            state.dataSource.choruses = data;
            saveChorusesToLocalStorage();
            debugLog('LOAD', setLang('str803').replace('{n}', data.length));
        } else {
            debugLog('LOAD', setLang('str804'));
        }
    } catch (err) {
        debugLog('LOAD', setLang('str805') + err.message);
    }
}

function syncChorusModalSelection() {
    const rows = document.querySelectorAll('#agregar-coro-rows .chorus-card');
    
    _.forEach(rows, el => {
        const id = _.parseInt(el.dataset.id);
        el.classList.toggle('active', _chorusModalSelectedIds.has(id));
    });
}

function addChorusById(id) {
    const sourceCoro = state.dataSource.choruses.find(c => c.id_coro === id);
    if (!sourceCoro) return null;

    const alreadyInQueue = state.queue.choruses.some(c => c.nombre === sourceCoro.nombre);
    if (alreadyInQueue) return null;

    createSessionIfNeeded();

    const nuevoId = Date.now() + Math.random();
    const entry = { ...sourceCoro, id: nuevoId, targetDisplayId: targetDisplayId };
    state.queue.choruses.push(entry);
    persistSession();

    return entry;
}

function addChorusesByIds(ids) {
    if (!Array.isArray(ids) || ids.length === 0) return;

    const added = [];
    ids.forEach(id => {
        const entry = addChorusById(id);
        if (entry) added.push(entry);
    });

    if (added.length === 0) {
        customAlert(setLang('str149'));
        return;
    }

    renderChorus();

    // Selecciona el último agregado en la columna
    const last = added[added.length - 1];
    selectCanto(last.id);
}

