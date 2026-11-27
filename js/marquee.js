
function validateMarqueeDraft(draft) {
    if (!draft?.text?.trim()) {
        Tooltip.show('mrc-text',setLang('str141'));
        return false;
    }
    if (!draft.targetDisplays?.length) {
        Tooltip.show('mrc-monitors-list',setLang('str142'));
        return false;
    }
    return true;
}

function buildCleanMarqueeConfig(draft, visible) {
    const config = Object.assign({}, _.omit(draft, ['targetDisplays']), {
        visible,
        text: draft.text.trim()
    });

    if (window.Fonts) {
        config.fontFamily = Fonts.resolve(draft.fontFamily);
    }

    return config;
}

function upsertMarqueeEntry(config, targetDisplays) {
    if (state.marqueeSourceId) {
        const entry = _.find(zionLyricsObj.marquees, { id: state.marqueeSourceId });
        if (entry) {
            entry.config = config;
            entry.targetDisplays = [...targetDisplays];
            entry.sentAt = Date.now();
            return entry;
        }
    }
    const entry = {
        id: 'mrc-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
        sentAt: Date.now(),
        targetDisplays: [...targetDisplays],
        config
    };
    (zionLyricsObj.marquees ||= []).push(entry);
    state.marqueeSourceId = entry.id;
    saveZionLyricsObj();
    return entry;
}

function renderMarqueeMonitorList() {
    const list = $('mrc-monitors-list');
    if (!list) return;

    const targets = state.settings.connectedDisplays.filter(d => !d.isPrimary);
    if (targets.length === 0) {
        list.innerHTML = '<div class="mrc-queue-empty" data-i18n="str187">No hay monitores extendidos.</div>';
        return;
    }

    list.innerHTML = targets.map(t => {
        const iconType = getMonitorIconType(t.label);
        return `
            <label class="chk-custom">
                <input type="checkbox" data-display-id="${t.id}">
                <span class="chk-box"></span>
                <i data-lucide="${iconType}" class="mrc-monitor-icon"></i>
                <span class="chk-label">${t.label}</span>
            </label>
        `;
    }).join('');

    createIcons();
    applyTranslations();
}

function previewMarqueeSettings() {
    const draft = state.marqueeDraft;
    if (!draft) return;

    const layer = $$('.mrc-preview-layer');
    const track = layer?.querySelector('.mrc-preview-track');
    const textEl = layer?.querySelector('.mrc-preview-text');
    if (!layer || !track || !textEl) return;

    textEl.textContent = draft.text || setLang('str143');

    layer.dataset.position = draft.position || 'bottom';
    Object.assign(layer.style, {
        background: draft.bgColor || '#000',
        color:      draft.color || '#fff',
        fontSize:   (draft.fontSize || 3) + 'cqi'
    });

    const resolvedFont = window.Fonts ? Fonts.resolve(draft.fontFamily) : (draft.fontFamily || 'inherit');
    layer.style.setProperty('--mrc-font', resolvedFont);
    layer.style.setProperty('--mrc-weight', draft.fontWeight || '400');
    track.style.setProperty('--mrc-speed', (draft.speed || 60) + 's');

    // Re-dispara la animación de entrada si cambió
    const newAnim = draft.animation || 'none';
    if (layer.dataset.anim !== newAnim) {
        layer.dataset.anim = newAnim;
        layer.style.animation = 'none';
        void layer.offsetWidth;
        layer.style.animation = '';
    }

    // Reinicia el scroll
    track.style.animation = 'none';
    void track.offsetWidth;
    track.style.animation = '';
    applyTranslations();
}

function loadMarqueeIntoDraft(el, ev, id) {
    const m = _.find(zionLyricsObj.marquees, { id });
    if (!m) return;

    // Persiste cambios pendientes de la entry anterior
    if (state.marqueeSourceId) autosaveActiveMarquee();

    // Mutación del draft existente (mantiene la referencia → watch sigue conectado)
    Object.assign(state.marqueeDraft, defaultMarqueeDraft(), m.config, {
        targetDisplays: [...(m.targetDisplays || [])]
    });
    state.marqueeSourceId = id;

    // DataBinding rellena los campos y marca los checkboxes
    DataBinding.read('#configurar-marquesina', state.marqueeDraft);

    renderMarqueeQueue();
    applyTranslations();
    previewMarqueeSettings();
}

function clearMarqueeFields() {
    Object.assign(state.marqueeDraft, defaultMarqueeDraft());
    state.marqueeSourceId = null;

    DataBinding.read('#configurar-marquesina', state.marqueeDraft);

    renderMarqueeQueue();
    previewMarqueeSettings();
}

async function autosaveActiveMarquee() {
    if (!state.marqueeSourceId) return;
    const entry = _.find(zionLyricsObj.marquees, { id: state.marqueeSourceId });
    if (!entry) return;

    entry.config = _.omit(state.marqueeDraft, ['targetDisplays']);

    // Solo sobrescribe targetDisplays si el draft tiene alguno,
    // o si explícitamente el usuario desmarcó todos (queremos permitir quitar todos)
    if (state.marqueeDraft.targetDisplays !== undefined) {
        entry.targetDisplays = [...state.marqueeDraft.targetDisplays];
    }

    await saveZionLyricsObj();
    renderMarqueeQueue();
}

async function saveMarqueeToQueue() {
    const draft = state.marqueeDraft;
    if (!validateMarqueeDraft(draft)) return;

    upsertMarqueeEntry(buildCleanMarqueeConfig(draft, false), draft.targetDisplays);
    await saveZionLyricsObj();
    renderMarqueeQueue();
    applyTranslations();
}

function handleMarqueeAction(el, ev, action, id) {
    if (action === 'resend') resendMarqueeFromQueue(id);
    else if (action === 'stop') stopMarqueeFromQueue(id);
    else if (action === 'delete') deleteMarqueeFromQueue(id);
}

async function resendMarqueeFromQueue(id) {
    const m = _.find(zionLyricsObj.marquees, { id });
    if (!m) return;

    const currentTargets = m.targetDisplays || [];
    if (!currentTargets.length) {
        Tooltip.show('mrc-monitors-list', setLang('str142'));
        return;
    }

    ProyController.applyLayers(currentTargets, {
        marquee: Object.assign({}, m.config, { visible: true, fireAt: Date.now() })
    });

    // Solo actualiza el timestamp del último envío, sin duplicar
    m.sentAt = Date.now();
    m.config.fireAt = Date.now();
    await saveZionLyricsObj();
    renderMarqueeQueue();
}

function stopMarqueeFromQueue(id) {
    const m = _.find(zionLyricsObj.marquees, { id });
    if (!m) return;
    ProyController.applyLayers(m.targetDisplays, { marquee: { visible: false } });
}

async function deleteMarqueeFromQueue(id) {
    zionLyricsObj.marquees = _.filter(zionLyricsObj.marquees, m => m.id !== id);

    // Si borraste la marquesina activa, limpia el draft también
    if (state.marqueeSourceId === id) {
        state.marqueeSourceId = null;
        Object.assign(state.marqueeDraft, defaultMarqueeDraft());
        DataBinding.read('#configurar-marquesina', state.marqueeDraft);
        previewMarqueeSettings();
    }

    await saveZionLyricsObj();
    renderMarqueeQueue();
}

function renderMarqueeQueue() {
    const list = $('mrc-queue-list');
    if (!list) return;

    const marquees = zionLyricsObj.marquees || [];
    if (marquees.length === 0) {
        list.innerHTML = '<div class="mrc-queue-empty" data-i18n="str89"></div>';
        return;
    }

    const activeId = state.marqueeSourceId;
    const extended = state.settings.connectedDisplays.filter(d => !d.isPrimary);

    list.innerHTML = marquees.slice().reverse().map(m => {
        const targetIds = m.targetDisplays || [];
        const allSelected = extended.length > 0
            && targetIds.length === extended.length
            && extended.every(d => targetIds.includes(d.id));

        const targetsLabel = allSelected
            ? setLang('str140')
            : (targetIds.map(id => extended.find(d => d.id === id)?.label || id).join(', ') || setLang('str144'));

        const time = new Date(m.sentAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
        const activeClass = m.id === activeId ? ' active' : '';

        return `
            <div class="mrc-queue-item app-card${activeClass}"
                 data-mrc-id="${m.id}"
                 data-function="loadMarqueeIntoDraft"
                 data-function-arg1="${m.id}">
                <div class="mrc-queue-item-text">${escapeHtml(m.config.text || setLang('str145'))}</div>
                <div class="mrc-queue-item-meta">
                    <span>→ ${targetsLabel}</span>
                    <span>· ${time}</span>
                </div>
                <div class="mrc-queue-item-actions">
                    <div class="code-btn" data-function="handleMarqueeAction" data-function-arg1="resend" data-function-arg2="${m.id}"><span data-i18n="str138">Enviar</span></div>
                    <div class="code-btn" data-function="handleMarqueeAction" data-function-arg1="stop"   data-function-arg2="${m.id}"><span data-i18n="str139">Detener</span></div>
                    <div class="code-btn code-btn-danger" data-function="handleMarqueeAction" data-function-arg1="delete" data-function-arg2="${m.id}"><span data-i18n="str4">Quitar</span></div>
                </div>
            </div>
        `;
    }).join('');
    applyTranslations();
}
