import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import fetch from 'node-fetch';
import AdmZip from 'adm-zip';

interface DownloadConfig {
    url: string;
    sha256: string;
}

interface InstallationProgress {
    lastPercent: number;
}

export class WindowsDownloader {
    private isDownloading = false;
    private downloadPromise: Promise<boolean> | null = null;

    private readonly MINGW_CONFIG: DownloadConfig = {
        url: 'https://github.com/AlbatrossC/graphics-h-compiler/releases/download/gcc-11.5.0-mingw32/mingw32.zip',
        sha256: '72a111d72772914b6db9fe506fe4f0bb8d21b721894e2690c89aee9521fb97cd'
    };

    isInProgress(): boolean {
        return this.isDownloading;
    }

    private reportProgress(
        progress: vscode.Progress<{ message?: string; increment?: number }>,
        state: InstallationProgress,
        stage: number,
        percent: number,
        message: string
    ): void {
        const overallPercent = Math.max(state.lastPercent, Math.min(100, Math.round(percent)));
        progress.report({
            message: `[${stage}/5] ${message} (${overallPercent}%)`,
            increment: overallPercent - state.lastPercent
        });
        state.lastPercent = overallPercent;
    }

    private async verifyDownload(
        filePath: string,
        expectedHash: string,
        progress: vscode.Progress<{ message?: string; increment?: number }>,
        state: InstallationProgress
    ): Promise<boolean> {
        return new Promise(resolve => {
            try {
                const totalSize = fs.statSync(filePath).size;
                const hashSum = crypto.createHash('sha256');
                const fileStream = fs.createReadStream(filePath);
                let verifiedSize = 0;
                let lastReportedPercent = 0;

                this.reportProgress(progress, state, 2, 60, 'Verifying download checksum: 0%');

                fileStream.on('data', (chunk: string | Buffer) => {
                    hashSum.update(chunk);
                    verifiedSize += Buffer.byteLength(chunk);
                    const verificationPercent = Math.floor((verifiedSize / totalSize) * 100);

                    if (verificationPercent >= lastReportedPercent + 10 || verificationPercent === 100) {
                        this.reportProgress(
                            progress,
                            state,
                            2,
                            60 + verificationPercent * 0.1,
                            `Verifying download checksum: ${verificationPercent}%`
                        );
                        lastReportedPercent = verificationPercent;
                    }
                });

                fileStream.on('end', () => {
                    const actualHash = hashSum.digest('hex').toLowerCase();
                    const expected = expectedHash.toLowerCase();

                    if (actualHash !== expected) {
                        console.error('Hash mismatch:');
                        console.error('  Expected:', expected);
                        console.error('  Actual:  ', actualHash);
                        resolve(false);
                        return;
                    }

                    resolve(true);
                });

                fileStream.on('error', error => {
                    console.error('Error verifying download:', error);
                    resolve(false);
                });
            } catch (error) {
                console.error('Error verifying download:', error);
                resolve(false);
            }
        });
    }

    private async downloadFromUrl(
        url: string,
        tempZip: string,
        progress: vscode.Progress<{ message?: string; increment?: number }>,
        state: InstallationProgress
    ): Promise<boolean> {
        try {
            this.reportProgress(progress, state, 1, 0, 'Downloading MinGW32 toolchain');

            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0',
                    'Accept': 'application/octet-stream'
                },
                redirect: 'follow'
            });

            if (!response.ok) {
                throw new Error(`Download failed: HTTP ${response.status} ${response.statusText}`);
            }

            const totalSize = parseInt(response.headers.get('content-length') || '0');

            if (totalSize === 0) {
                throw new Error('Could not determine file size');
            }

            await this.streamToDisk(response, tempZip, progress, state, totalSize);

            const isValid = await this.verifyDownload(tempZip, this.MINGW_CONFIG.sha256, progress, state);
            if (!isValid) {
                throw new Error('Verification failed: Checksum mismatch');
            }

            return true;

        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.error(`Download from ${url} failed:`, errorMsg);
            throw error;
        }
    }

    private async streamToDisk(
        response: any,
        filePath: string,
        progress: vscode.Progress<{ message?: string; increment?: number }>,
        state: InstallationProgress,
        totalSize: number
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            const fileStream = fs.createWriteStream(filePath);
            let downloadedSize = 0;
                let lastReportedPercent = -1;

            response.body.on('data', (chunk: Buffer) => {
                downloadedSize += chunk.length;
                const percent = Math.floor((downloadedSize / totalSize) * 100);

                if (percent >= lastReportedPercent + 2 || percent === 100) {
                    const sizeMB = (downloadedSize / 1024 / 1024).toFixed(1);
                    const totalMB = (totalSize / 1024 / 1024).toFixed(1);

                    this.reportProgress(
                        progress,
                        state,
                        1,
                        percent * 0.6,
                        `Downloading: ${sizeMB}MB / ${totalMB}MB (${percent}% downloaded)`
                    );

                    lastReportedPercent = percent;
                }
            });

            response.body.pipe(fileStream);

            fileStream.on('finish', () => {
                fileStream.close();
                resolve();
            });

            const cleanup = (error: Error) => {
                fileStream.close();
                if (fs.existsSync(filePath)) {
                    try { fs.unlinkSync(filePath); } catch { /* ignore cleanup error */ }
                }
                reject(error);
            };

            fileStream.on('error', cleanup);
            response.body.on('error', cleanup);
        });
    }

    private yieldToEventLoop(): Promise<void> {
        return new Promise(resolve => setImmediate(resolve));
    }

    private async extractToolchain(
        tempZip: string,
        targetPath: string,
        progress: vscode.Progress<{ message?: string; increment?: number }>,
        state: InstallationProgress
    ): Promise<void> {
        const zip = new AdmZip(tempZip);
        const entries = zip.getEntries().filter(entry => !entry.isDirectory);
        const targetDirectory = path.dirname(targetPath);
        let lastReportedPercent = -1;

        this.reportProgress(progress, state, 3, 70, `Extracting MinGW32 toolchain: 0/${entries.length} files`);

        for (let index = 0; index < entries.length; index++) {
            const entry = entries[index];
            zip.extractEntryTo(entry, targetDirectory, true, true);

            const extractionPercent = Math.floor(((index + 1) / entries.length) * 100);
            if (extractionPercent >= lastReportedPercent + 1 || index === entries.length - 1) {
                this.reportProgress(
                    progress,
                    state,
                    3,
                    70 + extractionPercent * 0.22,
                    `Extracting MinGW32 toolchain: ${index + 1}/${entries.length} files (${extractionPercent}%)`
                );
                lastReportedPercent = extractionPercent;
            }

            if ((index + 1) % 25 === 0) {
                await this.yieldToEventLoop();
            }
        }
    }

    private copyBundledGraphicsFiles(
        mingwPath: string,
        extensionPath: string,
        progress: vscode.Progress<{ message?: string; increment?: number }>,
        state: InstallationProgress
    ): void {
        const resourcesPath = path.join(extensionPath, 'resources', 'graphics');
        const includeDir = path.join(mingwPath, 'include');
        const libDir = path.join(mingwPath, 'lib');

        const files = [
            { sourceName: 'modified-graphics.h', targetName: 'graphics.h', targetDir: includeDir },
            { sourceName: 'winbgim.h', targetName: 'winbgim.h', targetDir: includeDir },
            { sourceName: 'libbgi.a', targetName: 'libbgi.a', targetDir: libDir }
        ];

        for (const [index, file] of files.entries()) {
            this.reportProgress(
                progress,
                state,
                4,
                92 + ((index + 1) / files.length) * 6,
                `Copying graphics files: ${index + 1}/${files.length} (${file.targetName})`
            );
            const sourceFile = path.join(resourcesPath, file.sourceName);
            const targetFile = path.join(file.targetDir, file.targetName);

            if (!fs.existsSync(sourceFile)) {
                throw new Error(`Bundled file ${file.sourceName} not found in extension resources`);
            }

            if (!fs.existsSync(file.targetDir)) {
                fs.mkdirSync(file.targetDir, { recursive: true });
            }

            fs.copyFileSync(sourceFile, targetFile);

            if (!fs.existsSync(targetFile)) {
                throw new Error(`Failed to copy ${file.sourceName} to MinGW directory`);
            }
        }

    }

    private verifyInstallation(
        targetPath: string,
        progress: vscode.Progress<{ message?: string; increment?: number }>,
        state: InstallationProgress
    ): void {
        const requiredFiles = [
            { path: path.join(targetPath, 'bin', 'g++.exe'), name: 'MinGW compiler' },
            { path: path.join(targetPath, 'include', 'graphics.h'), name: 'graphics.h' },
            { path: path.join(targetPath, 'include', 'winbgim.h'), name: 'winbgim.h' },
            { path: path.join(targetPath, 'lib', 'libbgi.a'), name: 'libbgi.a' }
        ];

        for (const [index, file] of requiredFiles.entries()) {
            this.reportProgress(
                progress,
                state,
                5,
                98 + ((index + 1) / requiredFiles.length) * 2,
                `Verifying installation: ${index + 1}/${requiredFiles.length} (${file.name})`
            );
            if (!fs.existsSync(file.path)) {
                throw new Error(`Installation verification failed: ${file.name} not found`);
            }
        }
    }

    async download(targetPath: string, extensionPath: string): Promise<boolean> {
        if (this.downloadPromise) {
            return this.downloadPromise;
        }

        this.isDownloading = true;

        this.downloadPromise = new Promise<boolean>((resolve) => {
            vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: 'Graphics.h Toolchain Setup (Windows)',
                    cancellable: false
                },
                async (progress) => {
                    const tempZip = path.join(targetPath, 'mingw32_temp.zip');
                    const progressState: InstallationProgress = { lastPercent: 0 };

                    try {
                        this.reportProgress(progress, progressState, 1, 0, 'Preparing installation');

                        if (!fs.existsSync(targetPath)) {
                            fs.mkdirSync(targetPath, { recursive: true });
                        }

                        await this.downloadFromUrl(this.MINGW_CONFIG.url, tempZip, progress, progressState);
                        await this.extractToolchain(tempZip, targetPath, progress, progressState);

                        if (fs.existsSync(tempZip)) {
                            fs.unlinkSync(tempZip);
                        }

                        this.copyBundledGraphicsFiles(targetPath, extensionPath, progress, progressState);
                        this.verifyInstallation(targetPath, progress, progressState);

                        vscode.window.showInformationMessage('✓ Graphics.h toolchain installed successfully!');

                        this.isDownloading = false;
                        this.downloadPromise = null;
                        resolve(true);

                    } catch (error) {
                        this.isDownloading = false;
                        this.downloadPromise = null;

                        if (fs.existsSync(tempZip)) {
                            try { fs.unlinkSync(tempZip); } catch { /* ignore */ }
                        }

                        const errorMsg = error instanceof Error ? error.message : String(error);

                        vscode.window.showErrorMessage(
                            `Toolchain setup failed: ${errorMsg}`,
                            'Retry',
                            'Report Issue'
                        ).then(choice => {
                            if (choice === 'Retry') {
                                this.downloadPromise = null;
                                this.download(targetPath, extensionPath);
                            } else if (choice === 'Report Issue') {
                                vscode.env.openExternal(
                                    vscode.Uri.parse('https://github.com/AlbatrossC/graphics-h-compiler/issues')
                                );
                            }
                        });

                        console.error('Installation error:', error);
                        resolve(false);
                    }
                }
            );
        });

        return this.downloadPromise;
    }

    async promptForPermission(): Promise<boolean> {
        const choice = await vscode.window.showInformationMessage(
            '⚙️ Graphics.h Compiler setup required\n\n' +
            'To compile graphics programs, a one-time setup is needed.\n' +
            '📦 ~220MB download, up to ~1GB disk space\n\n' +
            'Download and continue?',
            { modal: true },
            'Download'
        );

        return choice === 'Download';
    }

}
