/**
 * anim.js — Wrappers de anime.js para ZionLyrics
 *
 * Política: solo se usa anime.js para coreografía, stagger y layout-shift.
 * Los hovers, transiciones de color y animaciones infinitas decorativas
 * siguen en CSS (ver HANDOFF sección 4).
 *
 * Todos los helpers respetan prefers-reduced-motion: si está activo,
 * las animaciones duran 0ms y el layout se aplica sin transición.
 */

import { animate, stagger } from 'animejs';
import Sortable from 'sortablejs';

// Sortable.mount(new MultiDrag());

const _reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ==========================================================
// CARDS
// ==========================================================

/**
 * Entrada de una card: fade + slide-up + scale desde el punto final,
 * con colapso de altura para que las siguientes cards hagan espacio.
 *
 * El elemento se inserta normalmente en el DOM, se mide su altura
 * natural, se colapsa a 0, y se anima de vuelta. Así el layout queda
 * estable al terminar.
 */
function cardEnter(el, opts = {}) {
    if (!el) return;
    if (_reduceMotion) return;

    const duration = opts.duration ?? 300;

    // Medir altura natural antes de colapsar
    const naturalHeight = el.offsetHeight;
    if (naturalHeight === 0) return;   // aún no layout, no animar

    // Colapsar el estado inicial
    el.style.overflow = 'hidden';
    el.style.height = '0px';
    el.style.opacity = '0';
    el.style.transform = 'translateY(8px) scale(0.96)';

    animate(el, {
        height: naturalHeight + 'px',
        opacity: 1,
        translateY: 0,
        scale: 1,
        duration,
        ease: 'outQuad',
        onComplete: () => {
            // Restaurar el estado natural (sin inline styles)
            el.style.height = '';
            el.style.overflow = '';
            el.style.opacity = '';
            el.style.transform = '';
        }
    });
}

/**
 * Salida de una card: fade + scale + colapso de altura/padding/margen.
 * Los elementos siguientes suben suavemente mientras esta se desvanece.
 * Al terminar, se quita del DOM y se llama a onDone (o se remueve solo).
 */
function cardLeave(el, onDone) {
    if (!el) return;

    const finish = () => {
        if (typeof onDone === 'function') onDone(el);
        else el.remove();
    };

    if (_reduceMotion) {
        finish();
        return;
    }

    const style = getComputedStyle(el);

    el.style.overflow = 'hidden';

    animate(el, {
        height: '0px',
        paddingTop: '0px',
        paddingBottom: '0px',
        marginBottom: '0px',
        opacity: 0,
        scale: 0.96,
        duration: 250,
        ease: 'inQuad',
        onComplete: finish
    });
}

// ==========================================================
// CHIPS
// ==========================================================

/**
 * Entrada de un chip con overshoot leve (pop-in). Escala de 0 a 1
 * pasando por 1.08, sin alterar el layout de los chips vecinos.
 */
function chipEnter(el) {
    if (!el) return;
    if (_reduceMotion) return;

    animate(el, {
        scale: [
            { to: 0,   duration: 0    },
            { to: 1.08, duration: 130, ease: 'outQuad' },
            { to: 1,    duration: 90,  ease: 'inOutQuad' }
        ],
        opacity: [
            { to: 0, duration: 0 },
            { to: 1, duration: 130 }
        ]
    });
}

/**
 * Salida de un chip: fade + scale hacia abajo, luego remover del DOM.
 */
function chipLeave(el, onDone) {
    if (!el) return;

    const finish = () => {
        if (typeof onDone === 'function') onDone(el);
        else el.remove();
    };

    if (_reduceMotion) {
        finish();
        return;
    }

    animate(el, {
        scale: 0.85,
        opacity: 0,
        duration: 150,
        ease: 'inQuad',
        onComplete: finish
    });
}

/**
 * Anima la entrada de un conjunto de celdas con stagger.
 * Pensado para grids (capítulos, versículos) y cards de lista.
 *
 * opts.style: 'scale' (default) | 'fade' | 'slide-up'
 * opts.stagger: ms entre cada celda (default 12)
 * opts.duration: ms por celda (default 220)
 * opts.maxDelay: techo del delay acumulado (default 400).
 *   Sin esto, un grid de 176 versículos tardaría 2s en aparecer entero.
 */
function cellsEnter(cells, opts = {}) {
    if (!cells || cells.length === 0) return;
    if (_reduceMotion) return;

    const staggerMs = opts.stagger ?? 12;
    const duration  = opts.duration ?? 220;
    const maxDelay  = opts.maxDelay ?? 400;
    const style     = opts.style ?? 'scale';

    cells.forEach((cell, i) => {
        const from = style === 'fade'     ? { opacity: 0 }
                   : style === 'slide-up' ? { opacity: 0, translateY: 8 }
                   :                        { opacity: 0, scale: 0.85 };

        cell.style.opacity = '0';

        animate(cell, {
            ...from,
            opacity: 1,
            scale: style === 'scale' ? 1 : undefined,
            translateY: style === 'slide-up' ? 0 : undefined,
            duration,
            delay: Math.min(i * staggerMs, maxDelay),
            ease: 'outQuad',
            onComplete: () => { cell.style.opacity = ''; }
        });
    });
}

/**
 * Entrada tipo "staggered layout": las celdas aparecen en cascada
 * siguiendo su posición en el grid (serpentina en diagonal desde
 * el centro o una esquina), no solo en orden de aparición.
 *
 * Pensado para grids de capítulos y versículos.
 *
 * opts.stagger:   ms entre celda y celda (default 25)
 * opts.duration:  ms por celda (default 380)
 * opts.from:      'first' | 'center' | 'last' (default 'center')
 *                 desde dónde arranca la cascada
 * opts.cols:      override del número de columnas (si no se calcula)
 */
function cellsLayoutEnter(cells, opts = {}) {
    if (!cells || cells.length === 0) return;
    if (_reduceMotion) return;

    const duration = opts.duration ?? 380;
    const staggerMs = opts.stagger ?? 25;
    const from = opts.from ?? 'center';

    // Detectar el número de columnas del grid. Sin esto, stagger.grid()
    // no sabe cómo repartir la serpentina en 2D.
    const parent = cells[0].parentElement;
    let cols = opts.cols;
    if (!cols && parent) {
        const gridCols = getComputedStyle(parent).gridTemplateColumns;
        if (gridCols && gridCols !== 'none') {
            cols = gridCols.split(' ').filter(Boolean).length;
        }
    }
    if (!cols || cols < 1) cols = 1;

    const rows = Math.ceil(cells.length / cols);

    animate(cells, {
        opacity: [0, 1],
        scale: [
            { to: 0.55, duration: duration * 0.45, ease: 'outSine' },
            { to: 1,    duration: duration * 0.55, ease: 'outBack' }
        ],
        translateY: [10, 0],
        delay: stagger(staggerMs, { grid: [rows, cols], from }),
        duration,
        ease: 'outQuad'
    });
}

/**
 * Sistema de tracking de "ids renderizados en el render anterior".
 * Reutilizable por cualquier lista que quiera animar solo las novedades.
 *
 * Uso:
 *   const tracker = makeListTracker();
 *   const newIds = tracker.diff(currentIds, ownerId);
 *   // ... render ...
 *   tracker.commit(currentIds, ownerId);
 *
 * Si ownerId cambia respecto al último commit, el tracker se resetea
 * automáticamente (útil cuando cambias de "dueño", ej. cambiar de canto).
 */
function makeListTracker() {
    return {
        lastIds: new Set(),
        lastOwnerId: null,

        diff(currentIds, ownerId = null) {
            if (ownerId !== null && ownerId !== this.lastOwnerId) {
                this.lastIds = new Set();
                this.lastOwnerId = ownerId;
            }
            return new Set([...currentIds].filter(id => !this.lastIds.has(id)));
        },

        commit(currentIds, ownerId = null) {
            this.lastIds = new Set(currentIds);
            if (ownerId !== null) this.lastOwnerId = ownerId;
        },

        forget(id) {
            this.lastIds.delete(id);
        },

        reset() {
            this.lastIds = new Set();
            this.lastOwnerId = null;
        }
    };
}

/**
 * Anima la altura de un elemento de un valor a otro.
 * Restaura el estilo al terminar para que el layout siga siendo natural.
 */
function animateHeight(el, fromH, toH, duration = 260) {
    if (!el) return;
    if (_reduceMotion) return;

    el.style.overflow = 'hidden';
    el.style.height = fromH + 'px';
    void el.offsetHeight;

    animate(el, {
        height: toH + 'px',
        duration,
        ease: 'outQuad',
        onComplete: () => {
            el.style.height = '';
            el.style.overflow = '';
        }
    });
}

/**
 * Helper genérico de SortableJS.
 *
 * @param {string}   listSelector - selector del contenedor (#list-xxx)
 * @param {string}   itemSelector - selector de cada item (.media-card)
 * @param {string}   ghostClass   - clase para el placeholder (default: itemSelector-ghost)
 * @param {string}   dragClass    - clase para el drag (default: itemSelector-drag)
 * @param {Function} onReorder    - recibe array de ids en el nuevo orden
 * @returns {Object|null} la instancia de Sortable, o null si algo falta.
 */
function makeSortable(listSelector, itemSelector, opts = {}) {
    const list = $$(listSelector);
    if (!list) return null;
    if (!Sortable) {
        console.warn('makeSortable: SortableJS no disponible');
        return null;
    }

    // Si ya hay una instancia para el mismo contenedor + mismo itemSelector,
    // REUSARLA. SortableJS detecta los hijos actuales en cada dragstart,
    // así que no necesita ser destruida cuando el contenido cambia.
    if (list._sortableInstance && list._sortableItemSelector === itemSelector) {
        // Actualizar solo el callback onReorder por si cambió (referencias a state)
        list._sortableOptions = opts;
        return list._sortableInstance;
    }

    // Si existe pero para otro selector, sí hay que destruir.
    if (list._sortableInstance) {
        try { list._sortableInstance.destroy(); } catch (_) {}
        list._sortableInstance = null;
    }

    const itemClass  = itemSelector.replace(/^\./, '');
    const ghostClass = opts.ghostClass || `${itemClass}-ghost`;
    const dragClass  = opts.dragClass  || `${itemClass}-drag`;
    const filter     = opts.filter || '.code-btn, .media-card-play, .canto-card-play, .canto-card-actions, .media-card-actions, .bible-card-actions';

    list._sortableItemSelector = itemSelector;
    list._sortableOptions = opts;

    const instance = Sortable.create(list, {
        animation: 160,
        handle: itemSelector,
        ghostClass,
        dragClass,
        filter,
        preventOnFilter: false,
        multiDrag:       opts.multiDrag === true,
        selectedClass:   opts.selectedClass || 'active',
        // Los clicks fuera NO deseleccionan: el Set de la app es la fuente de verdad.
        avoidImplicitDeselect: true,
        // MultiDrag arrastra SOLO lo que tiene en su lista interna (multiDragElements),
        // no lo que tenga la clase .active. Al tomar una card, volcamos el Set de la
        // app a esa lista interna (y purgamos nodos obsoletos de renders anteriores).
        onChoose: () => {
            const currentOpts = list._sortableOptions || {};
            if (!opts.multiDrag || typeof currentOpts.getSelectedIds !== 'function') return;
            // Foto del orden y de los nodos ANTES del drag (red de seguridad en onEnd)
            list._preDragEls = [...list.children];
            mirrorSelectionToSortable(list, instance, currentOpts.getSelectedIds());
        },
        onEnd: (evt) => {
            const currentOpts = list._sortableOptions || {};
            regroupSelection(list, evt && evt.item, currentOpts);
            const order = [...list.querySelectorAll(itemSelector)]
                .map(el => el.dataset.id)
                .filter(Boolean);
            if (typeof currentOpts.onReorder === 'function') currentOpts.onReorder(order);
        }
    });

    list._sortableInstance = instance;
    return instance;
}
/**
 * Vuelca un Set de ids (strings) a la lista interna de MultiDrag.
 * 1) _deselectMultiDrag() sin evento vacía TODA la lista interna
 *    (incluye nodos desconectados por re-renders previos).
 * 2) select() de los que están en el Set.
 * select() puede limpiar la selección interna de otra columna (la lista
 * de MultiDrag es global), por eso se re-sincroniza el .active visual.
 */
function mirrorSelectionToSortable(list, instance, idSet) {
    if (!Sortable.utils || !Sortable.utils.select || !instance?.multiDrag) return;
    try { instance.multiDrag._deselectMultiDrag(); } catch (_) {}
    const ids = new Set([...idSet].map(String));
    list.querySelectorAll(':scope > *').forEach(el => {
        if (ids.has(String(el.dataset.id))) Sortable.utils.select(el);
    });
    if (typeof syncChorusSelection === 'function') syncChorusSelection();
    if (typeof syncBibleSelection  === 'function') syncBibleSelection();
    if (typeof syncMediaSelection  === 'function') syncMediaSelection();
}

/**
 * Red de seguridad: tras soltar, garantiza que TODAS las cards del Set
 * queden juntas en el punto donde se soltó la card arrastrada, en su
 * orden relativo original. Si MultiDrag ya las movió, es idempotente.
 * Usa los nodos capturados en onChoose, así que también recupera cards
 * que MultiDrag haya dejado fuera del DOM.
 */
function regroupSelection(list, dragged, opts) {
    try {
        if (!dragged || typeof opts.getSelectedIds !== 'function') return;
        const ids = new Set([...opts.getSelectedIds()].map(String));
        const pre = list._preDragEls;
        list._preDragEls = null;
        if (ids.size < 2 || !pre || !ids.has(String(dragged.dataset.id))) return;

        const block = pre.filter(el => ids.has(String(el.dataset.id)));
        if (block.length < 2) return;

        // Primer hermano NO seleccionado después de la card soltada
        let ref = dragged.nextSibling;
        while (ref && (ref.nodeType !== 1 || block.includes(ref))) ref = ref.nextSibling;

        block.forEach(el => list.insertBefore(el, ref));

        // Quitar duplicados residuales (clones fantasma con el mismo data-id)
        const seen = new Set();
        [...list.children].forEach(el => {
            const k = String(el.dataset.id);
            if (seen.has(k) && !pre.includes(el)) el.remove(); else seen.add(k);
        });
    } catch (e) {
        console.warn('regroupSelection falló:', e);
    }
}

function destroySortable(listSelector) {
    const list = $$(listSelector);
    if (!list || !list._sortableInstance) return;
    try { list._sortableInstance.destroy(); } catch (_) {}
    list._sortableInstance = null;
}

window.Anim = {
    cardEnter,
    cardLeave,
    chipEnter,
    chipLeave,
    cellsEnter,
    cellsLayoutEnter,
    animateHeight,
    makeListTracker,
    destroySortable,
    makeSortable,
    Sortable,
    reducedMotion: _reduceMotion
};