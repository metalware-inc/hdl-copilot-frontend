import * as vscode from 'vscode';
import * as os from 'os';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { getPreferencesViewContent } from './preferences_view';
import { debounce } from 'lodash'; // You might need to install lodash or lodash.debounce
import * as projectView from './project_view';
import * as codegenUtils from './codegen_utils';
import {sendTlm, setExtensionVersion, setLicenseKey} from './tlm';

import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    State
} from 'vscode-languageclient/node';
import { isExcludedImpl } from './helpers';

const DOT_FILE: string = ".hdl-project" // used to detect Metalware HDL projects

let client: LanguageClient | null;
let projectDir: string | null = null;
let chunkBuffer: string = '';
let statusBarItem: vscode.StatusBarItem;
let serverProcess: any;
let serverPid: number;
let streamChunkCount: number = 0;

export function getProjectDir() {
    return projectDir;
}

function getOSDependentBinaryPath(context: vscode.ExtensionContext, binaryName: string): string {
    const binaryBasePath = 'bin/';
    let binaryPath: string;

    switch (os.platform()) {
        case 'win32':
            binaryPath = binaryBasePath + 'windows/' + binaryName + '.exe';
            break;
        case 'darwin':
            binaryPath = binaryBasePath + 'macos/' + binaryName;
            break;
        case 'linux':
            binaryPath = binaryBasePath + 'linux/' + binaryName;
            break;
        default:
            return "unknown";
    }

    binaryPath = path.join(context.extensionPath, binaryPath);
    return binaryPath;
}

function showError(err: string, ...args: any[]): Thenable<string | undefined> {
    return vscode.window.showErrorMessage('[HDL Copilot] ' + err, ...args);
}

function showInfo(info: string, ...args: any[]): Thenable<string | undefined> {
    return vscode.window.showInformationMessage('[HDL Copilot] ' + info, ...args);
}

function showWarning(warning: string, ...args: any[]): Thenable<string | undefined> {
    return vscode.window.showWarningMessage('[HDL Copilot] ' + warning, ...args);
}

class SystemVerilogFormatter implements vscode.DocumentFormattingEditProvider {
    private context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    provideDocumentFormattingEdits(document: vscode.TextDocument): Promise<vscode.TextEdit[]> {
        return new Promise((resolve, reject) => {
            const binaryPath = getOSDependentBinaryPath(this.context, 'verible-verilog-format');

            const proc = spawn(binaryPath, ["-"]);
            let stdout = '';
            let stderr = '';

            proc.stdout.on('data', (data: any) => {
                stdout += data.toString();
            });

            proc.stderr.on('data', (data: any) => {
                stderr += data.toString();
            });

            proc.on('close', (retcode: any) => {
                if (stderr !== '') {
                    // If there is an error, show it to the user and do not replace the document
                    showError(`Error during formatting: ${stderr}`);
                    return reject(stderr);
                }

                if (retcode === 0) {
                    const fullRange = new vscode.Range(
                        document.lineAt(0).range.start,
                        document.lineAt(document.lineCount - 1).range.end
                    );
                    resolve([vscode.TextEdit.replace(fullRange, stdout)]);
                } else {
                    reject(`Formatter process exited with code ${retcode}`);
                }
            });

            proc.on('error', (error: any) => {
                showError(`Error running formatter: ${error.message}`);
                reject(error);
            });

            proc.stdin.write(document.getText());
            proc.stdin.end();
        });
    }
}

function enterLicenseKey() {
    // Only allow letters, numbers and dashes
    let resp = vscode.window.showInputBox({
        prompt: 'Enter your license key',
        validateInput: (text) => {
            if (!text.match(/^[a-zA-Z0-9-]+$/)) {
                return 'Only letters, numbers, and dashes are allowed in the license key.';
            }
            return null;
        }
    }).then((licenseKey) => {
        // Send to server
        if (client) {
            client.sendRequest('setLicenseKey', { licenseKey: licenseKey });
        }
    });

    if (!resp) {
        showError('No license key entered.');
    }
}

function getLogFilePath() {
    const logDirectory = process.platform === 'win32' ? (process.env.USERPROFILE || 'C:\\Logs') : '/tmp';

    console.log("Log directory is: ", logDirectory);

    // Create the log directory if it does not exist
    if (!fs.existsSync(logDirectory)) {
        fs.mkdirSync(logDirectory, { recursive: true });
    }

    const logFileName = 'hdl-server-' + serverPid.toString() + '.log';
    const logFilePath = path.join(logDirectory, logFileName);
    return logFilePath;
}

function sendLastNLogLines() {
    const logFilePath = getLogFilePath();
    const lines = fs.readFileSync(logFilePath, 'utf-8').split('\n');
    const lastNLines = lines.slice(-200).join('\n');
    sendTlm('log_file', { contents: lastNLines, file_path: logFilePath });
}

async function setupLspClient(context: vscode.ExtensionContext) {
    if (!projectDir) {
        console.log("No HDL project detected. Please set a folder as an HDL project before starting the HDL server.");
        return;
    }

    if (client) {
        client.diagnostics?.clear();
        sendProjectPath(projectDir || '');
        sendTlm('changed_projects');
        return;
    }

    // Create an IPC connection to the server
    const serverOptions: ServerOptions = async () => {
        const serverPath = getOSDependentBinaryPath(context, 'hdl_copilot_server');

        // If linux, run unpack.sh and wait for it to finish.
        if (os.platform() === 'linux') {
            const scriptPath = getOSDependentBinaryPath(context, 'unpack.sh');
            const unpackProcess = spawn(scriptPath, [], { cwd: scriptPath.substring(0, scriptPath.lastIndexOf('/')) });
            console.log("Unpacking server..");
            await new Promise((resolve, reject) => {
                unpackProcess.on('close', (code) => {
                    if (code === 0) {
                        resolve("Unpacked server successfully");
                    } else {
                        showError("Failed to unpack server");
                        reject(new Error("Failed to unpack server"));
                    }
                });
            });
            console.log("Unpacked server finished");
        }

        // start process
        serverProcess = spawn(serverPath, []);
        serverPid = serverProcess.pid;
        if (!serverProcess) {
            sendTlm('failed_to_start_server_process');
            throw new Error("Failed to start server process");
        }

        serverProcess.on('exit', (code:any, signal:any) => {
            sendTlm('server_process_exited', { code: code, signal: signal });
            if (code !== 0) {
                console.log('Server process exited with code:', code, signal);
                sendLastNLogLines();
                updateLspStatus(CopilotState.Stopped);
            } 
        });

        // Return StreamInfo that connects to the server process' stdin/stdout
        return {
            reader: serverProcess.stdout,
            writer: serverProcess.stdin
        };
    };

    // Options to control the language client
    const clientOptions: LanguageClientOptions = {
        // Register the server for plain text documents
        documentSelector: [ 
            {scheme: 'file', language: 'SystemVerilog'},
            {scheme: 'file', language: 'systemverilog'},
            {scheme: 'file', language: 'verilog'},
            {scheme: 'file', language: 'Verilog'}
         ],
    };

    // Create the language client and start the client.
    client = new LanguageClient(
        'hdlServer',
        'Metalware HDL LSP',
        serverOptions,
        clientOptions
    );

    client.onDidChangeState(async (event) => {
        console.log('LSP Client State Change:', event.newState);
        // If state is disconnected, kill the server
        if (event.newState == State.Stopped) {
            updateLspStatus(CopilotState.Stopped);
            sendCmd('shutdown', {});
        } else if (event.newState == State.Running) {
            sendProjectPath(projectDir || '');
            updateLspStatus(CopilotState.Running);
        }
    });

    client.onNotification('backend/warning', (params) => {
        showWarning(params.message);
        sendTlm('backend_warning', { warning: params.message });
    });

    client.onNotification('backend/exclusionsChanged', (_) => {
        updateDecorationProvider();
        sendCmd('recompile', {});
    });

    client.onNotification('backend/macrosChanged', (_) => {
        sendCmd('recompile', {});
    });

    client.onNotification('backend/projectStructureChanged', (_) => {
        projectView.refresh();
    });

    client.onNotification('backend/licenseMissing', (_) => {
        showError('License not found.', 'Get a free license', 'Enter License').then((selection) => {
            if (selection === 'Get a free license') {
                vscode.env.openExternal(vscode.Uri.parse('https://license.metalware.io/'));
            } else if (selection === 'Enter License') {
                enterLicenseKey();
            }
        });
        sendTlm('license_missing');
    });

    client.onNotification('backend/licenseInvalid', (_) => {
        showError('License is invalid. Please check your license configuration.');
        enterLicenseKey();
        sendTlm('license_invalid');
    });

    client.onNotification('backend/licenseValid', (_) => {
        showInfo('License has been activated.');
        sendTlm('license_activated');
    });

    client.onNotification('backend/cacheLicense', (params) => {
        setLicenseKey(params.key);
    });

    client.onNotification('backend/llmStreamChunk', async (params) => {
        chunkBuffer += params['chunk'];
        // Add each line chunk to the editor and remove it from the buffer
        if (chunkBuffer.indexOf("<eof>")) {
            chunkBuffer = chunkBuffer.replace('<eof>', '\n').replace('<EOF', '\n');
        }

        let lines = chunkBuffer.split('\n');
        for (let i = 0; i < lines.length - 1; i++) {
            const activeEditor = vscode.window.activeTextEditor;
            lines[i] = lines[i].replace('<eof>', '\n').replace('<EOF>', '\n').replace("`", "");
            if (activeEditor) {
                // remove selection and insert text
                if (activeEditor.selection) {
                    const prefixInsertionPoint = new vscode.Position(activeEditor.selection.start.line, 0);
                    const middleInsertionPoint = new vscode.Position(activeEditor.selection.end.line, activeEditor.selection.end.character);
                    // remove selection
                    await activeEditor.edit((editBuilder) => {
                        if (streamChunkCount == 0) {
                            editBuilder.insert(prefixInsertionPoint, '// [HDL Copilot: Suggested]\n// [HDL Copilot: Original]\n');
                            editBuilder.insert(middleInsertionPoint, '\n// [HDL Copilot: EOS]');
                        }
                    }).then(() => {
                        if (streamChunkCount == 0) {
                            // Move up between suggested and original
                            const lineAfterPrefix = new vscode.Position(prefixInsertionPoint.line + 1, 0);
                            activeEditor.selection = new vscode.Selection(lineAfterPrefix, lineAfterPrefix);
                        }
                    }).then(() => {
                        activeEditor.edit((editBuilder) => {
                            editBuilder.insert(activeEditor.selection.active, lines[i] + '\n');
                        });
                    });
                }
            }
            streamChunkCount++;
        }
        chunkBuffer = lines[lines.length - 1];
    });

    client.onNotification('backend/llmEof', (params) => {
        console.log('Received EOF: ', params);
        codegenUtils.cachePrompt(params['prompt']);
        updateLspStatus(CopilotState.Running);
    });

    client.start();
}

export function sendCmd(command: string, args: object): Promise<object> {
    if (client) {
        return client.sendRequest(command, args);
    } else {
        return Promise.reject(new Error('LSP client not initialized'));
    }
}

// Recursive function to search for the .proj file.
// Picks the higher most dot file in the tree if multiple dot files are present. TODO: tests
function findProjDirs(dir: string, maxDepth: number): string[] {
    let projDirs: string[] = [];

    if (maxDepth < 0) {
        return projDirs;
    }

    const maxFiles = 1000;
    let fileCount = 0;

    try {
        const files = fs.readdirSync(dir);
        for (const file of files) {
            fileCount++;
            if (fileCount > maxFiles) {
                console.error("Too many files in directory, skipping:", dir);
                sendTlm('too_many_files_in_directory', { dir: dir });
                break;
            }

            const filePath = path.join(dir, file);
            if (!fs.existsSync(filePath)) {
                continue;
            }

            const stat = fs.statSync(filePath);

            if (stat.isDirectory() && maxDepth > 0) {
                // If the file is a directory, search within it
                projDirs = projDirs.concat(findProjDirs(filePath, maxDepth - 1));
            } else if (file === DOT_FILE) {
                // If the file is a .proj file, add its parent dir's path to the list
                projDirs.push(dir);
            }
        }
    } catch (error) {
        sendTlm('error_while_searching_for_dot_file', { error: error });
        console.error("Error while searching for .hdl-project file:", error);
    }

    return projDirs;
}

function sendProjectPath(projectPath: string) { // Sends given path to the backend for synchronization.
    sendCmd('setProjectPath', { path: projectPath });
}

function sendReloadDotFile() {
    sendCmd('reloadDotFile', {});
}

function commitConfigToDotFile(config: Object) {
    const dotFilePath = path.join(projectDir || '', DOT_FILE);
    try {
        fs.writeFileSync(dotFilePath, JSON.stringify(config));
    } catch (error) {
        showError(`Error writing .hdl-project file: ${error}`);
    }
}

function setHDLProjectDir(loc: string) {
    projectDir = loc;
    projectView.refresh();
    vscode.commands.executeCommand('setContext', 'hdlProjectSelected', true);
    updateDecorationProvider();
    showInfo('Activated HDL project: ' + projectDir);
    sendTlm('project_set', {});
}

function isProjectDirSet(): boolean {
    return projectDir !== null;
}

// Tries to find the project directory and sets it if found. If not found, prompts the user to select a folder.
// If forcePrompt is true, the user is always prompted to select a folder (usually when the user wants to change the project).
async function determineHDLProject(forcePrompt: boolean = false): Promise<boolean> {
    if (!forcePrompt && isProjectDirSet()) {
        return true;
    }

    // Prompt user for workspace folder if more than one is open.
    let workspaceFolderPath = null;
    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length == 0) {
        sendTlm('no_workspace_folder_open_1');
        showError('Please open a folder to use the extension.');
        return false;
    }

    if (vscode.workspace.workspaceFolders.length > 1) {
        let tmp = await vscode.window.showWorkspaceFolderPick();
        if (!tmp) {
            showError('No workspace folder is selected.');
            sendTlm('no_workspace_folder_selected');
            return false;
        }
        workspaceFolderPath = tmp.uri.fsPath;
    } else if (vscode.workspace.workspaceFolders.length == 1) {
        // Use the only workspace folder
        workspaceFolderPath = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
        if (!workspaceFolderPath) {
            sendTlm('no_workspace_folder_open_2');
            return false;
        }
    } else {
        sendTlm('no_workspace_folder_open_3');
        return false;
    }

    // Check if project can be detected automatically.
    let projDirs = findProjDirs(workspaceFolderPath, 1);

    if (forcePrompt) {
        // Do not auto-detect project. Just ask the user to select a folder.
        projectDir = await promptUserForProjectDir(workspaceFolderPath, projDirs);
    } else {
        if (projDirs.length == 1) {
            // Select the only existing project found in the workspace.
            setHDLProjectDir(projDirs[0]);
            sendTlm('single_project_found_in_workspace', {});
            return true;
        } else if (projDirs.length > 1) {
            // Multiple projects found in the workspace, prompt user to select one.
            sendTlm('multiple_projects_found_in_workspace', { project_count: projDirs.length });
            projectDir = await promptUserForProjectDir(workspaceFolderPath, projDirs);
        } else {
            // No projects found in the workspace, do nothing.
            sendTlm('no_projects_found_in_workspace', {});
            return false;
        }
    }

    if (projectDir) {
        setHDLProjectDir(projectDir);
        return true;
    }

    sendTlm('no_project_determined', {});
    return false;
}

let decorationProviderDisposable: vscode.Disposable | undefined;

function updateDecorationProvider() {
    console.log("Updating decoration proivder..");
    if (decorationProviderDisposable) {
        decorationProviderDisposable.dispose();
        console.log("Disposing..");
    }

    decorationProviderDisposable = vscode.window.registerFileDecorationProvider({
        provideFileDecoration: async (uri) => {
            if (await isExcluded(uri)) {
                return {
                    badge: 'E',
                    label: 'E',
                    tooltip: 'Excluded from Compilation',
                    color: new vscode.ThemeColor('decoration.excluded')
                };
            } else if (uri.fsPath == projectDir) {
                return {
                    badge: 'P',
                    label: 'P',
                    tooltip: 'HDL Project',
                    color: new vscode.ThemeColor('decoration.projectDir')
                };
            }
            return undefined;
        }
    });
}

async function loadProjectConfigFromDotFile(): Promise<Object> {
    const dotFilePath = path.join(projectDir || '', DOT_FILE);
    try {
        const dotFileContent = await vscode.workspace.fs.readFile(vscode.Uri.file(dotFilePath));
        // Parse as a json file. If parsing fails, overwrite file as a json file.
        try {
            return JSON.parse(dotFileContent.toString());
        } catch (error) {
            console.error("Error parsing .hdl-project file:", error);
            fs.writeFile(dotFilePath, JSON.stringify({ libraryIncludes: [], projectSuppressions: [] }), (err) => {
                if (err) {
                    console.error("Error writing .hdl-project file:", err);
                }
            });
        }
    } catch (error) {
        console.error("Error reading .hdl-project file:", error);
    }
    return {};
}

let diagnosticCounts = new Map<string, number>();

const sendTelemetryDebounced = debounce(() => {
    let totalDiagnostics = Array.from(diagnosticCounts.values()).reduce((sum, count) => sum + count, 0);
    console.log("Total Diagnostic Count:", totalDiagnostics);
    sendTlm('diagnostic_count', { count: totalDiagnostics });
}, 3000); // Adjust the time as needed


function getFolders(dirPath: string) {
    try {
        return fs.readdirSync(dirPath, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => path.join(dirPath, dirent.name));
    } catch (e) {
        console.error(e);
        return [];
    }
}

function hasSubFolders(dirPath: string) {
    try {
        return fs.readdirSync(dirPath, { withFileTypes: true })
            .some(dirent => dirent.isDirectory());
    } catch (e) {
        console.error(e);
        return false;
    }
}

async function pickFolder(rootPath: string) {
    let currentPath = rootPath;
    let atRoot = true;

    while (true) {
        const folders = getFolders(currentPath);
        const pickItems = folders.map(folder => ({
            label: path.basename(folder),
            description: folder
        }));

        pickItems.unshift({ label: ".", description: currentPath });
        if (!atRoot) {
            pickItems.unshift({ label: "..", description: "Move up" });
        }

        const pick = await vscode.window.showQuickPick(pickItems, { placeHolder: 'HDL Copilot: Select project folder' });

        if (!pick) {
            return undefined; // User cancelled the selection
        }

        if (pick.description === "Move up") {
            const parentPath = path.dirname(currentPath);
            if (parentPath === currentPath) {
                return undefined; // at root, should not occur due to atRoot flag
            }
            currentPath = parentPath;
            atRoot = currentPath === rootPath;
            continue;
        } else if (pick.description === currentPath) {
            return currentPath; // Selected the current root
        }

        currentPath = pick.description;
        atRoot = false;

        if (!hasSubFolders(currentPath)) {
            return currentPath;
        }
    }
}

async function promptUserForProjectDir(rootPath: string, projectDirs: string[]): Promise<string | null> {
    // If existing projects are found, prompt user to select one or to create new
    // If he chooses to load some other folder instead, prompt for folder selection.
    // If no projects are found user, prompt for folder selection.
    // If nothing is selected, show error message.
    // Add options to create a new project or select a different folder (they perform the same action; they're just for user convenience)
    let selectedDir = null;

    if (projectDirs.length === 0) {
        // No projects were found, just prompt the user to select a folder.
        selectedDir = await pickFolder(rootPath);
    } else {
        // Show projects.
        let projectDirMap = [];
        for (let i = 0; i < projectDirs.length; i++) {
            projectDirMap.push({ label: path.basename(projectDirs[i]), description: "[HDL Project: " + projectDirs[i] + "] " });
        }
        // Additionally, show option to load some "other folder".
        projectDirMap.push({ label: "...", description: "  Other folder" });
        let option = await vscode.window.showQuickPick(projectDirMap || [], { placeHolder: 'HDL Copilot: Select existing project' });

        if (option?.label === "...") {
            selectedDir = await pickFolder(rootPath);
        } else {
            selectedDir = projectDirs.find((dir) => path.basename(dir) === option?.label);
        }
    }

    if (selectedDir) {
        const folderUri = vscode.Uri.file(selectedDir);
        const projFilePath = vscode.Uri.joinPath(folderUri, DOT_FILE); // Create .metalware-proj file
        if (!fs.existsSync(projFilePath.fsPath)) {
            await vscode.workspace.fs.writeFile(projFilePath, Buffer.from('{}'));
            console.log("Created .hdl-project file in ", folderUri.fsPath);
        }
    } else {
        // Show error message if no project folder was ever selected.
        if (!projectDir) {
            showError('No project selected. HDL copilot will not be enabled.');
        }
        return null;
    }
    return selectedDir;
}

export async function getPreferences(): Promise<{ macros: { name: string, value: string }[], projectSuppresions: string[] }> {
    let macros: { name: string, value: string }[] = [];
    let projectSuppressions: string[] = [];

    // Check if projectDir is set and read the .hdl-project file
    if (projectDir) {
        const dotFilePath = path.join(projectDir, DOT_FILE);
        try {
            const dotFileContent = await vscode.workspace.fs.readFile(vscode.Uri.file(dotFilePath));
            const dotFile = JSON.parse(dotFileContent.toString());
            console.log("Dot file is ", dotFile);
            macros = dotFile.macros || [];
            projectSuppressions = dotFile.projectSuppressions || [];
        } catch (error) {
            console.error("Error reading .hdl-project file:", error);
        }
    } else {
        showError('No HDL project detected. Please set a folder as an HDL project before opening preferences.');
    }
    return { macros: macros, projectSuppresions: projectSuppressions };
}

enum CopilotState {
    Running = 1,
    Stopped = 2,
    Error = 3,
    CodegenInprogress = 4,
}

function updateLspStatus(state: CopilotState) {
    if (state === CopilotState.Running) {
        statusBarItem.text = `$(check) HDL Copilot Active`;
        statusBarItem.tooltip = 'The HDL Copilot backend is running';
        statusBarItem.show();
    } else if (state === CopilotState.Stopped) {
        statusBarItem.text = `$(x) HDL Copilot Inactive`;
        statusBarItem.tooltip = 'The HDL Copilot backend is disconnected';
        statusBarItem.show();
    } else if (state === CopilotState.Error) {
        statusBarItem.text = `$(error) HDL Copilot Error`;
        statusBarItem.tooltip = 'The backend server has encountered an error';
        statusBarItem.show();
    } else if (state === CopilotState.CodegenInprogress) {
        statusBarItem.text = `$(sync~spin) HDL Copilot Codegen In Progress`;
        statusBarItem.tooltip = 'The backend server is generating code';
        statusBarItem.show();
    } else {
        statusBarItem.hide();
    }
}

export async function activate(context: vscode.ExtensionContext) {
    try {
        projectView.init(context);
        codegenUtils.init(context);

        let disposable = vscode.commands.registerCommand('extension.showExperimentalBox', () => {
            // Check if there's an active editor
            const editor = vscode.window.activeTextEditor;
            let placeholderText = "Generate SVA as per description";
            let selectedText = '';
            let prefix = '';
            let suffix = '';

            if (codegenUtils.containsPendingSuggestion()) {
                showError('Please accept or reject the pending suggestions before generating new code.');
                return;
            }

            if (editor) {
                const document = editor.document;
                const selection = editor.selection;
                const entireText = document.getText(); // Get the entire text of the document
                const startOffset = document.offsetAt(selection.start); // Get the start position of the selection
                const endOffset = document.offsetAt(selection.end); // Get the end position of the selection
                // Extract text before and after the selection or cursor position
                prefix = entireText.substring(0, startOffset);
                suffix = entireText.substring(endOffset);

                // Check if the selection is not empty
                if (!selection.isEmpty) {
                    placeholderText = "Modify as per description";
                    selectedText = document.getText(selection); // Retrieve the selected text
                }

                vscode.window.showInputBox({
                    placeHolder: placeholderText // Use the dynamic placeholder text
                }).then(async value => {
                    if (value) { // Check if some input was given
                        console.log(value);
                        // Prepare the command data
                        const commandData = {
                            query: value,
                            prefix: prefix,
                            suffix: suffix,
                            selection: selectedText
                        };
                        streamChunkCount = 0; // Reset stream chunk count
                        chunkBuffer = ''; // Reset chunk buffer
                        // Replace selection with empty string
                        editor?.edit(editBuilder => {
                        }).then(async () => {
                            // set status to loading
                            updateLspStatus(CopilotState.CodegenInprogress);
                            await sendCmd('llmRequest', commandData);
                        });
                    }
                });
            }
        });

        context.subscriptions.push(disposable);

        const extension = vscode.extensions.getExtension('metalware-inc.hdl-copilot');
        setExtensionVersion(extension?.packageJSON.version || 'unknown');

        // Create the status bar item and initially set it to invisible
        statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        statusBarItem.hide();
        context.subscriptions.push(statusBarItem);

        if (await determineHDLProject()) {
            await setupLspClient(context);
        }
        context.subscriptions.push(vscode.languages.onDidChangeDiagnostics(event => {
            event.uris.forEach(uri => {
                const diagnostics = vscode.languages.getDiagnostics(uri);
                diagnosticCounts.set(uri.toString(), diagnostics.length);
            });

            // Debounced call to send telemetry
            sendTelemetryDebounced();
        }));

        vscode.workspace.onDidChangeWorkspaceFolders(event => {
            if (client && client.diagnostics) {
                console.log("Clearing diagnostics - new workspace detected!");
                client.diagnostics.clear();
            }
            else {
                console.log("Client or diagnostics not found");
            }
        });

        updateDecorationProvider();

        context.subscriptions.push(vscode.commands.registerCommand('extension.sendDebugLog', async () => {
            sendLastNLogLines();
        }));

        // Register command for preferences
        context.subscriptions.push(vscode.commands.registerCommand('extension.openPreferences', async () => {

            const panel = vscode.window.createWebviewPanel(
                'preferencesView',
                'Preferences',
                vscode.ViewColumn.One,
                {
                    enableScripts: true // Enable scripts in the webview
                }
            );

            panel.webview.html = await getPreferencesViewContent();
            panel.webview.onDidReceiveMessage(
                async message => {
                    if (message.command === 'saveMacros') {
                        console.log("Received macros:", message, message.macros);
                        sendCmd('setMacros', { macros: message.macros });
                        sendTlm('project_macros', { macros: message.macros });
                    } else if (message.command === 'deleteSuppression') {
                        let configObj: any = await loadProjectConfigFromDotFile();
                        const suppressions = configObj.projectSuppressions || [];
                        suppressions.splice(message.index, 1);
                        commitConfigToDotFile(configObj);
                        sendReloadDotFile();
                        sendTlm('project_suppression_deleted', { current_project_suppressions: suppressions });
                    }
                    panel.webview.html = await getPreferencesViewContent();
                },
                undefined,
                context.subscriptions
            );
        }));

        let setSysVerilogProjectCmd = vscode.commands.registerCommand('extension.setSystemVerilogProject', async (uri?: vscode.Uri) => {
            if (!vscode.workspace.workspaceFolders) {
                showError('No workspace folder is open.');
                return;
            }

            if (await determineHDLProject(/* force prompt - do not auto-select project */ true)) {
                await setupLspClient(context);
            }
        });
        context.subscriptions.push(setSysVerilogProjectCmd);
        let _ = vscode.commands.registerCommand('extension.setLicense', enterLicenseKey);

        const formatter = new SystemVerilogFormatter(context);
        const selector: vscode.DocumentSelector = { scheme: 'file', language: 'SystemVerilog' };
        context.subscriptions.push(vscode.languages.registerDocumentFormattingEditProvider(selector, formatter));

        // Register the code action provider for SystemVerilog
        context.subscriptions.push(vscode.languages.registerCodeActionsProvider(selector, new SuppressDiagnosticsCodeActionProvider()));

        // Register custom commands for handling suppression
        context.subscriptions.push(vscode.commands.registerCommand('suppressDiagnosticLine', suppressDiagnosticLine));
        context.subscriptions.push(vscode.commands.registerCommand('suppressDiagnosticFile', suppressDiagnosticFile));
        context.subscriptions.push(vscode.commands.registerCommand('suppressDiagnosticProject', suppressDiagnosticProject));
    } catch (error) {
        sendTlm('extension_error', { error_message: error });
        throw error;
    }
}

async function isExcluded(uri: vscode.Uri): Promise<boolean> {
    if (!projectDir) {
        return false;
    }

    let configObj: any = await loadProjectConfigFromDotFile();
    return isExcludedImpl(uri.fsPath, configObj);
}

export async function getImports(): Promise<string[]> {
    let configObj: any = await loadProjectConfigFromDotFile();
    return configObj.imports || [];
}

export async function deactivate() {
    sendCmd('shutdown', {});

    if (serverProcess) {
        console.log('Terminating LSP server process...');
        await serverProcess.kill();
    }
    if (client) {
        client.stop();
    }
}

class SuppressDiagnosticsCodeActionProvider implements vscode.CodeActionProvider {
    public provideCodeActions(document: vscode.TextDocument, range: vscode.Range | vscode.Selection, context: vscode.CodeActionContext, token: vscode.CancellationToken): vscode.CodeAction[] {
        const documentName = path.basename(document.uri.fsPath);
        console.log("Code actions requested for:", documentName, context.diagnostics.length, "diagnostics");

        // Group diagnostics by line number
        const diagnosticsByLine = new Map<number, vscode.Diagnostic[]>();
        for (const diagnostic of context.diagnostics) {
            const lineNumber = diagnostic.range.start.line;
            if (!diagnosticsByLine.has(lineNumber)) {
                diagnosticsByLine.set(lineNumber, []);
            }
            diagnosticsByLine.get(lineNumber)?.push(diagnostic);
        }

        // Create suppress actions for each unique line
        const actions: vscode.CodeAction[] = [];
        diagnosticsByLine.forEach((diags, line) => {
            if (diags.length > 0) {
                actions.push(...this.createSuppressActions(document, line));
            }
        });

        return actions;
    }

    private createSuppressActions(document: vscode.TextDocument, line: number): vscode.CodeAction[] {
        // Create actions for line, file, and project suppression
        const suppressLine = this.createAction(`Suppress for Line`, 'suppressDiagnosticLine', document, line);
        const suppressFile = this.createAction(`Suppress for File`, 'suppressDiagnosticFile', document, line);
        const suppressProject = this.createAction(`Suppress for Project`, 'suppressDiagnosticProject', document, line);

        return [suppressLine, suppressFile, suppressProject];
    }

    private createAction(title: string, command: string, ...args: any[]): vscode.CodeAction {
        const action = new vscode.CodeAction(title, vscode.CodeActionKind.QuickFix);
        action.command = { title, command, arguments: args };
        return action;
    }
}

async function suppressDiagnosticLine(document: vscode.TextDocument, line: number): Promise<void> {
    // Logic to suppress diagnostic on the specified line
    showInfo(`Suppressing diagnostics on line ${line}`);
    try {
        const resp: object = await sendCmd('getDiagnosticStringsForLine', { filePath: document.uri.fsPath, line });

        if (resp && "names" in resp) {
            console.log(`Diagnostic strings for line ${line}:`, resp);

            const lineText = document.lineAt(line).text;
            const newNames = (resp as any)["names"].join(', ');
            const edit = new vscode.WorkspaceEdit();

            if (lineText.includes("@suppress")) {
                // Line already contains an @suppress tag, update it with new names
                const updatedLine = lineText.replace(/@suppress\(([^)]*)\)/, (match, existingNames) => {
                    var existingNamesArr = []
                    if (existingNames.trim() != "") {
                        existingNamesArr = existingNames.split(', ')
                    }
                    const allNames = new Set(existingNamesArr.concat(newNames.split(', ')).map((name: string) => name.trim()));
                    return `@suppress(${Array.from(allNames).join(', ')})`;
                });
                edit.replace(document.uri, new vscode.Range(line, 0, line, lineText.length), updatedLine);
            } else if (lineText.includes("//")) {
                // Line contains a comment but no @suppress, append @suppress tag
                const updatedLine = lineText + ` @suppress(${newNames})`;
                edit.replace(document.uri, new vscode.Range(line, 0, line, lineText.length), updatedLine);
            } else {
                // Line does not contain a comment, append a new comment at the end of the line
                const newComment = ` // @suppress(${newNames})`;
                edit.insert(document.uri, new vscode.Position(line, lineText.length), newComment);
            }
            await vscode.workspace.applyEdit(edit);
            sendTlm('line_suppressions_added', { new_line_suppressions: newNames.split(', ') });
        }
    } catch (error) {
        console.error('Error while suppressing diagnostics:', error);
    }
}

async function suppressDiagnosticFile(document: vscode.TextDocument, line: number): Promise<void> {
    // Logic to suppress diagnostics in the entire file
    try {
        const resp: object = await sendCmd('getDiagnosticStringsForLine', { filePath: document.uri.fsPath, line });

        if (resp && "names" in resp) {
            console.log(`Diagnostic strings for line ${line}:`, resp);

            const newNames = (resp as any)["names"].join(', ');
            const edit = new vscode.WorkspaceEdit();

            const newComment = `// @file_suppress(${newNames})\n`;
            edit.insert(document.uri, new vscode.Position(0, 0), newComment);

            await vscode.workspace.applyEdit(edit);

            sendTlm('file_suppressions_added', { new_file_suppressions: newNames.split(', ') });
        }
    } catch (error) {
        console.error('Error while suppressing diagnostics:', error);
    }
}

async function suppressDiagnosticProject(document: vscode.TextDocument, line: number): Promise<void> {
    // Logic to suppress diagnostics in the entire project
    showInfo(`Suppressing diagnostics in project ${projectDir}`);

    // Logic to suppress diagnostics in the entire file
    try {
        const resp: any = await sendCmd('getDiagnosticStringsForLine', { filePath: document.uri.fsPath, line });
        if (resp && resp["names"]) {
            var config: any = await loadProjectConfigFromDotFile();
            if (!config.projectSuppressions) {
                config.projectSuppressions = [];
            }
            for (const name of resp["names"]) {
                if (!config.projectSuppressions.includes(name)) {
                    config.projectSuppressions.push(name);
                }
            }

            commitConfigToDotFile(config);
            sendReloadDotFile();
            sendTlm('project_suppressions_added', { all_project_suppressions: resp["names"] });
            console.log(`Diagnostic strings for line ${line}:`, resp);
        }
    } catch (error) {
        console.error('Error while suppressing diagnostics:', error);
    }
}