// Submenús anidados para dropdowns (.dd-item.has-submenu).
// - Abre con mouseenter, cierra con delay de 180ms.
// - Si el padre (.dropdown-menu) se oculta, limpia submenús abiertos.
(function () {
    'use strict';

    let _closeTimer = null;

    function openSubmenu(itemEl) {
        if (_closeTimer) { clearTimeout(_closeTimer); _closeTimer = null; }

        // Cerrar otros submenús abiertos
        document.querySelectorAll('.dd-item.has-submenu.open').forEach(other => {
            if (other === itemEl) return;
            other.classList.remove('open');
            const s = other.querySelector('.dropdown-menu.submenu');
            if (s) s.classList.remove('show');
        });

        itemEl.classList.add('open');
        const sub = itemEl.querySelector('.dropdown-menu.submenu');
        if (!sub) return;
        sub.classList.add('show');

        // Flip a izquierda si se sale del viewport por la derecha
        sub.classList.remove('flip-left');
        const r = sub.getBoundingClientRect();
        if (r.right > window.innerWidth - 8) sub.classList.add('flip-left');
    }

    function scheduleClose(itemEl) {
        if (_closeTimer) clearTimeout(_closeTimer);
        _closeTimer = setTimeout(() => {
            itemEl.classList.remove('open');
            const sub = itemEl.querySelector('.dropdown-menu.submenu');
            if (sub) sub.classList.remove('show');
            _closeTimer = null;
        }, 180);
    }

    function initSubmenus() {
        document.querySelectorAll('.dd-item.has-submenu').forEach(item => {
            const sub = item.querySelector('.dropdown-menu.submenu');
            if (!sub) return;

            item.addEventListener('mouseenter', () => openSubmenu(item));
            item.addEventListener('mouseleave', (e) => {
                if (e.relatedTarget && sub.contains(e.relatedTarget)) return;
                scheduleClose(item);
            });

            sub.addEventListener('mouseenter', () => {
                if (_closeTimer) { clearTimeout(_closeTimer); _closeTimer = null; }
            });
            sub.addEventListener('mouseleave', (e) => {
                if (e.relatedTarget && item.contains(e.relatedTarget)) return;
                scheduleClose(item);
            });
        });

        // Cerrar submenús cuando el dropdown padre se oculta
        const observer = new MutationObserver((muts) => {
            muts.forEach(m => {
                if (m.type !== 'attributes' || m.attributeName !== 'class') return;
                const menu = m.target;
                if (!menu.classList.contains('dropdown-menu')) return;
                if (menu.classList.contains('submenu')) return;
                if (!menu.classList.contains('show')) {
                    menu.querySelectorAll('.dd-item.has-submenu.open').forEach(item => {
                        item.classList.remove('open');
                        const sub = item.querySelector('.dropdown-menu.submenu');
                        if (sub) sub.classList.remove('show');
                    });
                }
            });
        });

        document.querySelectorAll('.dropdown-menu:not(.submenu)').forEach(m => {
            observer.observe(m, { attributes: true, attributeFilter: ['class'] });
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSubmenus);
    } else {
        initSubmenus();
    }
})();