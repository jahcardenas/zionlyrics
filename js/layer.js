function openSermonTitleModal(el, ev) {
    const virtualAnchor = {
        getBoundingClientRect: () => ({
            width:  0,
            height: 0,
            x:      window.innerWidth  / 2,
            y:      window.innerHeight / 2,
            top:    window.innerHeight / 2,
            left:   window.innerWidth  / 2,
            right:  window.innerWidth  / 2,
            bottom: window.innerHeight / 2
        })
    };

    const current = state.session?.sermonTitle || '';

    PickerBase.open(virtualAnchor, {
        className: 'sermon-title-picker',
        minWidth: 360,
        placement: 'bottom',
        content: `
            <div class="sermon-title-inner">
                <div class="sermon-title-label" data-i18n="str322">Título del sermón</div>
                <input type="text"
                       class="sermon-title-input"
                       data-i18n-placeholder="str323"
                       placeholder="Escribe el título del sermón"
                       maxlength="80"
                       value="${escapeHtml(current)}">
                <div class="sermon-title-actions">
                    <div class="code-btn code-btn-primary sermon-title-ok" data-i18n="str26">Aceptar</div>
                    <div class="code-btn code-btn-cancel sermon-title-cancel" data-i18n="str38">Cerrar</div>
                </div>
            </div>
        `,
        onMount(el, closeFn) {
            const input = el.querySelector('.sermon-title-input');
            const btnOk = el.querySelector('.sermon-title-ok');
            const btnCancel = el.querySelector('.sermon-title-cancel');

            setTimeout(() => {
                if (input) {
                    input.focus();
                    input.select();
                }
            }, 30);

            const commit = async () => {
                const value = (input.value || '').trim();
                createSessionIfNeeded();
                state.session.sermonTitle = value;
                renderTitlebarSermon();
                await persistSession({ force: true });
                closeFn();
                if (typeof renderMedia === 'function') renderMedia(); 
            };

            btnOk.addEventListener('click', commit);
            btnCancel.addEventListener('click', closeFn);

            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    commit();
                }
            });
        }
    });
}

function renderTitlebarSermon() {
    const titleEl = $('custom-titlebar-title');
    if (!titleEl) return;

    const title = (state.session?.sermonTitle || '').trim();

    let sepEl = titleEl.querySelector('.titlebar-sermon-sep');
    let titleTextEl = titleEl.querySelector('.titlebar-sermon-text');
    if (!sepEl) {
        sepEl = document.createElement('span');
        sepEl.className = 'titlebar-sermon-sep';
        sepEl.textContent = ':\u00A0';
        titleEl.appendChild(sepEl);
    }
    if (!titleTextEl) {
        titleTextEl = document.createElement('span');
        titleTextEl.className = 'titlebar-sermon-text';
        titleEl.appendChild(titleTextEl);
    }

    if (title) {
        sepEl.style.display = '';
        titleTextEl.style.display = '';
        titleTextEl.textContent = title;
        titleTextEl.title = title;
    } else {
        sepEl.style.display = 'none';
        titleTextEl.style.display = 'none';
        titleTextEl.textContent = '';
        titleTextEl.removeAttribute('title');
    }
}

async function populateAudioOutputs() {
    if (!HTMLMediaElement.prototype.setSinkId) return;

    _audioDevicesMap = {};
    try {
        let devices = await navigator.mediaDevices.enumerateDevices();
        const hasLabels = devices.some(d => d.kind === 'audiooutput' && d.label);
        if (!hasLabels) {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                stream.getTracks().forEach(t => t.stop());
                devices = await navigator.mediaDevices.enumerateDevices();
            } catch (_) {}
        }

        const seen = new Set();
        devices.filter(d => d.kind === 'audiooutput').forEach((d) => {
            if (d.deviceId === 'default' || d.deviceId === 'communications') return;
            let label = d.label || '';
            if (!label) return;
            if (/Microsoft Teams|Zoom|Virtual|Null/i.test(label)) return;
            if (seen.has(label)) return;
            seen.add(label);
            _audioDevicesMap[label] = d.deviceId;
        });

        const picker = $('cc-audio-output'); // Si existe, lo actualiza (aunque lo vamos a quitar)
        if (picker) {
            const current = picker.dataset.value || '';
            const opts = SINGLE_PROVIDERS['audio-output']();
            const found = opts.find(o => o.value === current) || opts[0];
            picker.dataset.value = found.value;
            const labelEl = picker.querySelector('.cc-multi-btn-label');
            if (labelEl) labelEl.textContent = found.label;
        }
    } catch (e) {
        console.warn('Failed to enumerate audio outputs.');
    }
}