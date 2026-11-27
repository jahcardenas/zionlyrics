(function () {
    'use strict';

    // ==========================================================
    // ADAPTERS
    // ==========================================================
    const ADAPTERS = {
        text: {
            read: el => el.value ?? '',
            write: (el, v) => { el.value = (v ?? '').toString(); }
        },
        number: {
            read: el => {
                const n = parseFloat(el.value);
                return isFinite(n) ? n : 0;
            },
            write: (el, v) => {
                const n = (typeof v === 'number' && isFinite(v)) ? v : 0;
                el.value = String(n);
            }
        },
        select: {
            read: el => el.value,
            write: (el, v) => { el.value = (v ?? '').toString(); }
        },
        checkbox: {
            read: el => !!el.checked,
            write: (el, v) => { el.checked = !!v; }
        },
        color: {
            read: el => el.dataset.color || '#ffffff',
            write: (el, v) => {
                const c = (typeof v === 'string' && /^#/.test(v)) ? v : '#ffffff';
                el.dataset.color = c;
                el.style.background = c;
            }
        },
        thumb: {
            read: el => el.dataset.persistentPath || '',
            write: (el, v) => {
                const val = (v ?? '').toString();
                // Solo escribe al dataset si es un path válido (no texto plano)
                const isMediaPath = /^(media\/|blob:|data:|https?:\/\/|#)/.test(val);
                el.dataset.persistentPath = isMediaPath ? val : '';

                if (typeof updateModalThumb === 'function') {
                    const id = el.id;
                    if (id === 'cc-bg-thumb') updateModalThumb('background');
                    else if (id === 'cc-logo-thumb') updateModalThumb('logo');
                    else if (id === 'cc-ph-thumb') updateModalThumb('placeholder');
                }
            }
        },
        shadow: {
            read: el => {
                try { return JSON.parse(el.dataset.shadow || '{}'); }
                catch (_) { return {}; }
            },
            write: (el, v) => {
                el.dataset.shadow = JSON.stringify(v || {});
                el.classList.toggle('is-enabled', !!(v && v.enabled));
            }
        },
        position: {
            read: el => {
                const raw = el.dataset.position;
                if (!raw) return { x: 50, y: 50, anchor: 'middle-center' };
                try { return JSON.parse(raw); }
                catch { return raw; }   // legacy string (pre-migración)
            },
            write: (el, v) => {
                const val = v || { x: 50, y: 50, anchor: 'middle-center' };
                el.dataset.position = typeof val === 'string' ? val : JSON.stringify(val);
                if (window.PositionPicker?.updateBtnDot) {
                    window.PositionPicker.updateBtnDot(el, val);
                }
            }
        },
        multi: {
            read: el => {
                try { return JSON.parse(el.dataset.multi || '{}'); }
                catch (_) { return {}; }
            },
            write: (el, v) => {
                el.dataset.multi = JSON.stringify(v || {});
                const labelEl = el.querySelector('.cc-multi-btn-label');
                if (labelEl && window.MultiPicker && typeof window.MultiPicker.computeLabel === 'function') {
                    const options = [
                        { label: 'Coros',      checked: !!(v && v.coros) },
                        { label: 'Citas',      checked: !!(v && v.citas) },
                        { label: 'Multimedia', checked: !!(v && v.media) }
                    ];
                    labelEl.textContent = window.MultiPicker.computeLabel(options);
                }
            }
        },
        'single-picker': {
            read: el => el.dataset.value || '',
            write: (el, v) => {
                let val = (v ?? '').toString();
                const providerRef = el.dataset.functionArg1;
                const opts = (window.MultiPicker?.getOptions)
                    ? window.MultiPicker.getOptions(providerRef)
                    : [];

                const emptyLabel = el.dataset.emptyLabel;

                // Provider vacío → label de "no hay opciones", valor vacío
                if (opts.length === 0) {
                    el.dataset.value = '';
                    const labelEl = el.querySelector('.cc-multi-btn-label');
                    if (labelEl) labelEl.textContent = emptyLabel || setLang('str191');
                    return;
                }

                // Con opciones: buscar coincidencia, si no, auto-seleccionar la primera
                let found = opts.find(o => o.value === val);
                if (!found) {
                    found = opts[0];
                    val = found.value;
                }

                el.dataset.value = val;
                const labelEl = el.querySelector('.cc-multi-btn-label');
                if (labelEl) labelEl.textContent = found.label;
            }
        },
        'targets-multi': {
            read: el => {
                return [...el.querySelectorAll('input[type="checkbox"]:checked')]
                    .map(cb => cb.dataset.displayId)
                    .filter(Boolean);
            },
            write: (el, ids) => {
                const set = new Set(ids || []);
                el.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                    cb.checked = set.has(cb.dataset.displayId);
                });
            }
        },
    };

    // ==========================================================
    // HELPERS DE PATHS (wrappers sobre lodash)
    // ==========================================================
    const getNested = (obj, path) => _.get(obj, path);
    const setNested = (obj, path, value) => { _.set(obj, path, value); };

    // ==========================================================
    // ESTADO INTERNO
    // ==========================================================
    let _watchState = null;
    let _snapshot = null;
    let _snapshotRoot = null;

    const COMMIT_DEBOUNCE_MS = 300;

    function read(rootSelector, rootObject) {
        const root = $$(rootSelector);
        if (!root || !rootObject) return;
        root.querySelectorAll('[data-json-key]').forEach(el => {
            const key = el.dataset.jsonKey;
            const type = el.dataset.type || 'text';
            const adapter = ADAPTERS[type] || ADAPTERS.text;

            const value = getNested(rootObject, key);
            if (value === undefined) return;

            el._binding = true;
            try { adapter.write(el, value); } catch (e) {
                console.warn('data-binding: write failed for ', key, e);
            }
            setTimeout(() => { el._binding = false; }, 0);
        });
    }

    function write(rootSelector, rootObject) {
        const root = $$(rootSelector);
        if (!root || !rootObject) return;
        root.querySelectorAll('[data-json-key]').forEach(el => {
            const key = el.dataset.jsonKey;
            const type = el.dataset.type || 'text';
            const adapter = ADAPTERS[type] || ADAPTERS.text;

            try {
                const value = adapter.read(el);
                setNested(rootObject, key, value);
            } catch (e) {
                console.warn('data-binding: read failed for ' + key, e);
            }
        });
    }

    function commit(el, value, eventName) {
        const type = el.dataset.type || 'text';
        const adapter = ADAPTERS[type] || ADAPTERS.text;
        try {
            adapter.write(el, value);
        } catch (e) {
            console.warn('data-binding: commit failed for ' + el.dataset.jsonKey, e);
            return;
        }
        el.dispatchEvent(new Event(eventName || 'input', { bubbles: true }));
    }

    function setValue(key, value) {
        if (!_watchState) {
            console.warn('DataBinding.setValue: no active watch for key ' + key);
            return;
        }
        const { rootSel, rootObj } = _watchState;
        const root = $$(rootSel);
        if (!root) return;

        const el = root.querySelector(`[data-json-key="${key}"]`);
        if (!el) return;

        // 1) Escribe al objeto raíz
        setNested(rootObj, key, value);

        // 2) Refresca el DOM de ese campo desde el objeto
        const type = el.dataset.type || 'text';
        const adapter = ADAPTERS[type] || ADAPTERS.text;
        el._binding = true;
        try { adapter.write(el, value); } catch (e) {
            console.warn('DataBinding.setValue: adapter.write failed for ' + key, e);
        }
        setTimeout(() => { el._binding = false; }, 0);
    }

    function getValue(key) {
        if (!_watchState) return undefined;
        return getNested(_watchState.rootObj, key);
    }

    function watch(rootSelector, rootObject, opts) {
        unwatch();
        const root = $$(rootSelector);
        if (!root || !rootObject) return;

        const onChange = (opts && typeof opts.onChange === 'function') ? opts.onChange : null;
        const onCommit = (opts && typeof opts.onCommit === 'function') ? opts.onCommit : null;

        // Debounce del commit con lodash (permite .cancel())
        const commitFn = onCommit
            ? _.debounce(() => onCommit(rootObject), COMMIT_DEBOUNCE_MS)
            : null;

        const listeners = [];

        root.querySelectorAll('[data-json-key]').forEach(el => {
            const handler = () => {
                if (el._binding) return;

                const key = el.dataset.jsonKey;
                const type = el.dataset.type || 'text';
                const adapter = ADAPTERS[type] || ADAPTERS.text;

                try {
                    const value = adapter.read(el);
                    setNested(rootObject, key, value);
                } catch (e) {
                    console.warn('data-binding: change not applied', key, e);
                    return;
                }

                if (onChange) onChange(rootObject, key);
                if (commitFn) commitFn();
            };

            el.addEventListener('input',  handler);
            el.addEventListener('change', handler);
            listeners.push({ el, handler });
        });

        _watchState = {
            rootSel: rootSelector,
            rootObj: rootObject,
            onChange,
            onCommit,
            listeners,
            commitFn
        };
    }

    function unwatch() {
        if (!_watchState) return;
        if (_watchState.commitFn) _watchState.commitFn.cancel();
        _watchState.listeners.forEach(({ el, handler }) => {
            el.removeEventListener('input',  handler);
            el.removeEventListener('change', handler);
            el._binding = false;
        });
        _watchState = null;
    }

    function beginEdit(rootObject) {
        _snapshot = _.cloneDeep(rootObject);
        _snapshotRoot = rootObject;
    }

    function commitEdit() {
        _snapshot = null;
        _snapshotRoot = null;
    }

    function cancelEdit(rootObject) {
        const target = rootObject || _snapshotRoot;
        if (!target || !_snapshot) {
            _snapshot = null;
            _snapshotRoot = null;
            return;
        }
        // Reemplazo completo de claves (para eliminar las que no existían en el snapshot)
        Object.keys(target).forEach(k => { delete target[k]; });
        Object.keys(_snapshot).forEach(k => { target[k] = _snapshot[k]; });
        _snapshot = null;
        _snapshotRoot = null;
    }

    function hasSnapshot() {
        return _snapshot !== null;
    }

    function hasChanges() {
        if (!_snapshot || !_snapshotRoot) return false;
        return !_.isEqual(_snapshotRoot, _snapshot);
    }

    window.DataBinding = {
        read,
        write,
        setValue,
        getValue,
        watch,
        unwatch,
        beginEdit,
        commitEdit,
        cancelEdit,
        hasSnapshot,
        hasChanges,
        getNested,
        setNested,
        commit
    };
})();