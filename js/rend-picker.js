import { computePosition, offset, flip, shift, arrow, autoUpdate, size } from '@floating-ui/dom';

const _stack = [];              // pickers apilados
let _openDropdown = null;
let _openAppMenu  = null;

function position(anchorEl, floatingEl, opts = {}) {
    const placement     = opts.placement || 'bottom';
    const shiftPadding  = opts.shiftPadding == null ? 8 : opts.shiftPadding;
    const fallback      = opts.fallbackPlacements || ['top-end', 'top-start', 'top'];

    let arrowEl = opts.arrowEl || floatingEl.querySelector(':scope > .floating-arrow') || null;
    if (!arrowEl && opts.arrow === true) {
        arrowEl = document.createElement('div');
        arrowEl.className = 'floating-arrow';
        floatingEl.appendChild(arrowEl);
    }

    // La altura del arrow (7px en .floating-arrow). Sin arrow, la caja sube
    // ese espacio para que el gap visual sea el mismo en ambos casos.
    const ARROW_HEIGHT = 7;
    const baseOffset   = opts.offset == null ? 10 : opts.offset;
    const offsetValue  = arrowEl
        ? baseOffset
        : Math.max(0, baseOffset - ARROW_HEIGHT);

    const middleware = [
        offset(offsetValue),
        flip({
            fallbackPlacements: fallback,
            padding: shiftPadding,
            fallbackStrategy: 'bestFit'   // Elige el lado con MÁS espacio, no el primero que cabe
        }),
        shift({
            padding: shiftPadding,
            mainAxis: true,               // Mueve en el eje principal (vertical en bottom-start)
            crossAxis: true               // Y también en el eje cruzado (horizontal)
        })
    ];
    
    // Safety net: solo si el menú NO cabe de ninguna forma (muy pocos px disponibles)
    // forzamos maxHeight + scroll. Si el menú cabe (availableHeight >= 150px), lo dejamos
    // fluir y que shift lo posicione.
    middleware.push(size({
        padding: shiftPadding,
        apply({ availableHeight, elements }) {
            if (availableHeight < 150) {
                Object.assign(elements.floating.style, {
                    maxHeight: Math.max(availableHeight, 100) + 'px',
                    overflowY: 'auto'
                });
            } else {
                elements.floating.style.maxHeight = '';
                elements.floating.style.overflowY = '';
            }
        }
    }));
    if (arrowEl) middleware.push(arrow({ element: arrowEl, padding: 14 }));

    const update = () => {
        computePosition(anchorEl, floatingEl, {
            placement,
            strategy: 'fixed',
            middleware
        }).then(({ x, y, placement: finalPlacement, middlewareData }) => {
            Object.assign(floatingEl.style, {
                left: Math.round(x) + 'px',
                top:  Math.round(y) + 'px'
            });

            if (!arrowEl) return;

            const side = finalPlacement.split('-')[0];
            floatingEl.classList.remove('arrow-top', 'arrow-bottom', 'arrow-left', 'arrow-right');
            floatingEl.classList.add('arrow-' + side);

            if (middlewareData.arrow) {
                const { x: ax, y: ay } = middlewareData.arrow;
                const staticSide = {
                    top: 'bottom', right: 'left', bottom: 'top', left: 'right'
                }[side];

                Object.assign(arrowEl.style, {
                    left:   ax != null ? Math.round(ax) + 'px' : '',
                    top:    ay != null ? Math.round(ay) + 'px' : '',
                    right:  '',
                    bottom: '',
                    [staticSide]: '-7px'
                });
            }
        }).catch(err => console.warn('[PickerBase] computePosition failed:', err));
    };

    return autoUpdate(anchorEl, floatingEl, update);
}

function _closeAllPickers() {
    _stack.slice().forEach(closeOne);
}

function _closeDropdownsOnly() {
    if (_openDropdown) _closeDropdownOnly();
    if (_openAppMenu) _closeAppMenuOnly();
}

function open(anchorEl, opts) {
    if (!anchorEl || !opts) return null;
    if (window.Tooltip?.hideAll) window.Tooltip.hideAll();

    // ¿El anchor vive dentro de un picker apilado?
    const anchorIsNode = anchorEl instanceof Node;
    const parentPicker = anchorIsNode
        ? _stack.find(e => e.el.contains(anchorEl))
        : null;

    if (!parentPicker) {
        // Abriendo desde fuera del stack: cierra TODO lo demás
        _closeDropdownsOnly();
        _closeAllPickers();
    }
    // else: apilamiento — no cerramos nada

    // Cierra duplicados del mismo tipo (p.ej. dos color pickers)
    if (opts.className) {
        _stack.filter(e => e.el.classList.contains(opts.className)).forEach(closeOne);
    }

    const el = document.createElement('div');
    el.className = 'picker-popup' + (opts.className ? ' ' + opts.className : '');
    if (opts.minWidth) el.style.minWidth = opts.minWidth + 'px';
    el.innerHTML = opts.content || '';
    document.body.appendChild(el);

    if (typeof applyTranslations === 'function') applyTranslations(el);

    // Arrow condicional: solo se crea si el caller lo pide explícitamente
    let arrowEl = null;
    if (opts.arrow === true) {
        arrowEl = el.querySelector(':scope > .floating-arrow');
        if (!arrowEl) {
            arrowEl = document.createElement('div');
            arrowEl.className = 'floating-arrow';
            el.appendChild(arrowEl);
        }
    }

    const entry = {
        el,
        anchor: anchorEl,
        ignoreCloseFrom: opts.ignoreCloseFrom || [],
        onClose: opts.onClose || null,
        outsideHandler: null,
        cleanupAutoUpdate: null
    };

    const closeFn = () => closeOne(entry);
    if (opts.onMount) opts.onMount(el, closeFn);

    entry.cleanupAutoUpdate = position(anchorEl, el, {
        placement: opts.placement,
        offset: opts.offset,
        fallbackPlacements: opts.fallbackPlacements,
        arrowEl
    });

    _stack.push(entry);

    if (opts.closeOnOutsideClick !== false) {
        setTimeout(() => {
            const handler = (e) => {
                if (!_stack.includes(entry)) return;
                if (entry.el.contains(e.target)) return;
                if (entry.anchor && entry.anchor.contains && entry.anchor.contains(e.target)) return;

                // No cerrar si el click está en un picker APILADO ENCIMA
                const idx = _stack.indexOf(entry);
                for (let i = idx + 1; i < _stack.length; i++) {
                    if (_stack[i].el.contains(e.target)) return;
                }

                for (const sel of entry.ignoreCloseFrom) {
                    if (e.target.closest && e.target.closest(sel)) return;
                }
                closeFrom(entry, 'outside');
            };
            entry.outsideHandler = handler;
            document.addEventListener('mousedown', handler);
        }, 0);
    }

    requestAnimationFrame(() => el.classList.add('visible'));
    return { el, close: closeFn };
}

function closeOne(entry, reason = 'programmatic') {
    const idx = _stack.indexOf(entry);
    if (idx === -1) return;
    _stack.splice(idx, 1);
    if (entry.outsideHandler) document.removeEventListener('mousedown', entry.outsideHandler);
    if (entry.cleanupAutoUpdate) entry.cleanupAutoUpdate();
    entry.el.classList.remove('visible');
    setTimeout(() => entry.el.remove(), 200);

    // Notifica al consumidor (opcional). El motivo puede ser:
    // 'escape' | 'outside' | 'programmatic'
    if (typeof entry.onClose === 'function') {
        try { entry.onClose(reason); } catch (_) {}
    }
}

function closeFrom(entry, reason = 'programmatic') {
    const idx = _stack.indexOf(entry);
    if (idx === -1) return;
    _stack.slice(idx).forEach(e => closeOne(e, reason));
}

function close() { 
    _closeAllPickers(); 
}

function getDropdown() { 
    return _openDropdown; 
}

function setDropdown(entry) {
    if (window.Tooltip?.hideAll) {
        window.Tooltip.hideAll();
    }
    _closeAllPickers();
    _closeDropdownsOnly();

    _openDropdown = entry;
}

function _closeDropdownOnly() {
    if (!_openDropdown) return;
    const { menu, anchor, cleanup } = _openDropdown;
    menu.classList.remove('show', 'arrow-top', 'arrow-bottom', 'arrow-left', 'arrow-right');
    if (anchor) anchor.classList.remove('active');
    if (cleanup) cleanup();
    _openDropdown = null;
}

function closeDropdown() { 
    _closeDropdownOnly(); 
}

function getAppMenu() { 
    return _openAppMenu; 
}

function setAppMenu(entry) {
    if (window.Tooltip.hideAll) window.Tooltip.hideAll();
    _closeAllPickers();
    _closeDropdownsOnly();
    _openAppMenu = entry;
}

function _closeAppMenuOnly() {
    if (!_openAppMenu) return;
    const { menu, anchor, cleanup } = _openAppMenu;
    menu.classList.remove('show', 'arrow-top', 'arrow-bottom', 'arrow-left', 'arrow-right');
    if (anchor) anchor.classList.remove('active');
    if (cleanup) cleanup();
    _openAppMenu = null;
}

function closeAppMenu() { 
    _closeAppMenuOnly(); 
}

function closeDropdowns() {
    _closeDropdownOnly();
    _closeAppMenuOnly();
}

function hasOpen() {
    return _stack.length > 0;
}

document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (_stack.length === 0) return;
    e.stopPropagation();
    e.preventDefault();
    const top = _stack[_stack.length - 1];
    closeFrom(top, 'escape');
}, true);

window.PickerBase = {
    open, 
    close,
    position,
    getDropdown,
    setDropdown,
    closeDropdown,
    getAppMenu,
    setAppMenu,
    closeAppMenu,
    closeDropdowns,
    hasOpen
};
