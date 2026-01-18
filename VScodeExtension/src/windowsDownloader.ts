import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import fetch from 'node-fetch';
import AdmZip from 'adm-zip';

interface DownloadConfig {
    url: string;
    sha256?: string;
    fallbackUrls?: string[];
}

export class WindowsDownloader {
    private isDownloading = false;
    private downloadPromise: Promise<boolean> | null = null;

    // Configuration for MinGW download
    private readonly MINGW_CONFIG: DownloadConfig = {
        url: 'https://www.dropbox.com/scl/fi/82j3vrao5my1w8amee44v/mingw32.zip?rlkey=0issjauibhxolr3iiypc5qpjc&e=2&st=x6obvlyq&dl=1',
        sha256: '',
        fallbackUrls: []
    };

    isInProgress(): boolean {
        return this.isDownloading;
    }

    // Verify downloaded file integrity using SHA256
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

    // Download from URL with fallback support
    private async downloadFromUrl(
        url: string,
        tempZip: string,
        progress: vscode.Progress<{ message?: string; increment?: number }>
    ): Promise<boolean> {
        try {
            progress.report({ 
                message: `Downloading MinGW32 toolchain...`,
                increment: 5
            });

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
                progress.report({ 
                    message: `Verifying integrity...`,
                    increment: 5
                });

                const isValid = await this.verifyDownload(tempZip, this.MINGW_CONFIG.sha256);
                if (!isValid) {
                    throw new Error(`Verification failed: Checksum mismatch`);
                }
            }

            return true;

        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.error(`Download from ${url} failed:`, errorMsg);
            throw error;
        }
    }

    // Stream download directly to disk
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

            fileStream.on('error', (error: Error) => {
                fileStream.close();
                if (fs.existsSync(filePath)) {
                    try {
                        fs.unlinkSync(filePath);
                    } catch (cleanupError) {
                        console.error('Failed to cleanup partial file:', cleanupError);
                    }
                }
                reject(error);
            });

            response.body.on('error', (error: Error) => {
                fileStream.close();
                if (fs.existsSync(filePath)) {
                    try {
                        fs.unlinkSync(filePath);
                    } catch (cleanupError) {
                        console.error('Failed to cleanup partial file:', cleanupError);
                    }
                }
                reject(error);
            });
        });
    }

    // Copy bundled graphics files to MinGW directories
    private copyBundledGraphicsFiles(
        mingwPath: string,
        extensionPath: string,
        progress: vscode.Progress<{ message?: string; increment?: number }>
    ): void {
        progress.report({
            message: "Installing graphics.h files...",
            increment: 5
        });

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

            // Create target directory if it doesn't exist
            if (!fs.existsSync(file.targetDir)) {
                fs.mkdirSync(file.targetDir, { recursive: true });
            }

            fs.copyFileSync(sourceFile, targetFile);

            if (!fs.existsSync(targetFile)) {
                throw new Error(`Failed to copy ${file.name} to MinGW directory`);
            }
        }

        progress.report({
            message: "✓ Graphics.h files installed",
            increment: 5
        });
    }

    // Main download and installation function for Windows
    async download(targetPath: string, extensionPath: string): Promise<boolean> {
        if (this.downloadPromise) {
            return this.downloadPromise;
        }

        this.isDownloading = true;

        this.downloadPromise = new Promise<boolean>((resolve) => {
            vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Graphics.h Toolchain Setup (Windows)",
                cancellable: false
            }, async (progress) => {
                const tempZip = path.join(targetPath, 'mingw32_temp.zip');

                try {
                    // Create target directory
                    progress.report({ 
                        message: "Preparing installation...",
                        increment: 5
                    });
                    
                    if (!fs.existsSync(targetPath)) {
                        fs.mkdirSync(targetPath, { recursive: true });
                    }

                    // Download MinGW32
                    const urlsToTry = [
                        this.MINGW_CONFIG.url,
                        ...(this.MINGW_CONFIG.fallbackUrls || [])
                    ];

                    let downloadSuccess = false;
                    let lastError: Error | null = null;

                    for (const url of urlsToTry) {
                        if (!url) continue;

                        try {
                            await this.downloadFromUrl(url, tempZip, progress);
                            downloadSuccess = true;
                            break;
                        } catch (error) {
                            lastError = error instanceof Error ? error : new Error(String(error));
                            
                            if (fs.existsSync(tempZip)) {
                                try {
                                    fs.unlinkSync(tempZip);
                                } catch (cleanupError) {
                                    console.error('Failed to delete partial zip:', cleanupError);
                                }
                            }

                            if (url !== urlsToTry[urlsToTry.length - 1]) {
                                console.log(`Trying fallback URL...`);
                                continue;
                            }
                        }
                    }

                    if (!downloadSuccess) {
                        throw lastError || new Error('All download URLs failed');
                    }

                    // Extract MinGW32
                    progress.report({ 
                        message: "Extracting MinGW32 toolchain...",
                        increment: 30
                    });

                    const zip = new AdmZip(tempZip);
                    zip.extractAllTo(path.dirname(targetPath), true);

                    // Clean up zip file
                    if (fs.existsSync(tempZip)) {
                        fs.unlinkSync(tempZip);
                    }

                    // Copy bundled graphics.h files
                    this.copyBundledGraphicsFiles(targetPath, extensionPath, progress);

                    // Verify installation
                    progress.report({ 
                        message: "Verifying installation...",
                        increment: 10
                    });

                    const gppPath = path.join(targetPath, 'bin', 'g++.exe');
                    if (!fs.existsSync(gppPath)) {
                        throw new Error('MinGW installation verification failed');
                    }

                    progress.report({ 
                        message: "Complete!",
                        increment: 5
                    });

                    vscode.window.showInformationMessage('✓ Graphics.h toolchain installed successfully!');

                    this.isDownloading = false;
                    this.downloadPromise = null;
                    resolve(true);

                } catch (error) {
                    this.isDownloading = false;
                    this.downloadPromise = null;

                    if (fs.existsSync(tempZip)) {
                        try {
                            fs.unlinkSync(tempZip);
                        } catch (cleanupError) {
                            console.error('Failed to delete partial zip:', cleanupError);
                        }
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
                                vscode.Uri.parse('https://github.com/YOUR_USERNAME/YOUR_REPO/issues')
                            );
                        }
                    });

                    console.error('Installation error:', error);
                    resolve(false);
                }
            });
        });

        return this.downloadPromise;
    }

    // Prompt user for permission to download
    async promptForPermission(): Promise<boolean> {
        const choice = await vscode.window.showInformationMessage(
            `⚙️ Graphics.h Compiler setup required\n\n` +
            `To compile graphics programs, a one-time setup is needed.\n` +
            `📦 ~220MB download, ~770MB disk space\n\n` +
            `Download and continue?`,
            { modal: true },
            'Download',
            'Cancel'
        );

        return choice === 'Download';
    }

    // Update download configuration
    updateConfig(config: Partial<DownloadConfig>): void {
        Object.assign(this.MINGW_CONFIG, config);
    }
}