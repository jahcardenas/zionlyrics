(function () {
    'use strict';

    const CARET_WIDTH = 2;
    const CARET_COLOR = '#0078D7';
    const BLINK_ANIM  = 'fakeCaretBlink 1s ease-in-out infinite';

    let caret = null;
    let mirror = null;
    let styleEl = null;
    let scheduled = false;
    let enabled = true;

    function createElements() {
        if (caret) return;

        caret = document.createElement('div');
        caret.className = 'fake-caret';
        caret.style.background = CARET_COLOR;
        caret.style.width = CARET_WIDTH + 'px';
        document.body.appendChild(caret);

        mirror = document.createElement('span');
        mirror.className = 'fake-caret-mirror';
        document.body.appendChild(mirror);

        styleEl = document.createElement('style');
        styleEl.textContent = `
            input[type="text"],
            input[type="search"],
            input[type="email"],
            input[type="url"],
            input[type="password"],
            [contenteditable="true"] {
                caret-color: transparent !important;
            }
        `;
        document.head.appendChild(styleEl);
    }

    function hide() {
        if (caret) caret.style.display = 'none';
    }

    function place(x, y, height) {
        caret.style.left = x + 'px';
        caret.style.top = y + 'px';
        caret.style.height = height + 'px';
        caret.style.display = 'block';
        caret.style.animation = 'none';
        void caret.offsetWidth;
        caret.style.animation = BLINK_ANIM;
    }

    function bindScroll(el) {
        if (el._fakeCaretScrollBound) return;
        el._fakeCaretScrollBound = true;
        el.addEventListener('scroll', schedule, { passive: true });
    }

    // Fallback robusto: si document.activeElement no es un elemento de texto
    // (por ejemplo, mousedown disparó antes de que el foco llegara al editor),
    // buscamos el contenteditable que contiene la selección actual.
    function getActiveTextElement() {
        const el = document.activeElement;
        if (el && (el.isContentEditable || el.tagName === 'INPUT')) return el;

        const sel = window.getSelection();
        if (!sel.rangeCount) return null;
        let node = sel.getRangeAt(0).startContainer;
        if (node.nodeType === 3) node = node.parentNode;
        while (node) {
            if (node.isContentEditable) return node;
            node = node.parentNode;
        }
        return null;
    }

    function updateInput(el) {
        if (el.selectionStart !== el.selectionEnd) { hide(); return; }
        bindScroll(el);

        const cs = getComputedStyle(el);
        mirror.style.font = cs.font;
        mirror.style.letterSpacing = cs.letterSpacing;
        mirror.style.whiteSpace = 'pre';
        mirror.textContent = el.value.slice(0, el.selectionStart);

        const r = el.getBoundingClientRect();
        const x = r.left + parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft)
                + mirror.offsetWidth - el.scrollLeft;
        const h = parseFloat(cs.fontSize) * 1.45;
        const y = r.top + (r.height - h) / 2;
        place(x, y, h);
    }

    // Cascada de rects para el rango colapsado:
    //   1. getBoundingClientRect() del rango → caso normal (cursor en medio de texto)
    //   2. getClientRects()[0]                → algunos motores lo dan cuando (1) falla
    //   3. rect del carácter anterior         → cursor al final de un nodo texto
    //   4. rect del bloque padre              → cursor al inicio de un párrafo vacío
    function resolveContentEditableRect(range, editorEl) {
        let rect = range.getBoundingClientRect();
        if (rect.height > 0) return rect;

        const firstClientRect = range.getClientRects?.()[0];
        if (firstClientRect && firstClientRect.height > 0) return firstClientRect;

        if (range.startContainer.nodeType === 3 && range.startOffset > 0) {
            const r2 = document.createRange();
            r2.setStart(range.startContainer, range.startOffset - 1);
            r2.setEnd(range.startContainer, range.startOffset);
            const r2rect = r2.getBoundingClientRect();
            if (r2rect.height > 0) {
                // El carácter anterior da la altura, pero el caret debe ir al borde
                // derecho de ese carácter, no a su inicio.
                return {
                    left:  r2rect.right,
                    top:   r2rect.top,
                    height: r2rect.height
                };
            }
        }

        // Último recurso: subir hasta un ancestro bloque con rect
        let node = range.startContainer;
        if (node.nodeType === 3) node = node.parentNode;
        while (node && node !== editorEl.parentNode) {
            const nr = node.getBoundingClientRect();
            if (nr.height > 0) {
                const cs = getComputedStyle(node);
                return {
                    left:   nr.left + parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth),
                    top:    nr.top,
                    height: nr.height
                };
            }
            node = node.parentNode;
        }
        return null;
    }

    function updateContentEditable(el) {
        const sel = window.getSelection();
        if (!sel.rangeCount) { hide(); return; }
        const range = sel.getRangeAt(0);
        if (!range.collapsed) { hide(); return; }
        if (!el.contains(range.startContainer)) { hide(); return; }
        bindScroll(el);

        const rect = resolveContentEditableRect(range, el);
        if (!rect) { hide(); return; }

        const extra  = rect.height * 0.15;
        const newH   = rect.height + extra;
        const newTop = rect.top - extra / 2;
        place(rect.left, newTop, newH);
    }

    function update() {
        scheduled = false;
        if (!enabled) { hide(); return; }

        const el = getActiveTextElement();
        if (!el) { hide(); return; }

        if (el.isContentEditable) {
            updateContentEditable(el);
            return;
        }

        if (el.tagName === 'INPUT') {
            const t = el.type;
            if (t === 'text' || t === 'search' || t === 'email' || t === 'url' || t === 'password') {
                updateInput(el);
                return;
            }
        }

        hide();
    }

    function schedule() {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(update);
    }

    function bindListeners() {
        // `selectionchange` es la fuente principal (Tiptap/ProseMirror la dispara
        // al cambiar de posición el cursor). Los demás eventos cubren los flujos
        // donde el foco llega antes o después de la selección.
        document.addEventListener('selectionchange', schedule);
        document.addEventListener('input',     schedule, true);
        document.addEventListener('keyup',     schedule, true);
        document.addEventListener('mousedown', schedule, true);
        document.addEventListener('mouseup',   schedule, true);
        document.addEventListener('pointerdown', schedule, true);
        document.addEventListener('pointerup',   schedule, true);
        document.addEventListener('focusin',   schedule, true);
        document.addEventListener('focusout',  () => setTimeout(hide, 0), true);
        window.addEventListener('resize', schedule);
    }

    function enable() {
        enabled = true;
        if (styleEl) styleEl.disabled = false;
        schedule();
    }

    function disable() {
        enabled = false;
        if (styleEl) styleEl.disabled = true;
        hide();
    }

    function init() {
        if (caret) return;
        createElements();
        bindListeners();
    }

    window.FakeCaret = { init, update, schedule, hide, enable, disable };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();