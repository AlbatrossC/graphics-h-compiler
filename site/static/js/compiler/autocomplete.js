// Autocomplete system for CodeMirror 6.
// Provides smart context-aware autocomplete and tooltips for CodeMirror 6

let functionsMap = {};
let constantsMap = {};
let headerFiles = [];
let dataLoaded = false;
let startAutocomplete = null;
let pendingIncludeHeaderSuggestions = false;
let cachedFunctionOptions = null;
let applySnippet = null;
let autocompleteCacheField = null;
const constantCache = new Map();

const INCLUDE_DIRECTIVE = '#include';
const DEFAULT_INCLUDE_HEADERS = ['graphics.h', 'conio.h', 'dos.h'];
const BOILERPLATE_LABEL = 'boilerplate';
const BOILERPLATE_TEMPLATE = `#include <graphics.h>
#include <conio.h>

int main() {
    int gd = DETECT, gm;
    initgraph(&gd, &gm, "");

    getch();
    closegraph();
    return 0;
}`;

const SNIPPETS = {
    for: {
        label: 'for',
        detail: 'counting loop',
        type: 'keyword',
        boost: 5,
        apply: createSnippetApply('for (int ${i} = 0; ${i} < ${n}; ${i}++) {\n\t${}\n}')
    },
    while: {
        label: 'while',
        detail: 'while loop',
        type: 'keyword',
        boost: 5,
        apply: createSnippetApply('while (${condition}) {\n\t${}\n}')
    },
    if: {
        label: 'if',
        detail: 'conditional block',
        type: 'keyword',
        boost: 5,
        apply: createSnippetApply('if (${condition}) {\n\t${}\n}')
    },
    main: {
        label: 'main',
        detail: 'main function',
        type: 'keyword',
        boost: 5,
        apply: createSnippetApply('int main() {\n\t${}\n\treturn 0;\n}')
    },
    anim: {
        label: 'anim',
        detail: 'animation loop',
        type: 'keyword',
        boost: 5,
        apply: createSnippetApply('while (!kbhit()) {\n\tcleardevice();\n\t${}\n\tdelay(16);\n}')
    }
};

// Builds a snippet apply handler with a plain-text fallback.
function createSnippetApply(template) {
    return (view, completion, from, to) => {
        if (typeof applySnippet === 'function') {
            applySnippet(template)(view, completion, from, to);
            return;
        }

        const plainText = template.replace(/\$\{([^}]*)\}/g, '$1');
        view.dispatch({
            changes: { from, to, insert: plainText },
            selection: { anchor: from + plainText.length }
        });
    };
}

// Resets caches whenever autocomplete data is reloaded or cleared.
function resetAutocompleteCaches() {
    cachedFunctionOptions = null;
    constantCache.clear();
}

// Extracts variables from a single line so changed lines can be updated incrementally.
function extractVariablesFromLine(lineText) {
    const variables = [];
    const variablePattern = /\b(int|float|double|char\s*\*?)\s+(\w+)/g;
    let match;

    while ((match = variablePattern.exec(lineText)) !== null) {
        variables.push(match[2]);
    }

    return variables;
}

// Stores the line text with its extracted variables for cache reuse.
function createLineVariableEntry(lineText) {
    return {
        text: lineText,
        variables: extractVariablesFromLine(lineText)
    };
}

// Builds a de-duplicated variable list from cached line entries without rescanning source text.
function buildVariableListFromLineEntries(lineEntries) {
    const variables = [];
    const seen = new Set();

    for (const entry of lineEntries) {
        for (const variableName of entry.variables) {
            if (!seen.has(variableName)) {
                seen.add(variableName);
                variables.push(variableName);
            }
        }
    }

    return variables;
}

// Builds the initial autocomplete cache for a document and stores derived data together.
function buildAutocompleteDocCache(doc) {
    const source = doc.toString();
    const lineEntries = [];

    for (let lineNumber = 1; lineNumber <= doc.lines; lineNumber++) {
        lineEntries.push(createLineVariableEntry(doc.line(lineNumber).text));
    }

    return {
        source,
        lineEntries,
        variables: buildVariableListFromLineEntries(lineEntries),
        includedHeaders: getIncludedHeaders(source)
    };
}

// Returns the line range affected by a change so only those lines need variable re-extraction.
function getChangedLineRange(doc, from, to) {
    const safeFrom = Math.min(from, doc.length);
    const safeEnd = Math.min(to > from ? to - 1 : from, doc.length);

    return {
        from: doc.lineAt(safeFrom).number,
        to: doc.lineAt(safeEnd).number
    };
}

// Updates cached source/variables when content changes, including paste and undo/redo.
function updateAutocompleteDocCache(previousCache, transaction) {
    const source = transaction.state.doc.toString();
    const lineEntries = previousCache.lineEntries.slice();
    const replacements = [];

    transaction.changes.iterChangedRanges((fromA, toA, fromB, toB) => {
        const oldRange = getChangedLineRange(transaction.startState.doc, fromA, toA);
        const newRange = getChangedLineRange(transaction.state.doc, fromB, toB);
        const newEntries = [];

        for (let lineNumber = newRange.from; lineNumber <= newRange.to; lineNumber++) {
            newEntries.push(createLineVariableEntry(transaction.state.doc.line(lineNumber).text));
        }

        replacements.push({
            oldFromLine: oldRange.from,
            oldToLine: oldRange.to,
            newEntries
        });
    });

    let lineOffset = 0;
    for (const replacement of replacements) {
        const startIndex = replacement.oldFromLine - 1 + lineOffset;
        const deleteCount = replacement.oldToLine - replacement.oldFromLine + 1;
        lineEntries.splice(startIndex, deleteCount, ...replacement.newEntries);
        lineOffset += replacement.newEntries.length - deleteCount;
    }

    if (lineEntries.length !== transaction.state.doc.lines) {
        return buildAutocompleteDocCache(transaction.state.doc);
    }

    return {
        source,
        lineEntries,
        variables: buildVariableListFromLineEntries(lineEntries),
        includedHeaders: getIncludedHeaders(source)
    };
}

// Reads cached autocomplete data from editor state and falls back to a one-off build if needed.
function getAutocompleteDocCache(state) {
    if (autocompleteCacheField) {
        const cached = state.field(autocompleteCacheField, false);
        if (cached) {
            return cached;
        }
    }

    return buildAutocompleteDocCache(state.doc);
}

// Step 2: Load autocomplete functions and constants JSON data.
async function loadData() {
    if (dataLoaded) return;
    try {
        const response = await fetch('/static/assets/functions.2.json');
        if (!response.ok) throw new Error('Failed to load functions data');
        const data = await response.json();

        functionsMap = {};
        constantsMap = {};
        headerFiles = [];
        resetAutocompleteCaches();

        for (const func of data.functions) {
            functionsMap[func.name] = func;
        }

        if (data.constants) {
            for (const [key, values] of Object.entries(data.constants)) {
                constantsMap[key] = values;
            }
        }

        if (Array.isArray(data.headers)) {
            headerFiles = data.headers
                .map((header) => String(header || '').trim().toLowerCase())
                .filter(Boolean);
        }

        dataLoaded = true;
    } catch (error) {
        dataLoaded = false;
        resetAutocompleteCaches();
        console.error('Autocomplete: failed to load data', error);
    }
}

// Load once on page load
loadData();

// Gets the set of included headers from a source string or editor state.
function getIncludedHeaders(sourceOrState) {
    if (sourceOrState && typeof sourceOrState !== 'string') {
        const cached = getAutocompleteDocCache(sourceOrState);
        if (cached?.includedHeaders) {
            return cached.includedHeaders;
        }
    }

    const includedHeaders = new Set();
    const includePattern = /^\s*#include\s*[<"]([^>"\r\n]+)[>"]/gm;
    const source = typeof sourceOrState === 'string'
        ? sourceOrState
        : sourceOrState?.doc?.toString?.() ?? '';
    let match;

    while ((match = includePattern.exec(source)) !== null) {
        includedHeaders.add(match[1].trim().toLowerCase());
    }

    return includedHeaders;
}

function buildHeaderOptions(headers, preserveOrder = false, closeDelimiter = '>') {
    const totalHeaders = headers.length;
    return headers.map((header, index) => ({
        label: header,
        type: 'text',
        boost: preserveOrder ? (totalHeaders - index) * 100 : undefined,
        apply: (view, completion, from, to) => {
            const hasClosingDelimiter = view.state.sliceDoc(to, to + 1) === closeDelimiter;
            const insertText = completion.label + (hasClosingDelimiter ? '' : closeDelimiter);
            view.dispatch({
                changes: { from, to, insert: insertText },
                selection: {
                    anchor: from + completion.label.length + (hasClosingDelimiter ? 1 : closeDelimiter.length)
                }
            });
            pendingIncludeHeaderSuggestions = false;
        }
    }));
}

function getHeaderSuggestions(source, prefix, useStarterList) {
    const normalizedPrefix = (prefix || '').toLowerCase();

    if (useStarterList) {
        const includedHeaders = getIncludedHeaders(source);
        return DEFAULT_INCLUDE_HEADERS
            .filter((header) => headerFiles.includes(header))
            .filter((header) => !includedHeaders.has(header));
    }

    return headerFiles.filter((header) => header.startsWith(normalizedPrefix));
}

function isBoilerplatePrefix(prefix) {
    if (!prefix) return false;
    const normalizedPrefix = prefix.toLowerCase();
    return normalizedPrefix.length >= 1 && BOILERPLATE_LABEL.startsWith(normalizedPrefix);
}

// Treats blank lines and single-line comments as empty for boilerplate detection.
function isEffectivelyEmpty(source, typedWord) {
    const normalized = source
        .split('\n')
        .filter((line) => {
            const trimmed = line.trim();
            return trimmed && !trimmed.startsWith('//');
        })
        .join('')
        .trim();

    return normalized.toLowerCase() === (typedWord || '').toLowerCase();
}

function getBoilerplateTrigger(source, word) {
    if (!word || !word.text) {
        return null;
    }

    if (!source.trim() || !isEffectivelyEmpty(source, word.text)) {
        return null;
    }

    if (!isBoilerplatePrefix(word.text)) {
        return null;
    }

    return {
        from: word.from,
        to: word.to,
        text: word.text
    };
}

// Detects whether the cursor is currently inside a quoted string.
function isInsideString(textUpToCursor) {
    const quoteCount = (textUpToCursor.match(/"/g) || []).length;
    return quoteCount % 2 === 1;
}

// Detects whether the current line is a single-line comment.
function isLineComment(textUpToCursor) {
    return textUpToCursor.trimStart().startsWith('//');
}

// Detects whether the cursor is currently inside a block comment.
function isInsideBlockComment(source, pos) {
    const sourceUpToCursor = source.slice(0, pos);
    const openCount = (sourceUpToCursor.match(/\/\*/g) || []).length;
    const closeCount = (sourceUpToCursor.match(/\*\//g) || []).length;
    return openCount > closeCount;
}

// Detects include directive contexts and tracks the active delimiter.
function detectIncludeContext(textUpToCursor, pos) {
    const includeKeywordMatch = textUpToCursor.match(/#in\w*$/);
    if (includeKeywordMatch) {
        return {
            type: 'include-keyword',
            prefix: includeKeywordMatch[0],
            from: pos - includeKeywordMatch[0].length
        };
    }

    const includeHeaderMatch = textUpToCursor.match(/^\s*#include\s*[<"]([^>"'\r\n]*)$/);
    if (includeHeaderMatch) {
        const prefix = includeHeaderMatch[1] || '';
        const openDelimiter = textUpToCursor[textUpToCursor.length - prefix.length - 1] || '<';
        return {
            type: 'headers',
            prefix,
            from: pos - prefix.length,
            openDelimiter,
            closeDelimiter: openDelimiter === '"' ? '"' : '>'
        };
    }

    return null;
}

// Detects whether completion is happening in function-name or parameter context.
function detectParenContext(textUpToCursor) {
    let counter = 0;
    let openParenIndex = -1;

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

    if (openParenIndex === -1) {
        const match = textUpToCursor.match(/[\w]+$/);
        const prefix = match ? match[0] : '';
        return { type: 'functions', prefix };
    }

    const textBeforeParen = textUpToCursor.slice(0, openParenIndex);
    const funcMatch = textBeforeParen.match(/[\w]+$/);
    const funcName = funcMatch ? funcMatch[0] : '';

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

    const prefixMatch = innerText.match(/[\w]+$/);
    const prefix = prefixMatch ? prefixMatch[0] : '';

    return {
        type: 'constants',
        funcName,
        paramIndex: commaCount.toString(),
        prefix
    };
}

// Extracts variable names from the cached document snapshot to avoid repeated full rescans.
function extractVariables(source) {
    if (typeof source === 'string') {
        const lineEntries = source.split('\n').map((lineText) => createLineVariableEntry(lineText));
        return buildVariableListFromLineEntries(lineEntries);
    }

    return getAutocompleteDocCache(source).variables;
}

// Performs simple ordered-character fuzzy matching for autocomplete filtering.
function fuzzyMatch(str, pattern) {
    let patternIndex = 0;
    for (let i = 0; i < str.length && patternIndex < pattern.length; i++) {
        if (str[i] === pattern[patternIndex]) {
            patternIndex++;
        }
    }
    return patternIndex === pattern.length;
}

// Builds and caches the base set of function completion options.
function buildFunctionOptions() {
    if (cachedFunctionOptions) {
        return cachedFunctionOptions;
    }

    cachedFunctionOptions = Object.entries(functionsMap).map(([name, func]) => ({
        label: name,
        detail: '()',
        type: 'function',
        boost: func.boost ?? 0,
        info: () => {
            const d = buildTooltipHTML(func.info);
            return { dom: d };
        },
        apply: (view, completion, from, to) => {
            const isInside = func.cursor === 'inside';
            const insertText = name + '()';
            const activeParamIndex = isInside ? 0 : null;

            view.dispatch({
                changes: { from, to, insert: insertText },
                selection: { anchor: from + name.length + (isInside ? 1 : 2) }
            });

            view.dispatch({
                effects: showSelectionTooltip.of({ name, activeParamIndex })
            });
        }
    }));

    return cachedFunctionOptions;
}

// Step 3: Detect token context at cursor (e.g. comments, strings, preprocessor, include).
function detectContext(state, pos, source) {
    const line = state.doc.lineAt(pos);
    const textUpToCursor = line.text.slice(0, pos - line.from);

    if (isLineComment(textUpToCursor)) {
        return { type: 'comment' };
    }

    if (isInsideBlockComment(source, pos)) {
        return { type: 'comment' };
    }

    if (isInsideString(textUpToCursor)) {
        return { type: 'string' };
    }

    const includeContext = detectIncludeContext(textUpToCursor, pos);
    if (includeContext) {
        return includeContext;
    }

    const preprocessorMatch = textUpToCursor.match(/#\w*$/);

    if (preprocessorMatch) {
        return {
            type: 'preprocessor',
            prefix: preprocessorMatch[0],
            from: pos - preprocessorMatch[0].length
        };
    }

    return detectParenContext(textUpToCursor, pos);
}

// Steps 4 & 5: Gather candidate completion options based on detected context.
function getCompletions(context) {
    const state = context.state;
    const pos = context.pos;
    const docCache = getAutocompleteDocCache(state);
    const source = docCache.source;
    const currentWord = context.matchBefore(/\w*/);
    const boilerplateTrigger = getBoilerplateTrigger(source, currentWord);

    if (boilerplateTrigger && pos >= boilerplateTrigger.from && pos <= boilerplateTrigger.to) {
        return {
            from: boilerplateTrigger.from,
            options: [{
                label: BOILERPLATE_LABEL,
                detail: 'graphics.h template',
                type: 'keyword',
                boost: 1000,
                apply: (view) => {
                    view.dispatch({
                        changes: { from: 0, to: view.state.doc.length, insert: BOILERPLATE_TEMPLATE },
                        selection: { anchor: BOILERPLATE_TEMPLATE.length }
                    });
                }
            }],
            validFor: /^\w*$/i
        };
    }

    if (!dataLoaded) return null;

    const detected = detectContext(state, pos, source);

    if (detected.type !== 'headers') {
        pendingIncludeHeaderSuggestions = false;
    }

    if (detected.type === 'string' || detected.type === 'comment') {
        return null;
    }

    if (detected.type === 'include-keyword') {
        return {
            from: detected.from,
            options: [{
                label: INCLUDE_DIRECTIVE,
                detail: '<header.h>',
                type: 'keyword',
                apply: (view, completion, from, to) => {
                    pendingIncludeHeaderSuggestions = true;
                    view.dispatch({
                        changes: { from, to, insert: '#include <>' },
                        selection: { anchor: from + '#include <'.length }
                    });

                    if (typeof startAutocomplete === 'function') {
                        setTimeout(() => startAutocomplete(view), 0);
                    }
                }
            }],
            validFor: /^#\w*$/
        };
    }

    if (detected.type === 'headers') {
        const useStarterList = !detected.prefix && pendingIncludeHeaderSuggestions;
        if (!detected.prefix && !useStarterList) {
            return null;
        }

        const headerSuggestions = getHeaderSuggestions(source, detected.prefix, useStarterList);
        pendingIncludeHeaderSuggestions = false;

        if (!headerSuggestions.length) {
            return null;
        }

        return {
            from: detected.from,
            options: buildHeaderOptions(headerSuggestions, useStarterList, detected.closeDelimiter),
            validFor: /^[\w/]*$/
        };
    }

    if (detected.type === 'preprocessor') {
        return null;
    }

    const word = currentWord;
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
        const prefix = (detected.prefix || '').toLowerCase();
        const functionOptions = buildFunctionOptions().filter((option) => (
            !prefix || fuzzyMatch(option.label.toLowerCase(), prefix)
        ));
        const variableOptions = docCache.variables
            .filter((name) => !prefix || fuzzyMatch(name.toLowerCase(), prefix))
            .map((name) => ({
                label: name,
                type: 'variable',
                boost: -2
            }));
        const snippetOptions = Object.values(SNIPPETS)
            .filter((snippet) => !prefix || fuzzyMatch(snippet.label.toLowerCase(), prefix));

        const options = [...snippetOptions, ...functionOptions, ...variableOptions];

        return {
            from: word.from,
            options,
            validFor: /^\w*$/
        };
    } else if (detected.type === 'constants') {
        const func = functionsMap[detected.funcName];
        if (!func) {
            return null;
        }

        if (!func.accepts || !func.accepts[detected.paramIndex]) {
            // Known function, but no constants for this parameter
            return null;
        }

        const cacheKey = detected.funcName + ':' + detected.paramIndex;
        if (constantCache.has(cacheKey)) {
            return {
                from: word.from,
                options: constantCache.get(cacheKey),
                validFor: /^\w*$/
            };
        }

        // Allowed groups for this parameter
        const groups = func.accepts[detected.paramIndex];
        const options = [];
        const seen = new Set();

        for (const group of groups) {
            const constants = constantsMap[group] || [];
            for (const constant of constants) {
                if (seen.has(constant)) continue;
                seen.add(constant);
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

        constantCache.set(cacheKey, options);

        return {
            from: word.from,
            options,
            validFor: /^\w*$/
        };
    }

    return null;
}

// Step 6: Render documentation hover tooltips.
function buildTooltipHTML(info, activeParamIndex, state) {
    const dom = document.createElement('div');
    dom.className = 'cm-func-tooltip';

    let html = `<div class="tooltip-signature">${info.signature}</div>`;
    html += `<div class="tooltip-scroll-area">`;

    if (state && info.header) {
        const includedHeaders = getIncludedHeaders(state);
        if (!includedHeaders.has(info.header.toLowerCase())) {
            html += `<div class="tooltip-warning">⚠ Requires #include &lt;${info.header}&gt;</div>`;
        }
    }
    
    if (info.description) {
        html += `<div class="tooltip-description">${info.description}</div>`;
    }

    if (info.params && info.params.length > 0) {
        html += `<div class="tooltip-params">`;
        info.params.forEach((param, index) => {
            // Split param text by first '→' to extract the name
            const parts = param.split('→');
            const activeClass = index === activeParamIndex ? ' tooltip-param-active' : '';
            if (parts.length > 1) {
                const name = parts[0].trim();
                const desc = parts.slice(1).join('→').trim();
                html += `<div class="tooltip-param${activeClass}"><span class="tooltip-param-name">${name}</span> <span class="tooltip-param-arrow">→</span> <span class="tooltip-param-desc">${desc}</span></div>`;
            } else {
                html += `<div class="tooltip-param${activeClass}">${param}</div>`;
            }
        });
        html += `</div>`;
    }
    
    html += `</div>`;

    dom.innerHTML = html;
    return dom;
}

let showSelectionTooltip;
let hideSelectionTooltip;

// Setup CodeMirror autocomplete extensions and state fields.
window.setupAutocomplete = function (editorView) {
    const { hoverTooltip, showTooltip } = cmModules.view;
    const { StateField, StateEffect } = cmModules.state;
    const { autocompletion, startCompletion, snippet } = cmModules.autocomplete;

    startAutocomplete = startCompletion;
    applySnippet = snippet;

    showSelectionTooltip = StateEffect.define();
    hideSelectionTooltip = StateEffect.define();
    autocompleteCacheField = StateField.define({
        create(state) {
            // Cache source/variables once up front so autocomplete reads cheap derived data later.
            return buildAutocompleteDocCache(state.doc);
        },
        update(value, tr) {
            if (!tr.docChanged) {
                return value;
            }

            // Recompute only the changed lines on content edits, paste, undo, and redo.
            return updateAutocompleteDocCache(value, tr);
        }
    });

    const hoverTooltipSource = hoverTooltip((view, pos, side) => {
        if (!dataLoaded) return null;
        const source = getAutocompleteDocCache(view.state).source;
        const detected = detectContext(view.state, pos, source);
        const word = view.state.wordAt(pos);
        if (!word) return null;
        const name = view.state.sliceDoc(word.from, word.to);
        const func = functionsMap[name];
        if (!func || !func.info) return null;
        const activeParamIndex = detected.type === 'constants' && detected.funcName === name
            ? parseInt(detected.paramIndex, 10)
            : undefined;
        return {
            pos: word.from, end: word.to, above: false,
            create() { return { dom: buildTooltipHTML(func.info, activeParamIndex, view.state) }; }
        };
    }, { hoverTime: 80 });

    const selectionTooltipField = StateField.define({
        create() { return null; },
        update(tooltip, tr) {
            if (tr.docChanged || tr.selection) return null;
            for (const e of tr.effects) { if (e.is(hideSelectionTooltip)) return null; }
            for (const e of tr.effects) {
                if (e.is(showSelectionTooltip)) {
                    const func = functionsMap[e.value.name];
                    if (func && func.info) {
                        return {
                            pos: tr.state.selection.main.head, above: false,
                            create() {
                                return {
                                    dom: buildTooltipHTML(func.info, e.value.activeParamIndex, tr.state)
                                };
                            }
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
            backgroundColor: "#1d1f23",
            border: "1px solid rgba(120, 142, 166, 0.16)",
            borderRadius: "16px",
            padding: "7px",
            boxShadow: "0 18px 30px rgba(0,0,0,0.30)",
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: "13px",
            minWidth: "210px",
            maxWidth: "260px"
        },
        ".cm-tooltip.cm-tooltip-autocomplete > ul": {
            margin: "0",
            padding: "0",
            minWidth: "196px",
            maxWidth: "246px"
        },
        ".cm-tooltip-autocomplete ul::-webkit-scrollbar": {
            width: "8px"
        },
        ".cm-tooltip-autocomplete ul::-webkit-scrollbar-track": {
            background: "transparent"
        },
        ".cm-tooltip-autocomplete ul::-webkit-scrollbar-thumb": {
            backgroundColor: "#3f4854",
            borderRadius: "999px",
            border: "2px solid #1d1f23"
        },
        ".cm-tooltip-autocomplete ul::-webkit-scrollbar-thumb:hover": {
            backgroundColor: "#556171"
        },
        ".cm-tooltip.cm-tooltip-autocomplete > ul > li": {
            padding: "8px 11px",
            color: "#d8e0ea",
            borderRadius: "12px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            lineHeight: "1.3",
            minHeight: "32px",
            margin: "2px 0"
        },
        ".cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]": {
            backgroundColor: "rgba(var(--color-rgb-primary, 0, 255, 136), 0.11)",
            outline: "1px solid rgba(var(--color-rgb-primary, 0, 255, 136), 0.18)",
            color: "#ffffff",
        },
        ".cm-completionIcon": {
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "14px",
            height: "14px",
            marginRight: "0",
            opacity: "0.78",
            flexShrink: "0"
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
        ".cm-completionIcon-variable::after": {
            content: "'v'",
            color: "#9cdcfe",
            fontFamily: "monospace",
            fontSize: "12px"
        },
        ".cm-completionMatchedText": {
            color: "#86f7b2",
            textDecoration: "none",
            fontWeight: "bold",
        },
        ".cm-completionLabel": {
            fontSize: "13px",
            lineHeight: "1.25"
        },
        ".cm-completionDetail": {
            color: "#8b97a6",
            fontStyle: "normal",
            marginLeft: "4px",
            fontSize: "11px",
            fontFamily: "'JetBrains Mono', monospace"
        },
        // Function tooltip card
        ".cm-func-tooltip": {
            backgroundColor: "#252526",
            border: "1px solid #454545",
            borderRadius: "6px",
            overflow: "hidden",
            maxWidth: "400px",
            maxHeight: "220px",
            display: "flex",
            flexDirection: "column",
            boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
            fontFamily: "system-ui, -apple-system, sans-serif",
            color: "#cccccc",
        },
        ".tooltip-signature": {
            backgroundColor: "#1e1e1e",
            borderBottom: "1px solid #454545",
            padding: "8px 12px",
            color: "#dcdcaa",
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: "12.5px",
            flexShrink: 0
        },
        ".tooltip-scroll-area": {
            overflowY: "auto",
            flex: 1
        },
        ".tooltip-warning": {
            color: "#ffcc00",
            fontSize: "11px",
            padding: "8px 12px",
            borderBottom: "1px solid #454545"
        },
        ".tooltip-scroll-area::-webkit-scrollbar": {
            width: "6px"
        },
        ".tooltip-scroll-area::-webkit-scrollbar-track": {
            background: "transparent"
        },
        ".tooltip-scroll-area::-webkit-scrollbar-thumb": {
            backgroundColor: "#424242",
            borderRadius: "4px"
        },
        ".tooltip-scroll-area::-webkit-scrollbar-thumb:hover": {
            backgroundColor: "#4f4f4f"
        },
        ".tooltip-description": {
            padding: "10px 12px 6px",
            color: "#cccccc",
            fontSize: "12px",
            lineHeight: "1.4",
        },
        ".tooltip-params": {
            padding: "4px 12px 10px",
            display: "flex",
            flexDirection: "column",
            gap: "6px",
        },
        ".tooltip-param": {
            color: "#cccccc",
            fontSize: "12px",
            lineHeight: "1.4",
            display: "flex",
            alignItems: "flex-start",
            gap: "6px"
        },
        ".tooltip-param-name": {
            color: "#9cdcfe",
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: "12px",
            fontWeight: "normal",
            whiteSpace: "nowrap",
        },
        ".tooltip-param-active .tooltip-param-name": {
            color: "#ffcc00",
            fontWeight: "bold"
        },
        ".tooltip-param-arrow": {
            color: "#858585",
            fontSize: "12px",
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

    const autocompleteCompartment = new cmModules.state.Compartment();
    const tooltipCompartment = new cmModules.state.Compartment();

    const appSettings = (typeof loadAppSettings === 'function') ? loadAppSettings() : {};
    const initAc = appSettings?.editor?.autocomplete !== false;
    const initTt = appSettings?.editor?.hoverTooltips !== false;

    const acExtension = autocompletion({ override: [getCompletions] });
    const ttExtension = [hoverTooltipSource, selectionTooltipField, tooltipHideListener];

    editorView.dispatch({
        effects: cmModules.state.StateEffect.appendConfig.of([
            autocompleteCacheField,
            autocompleteCompartment.of(initAc ? acExtension : []),
            tooltipCompartment.of(initTt ? ttExtension : []),
            tooltipTheme
        ])
    });

    document.addEventListener('editor-settings-changed', (event) => {
        const settings = event.detail?.settings?.editor || {};
        const enableAc = settings.autocomplete !== false;
        const enableTt = settings.hoverTooltips !== false;
        
        editorView.dispatch({
            effects: [
                autocompleteCompartment.reconfigure(enableAc ? acExtension : []),
                tooltipCompartment.reconfigure(enableTt ? ttExtension : [])
            ]
        });
    });
};
