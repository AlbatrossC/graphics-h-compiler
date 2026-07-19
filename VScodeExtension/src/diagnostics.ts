import * as path from 'path';

export type CompilationSeverity = 'error' | 'warning' | 'information';

export interface CompilationDiagnostic {
    file?: string;
    line?: number;
    column?: number;
    severity: CompilationSeverity;
    message: string;
}

const compilerDiagnosticPattern = /^(.*?):(\d+)(?::(\d+))?:\s*(fatal error|error|warning|note):\s*(.+)$/i;
const linkerErrorPattern = /(?:undefined reference to|collect2: error:|ld(?:\.exe)?: )/i;

export function parseCompilerOutput(output: string, workingDirectory: string): CompilationDiagnostic[] {
    const diagnostics: CompilationDiagnostic[] = [];

    for (const rawLine of output.split(/\r?\n/)) {
        const line = rawLine.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '');
        const match = compilerDiagnosticPattern.exec(line);

        if (match) {
            const [, file, lineNumber, columnNumber, kind, message] = match;
            diagnostics.push({
                file: resolveDiagnosticPath(file, workingDirectory),
                line: Number.parseInt(lineNumber, 10),
                column: columnNumber ? Number.parseInt(columnNumber, 10) : 1,
                severity: severityFor(kind),
                message: message.trim()
            });
            continue;
        }

        if (linkerErrorPattern.test(line)) {
            diagnostics.push({
                severity: 'error',
                message: line.trim()
            });
        }
    }

    return diagnostics;
}

function resolveDiagnosticPath(file: string, workingDirectory: string): string | undefined {
    if (!file || file.startsWith('<')) {
        return undefined;
    }

    return path.isAbsolute(file) ? file : path.resolve(workingDirectory, file);
}

function severityFor(kind: string): CompilationSeverity {
    if (kind.toLowerCase() === 'warning') {
        return 'warning';
    }

    if (kind.toLowerCase() === 'note') {
        return 'information';
    }

    return 'error';
}
