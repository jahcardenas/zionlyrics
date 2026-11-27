(function () {
    'use strict';

    const POSITIONS = [
        'top-left',    
        'top-center',    
        'top-right',
        'middle-left', 
        'middle-center', 
        'middle-right',
        'bottom-left', 
        'bottom-center', 
        'bottom-right'
    ];

    const LABELS = {
        'top-left':      setLang('str220'),
        'top-center':    setLang('str221'),
        'top-right':     setLang('str222'),
        'middle-left':   setLang('str223'),
        'middle-center': setLang('str224'),
        'middle-right':  setLang('str225'),
        'bottom-left':   setLang('str226'),
        'bottom-center': setLang('str227'),
        'bottom-right':  setLang('str228')
    };

    function getLabels() {
        return {
            'top-left':      setLang('str220'),
            'top-center':    setLang('str221'),
            'top-right':     setLang('str222'),
            'middle-left':   setLang('str223'),
            'middle-center': setLang('str224'),
            'middle-right':  setLang('str225'),
            'bottom-left':   setLang('str226'),
            'bottom-center': setLang('str227'),
            'bottom-right':  setLang('str228')
        };
    }

    function buildContent(current) {
        return `
            <div class="pos-picker-title" data-i18n="str115">Posición en pantalla</div>
            <div class="pos-picker-grid">
                ${POSITIONS.map(p => `
                    <button type="button" class="pos-cell ${p === current ? 'selected' : ''}"
                            data-pos="${p}" title="${getLabels()[p]}">
                        <span class="pos-dot pos-${p}"></span>
                    </button>
                `).join('')}
            </div>
            <div class="pos-picker-actions modal-footer-right">
                <div class="code-btn code-btn-primary pos-save" data-i18n="str57">Guardar</div>
                <div class="code-btn code-btn-cancel pos-cancel" data-i18n="str38">Cerrar</div>
            </div>
        `;
    }

    function normalizeToCell(val) {
        if (!val) return 'middle-center';
        if (typeof val === 'string') {
            try { val = JSON.parse(val); } catch { return val; }
        }
        if (typeof val !== 'object' || val === null) return 'middle-center';
        const x = val.x ?? 50, y = val.y ?? 50;
        const col = x < 33 ? 'left' : x > 66 ? 'right' : 'center';
        const row = y < 33 ? 'top'  : y > 66 ? 'bottom' : 'middle';
        return `${row}-${col}`;
    }

    function cellToXY(cell) {
        if (!cell || typeof cell !== 'string' || !cell.includes('-')) {
            return { x: 50, y: 50, anchor: 'middle-center' };
        }
        const [row, col] = cell.split('-');
        if (!['top','middle','bottom'].includes(row) || !['left','center','right'].includes(col)) {
            return { x: 50, y: 50, anchor: 'middle-center' };
        }
        const x = col === 'left' ? 0 : col === 'right' ? 100 : 50;
        const y = row === 'top'  ? 0 : row === 'bottom' ? 100 : 50;
        return { x, y, anchor: cell };
    }

    function open(anchorEl, currentValue, onSelect) {
        let selectedCell = normalizeToCell(currentValue);

        PickerBase.open(anchorEl, {
            className: 'position-picker',
            content: buildContent(selectedCell),
            minWidth: 170,
            onMount(el, closeFn) {
                const cells = el.querySelectorAll('.pos-cell');
                cells.forEach(cell => {
                    cell.addEventListener('click', () => {
                        cells.forEach(c => c.classList.remove('selected'));
                        cell.classList.add('selected');
                        selectedCell = cell.dataset.pos;
                    });
                });
                el.querySelector('.pos-save')?.addEventListener('click', () => {
                    DataBinding.commit(anchorEl, cellToXY(selectedCell));
                    closeFn();
                });
                el.querySelector('.pos-cancel')?.addEventListener('click', closeFn);
            }
        });
    }

    function updateBtnDot(btnEl, pos) {
        if (!btnEl) return;
        const cell = normalizeToCell(pos);
        let dot = btnEl.querySelector('.pos-dot');
        if (!dot) { dot = document.createElement('span'); btnEl.appendChild(dot); }
        dot.className = 'pos-dot pos-' + cell;
    }

    window.PositionPicker = { 
        open, 
        updateBtnDot,
        cellToXY,
        normalizeToCell,
        POSITIONS, 
        LABELS 
    };
})();