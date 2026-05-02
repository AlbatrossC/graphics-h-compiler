// ==================== AUTOCOMPLETE SYSTEM ====================
// Provides smart context-aware autocomplete and tooltips for CodeMirror 6

let functionsMap = {};
let constantsMap = {};
let dataLoaded = false;

// --- STEP 2: DATA LOADING ---
async function loadData() {
    if (dataLoaded) return;
    try {
        const response = await fetch('/static/assets/functions.1.json');
        if (!response.ok) throw new Error('Failed to load functions data');
        const data = await response.json();

        for (const func of data.functions) {
            functionsMap[func.name] = func;
        }

        if (data.constants) {
            for (const [key, values] of Object.entries(data.constants)) {
                constantsMap[key] = values;
            }
        }

        dataLoaded = true;
    } catch (error) {
        console.error('Autocomplete: failed to load data', error);
    }
}

// Load once on page load
loadData();

// --- STEP 3: CONTEXT DETECTION ---
function detectContext(state, pos) {
    const line = state.doc.lineAt(pos);
    const textUpToCursor = line.text.slice(0, pos - line.from);

    let counter = 0;
    let openParenIndex = -1;

    // Scan left from cursor
    for (let i = textUpToCursor.length - 1; i >= 0; i--) {
        const char = textUpToCursor[i];
        if (char === ')') {
            counter++;
        } else if (char === '(') {
            counter--;
            if (counter < 0) {
                openParenIndex = i;
                break;
            }
        }
    }

    // Context: Outside parens
    if (openParenIndex === -1) {
        // Find typed prefix
        const match = textUpToCursor.match(/[\w]+$/);
        const prefix = match ? match[0] : '';
        return { type: 'functions', prefix: prefix };
    }

    // Context: Inside parens
    // Extract function name (word before the '(')
    const textBeforeParen = textUpToCursor.slice(0, openParenIndex);
    const funcMatch = textBeforeParen.match(/[\w]+$/);
    const funcName = funcMatch ? funcMatch[0] : '';

    // Count commas between '(' and cursor at the same nesting level
    let commaCount = 0;
    let innerCounter = 0;
    const innerText = textUpToCursor.slice(openParenIndex + 1);

    for (let i = 0; i < innerText.length; i++) {
        const char = innerText[i];
        if (char === '(') {
            innerCounter++;
        } else if (char === ')') {
            innerCounter--;
        } else if (char === ',' && innerCounter === 0) {
            commaCount++;
        }
    }

    const paramIndex = commaCount.toString();

    // Find typed prefix for the constant
    // Match word characters right before cursor
    const prefixMatch = innerText.match(/[\w]+$/);
    const prefix = prefixMatch ? prefixMatch[0] : '';

    return { type: 'constants', funcName, paramIndex, prefix };
}

// --- STEP 4 & 5: COMPLETIONS ---
function getCompletions(context) {
    if (!dataLoaded) return null;

    const state = context.state;
    const pos = context.pos;

    const detected = detectContext(state, pos);

    const word = context.matchBefore(/\w*/);
    if (!word) return null;
    if (word.from === word.to && !context.explicit) {
        if (detected.type === 'functions') {
            return null;
        } else if (detected.type === 'constants') {
            const charBefore = state.sliceDoc(pos - 1, pos);
            if (!['(', ',', ' '].includes(charBefore)) {
                return null;
            }
        }
    }

    if (detected.type === 'functions') {
        const options = [];
        for (const [name, func] of Object.entries(functionsMap)) {
            options.push({
                label: name,
                detail: "()",
                type: 'function',
                apply: (view, completion, from, to) => {
                    const isInside = func.cursor === 'inside';
                    const insertText = name + '()';
                    view.dispatch({
                        changes: { from, to, insert: insertText },
                        selection: { anchor: from + name.length + (isInside ? 1 : 2) }
                    });

                    // Show tooltip after selection
                    view.dispatch({
                        effects: showSelectionTooltip.of(name)
                    });
                }
            });
        }
        return {
            from: word.from,
            options: options,
            validFor: /^\w*$/
        };
    } else if (detected.type === 'constants') {
        const func = functionsMap[detected.funcName];
        if (!func) {
            // Fallback: Unknown function, show functions
            const options = [];
            for (const name of Object.keys(functionsMap)) {
                options.push({
                    label: name,
                    detail: "()",
                    type: 'function',
                    apply: (view, completion, from, to) => {
                        const insertText = name + '()';
                        const isInside = functionsMap[name].cursor === 'inside';
                        view.dispatch({
                            changes: { from, to, insert: insertText },
                            selection: { anchor: from + name.length + (isInside ? 1 : 2) }
                        });
                    }
                });
            }
            return { from: word.from, options: options, validFor: /^\w*$/ };
        }

        if (!func.accepts || !func.accepts[detected.paramIndex]) {
            // Known function, but no constants for this parameter
            return null;
        }

        // Allowed groups for this parameter
        const groups = func.accepts[detected.paramIndex];
        const options = [];

        for (const group of groups) {
            const constants = constantsMap[group] || [];
            for (const constant of constants) {
                options.push({
                    label: constant,
                    type: 'constant',
                    apply: (view, completion, from, to) => {
                        view.dispatch({
                            changes: { from, to, insert: constant },
                            selection: { anchor: from + constant.length }
                        });
                    }
                });
            }
        }

        return {
            from: word.from,
            options: options,
            validFor: /^\w*$/
        };
    }

    return null;
}

// --- STEP 6: TOOLTIP DESIGN ---
function buildTooltipHTML(info) {
    const dom = document.createElement('div');
    dom.className = 'cm-func-tooltip';

    let html = `<div class="tooltip-signature">${info.signature}</div>`;
    if (info.description) {
        html += `<div class="tooltip-description">${info.description}</div>`;
    }

    if (info.params && info.params.length > 0) {
        html += `<div class="tooltip-params">`;
        for (const param of info.params) {
            // Split param text by first '→' to extract the name
            const parts = param.split('→');
            if (parts.length > 1) {
                const name = parts[0].trim();
                const desc = parts.slice(1).join('→').trim();
                html += `<div class="tooltip-param"><span class="tooltip-param-name">${name}</span> <span class="tooltip-param-arrow">→</span> <span class="tooltip-param-desc">${desc}</span></div>`;
            } else {
                html += `<div class="tooltip-param">${param}</div>`;
            }
        }
        html += `</div>`;
    }

    dom.innerHTML = html;
    return dom;
}

let showSelectionTooltip;
let hideSelectionTooltip;

// --- EXPORT ---
window.setupAutocomplete = function (editorView) {
    const { hoverTooltip, showTooltip } = cmModules.view;
    const { StateField, StateEffect } = cmModules.state;
    const { autocompletion } = cmModules.autocomplete;

    showSelectionTooltip = StateEffect.define();
    hideSelectionTooltip = StateEffect.define();

    const hoverTooltipSource = hoverTooltip((view, pos, side) => {
        if (!dataLoaded) return null;
        const word = view.state.wordAt(pos);
        if (!word) return null;
        const name = view.state.sliceDoc(word.from, word.to);
        const func = functionsMap[name];
        if (!func || !func.info) return null;
        return {
            pos: word.from, end: word.to, above: false,
            create() { return { dom: buildTooltipHTML(func.info) }; }
        };
    });

    const selectionTooltipField = StateField.define({
        create() { return null; },
        update(tooltip, tr) {
            if (tr.docChanged || tr.selection) return null;
            for (const e of tr.effects) { if (e.is(hideSelectionTooltip)) return null; }
            for (const e of tr.effects) {
                if (e.is(showSelectionTooltip)) {
                    const func = functionsMap[e.value];
                    if (func && func.info) {
                        return {
                            pos: tr.state.selection.main.head, above: false,
                            create() { return { dom: buildTooltipHTML(func.info) }; }
                        };
                    }
                }
            }
            return tooltip;
        },
        provide: f => showTooltip.computeN([f], s => { const t = s.field(f); return t ? [t] : []; })
    });

    const tooltipTheme = cmModules.view.EditorView.theme({
        // Base tooltip — transparent so .cm-func-tooltip provides visuals
        ".cm-tooltip": {
            backgroundColor: "transparent",
            border: "none",
            boxShadow: "none",
            padding: "0",
        },
        // Autocomplete dropdown — must override base with higher specificity
        ".cm-tooltip.cm-tooltip-autocomplete": {
            backgroundColor: "#252526",
            border: "1px solid #454545",
            borderRadius: "6px",
            padding: "4px",
            boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: "13.5px",
        },
        ".cm-tooltip-autocomplete ul": { margin: "0", padding: "0" },
        ".cm-tooltip-autocomplete ul::-webkit-scrollbar": {
            width: "10px"
        },
        ".cm-tooltip-autocomplete ul::-webkit-scrollbar-track": {
            background: "transparent"
        },
        ".cm-tooltip-autocomplete ul::-webkit-scrollbar-thumb": {
            backgroundColor: "#424242",
            borderRadius: "6px",
            border: "2px solid #252526"
        },
        ".cm-tooltip-autocomplete ul::-webkit-scrollbar-thumb:hover": {
            backgroundColor: "#4f4f4f"
        },
        ".cm-tooltip-autocomplete ul li": {
            padding: "4px 8px",
            color: "#cccccc",
            borderRadius: "4px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            lineHeight: "1.4"
        },
        ".cm-tooltip-autocomplete ul li[aria-selected]": {
            backgroundColor: "#04395e",
            color: "#ffffff",
        },
        ".cm-completionIcon": {
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "16px",
            height: "16px",
            marginRight: "6px",
            opacity: "0.9"
        },
        ".cm-completionIcon-function::after": {
            content: "'ƒ'",
            color: "#c586c0",
            fontWeight: "bold",
            fontStyle: "italic",
            fontFamily: "serif",
            fontSize: "15px"
        },
        ".cm-completionIcon-constant::after": {
            content: "'[c]'",
            color: "#4fc1ff",
            fontFamily: "monospace",
            fontSize: "11px",
            letterSpacing: "-1px"
        },
        ".cm-completionMatchedText": {
            color: "#569cd6",
            textDecoration: "none",
            fontWeight: "bold",
        },
        ".cm-completionDetail": {
            color: "#858585",
            fontStyle: "normal",
            marginLeft: "2px",
            fontSize: "13px",
            fontFamily: "'JetBrains Mono', monospace"
        },
        // Function tooltip card
        ".cm-func-tooltip": {
            backgroundColor: "#252526",
            border: "1px solid #454545",
            borderRadius: "6px",
            overflow: "hidden",
            maxWidth: "450px",
            boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
            fontFamily: "system-ui, -apple-system, sans-serif",
            color: "#cccccc",
        },
        ".tooltip-signature": {
            backgroundColor: "#1e1e1e",
            borderBottom: "1px solid #454545",
            padding: "10px 14px",
            color: "#dcdcaa",
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: "13.5px",
        },
        ".tooltip-description": {
            padding: "12px 14px 8px",
            color: "#cccccc",
            fontSize: "13px",
            lineHeight: "1.5",
        },
        ".tooltip-params": {
            padding: "4px 14px 14px",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
        },
        ".tooltip-param": {
            color: "#cccccc",
            fontSize: "13px",
            lineHeight: "1.5",
            display: "flex",
            alignItems: "flex-start",
            gap: "8px"
        },
        ".tooltip-param-name": {
            color: "#9cdcfe",
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: "13px",
            fontWeight: "normal",
            whiteSpace: "nowrap",
        },
        ".tooltip-param-arrow": {
            color: "#858585",
            fontSize: "13px",
        },
        ".tooltip-param-desc": {
            flex: "1"
        }
    });

    const tooltipHideListener = cmModules.view.EditorView.domEventHandlers({
        mousedown(e, view) {
            view.dispatch({ effects: hideSelectionTooltip.of() });
            return false;
        }
    });

    editorView.dispatch({
        effects: cmModules.state.StateEffect.appendConfig.of([
            autocompletion({ override: [getCompletions] }),
            hoverTooltipSource,
            selectionTooltipField,
            tooltipTheme,
            tooltipHideListener,
        ])
    });
};
