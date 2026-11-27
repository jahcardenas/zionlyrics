(function () {
    'use strict';

    function computeLabel(options) {
        const checked = options.filter(o => o.checked);
        if (checked.length === 0) return setLang('str219'); 
        if (checked.length === options.length) return setLang('str217');
        return checked.map(o => o.label).join(' + ');
    }

    // Normaliza la respuesta del provider a { flat, groups, persistKey, activeGroup }
    function getProviderData(ref) {
        const raw = (typeof SINGLE_PROVIDERS !== 'undefined' && SINGLE_PROVIDERS[ref])
            ? SINGLE_PROVIDERS[ref]()
            : [];

        if (Array.isArray(raw)) {
            return { flat: raw, groups: null, persistKey: null, activeGroup: null };
        }
        if (raw && Array.isArray(raw.groups)) {
            const activeGroup = raw.activeGroup || raw.groups[0]?.id || null;
            return {
                flat: raw.groups.flatMap(g => g.options),
                groups: raw.groups,
                persistKey: raw.persistKey || null,
                activeGroup
            };
        }
        return { flat: [], groups: null, persistKey: null, activeGroup: null };
    }

    // Comodidad para databind y otros consumidores que solo quieren la lista plana.
    function getOptions(ref) {
        return getProviderData(ref).flat;
    }

    function open(anchorEl, options, onChange) {
        const opts = options.map(o => ({ ...o }));

        PickerBase.open(anchorEl, {
            className: 'multi-picker',
            minWidth: 180,
            ignoreCloseFrom: ['.cc-color-picker', '.cc-shadow-picker'],
            content: `
                <div class="cc-mp-title">Mostrar en</div>
                <div class="cc-mp-options">
                    ${opts.map((o, i) => `
                        <label class="chk-custom">
                            <input type="checkbox" data-idx="${i}" ${o.checked ? 'checked' : ''}>
                            <span class="chk-box"></span>
                            <span class="chk-label">${o.label}</span>
                        </label>
                    `).join('')}
                </div>
                <div class="cc-mp-actions modal-footer-right">
                    <div class="code-btn code-btn-primary cc-mp-save">Guardar</div>
                    <div class="code-btn code-btn-cancel cc-mp-cancel">Cancelar</div>
                </div>
            `,
            onMount(el, closeFn) {
                el.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                    cb.addEventListener('change', () => {
                        const idx = parseInt(cb.dataset.idx, 10);
                        opts[idx].checked = cb.checked;
                    });
                });

                el.querySelector('.cc-mp-save').addEventListener('click', () => {
                    const result = {
                        coros: opts[0].checked,
                        citas: opts[1].checked,
                        media: opts[2].checked
                    };
                    if (typeof onChange === 'function') onChange(result);
                    if (anchorEl.dataset.jsonKey) DataBinding.commit(anchorEl, result);
                    closeFn();
                });

                el.querySelector('.cc-mp-cancel').addEventListener('click', closeFn);
            }
        });
    }

    function openSingle(anchorEl, providerRef, onSelect, customClass = '') {
        const providerData = getProviderData(providerRef);
        const current = anchorEl.dataset.value || '';
        const emptyLabel = anchorEl.dataset.emptyLabel;
        const includeAll = anchorEl.hasAttribute('data-include-all');
        const hasGroups = !!providerData.groups;

        PickerBase.open(anchorEl, {
            className: `multi-picker single-mode ${customClass}`,
            minWidth: 160,
            content: `
                ${hasGroups ? `<div class="sp-group-switch" id="sp-group-switch"></div>` : ''}
                <div class="sp-list" id="sp-list-container"></div>
            `,
            onMount(el, closeFn) {
                const listEl = el.querySelector('#sp-list-container');
                let activeGroupId = providerData.activeGroup;

                const renderSwitch = () => {
                    const switchEl = el.querySelector('#sp-group-switch');
                    if (!switchEl) return;
                    switchEl.innerHTML = providerData.groups.map(g => `
                        <button type="button" data-group-id="${g.id}"
                                class="${g.id === activeGroupId ? 'active' : ''}">${g.label}</button>
                    `).join('');
                    switchEl.querySelectorAll('button').forEach(btn => {
                        btn.addEventListener('click', () => {
                            const gid = btn.dataset.groupId;
                            if (gid === activeGroupId) return;
                            activeGroupId = gid;
                            if (providerData.persistKey) {
                                zionLyricsObj[providerData.persistKey] = gid;
                                saveZionLyricsObj();
                            }
                            renderSwitch();
                            renderList();
                        });
                    });
                };

                const renderList = () => {
                    const baseList = hasGroups
                        ? (providerData.groups.find(g => g.id === activeGroupId)?.options || [])
                        : providerData.flat;

                    let opts;
                    if (baseList.length === 0 && emptyLabel) {
                        opts = [{ value: '', label: emptyLabel, checked: true, disabled: true }];
                    } else {
                        opts = baseList.map(o => ({ ...o, checked: o.value === current }));
                        if (includeAll) {
                            opts.unshift({ value: 'Ver Todo', label: setLang('str218'), checked: current === 'Ver Todo' });
                        }
                    }

                    listEl.innerHTML = opts.map((o, i) => `
                        <div class="sp-item ${o.checked ? 'is-selected' : ''}"
                             data-idx="${i}"
                             ${o.disabled ? 'data-disabled="1"' : ''}>
                            ${o.label}
                        </div>
                    `).join('');

                    listEl.querySelectorAll('.sp-item').forEach(item => {
                        if (item.dataset.disabled) return;
                        item.addEventListener('click', () => {
                            const idx = parseInt(item.dataset.idx, 10);
                            const picked = opts[idx];
                            DataBinding.commit(anchorEl, picked.value);
                            if (onSelect) onSelect(picked.value, picked);
                            closeFn();
                        });
                    });
                };

                if (hasGroups) renderSwitch();
                renderList();
            }
        });
    }

    function setValue(anchorEl, value) {
        if (!anchorEl) return;
        const val = (value ?? '').toString();
        anchorEl.dataset.value = val;

        const labelEl = anchorEl.querySelector('.cc-multi-btn-label');
        if (!labelEl) return;

        const ref = anchorEl.dataset.functionArg1;
        const opts = getOptions(ref);
        const found = opts.find(o => o.value === val);
        labelEl.textContent = found ? found.label : (val || 'Ninguna');
    }

    window.MultiPicker = {
        open,
        computeLabel,
        openSingle,
        getOptions,
        getProviderData,
        setValue
    };
})();