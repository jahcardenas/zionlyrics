import { Editor, Node, Mark, mergeAttributes, Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { Fragment } from '@tiptap/pm/model';
import StarterKit from '@tiptap/starter-kit';
import Document from '@tiptap/extension-document';


// ==========================================================
// Document custom: solo acepta stanzas como hijos directos
// ==========================================================
const StanzaDocument = Document.extend({
    content: 'stanza+'
});

// ==========================================================
// Custom Node: Stanza (estrofa)
// ==========================================================
const Stanza = Node.create({
    name: 'stanza',
    group: 'block',
    content: 'paragraph+',
    defining: true,

    addAttributes() {
        return {
            repite: {
                default: 1,
                parseHTML: element => parseInt(element.getAttribute('data-repite')) || 1,
                renderHTML: attributes => ({ 'data-repite': attributes.repite })
            },
            tipo: {
                default: 'estrofa',
                parseHTML: element => element.getAttribute('data-tipo') || 'estrofa',
                renderHTML: attributes => ({ 'data-tipo': attributes.tipo })
            }
        };
    },

    parseHTML() {
        return [{ tag: 'div[data-stanza]' }];
    },

    renderHTML({ HTMLAttributes }) {
        return [
            'div',
            mergeAttributes(HTMLAttributes, { 'data-stanza': '', class: 'chorus-stanza' }),
            0
        ];
    }
});

// ==========================================================
// Custom Mark: Note (acorde musical inline)
// ==========================================================
const Note = Mark.create({
    name: 'note',
    inclusive: false,
    keepOnSplit: false,

    addAttributes() {
        return {
            note: {
                default: null,
                parseHTML: el => el.getAttribute('data-note'),
                renderHTML: attrs => attrs.note ? { 'data-note': attrs.note } : {}
            }
        };
    },

    parseHTML() {
        return [{ tag: 'span[data-note]' }];
    },

    renderHTML({ HTMLAttributes }) {
        return ['span', mergeAttributes(HTMLAttributes, { class: 'chorus-note-mark' }), 0];
    }
});

// ==========================================================
// Configuración del tipo de estrofa y Dropdown
// ==========================================================
const STANZA_TYPES = [
    { value: 'estrofa', label: 'Estrofa' },
    { value: 'coro', label: 'Coro' },
    { value: 'pre-coro', label: 'Pre-coro' },
    { value: 'puente', label: 'Puente' },
    { value: 'intro', label: 'Intro' },
    { value: 'outro', label: 'Outro' },
    { value: 'tag', label: 'Tag' }
];

function getStanzaTypeLabel(val) {
    const found = STANZA_TYPES.find(o => o.value === val);
    return found ? found.label : (val || 'Estrofa');
}

function openStanzaTypeDropdown(anchor, currentType, onSelect) {
    if (!window.PickerBase) return;

    const contentHTML = `
        <div class="stanza-dropdown-inner">
            <div class="stanza-dropdown-header">Tipo de estrofa</div>
            ${STANZA_TYPES.map(t => `
                <button class="stanza-dropdown-item ${t.value === currentType ? 'is-selected' : ''}" data-value="${t.value}">
                    <span class="sd-label">${t.label}</span>
                    <i data-lucide="check" class="sd-check"></i>
                </button>
            `).join('')}
        </div>
    `;

    window.PickerBase.open(anchor, {
        className: 'stanza-type-picker',
        minWidth: 180,
        placement: 'bottom-start',
        offset: 6,
        arrow: false,
        content: contentHTML,
        onMount(el, closeFn) {
            if (window.createIcons) window.createIcons();
            
            el.querySelectorAll('.stanza-dropdown-item').forEach(btn => {
                btn.onclick = () => {
                    const newType = btn.dataset.value;
                    if (newType !== currentType) {
                        onSelect(newType);
                    }
                    closeFn();
                };
            });
        }
    });
}

// ==========================================================
// Helpers del slider de frontera entre stanzas
// ==========================================================
function buildSliderDOM() {
    const el = document.createElement('div');
    el.className = 'chorus-editor-slider';
    el.setAttribute('contenteditable', 'false');
    el.setAttribute('draggable', 'false');

    const line = document.createElement('div');
    line.className = 'chorus-editor-slider-line';

    const grip = document.createElement('div');
    grip.className = 'chorus-editor-slider-grip';
    grip.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12"
             viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="9" cy="6" r="1"></circle>
            <circle cx="9" cy="12" r="1"></circle>
            <circle cx="9" cy="18" r="1"></circle>
            <circle cx="15" cy="6" r="1"></circle>
            <circle cx="15" cy="12" r="1"></circle>
            <circle cx="15" cy="18" r="1"></circle>
        </svg>
    `;

    el.appendChild(line);
    el.appendChild(grip);
    return el;
}

function buildSliderDecorations(state) {
    const decos = [];
    const doc = state.doc;
    const childCount = doc.childCount;

    if (childCount < 2) return DecorationSet.empty;

    let pos = 0;
    for (let i = 0; i < childCount - 1; i++) {
        const child = doc.child(i);
        pos += child.nodeSize;

        const widget = Decoration.widget(pos, () => {
            const el = buildSliderDOM();
            el.dataset.boundaryIndex = String(i);
            return el;
        }, {
            side: -1,
            key: `stanza-slider-${i}`
        });

        decos.push(widget);
    }

    return DecorationSet.create(doc, decos);
}

function stanzaToLines(stanza) {
    const lines = [[]];
    stanza.forEach((paragraph, _offset, paragraphIndex) => {
        if (paragraphIndex > 0) lines.push([]);
        paragraph.forEach(inline => {
            if (inline.type.name === 'hardBreak') lines.push([]);
            else lines[lines.length - 1].push(inline);
        });
    });
    return lines;
}

function linesToStanza(schema, lines, repite, tipo) {
    const paragraphs = lines.map(line => {
        const content = line.length > 0 ? Fragment.fromArray(line) : Fragment.empty;
        return schema.nodes.paragraph.create(null, content);
    });
    return schema.nodes.stanza.create(
        { repite, tipo },
        Fragment.fromArray(paragraphs)
    );
}

function lineIndexInStanza(doc, stanzaStart, pos) {
    let breaks = 0;
    let paragraphs = 0;
    doc.nodesBetween(stanzaStart + 1, pos, (node, nodePos) => {
        if (nodePos >= pos) return false;
        if (node.type.name === 'paragraph') paragraphs++;
        if (node.type.name === 'hardBreak') breaks++;
        return true;
    });
    return breaks + Math.max(0, paragraphs - 1);
}

function computeBoundaryMove(doc, schema, boundaryIndex, hitPos, dropInUpperHalf) {
    const $hit = doc.resolve(hitPos);
    if ($hit.depth < 1) return null;

    const stanzaIndex = $hit.index(0);
    if (stanzaIndex !== boundaryIndex && stanzaIndex !== boundaryIndex + 1) return null;

    let startA = 0;
    for (let i = 0; i < boundaryIndex; i++) startA += doc.child(i).nodeSize;

    const stanzaA = doc.child(boundaryIndex);
    const stanzaB = doc.child(boundaryIndex + 1);
    const startB  = startA + stanzaA.nodeSize;

    const linesA = stanzaToLines(stanzaA);
    const linesB = stanzaToLines(stanzaB);
    const total  = linesA.length + linesB.length;
    if (total < 2) return null;

    const inA    = stanzaIndex === boundaryIndex;
    const local  = lineIndexInStanza(doc, inA ? startA : startB, hitPos);
    const global = inA ? local : linesA.length + local;

    let splitAt = dropInUpperHalf ? global : global + 1;
    splitAt = Math.max(1, Math.min(total - 1, splitAt));

    if (splitAt === linesA.length) return null;

    const all = linesA.concat(linesB);
    return {
        from: startA,
        to:   startB + stanzaB.nodeSize,
        nodes: [
            linesToStanza(schema, all.slice(0, splitAt), stanzaA.attrs.repite, stanzaA.attrs.tipo),
            linesToStanza(schema, all.slice(splitAt),    stanzaB.attrs.repite, stanzaB.attrs.tipo)
        ]
    };
}

function moveBoundaryToDrop(view, boundaryIndex, clientX, clientY) {
    const hit = view.posAtCoords({ left: clientX, top: clientY });
    if (!hit) return false;

    const $hit = view.state.doc.resolve(hit.pos);
    if ($hit.depth < 1) return false;
    const stanzaIndex = $hit.index(0);
    if (stanzaIndex !== boundaryIndex && stanzaIndex !== boundaryIndex + 1) return false;
    const isInA = stanzaIndex === boundaryIndex;

    let dropInUpperHalf = false;
    try {
        const c = view.coordsAtPos(hit.pos, -1);
        const lineHeight = c.bottom - c.top;

        // Usar el mismo threshold para A y B, pero con signo distinto según el lado.
        // La idea: un solo "midpoint" por línea, no dos thresholds distintos.
        const midY = c.top + lineHeight * 0.5;

        if (clientY < c.top) {
            // Gap arriba del rect: si estamos en A, reducir; si en B, aumentar.
            dropInUpperHalf = isInA;
        } else if (clientY > c.bottom) {
            // Gap abajo del rect: siempre "lower".
            dropInUpperHalf = false;
        } else {
            // Cursor dentro del rect: comparación con el midpoint.
            dropInUpperHalf = clientY < midY;
        }
    } catch (_) {}

    const move = computeBoundaryMove(
        view.state.doc, view.state.schema, boundaryIndex, hit.pos, dropInUpperHalf
    );
    if (!move) return false;

    view.dispatch(view.state.tr.replaceWith(move.from, move.to, move.nodes));
    return true;
}

function setupSliderDrag(editorView) {
    let guideEl = null;

    const onPointerDown = (e) => {
        const sliderEl = e.target.closest('.chorus-editor-slider');
        if (!sliderEl) return;
        e.preventDefault();
        e.stopPropagation();

        const boundaryIndex = parseInt(sliderEl.dataset.boundaryIndex, 10);
        if (isNaN(boundaryIndex)) return;

        const editorRect = editorView.dom.getBoundingClientRect();

        guideEl = document.createElement('div');
        guideEl.className = 'chorus-editor-slider-guide';
        guideEl.style.left  = editorRect.left + 'px';
        guideEl.style.width = editorRect.width + 'px';
        guideEl.style.top   = e.clientY + 'px';
        document.body.appendChild(guideEl);

        const onPointerMove = (ev) => {
            if (guideEl) guideEl.style.top = ev.clientY + 'px';
        };

        const onPointerUp = (ev) => {
            document.removeEventListener('pointermove', onPointerMove);
            document.removeEventListener('pointerup', onPointerUp);

            if (guideEl) {
                guideEl.remove();
                guideEl = null;
            }

            moveBoundaryToDrop(editorView, boundaryIndex, ev.clientX, ev.clientY);
        };

        document.addEventListener('pointermove', onPointerMove);
        document.addEventListener('pointerup', onPointerUp);
    };

    editorView.dom.addEventListener('pointerdown', onPointerDown);

    return {
        destroy() {
            editorView.dom.removeEventListener('pointerdown', onPointerDown);
            if (guideEl) guideEl.remove();
        }
    };
}

function buildStanzaHeaderDecorations(state, view) {
    const decos = [];
    const doc = state.doc;

    let pos = 0;
    doc.forEach((node, offset, index) => {
        if (node.type.name === 'stanza') {
            const stanzaType = node.attrs.tipo || 'estrofa';

            const tagWidget = Decoration.widget(pos + 1, () => {
                const wrapper = document.createElement('div');
                wrapper.className = 'chorus-stanza-tag-wrapper';
                wrapper.setAttribute('contenteditable', 'false');

                const badge = document.createElement('button');
                badge.className = 'chorus-stanza-tag-badge';
                badge.textContent = getStanzaTypeLabel(stanzaType);
                badge.dataset.stanzaIndex = String(index);

                badge.onclick = (e) => {
                    e.stopPropagation();
                    e.preventDefault();

                    // Obtener el nodo y la posición FRESCOS desde el estado actual,
                    // no desde el closure (que puede quedar obsoleto tras un slider).
                    let currentStanza = null;
                    let currentPos = null;
                    let count = 0;
                    view.state.doc.forEach((n, offset) => {
                        if (n.type.name === 'stanza') {
                            if (count === index) {
                                currentStanza = n;
                                currentPos = offset;
                            }
                            count++;
                        }
                    });

                    if (!currentStanza) return;

                    openStanzaTypeDropdown(badge, currentStanza.attrs.tipo || 'estrofa', (newType) => {
                        view.dispatch(
                            view.state.tr.setNodeMarkup(currentPos, undefined, {
                                ...currentStanza.attrs,
                                tipo: newType
                            })
                        );
                    });
                };

                wrapper.appendChild(badge);
                return wrapper;
            }, {
                side: -1,
                key: `stanza-tag-${index}-${stanzaType}-${pos}`
            });

            decos.push(tagWidget);
        }
        pos += node.nodeSize;
    });

    return DecorationSet.create(doc, decos);
}

// ==========================================================
// Extension: commands + plugins
// ==========================================================
const StanzaCommands = Extension.create({
    name: 'stanzaCommands',

    addKeyboardShortcuts() {
        return {
            'Enter': () => {
                const { state } = this.editor;
                const { $from, empty } = state.selection;
                if (!empty) return false;

                let stanzaDepth = null;
                for (let d = $from.depth; d >= 0; d--) {
                    if ($from.node(d).type.name === 'stanza') {
                        stanzaDepth = d;
                        break;
                    }
                }
                if (stanzaDepth === null) return false;

                const stanzaNode = $from.node(stanzaDepth);
                const paragraphIndex = $from.index(stanzaDepth);
                const isLastParagraph = paragraphIndex === stanzaNode.childCount - 1;
                const atEndOfParagraph = $from.parentOffset === $from.parent.content.size;

                if (!isLastParagraph || !atEndOfParagraph) return false;

                const doc = state.doc;
                const stanzaEnd = $from.after(stanzaDepth);
                const isLastStanza = stanzaEnd >= doc.content.size - 1;

                if (!isLastStanza) return false;

                return this.editor.commands.insertStanza();
            }
        };
    },

    addCommands() {
        return {
            insertStanza: () => ({ state, dispatch }) => {
                const { from } = state.selection;
                let pos = null;
                state.doc.nodesBetween(from, from, (node, nodePos) => {
                    if (node.type.name === 'stanza') {
                        pos = nodePos + node.nodeSize;
                        return false;
                    }
                });
                if (pos === null) pos = state.doc.content.size;

                const newStanza = state.schema.nodes.stanza.createAndFill({ repite: 1, tipo: 'estrofa' });
                if (!newStanza) return false;

                const tr = state.tr.insert(pos, newStanza);
                if (dispatch) dispatch(tr);
                return true;
            },

            insertBreak: () => ({ state, dispatch }) => {
                const { $from } = state.selection;

                // Encontrar la stanza actual
                let stanzaDepth = null;
                let stanzaStart = null;
                for (let d = $from.depth; d >= 0; d--) {
                    if ($from.node(d).type.name === 'stanza') {
                        stanzaDepth = d;
                        stanzaStart = $from.before(d);
                        break;
                    }
                }
                if (stanzaDepth === null) return false;

                const stanzaNode = $from.node(stanzaDepth);
                const lines = stanzaToLines(stanzaNode);
                if (lines.length < 2) return false;

                // Calcular en qué línea lógica está el cursor
                const paraIndex    = $from.index(stanzaDepth);
                const offsetInPara = $from.parentOffset;

                // HardBreaks dentro del párrafo actual, antes del cursor
                let breaksBeforeCursor = 0;
                let charsConsumed = 0;
                $from.parent.forEach(child => {
                    if (charsConsumed >= offsetInPara) return false;
                    if (child.type.name === 'hardBreak') breaksBeforeCursor++;
                    charsConsumed += child.nodeSize;
                    return true;
                });

                // Líneas de los párrafos anteriores + hardBreaks del párrafo actual
                let linesBeforePara = 0;
                stanzaNode.forEach((para, _off, i) => {
                    if (i >= paraIndex) return false;
                    let paraBreaks = 0;
                    para.forEach(child => {
                        if (child.type.name === 'hardBreak') paraBreaks++;
                    });
                    linesBeforePara += paraBreaks + 1;
                    return true;
                });

                const cursorLine = linesBeforePara + breaksBeforeCursor;

                // ¿El cursor está al inicio de su línea?
                // Sí → dividir ANTES de esa línea (queda abajo).
                // No → dividir DESPUÉS de esa línea (queda arriba).
                const nodeBefore = $from.nodeBefore;
                const isAtStartOfLine = !nodeBefore || nodeBefore.type.name === 'hardBreak';

                const splitAt = isAtStartOfLine ? cursorLine : cursorLine + 1;
                if (splitAt <= 0 || splitAt >= lines.length) return false;

                const schema = state.schema;
                const stanzaEnd = $from.after(stanzaDepth);

                const newStanza1 = linesToStanza(
                    schema,
                    lines.slice(0, splitAt),
                    stanzaNode.attrs.repite,
                    stanzaNode.attrs.tipo
                );
                const newStanza2 = linesToStanza(
                    schema,
                    lines.slice(splitAt),
                    1,
                    'estrofa'
                );

                const tr = state.tr.replaceWith(stanzaStart, stanzaEnd, [newStanza1, newStanza2]);
                if (dispatch) dispatch(tr);
                return true;
            },

            setStanzaRepite: (repite) => ({ state, dispatch }) => {
                const { from } = state.selection;
                let pos = null;
                state.doc.nodesBetween(from, from, (node, nodePos) => {
                    if (node.type.name === 'stanza') {
                        pos = nodePos;
                        return false;
                    }
                });
                if (pos === null) return false;

                const currentAttrs = state.doc.nodeAt(pos).attrs;
                const tr = state.tr.setNodeMarkup(pos, undefined, { ...currentAttrs, repite });
                if (dispatch) dispatch(tr);
                return true;
            },

            getStanzaRepite: () => ({ state }) => {
                const { from } = state.selection;
                let repite = 1;
                state.doc.nodesBetween(from, from, (node) => {
                    if (node.type.name === 'stanza') {
                        repite = node.attrs.repite;
                        return false;
                    }
                });
                return repite;
            },

            setStanzaTipo: (tipo) => ({ state, dispatch }) => {
                const { from } = state.selection;
                let pos = null;
                state.doc.nodesBetween(from, from, (node, nodePos) => {
                    if (node.type.name === 'stanza') {
                        pos = nodePos;
                        return false;
                    }
                });
                if (pos === null) return false;

                const currentAttrs = state.doc.nodeAt(pos).attrs;
                const tr = state.tr.setNodeMarkup(pos, undefined, { ...currentAttrs, tipo });
                if (dispatch) dispatch(tr);
                return true;
            },

            getStanzaTipo: () => ({ state }) => {
                const { from } = state.selection;
                let tipo = 'estrofa';
                state.doc.nodesBetween(from, from, (node) => {
                    if (node.type.name === 'stanza') {
                        tipo = node.attrs.tipo || 'estrofa';
                        return false;
                    }
                });
                return tipo;
            }
        };
    },

    addProseMirrorPlugins() {
        const editor = this.editor;

        return [
            new Plugin({
                key: new PluginKey('stanzaActive'),
                props: {
                    decorations(state) {
                        const { $from } = state.selection;
                        let stanzaStart = null;
                        let stanzaEnd = null;

                        for (let d = $from.depth; d >= 0; d--) {
                            const node = $from.node(d);
                            if (node.type.name === 'stanza') {
                                stanzaStart = $from.before(d);
                                stanzaEnd   = $from.after(d);
                                break;
                            }
                        }

                        if (stanzaStart === null || stanzaEnd === null) {
                            return DecorationSet.empty;
                        }

                        return DecorationSet.create(state.doc, [
                            Decoration.node(stanzaStart, stanzaEnd, { class: 'chorus-stanza-active' })
                        ]);
                    }
                }
            }),

            new Plugin({
                key: new PluginKey('stanzaBreak'),
                props: {
                    handlePaste(view, event) {
                        const text = event.clipboardData.getData('text/plain');
                        if (!text) return false;
                        if (!/\n\s*\n/.test(text)) return false;

                        event.preventDefault();

                        const blocks = text
                            .split(/\n\s*\n/)
                            .map(b => b.trim())
                            .filter(b => b.length > 0);

                        if (blocks.length === 0) return false;

                        const newDoc = {
                            type: 'doc',
                            content: blocks.map(block => {
                                const lines = block.split('\n').filter(l => l.length > 0);
                                const safeLines = lines.length > 0 ? lines : [''];
                                return {
                                    type: 'stanza',
                                    attrs: { repite: 1, tipo: 'estrofa' },
                                    content: safeLines.map(line => ({
                                        type: 'paragraph',
                                        content: line ? [{ type: 'text', text: line }] : []
                                    }))
                                };
                            })
                        };

                        const editor = view.dom.editor;
                        if (!editor) return false;

                        editor.commands.setContent(newDoc);
                        return true;
                    },

                    handleKeyDown(view, event) {
                        if (event.key !== 'Enter' || event.shiftKey || event.metaKey || event.ctrlKey) return false;

                        const { state } = view;
                        const { $from, empty } = state.selection;
                        if (!empty) return false;
                        if ($from.parent.type.name !== 'paragraph') return false;
                        if ($from.parent.content.size > 0) return false;

                        let stanzaDepth = null;
                        for (let d = $from.depth; d >= 0; d--) {
                            if ($from.node(d).type.name === 'stanza') {
                                stanzaDepth = d;
                                break;
                            }
                        }
                        if (stanzaDepth === null) return false;

                        const stanzaNode = $from.node(stanzaDepth);
                        if (stanzaNode.childCount <= 1) return false;

                        const paraIndex = $from.index(stanzaDepth);
                        const paraStart = $from.before();
                        const paraEnd = $from.after();

                        const tr = state.tr;
                        tr.delete(paraStart, paraEnd);

                        if (paraIndex === stanzaNode.childCount - 1) {
                            const newStanza = state.schema.nodes.stanza.createAndFill({ repite: 1, tipo: 'estrofa' });
                            if (!newStanza) return false;
                            tr.insert(tr.mapping.map(paraStart), newStanza);
                        } else {
                            try {
                                tr.split(tr.mapping.map(paraStart), stanzaDepth);
                            } catch (e) {
                                return false;
                            }
                        }

                        view.dispatch(tr);
                        event.preventDefault();
                        return true;
                    }
                }
            }),

            new Plugin({
                key: new PluginKey('notePresence'),
                view(editorView) {
                    const updateClass = () => {
                        let hasNotes = false;
                        editorView.state.doc.descendants(node => {
                            if (node.marks && node.marks.some(m => m.type.name === 'note')) {
                                hasNotes = true;
                                return false;
                            }
                        });
                        editorView.dom.classList.toggle('has-notes', hasNotes);
                    };
                    updateClass();
                    return { update: updateClass };
                }
            }),

            new Plugin({
                key: new PluginKey('stanzaSliders'),
                props: {
                    decorations(state) {
                        return buildSliderDecorations(state);
                    }
                },
                view(editorView) {
                    return setupSliderDrag(editorView);
                }
            }),

            new Plugin({
                key: new PluginKey('stanzaTags'),
                props: {
                    decorations(state) {
                        return buildStanzaHeaderDecorations(state, editor.view);
                    }
                }
            })
        ];
    }
});

// ==========================================================
// Extension: commands del mark Note
// ==========================================================
const NoteCommands = Extension.create({
    name: 'noteCommands',
    addCommands() {
        return {
            applyNote: (noteValue) => ({ commands }) => commands.setMark('note', { note: noteValue }),
            removeNote: () => ({ commands }) => commands.unsetMark('note')
        };
    }
});

// ==========================================================
// Exponer al window
// ==========================================================
window.Tiptap = {
    Editor,
    StarterKit,
    StanzaDocument,
    Stanza,
    StanzaCommands,
    Note,
    NoteCommands
};