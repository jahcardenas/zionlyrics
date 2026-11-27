(function () {
    'use strict';

    function hexToRgba(hex, alpha) {
        const m = (hex || '').match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
        if (!m) return `rgba(0,0,0,${alpha})`;
        return `rgba(${parseInt(m[1],16)},${parseInt(m[2],16)},${parseInt(m[3],16)},${alpha})`;
    }

    function buildShadowCSS(cfg) {
        if (!cfg || !cfg.enabled) return 'none';
        return `${cfg.offsetX}px ${cfg.offsetY}px ${cfg.blur}px ${hexToRgba(cfg.color, cfg.opacity)}`;
    }

    function labelFor(target) {
        const labels = {
            'coro': setLang('str275'),      // "Coro"
            'ref': setLang('str71'),        // "Referencia bíblica"
            'verse': setLang('str72'),      // "Texto bíblico"
            'version': setLang('str73')     // "Versión"
        };
        return labels[target] || target;
    }

    function open(anchorEl, target) {
        if (!anchorEl) return;

        // El anchor guarda el estado en dataset.shadow (puesto por el binding)
        let initial = {};
        try { initial = JSON.parse(anchorEl.dataset.shadow || '{}'); } catch (_) {}

        const draft = Object.assign({
            enabled: false, color: '#000000', opacity: 0.9,
            blur: 15, offsetX: 0, offsetY: 0
        }, initial);

        PickerBase.open(anchorEl, {
            className: 'shadow-picker',
            minWidth: 260,
            ignoreCloseFrom: ['.cc-color-picker'],
            content: `
                <div class="cc-sp-title">${setLang('str262')}: ${labelFor(target)}</div>
                <label class="cc-sp-row">
                    <input type="checkbox" class="cc-sp-enabled" ${draft.enabled ? 'checked' : ''}>
                    <span data-i18n="str234">Activar sombra</span>
                </label>
                <div class="cc-sp-row">
                    <span class="cc-sp-label" data-i18n="str235">Color</span>
                    <div class="cc-sp-swatch cc-cp-preview" data-color="${draft.color}"></div>
                </div>
                <div class="cc-sp-row cc-sp-row-stack">
                    <div class="cc-sp-row-head">
                        <span class="cc-sp-label" data-i18n="str236">Opacidad</span>
                        <span class="cc-sp-value cc-sp-opacity-val">${draft.opacity.toFixed(2)}</span>
                    </div>
                    <input type="range" class="cc-sp-opacity" min="0" max="1" step="0.05" value="${draft.opacity}">
                </div>
                <div class="cc-sp-row">
                    <span class="cc-sp-label" data-i18n="str237">Difuminado</span>
                    <input type="number" class="cc-sp-blur" min="0" max="100" step="1" value="${draft.blur}">
                </div>
                <div class="cc-sp-row cc-sp-row-offset">
                    <span class="cc-sp-label">X</span>
                    <input type="number" class="cc-sp-x" min="-50" max="50" step="1" value="${draft.offsetX}">
                    <span class="cc-sp-label">Y</span>
                    <input type="number" class="cc-sp-y" min="-50" max="50" step="1" value="${draft.offsetY}">
                </div>
                <div class="cc-sp-preview">
                    <span class="cc-sp-preview-text" data-i18n="str143">Texto de ejemplo</span>
                </div>
                <div class="cc-sp-actions modal-footer-right">
                    <div class="code-btn code-btn-primary cc-sp-save" data-i18n="str57">Guardar</div>
                    <div class="code-btn cc-sp-reset" data-i18n="str38">Cerrar</div>
                </div>
            `,
            onMount(el, closeFn) {
                const swatch     = el.querySelector('.cc-sp-swatch');
                const enabledCk  = el.querySelector('.cc-sp-enabled');
                const opacityEl  = el.querySelector('.cc-sp-opacity');
                const blurEl     = el.querySelector('.cc-sp-blur');
                const xEl        = el.querySelector('.cc-sp-x');
                const yEl        = el.querySelector('.cc-sp-y');
                const previewTxt = el.querySelector('.cc-sp-preview-text');

                swatch.style.background = draft.color;

                const syncPreview = () => {
                    previewTxt.style.textShadow = buildShadowCSS(draft);
                };

                enabledCk.onchange = () => { draft.enabled = enabledCk.checked; syncPreview(); };
                opacityEl.oninput = () => {
                    draft.opacity = parseFloat(opacityEl.value);
                    el.querySelector('.cc-sp-opacity-val').textContent = draft.opacity.toFixed(2);
                    syncPreview();
                };
                blurEl.oninput = () => { draft.blur = parseInt(blurEl.value) || 0; syncPreview(); };
                xEl.oninput    = () => { draft.offsetX = parseInt(xEl.value) || 0; syncPreview(); };
                yEl.oninput    = () => { draft.offsetY = parseInt(yEl.value) || 0; syncPreview(); };

                swatch.onclick = () => {
                    ColorPicker.open(swatch, (hex) => {
                        draft.color = hex;
                        swatch.dataset.color = hex;
                        swatch.style.background = hex;
                        syncPreview();
                    }, draft.color);
                };

                el.querySelector('.cc-sp-reset').onclick = () => closeFn();

                el.querySelector('.cc-sp-save').onclick = () => {
                    DataBinding.commit(anchorEl, draft);
                    closeFn();
                };

                syncPreview();
            }
        });
    }

    window.ShadowPicker = { 
        open, 
        buildShadowCSS, 
        hexToRgba 
    };
})();