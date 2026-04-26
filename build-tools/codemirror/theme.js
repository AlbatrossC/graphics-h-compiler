import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';

export const THEME_VSCODE_DARK = 'vscode-dark';
export const THEME_VSCODE_LIGHT = 'vscode-light';
export const THEME_MONOKAI = 'monokai';
export const THEME_GITHUB_DARK = 'github-dark';
export const THEME_SOLARIZED_DARK = 'solarized-dark';
export const THEME_ONE_DARK = 'one-dark';
export const THEME_NAMES = Object.freeze([
    THEME_VSCODE_DARK,
    THEME_VSCODE_LIGHT,
    THEME_MONOKAI,
    THEME_GITHUB_DARK,
    THEME_SOLARIZED_DARK,
    THEME_ONE_DARK
]);

const THEME_DATA = {
    [THEME_VSCODE_DARK]: {
        dark: true,
        bg: 'transparent',
        fg: '#f8f8f2',
        cursor: '#00ff88',
        activeLine: '#1a1a1a',
        gutterBg: '#151515',
        gutterFg: '#a0a0a0',
        gutterBorder: '#262626',
        selection: 'rgba(0, 255, 136, 0.15)',
        matchBracketBg: 'rgba(0, 255, 136, 0.25)',
        matchBracketOutline: 'rgba(0, 255, 136, 0.4)',
        highlights: [
            { tag: tags.keyword, color: '#f92672' },
            { tag: tags.name, color: '#f8f8f2' },
            { tag: tags.typeName, color: '#66d9ef' },
            { tag: tags.variableName, color: '#f8f8f2' },
            { tag: tags.propertyName, color: '#a6e22e' },
            { tag: tags.function(tags.variableName), color: '#a6e22e' },
            { tag: tags.string, color: '#e6db74' },
            { tag: tags.number, color: '#ae81ff' },
            { tag: tags.bool, color: '#ae81ff' },
            { tag: tags.comment, color: '#75715e' },
            { tag: tags.operator, color: '#f92672' },
            { tag: tags.bracket, color: '#f8f8f2' },
            { tag: tags.meta, color: '#f92672' },
            { tag: tags.processingInstruction, color: '#f92672' },
            { tag: tags.definition(tags.variableName), color: '#a6e22e' },
            { tag: tags.macroName, color: '#a6e22e' },
        ]
    },
    [THEME_VSCODE_LIGHT]: {
        dark: false,
        bg: 'transparent',
        fg: '#1a1a1a',
        cursor: '#00cc6a',
        activeLine: '#f0f0f0',
        gutterBg: '#f5f5f5',
        gutterFg: '#606060',
        gutterBorder: '#e0e0e0',
        selection: 'rgba(0, 204, 106, 0.2)',
        matchBracketBg: 'rgba(0, 204, 106, 0.2)',
        matchBracketOutline: 'rgba(0, 204, 106, 0.4)',
        highlights: [
            { tag: tags.keyword, color: '#7928a1' },
            { tag: tags.name, color: '#1a1a1a' },
            { tag: tags.typeName, color: '#0550ae' },
            { tag: tags.variableName, color: '#1a1a1a' },
            { tag: tags.propertyName, color: '#116329' },
            { tag: tags.function(tags.variableName), color: '#116329' },
            { tag: tags.string, color: '#0a3069' },
            { tag: tags.number, color: '#0550ae' },
            { tag: tags.bool, color: '#0550ae' },
            { tag: tags.comment, color: '#6e7781' },
            { tag: tags.operator, color: '#cf222e' },
            { tag: tags.bracket, color: '#1a1a1a' },
            { tag: tags.meta, color: '#cf222e' },
            { tag: tags.processingInstruction, color: '#cf222e' },
            { tag: tags.definition(tags.variableName), color: '#116329' },
            { tag: tags.macroName, color: '#116329' },
        ]
    },
    [THEME_MONOKAI]: {
        dark: true,
        bg: '#272822',
        fg: '#f8f8f2',
        cursor: '#f8f8f2',
        activeLine: '#313228',
        gutterBg: '#272822',
        gutterFg: '#a7a79b',
        gutterBorder: '#3e3d32',
        selection: 'rgba(97, 97, 82, 0.65)',
        matchBracketBg: 'rgba(253, 151, 31, 0.3)',
        matchBracketOutline: 'rgba(253, 151, 31, 0.6)',
        highlights: [
            { tag: tags.keyword, color: '#f92672' },
            { tag: tags.name, color: '#f8f8f2' },
            { tag: tags.typeName, color: '#66d9ef', fontStyle: 'italic' },
            { tag: tags.variableName, color: '#f8f8f2' },
            { tag: tags.propertyName, color: '#a6e22e' },
            { tag: tags.function(tags.variableName), color: '#a6e22e' },
            { tag: tags.string, color: '#e6db74' },
            { tag: tags.number, color: '#ae81ff' },
            { tag: tags.bool, color: '#ae81ff' },
            { tag: tags.comment, color: '#a6a28c' },
            { tag: tags.operator, color: '#f92672' },
            { tag: tags.bracket, color: '#f8f8f2' },
            { tag: tags.meta, color: '#f92672' },
            { tag: tags.processingInstruction, color: '#f92672' },
            { tag: tags.definition(tags.variableName), color: '#a6e22e' },
            { tag: tags.macroName, color: '#a6e22e' },
        ]
    },
    [THEME_GITHUB_DARK]: {
        dark: true,
        bg: '#0d1117',
        fg: '#e6edf3',
        cursor: '#58a6ff',
        activeLine: '#161b22',
        gutterBg: '#0d1117',
        gutterFg: '#8b949e',
        gutterBorder: '#21262d',
        selection: 'rgba(56, 139, 253, 0.35)',
        matchBracketBg: 'rgba(56, 139, 253, 0.2)',
        matchBracketOutline: 'rgba(56, 139, 253, 0.5)',
        highlights: [
            { tag: tags.keyword, color: '#ff7b72' },
            { tag: tags.name, color: '#e6edf3' },
            { tag: tags.typeName, color: '#79c0ff' },
            { tag: tags.variableName, color: '#e6edf3' },
            { tag: tags.propertyName, color: '#7ee787' },
            { tag: tags.function(tags.variableName), color: '#d2a8ff' },
            { tag: tags.string, color: '#a5d6ff' },
            { tag: tags.number, color: '#79c0ff' },
            { tag: tags.bool, color: '#79c0ff' },
            { tag: tags.comment, color: '#9aa4ae' },
            { tag: tags.operator, color: '#ff7b72' },
            { tag: tags.bracket, color: '#e6edf3' },
            { tag: tags.meta, color: '#ff7b72' },
            { tag: tags.processingInstruction, color: '#ff7b72' },
            { tag: tags.definition(tags.variableName), color: '#d2a8ff' },
            { tag: tags.macroName, color: '#7ee787' },
        ]
    },
    [THEME_SOLARIZED_DARK]: {
        dark: true,
        bg: 'transparent',
        fg: '#839496',
        cursor: '#859900',
        activeLine: '#073642',
        gutterBg: '#002b36',
        gutterFg: '#586e75',
        gutterBorder: '#073642',
        selection: 'rgba(7, 54, 66, 0.9)',
        matchBracketBg: 'rgba(133, 153, 0, 0.2)',
        matchBracketOutline: 'rgba(133, 153, 0, 0.5)',
        highlights: [
            { tag: tags.keyword, color: '#859900' },
            { tag: tags.name, color: '#839496' },
            { tag: tags.typeName, color: '#b58900' },
            { tag: tags.variableName, color: '#839496' },
            { tag: tags.propertyName, color: '#268bd2' },
            { tag: tags.function(tags.variableName), color: '#268bd2' },
            { tag: tags.string, color: '#2aa198' },
            { tag: tags.number, color: '#d33682' },
            { tag: tags.bool, color: '#d33682' },
            { tag: tags.comment, color: '#586e75' },
            { tag: tags.operator, color: '#859900' },
            { tag: tags.bracket, color: '#839496' },
            { tag: tags.meta, color: '#cb4b16' },
            { tag: tags.processingInstruction, color: '#cb4b16' },
            { tag: tags.definition(tags.variableName), color: '#268bd2' },
            { tag: tags.macroName, color: '#268bd2' },
        ]
    },
    [THEME_ONE_DARK]: {
        dark: true,
        bg: 'transparent',
        fg: '#abb2bf',
        cursor: '#528bff',
        activeLine: '#2c313c',
        gutterBg: '#282c34',
        gutterFg: '#636d83',
        gutterBorder: '#2c313c',
        selection: 'rgba(67, 76, 94, 0.6)',
        matchBracketBg: 'rgba(97, 175, 239, 0.2)',
        matchBracketOutline: 'rgba(97, 175, 239, 0.5)',
        highlights: [
            { tag: tags.keyword, color: '#c678dd' },
            { tag: tags.name, color: '#abb2bf' },
            { tag: tags.typeName, color: '#e5c07b' },
            { tag: tags.variableName, color: '#e06c75' },
            { tag: tags.propertyName, color: '#e06c75' },
            { tag: tags.function(tags.variableName), color: '#61afef' },
            { tag: tags.string, color: '#98c379' },
            { tag: tags.number, color: '#d19a66' },
            { tag: tags.bool, color: '#d19a66' },
            { tag: tags.comment, color: '#5c6370', fontStyle: 'italic' },
            { tag: tags.operator, color: '#56b6c2' },
            { tag: tags.bracket, color: '#abb2bf' },
            { tag: tags.meta, color: '#e06c75' },
            { tag: tags.processingInstruction, color: '#e06c75' },
            { tag: tags.definition(tags.variableName), color: '#61afef' },
            { tag: tags.macroName, color: '#61afef' },
        ]
    }
};

Object.values(THEME_DATA).forEach((theme) => {
    Object.freeze(theme.highlights);
    Object.freeze(theme);
});
Object.freeze(THEME_DATA);

const compiledThemeCache = new Map();
const activeThemeByView = new WeakMap();

export function isValidThemeName(themeName) {
    return THEME_NAMES.includes(themeName);
}

export function resolveThemeName(themeName) {
    return isValidThemeName(themeName) ? themeName : THEME_VSCODE_DARK;
}

function compileTheme(themeName) {
    const resolvedName = resolveThemeName(themeName);
    if (compiledThemeCache.has(resolvedName)) {
        return compiledThemeCache.get(resolvedName);
    }

    const t = THEME_DATA[resolvedName];
    const highlight = HighlightStyle.define(t.highlights);
    const editorTheme = EditorView.theme({
        '&': { backgroundColor: t.bg },
        '.cm-scroller': { backgroundColor: t.bg },
        '.cm-content': { color: t.fg },
        '.cm-cursor': { borderLeftColor: t.cursor },
        '.cm-activeLine': { backgroundColor: t.activeLine },
        '.cm-activeLineGutter': { backgroundColor: t.activeLine },
        '.cm-gutters': {
            backgroundColor: t.gutterBg,
            color: t.gutterFg,
            borderRight: `1px solid ${t.gutterBorder}`
        },
        '.cm-selectionBackground': { backgroundColor: `${t.selection} !important` },
        '&.cm-focused .cm-selectionBackground': { backgroundColor: `${t.selection} !important` },
        '.cm-matchingBracket': {
            backgroundColor: t.matchBracketBg,
            outline: `1px solid ${t.matchBracketOutline}`
        },
    }, { dark: t.dark });

    const compiled = [editorTheme, syntaxHighlighting(highlight)];
    compiledThemeCache.set(resolvedName, compiled);
    return compiled;
}

export function applyTheme(cmView, themeCompartment, themeName) {
    if (!cmView || !themeCompartment) return;
    const resolvedName = resolveThemeName(themeName);
    const activeTheme = activeThemeByView.get(cmView);

    if (activeTheme === resolvedName) return;

    const compiledTheme = compileTheme(resolvedName);
    cmView.dispatch({
        effects: themeCompartment.reconfigure(compiledTheme)
    });
    activeThemeByView.set(cmView, resolvedName);
}
