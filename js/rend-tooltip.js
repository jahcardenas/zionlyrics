import { computePosition, autoUpdate, offset, shift, flip, arrow } from '@floating-ui/dom';

let tippyTooltips = [];

class FloatingTooltipInstance {
    constructor(reference, options = {}) {
        this.reference = reference;
        this.options = options;
        this.enabled = true;
        this.visible = false;
        this.cleanup = null;
        this.tooltipElement = null;
        this.arrowElement = null;

        this._create();
        this._bindEvents();
    }

    _create() {
        // Crear el contenedor principal del tooltip
        this.tooltipElement = document.createElement('div');
        this.tooltipElement.className = 'zion-floating-tooltip';

        const theme = this.options.theme || 'zionlyrics';
        this.tooltipElement.classList.add(theme);

        let content = '';
        if (typeof this.options.content === 'function') {
            content = this.options.content(this.reference);
        } else {
            content = this.options.content || this.reference.getAttribute('data-tooltip') || '';
        }

        this.tooltipElement.textContent = content;

        // Crear y añadir la flecha interna
        this.arrowElement = document.createElement('div');
        this.arrowElement.className = 'zion-tooltip-arrow';
        this.tooltipElement.appendChild(this.arrowElement);

        Object.assign(this.tooltipElement.style, {
            position: 'fixed',
            display: 'none',
            left: '0px',
            top: '0px'
        });

        document.body.appendChild(this.tooltipElement);
    }

    _bindEvents() {
        if (this.options.trigger === 'manual') return;

        const delay = this.options.delay || 200;   // ms antes de mostrar

        this._showHandler = () => {
            if (!this.enabled) return;
            clearTimeout(this._showTimer);
            clearTimeout(this._hideTimer);
            this._showTimer = setTimeout(() => {
                if (this.enabled) this.show();
            }, delay);
        };

        this._hideHandler = () => {
            clearTimeout(this._showTimer);
            clearTimeout(this._hideTimer);
            this._hideTimer = setTimeout(() => this.hide(), 100);
        };

        this.reference.addEventListener('mouseenter', this._showHandler);
        this.reference.addEventListener('mouseleave', this._hideHandler);
        this.reference.addEventListener('focus',      this._showHandler);
        this.reference.addEventListener('blur',       this._hideHandler);
    }

	show() {
	    if (!this.enabled) return;
	    clearTimeout(this._hideTimeout);
	    this.visible = true;

	    const el = this.tooltipElement;
	    el.dataset.animation = this.options.animation || 'shift-away';
	    el.style.display = 'block';
	    delete el.dataset.state; // vuelve al estado "hidden" antes de posicionar

	    const placement = this.options.placement || 'bottom';
	    let firstRun = true;

	    this.cleanup = autoUpdate(this.reference, el, () => {
	        computePosition(this.reference, el, {
	            placement: placement,
	            middleware: [
	                offset(10),
	                flip(),
	                shift({ padding: 5 }),
	                arrow({ element: this.arrowElement })
	            ]
	        }).then(({ x, y, placement: finalPlacement, middlewareData }) => {
	            Object.assign(el.style, {
	                left: `${x}px`,
	                top: `${y}px`,
	            });

	            // Necesario para que el CSS de shift-away sepa desde qué lado animar
	            el.dataset.placement = finalPlacement;

	            if (middlewareData.arrow) {
	                const { x: arrowX, y: arrowY } = middlewareData.arrow;
	                const staticSide = {
	                    top: 'bottom',
	                    right: 'left',
	                    bottom: 'top',
	                    left: 'right',
	                }[finalPlacement.split('-')[0]];

	                Object.assign(this.arrowElement.style, {
	                    left: arrowX != null ? `${arrowX}px` : '',
	                    top: arrowY != null ? `${arrowY}px` : '',
	                    right: '',
	                    bottom: '',
	                    [staticSide]: '-4px',
	                });
	            }

	            // Dispara la transición de entrada solo la primera vez
	            if (firstRun) {
	                firstRun = false;
	                requestAnimationFrame(() => {
	                    requestAnimationFrame(() => {
	                        el.dataset.state = 'visible';
	                    });
	                });
	            }
	        }).catch(err => console.error('Error positioning tooltip:', err));
	    });
	}

    hide(immediate = false) {
        if (!this.visible) return;
        this.visible = false;

        const el = this.tooltipElement;
        el.dataset.state = 'hidden';

        if (this.cleanup) {
            this.cleanup();
            this.cleanup = null;
        }

        clearTimeout(this._hideTimeout);

        if (immediate) {
            el.style.display = 'none';
            return;
        }

        const duration = el.dataset.animation === 'tada' ? 150 : 200;
        this._hideTimeout = setTimeout(() => {
            if (!this.visible) el.style.display = 'none';
        }, duration);
    }

    enable() {
        this.enabled = true;
    }

    disable() {
        this.hide();
        this.enabled = false;
    }

    destroy() {
        clearTimeout(this._showTimer);
        clearTimeout(this._hideTimer);

        this.hide();
        if (this.reference) {
            this.reference.removeEventListener('mouseenter', this._showHandler);
            this.reference.removeEventListener('mouseleave', this._hideHandler);
            this.reference.removeEventListener('focus', this._showHandler);
            this.reference.removeEventListener('blur', this._hideHandler);
            delete this.reference._tippy;
        }
        if (this.tooltipElement && this.tooltipElement.parentNode) {
            this.tooltipElement.parentNode.removeChild(this.tooltipElement);
        }
    }
}

function tippy(targets, options) {
    let elements = [];
    if (typeof targets === 'string') {
        elements = Array.from(document.querySelectorAll(targets));
    } else if (targets instanceof Element) {
        elements = [targets];
    } else if (NodeList.prototype.isPrototypeOf(targets) || Array.isArray(targets)) {
        elements = Array.from(targets);
    }

    const instances = elements.map(el => {
        if (el._tippy) {
            el._tippy.destroy();
        }
        const instance = new FloatingTooltipInstance(el, options);
        el._tippy = instance;
        return instance;
    });

    return elements.length === 1 ? instances[0] : instances;
}

export function initTooltips() {
    if (tippyTooltips.length > 0) {
        _.forEach(tippyTooltips, t => t.destroy());
        tippyTooltips = [];
    }

    const created = tippy('[data-tooltip]', {
        content(reference) {
            return reference.getAttribute('data-tooltip');
        },
        placement: 'bottom',
        theme: 'zionlyrics',
        delay: 250,
    });

    tippyTooltips = Array.isArray(created) ? created : [created];

    const show = typeof zionLyricsObj !== 'undefined' && zionLyricsObj.showTooltips !== false;
    if (!show) {
        _.forEach(tippyTooltips, t => t.disable());
    }
}

export function toggleTooltips(el, ev) {
    const isChecked = el.checked;

    if (typeof zionLyricsObj !== 'undefined') {
        zionLyricsObj.showTooltips = isChecked;
    }

    _.forEach(tippyTooltips, t => {
        if (isChecked) {
            t.enable();
        } else {
            t.hide();
            t.disable();
        }
    });
}

export function hideAllTooltips() {
    _.forEach(tippyTooltips, t => {
        if (t.visible) t.hide();
    });
}

export function showTooltip(targetEl, message, opts = {}) {
    if (typeof targetEl === 'string') {
        targetEl = $(targetEl);
    }
    if (!targetEl || !message) return;

    const theme     = opts.theme     || 'zionlyrics-red';
    const animation = opts.animation || 'tada';
    const placement = opts.placement || 'top';
    const duration  = typeof opts.duration === 'number' ? opts.duration : 4000;

    // Eliminar instancia previa si existe
    if (targetEl._tippy) targetEl._tippy.destroy();

    const tip = tippy(targetEl, {
        content: message,
        theme,
        placement,
        trigger: 'manual',
        animation,
    });

    tip.show();

    setTimeout(() => {
        tip.hide();
        setTimeout(() => {
            tip.destroy();
            initTooltips();
        }, 300);
    }, duration);
}

window.Tooltip = {
    init:    initTooltips,
    toggle:  toggleTooltips,
    show:    showTooltip,
    hideAll: hideAllTooltips
};