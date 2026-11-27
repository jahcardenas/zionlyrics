/**
 * ============================================================
 * ZionLyrics - Gestor de Modal Popups
 * ============================================================
 * Maneja apertura/cierre de modales con callbacks onOpen/onClose,
 * y anidamiento: si un modal abre otro (hijo), el padre se OCULTA
 * (no se cierra, no dispara su onClose) mientras el hijo está
 * visible, y se vuelve a MOSTRAR automáticamente (sin re-disparar
 * su onOpen) cuando el hijo se cierra.
 *
 * Uso típico desde HTML (patrón consistente con rend-icons.js /
 * rend-tooltip.js, expuesto también en window):
 *
 *   <button onclick="openModal(this, event, 'modal-confirmar', {
 *       onOpen: (el, ev, modalEl) => console.log('se abrió'),
 *       onClose: (el, ev, modalEl) => console.log('se cerró')
 *   })">Abrir</button>
 *
 *   <div id="modal-confirmar" class="zion-modal">
 *       <div class="zion-modal-content">
 *           ...
 *           <button onclick="closeModal(this, event, 'modal-confirmar')">Cerrar</button>
 *           <!-- Este botón abre un modal HIJO: el padre se oculta solo -->
 *           <button onclick="openModal(this, event, 'modal-hijo', {...})">Siguiente</button>
 *       </div>
 *   </div>
 *
 * idHtml puede apuntar a:
 *   a) Un elemento normal ya presente en el DOM (se reutiliza, toggle de clase/aria).
 *   b) Un <template id="..."> (se clona su contenido cada vez que se abre,
 *      y se elimina del DOM al cerrarse; útil para modales dinámicos/repetibles).
 * ============================================================
 */

class ModalManager {
    constructor() {
        this.stack = [];
        this._cloneCounter = 0;
    }

    open(elemento, evento, idHtml, options = {}) {
        if (evento?.preventDefault) evento.preventDefault();

        if (window.PickerBase) {
            window.PickerBase.close?.();
            window.PickerBase.closeDropdowns?.();
        }

        const source = $(idHtml);
        if (!source) {
            console.error(`[ModalManager] Id "${idHtml}" not found.`);
            return null;
        }

        const isTemplate = source.tagName === 'TEMPLATE';

        // Modales estáticos: no permitir abrir dos veces el mismo
        if (!isTemplate && this.stack.some(m => m.modalEl === source)) {
            console.warn(`[ModalManager] "${idHtml}" is already open.`);
            return this.getTop()?.modalEl || null;
        }

        const modalEl = isTemplate ? this._instantiateFromTemplate(source) : source;

        const {
            onOpen = null,
            onClose = null,
            closeOnOverlayClick = true,
            closeOnEsc = true,
        } = options;

        // onOpen antes de mostrar — puede abortar devolviendo false
        if (typeof onOpen === 'function') {
            const result = onOpen(elemento, evento, modalEl);
            if (result === false) {
                if (isTemplate) modalEl.remove();   // limpiar el clon si aborta
                return null;
            }
        }

        const parent = this.getTop();
        if (parent) this._setVisibility(parent.modalEl, false);

        const entry = {
            id: idHtml,
            modalEl,
            elemento,
            evento,
            onClose,
            closeOnOverlayClick,
            closeOnEsc,
            _escHandler: null,
            _overlayHandler: null,
        };

        this.stack.push(entry);
        this._setVisibility(modalEl, true);
        this._bindDismissHandlers(entry);
        return modalEl;
    }

    close(elemento = null, evento = null, idHtml = null) {
        if (evento?.preventDefault) evento.preventDefault();
        if (this.stack.length === 0) return;

        const targetIndex = idHtml
            ? this.stack.findIndex(m => m.id === idHtml)
            : this.stack.length - 1;

        if (targetIndex === -1) {
            console.warn(`[ModalManager] "${idHtml}" is not open.`);
            return;
        }

        while (this.stack.length - 1 > targetIndex) {
            this._closeTop(elemento, evento);
        }
        this._closeTop(elemento, evento);
    }

    closeAll(elemento = null, evento = null) {
        while (this.stack.length > 0) this._closeTop(elemento, evento);
    }

    getTop()  { 
        return this.stack[this.stack.length - 1] || null; 
    }

    isOpen(id) { 
        return this.stack.some(m => m.id === id); 
    }

    _instantiateFromTemplate(tpl) {
        const frag = tpl.content.cloneNode(true);
        const cloned = frag.firstElementChild;
        cloned.dataset.zionModalCloned = 'true';
        cloned.id = `${tpl.id}-${++this._cloneCounter}`;
        document.body.appendChild(cloned);
        return cloned;
    }

    _closeTop(elemento, evento) {
        const entry = this.stack.pop();
        if (!entry) return;

        this._unbindDismissHandlers(entry);

        if (window.Tooltip?.hideAll) {
            window.Tooltip.hideAll();
        }
        // Red de seguridad: si algún picker quedó abierto (por ejemplo porque
        // el modal se cerró programáticamente sin pasar por Escape), ciérralo
        // antes de destruir el modal. Sin esto, el picker queda huérfano en el DOM.
        if (window.PickerBase?.close) {
            window.PickerBase.close();
        }

        // Limpieza genérica
        /*entry.modalEl.querySelectorAll('.list-item.active, .media-grid-item.active')
            .forEach(r => r.classList.remove('active'));*/

        this._setVisibility(entry.modalEl, false);

        if (typeof entry.onClose === 'function') {
            entry.onClose(elemento ?? entry.elemento, evento ?? entry.evento, entry.modalEl);
        }

        if (entry.modalEl.dataset.zionModalCloned === 'true') {
            entry.modalEl.remove();
        }

        const parent = this.getTop();
        if (parent) this._setVisibility(parent.modalEl, true);
    }

    _setVisibility(modalEl, visible) {
        modalEl.classList.toggle('active', visible);
    }

    _bindDismissHandlers(entry) {
        if (entry.closeOnEsc) {
            entry._escHandler = (ev) => {
                if (ev.key !== 'Escape') return;
                if (this.getTop() !== entry) return;

                // Si hay pickers abiertos, no cerrar el modal. El picker ya se habrá
                // cerrado con su propio handler en fase de captura; este solo deja
                // pasar el evento sin acción.
                if (window.PickerBase?.hasOpen?.()) return;

                this.close(entry.elemento, ev, entry.id);
            };
            document.addEventListener('keydown', entry._escHandler);
        }
        if (entry.closeOnOverlayClick) {
            // Guardamos en qué elemento empezó el mousedown. Solo cerramos si
            // tanto el mousedown como el click terminaron sobre el overlay.
            // Sin esto, arrastrar texto desde el editor y soltar el mouse fuera
            // del modal genera un click sintético en el overlay y lo cierra.
            entry._overlayMouseDownTarget = null;

            entry._overlayDownHandler = (ev) => {
                entry._overlayMouseDownTarget = ev.target;
            };

            entry._overlayHandler = (ev) => {
                if (ev.target === entry.modalEl && entry._overlayMouseDownTarget === entry.modalEl) {
                    this.close(entry.elemento, ev, entry.id);
                }
                entry._overlayMouseDownTarget = null;
            };

            entry.modalEl.addEventListener('mousedown', entry._overlayDownHandler);
            entry.modalEl.addEventListener('click', entry._overlayHandler);
        }
    }

    _unbindDismissHandlers(entry) {
        if (entry._escHandler) document.removeEventListener('keydown', entry._escHandler);
        if (entry._overlayHandler) entry.modalEl.removeEventListener('click', entry._overlayHandler);
        if (entry._overlayDownHandler) entry.modalEl.removeEventListener('mousedown', entry._overlayDownHandler);
    }
}

const modalManager = new ModalManager();

window.ModalManager = {
    open:     (el, ev, id, opts) => modalManager.open(el, ev, id, opts),
    close:    (el, ev, id)       => modalManager.close(el, ev, id),
    closeAll: (el, ev)           => modalManager.closeAll(el, ev),
    isOpen:   (id)               => modalManager.isOpen(id),
    getTop:   ()                 => modalManager.getTop(),
};