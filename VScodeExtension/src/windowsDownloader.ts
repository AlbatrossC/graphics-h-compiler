import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import fetch from 'node-fetch';
import AdmZip from 'adm-zip';

interface DownloadConfig {
    url: string;
    sha256?: string;
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

    private async verifyDownload(filePath: string, expectedHash: string): Promise<boolean> {
        if (!expectedHash) {
            return true;
        }

        try {
            const fileBuffer = fs.readFileSync(filePath);
            const hashSum = crypto.createHash('sha256');
            hashSum.update(fileBuffer);
            const actualHash = hashSum.digest('hex').toLowerCase();
            const expected = expectedHash.toLowerCase();

            if (actualHash !== expected) {
                console.error('Hash mismatch:');
                console.error('  Expected:', expected);
                console.error('  Actual:  ', actualHash);
                return false;
            }

            return true;
        } catch (error) {
            console.error('Error verifying download:', error);
            return false;
        }
    }

    private async downloadFromUrl(
        url: string,
        tempZip: string,
        progress: vscode.Progress<{ message?: string; increment?: number }>
    ): Promise<boolean> {
        try {
            progress.report({ message: 'Downloading MinGW32 toolchain...', increment: 5 });

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

            await this.streamToDisk(response, tempZip, progress, totalSize);

            if (this.MINGW_CONFIG.sha256) {
                progress.report({ message: 'Verifying integrity...', increment: 5 });
                const isValid = await this.verifyDownload(tempZip, this.MINGW_CONFIG.sha256);
                if (!isValid) {
                    throw new Error('Verification failed: Checksum mismatch');
                }
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
        totalSize: number
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            const fileStream = fs.createWriteStream(filePath);
            let downloadedSize = 0;
            let lastReportedPercent = 0;

            response.body.on('data', (chunk: Buffer) => {
                downloadedSize += chunk.length;
                const percent = Math.floor((downloadedSize / totalSize) * 100);

                if (percent >= lastReportedPercent + 5) {
                    const sizeMB = (downloadedSize / 1024 / 1024).toFixed(1);
                    const totalMB = (totalSize / 1024 / 1024).toFixed(1);

                    progress.report({
                        message: `Downloading: ${sizeMB}MB / ${totalMB}MB (${percent}%)`,
                        increment: 5
                    });

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

    private copyBundledGraphicsFiles(
        mingwPath: string,
        extensionPath: string,
        progress: vscode.Progress<{ message?: string; increment?: number }>
    ): void {
        progress.report({ message: 'Installing graphics.h files...', increment: 5 });

        const resourcesPath = path.join(extensionPath, 'resources', 'graphics');
        const includeDir = path.join(mingwPath, 'include');
        const libDir = path.join(mingwPath, 'lib');

        const files = [
            { name: 'graphics.h', targetDir: includeDir },
            { name: 'winbgim.h', targetDir: includeDir },
            { name: 'libbgi.a', targetDir: libDir }
        ];

        for (const file of files) {
            const sourceFile = path.join(resourcesPath, file.name);
            const targetFile = path.join(file.targetDir, file.name);

            if (!fs.existsSync(sourceFile)) {
                throw new Error(`Bundled file ${file.name} not found in extension resources`);
            }

            if (!fs.existsSync(file.targetDir)) {
                fs.mkdirSync(file.targetDir, { recursive: true });
            }

            fs.copyFileSync(sourceFile, targetFile);

            if (!fs.existsSync(targetFile)) {
                throw new Error(`Failed to copy ${file.name} to MinGW directory`);
            }
        }

        progress.report({ message: '✓ Graphics.h files installed', increment: 5 });
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

                    try {
                        progress.report({ message: 'Preparing installation...', increment: 5 });

                        if (!fs.existsSync(targetPath)) {
                            fs.mkdirSync(targetPath, { recursive: true });
                        }

                        await this.downloadFromUrl(this.MINGW_CONFIG.url, tempZip, progress);

                        progress.report({ message: 'Extracting MinGW32 toolchain...', increment: 30 });

                        const zip = new AdmZip(tempZip);
                        zip.extractAllTo(path.dirname(targetPath), true);

                        if (fs.existsSync(tempZip)) {
                            fs.unlinkSync(tempZip);
                        }

                        this.copyBundledGraphicsFiles(targetPath, extensionPath, progress);

                        progress.report({ message: 'Verifying installation...', increment: 10 });

                        const gppPath = path.join(targetPath, 'bin', 'g++.exe');
                        if (!fs.existsSync(gppPath)) {
                            throw new Error('MinGW installation verification failed');
                        }

                        progress.report({ message: 'Complete!', increment: 5 });

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
            '📦 ~220MB download, ~770MB disk space\n\n' +
            'Download and continue?',
            { modal: true },
            'Download',
            'Cancel'
        );

        return choice === 'Download';
    }

    updateConfig(config: Partial<DownloadConfig>): void {
        Object.assign(this.MINGW_CONFIG, config);
    }
}