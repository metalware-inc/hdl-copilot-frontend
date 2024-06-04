import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
//import {projectDir, sendAddDependentFolderRequest} from './core';
import * as core from './extension';
import { json } from 'stream/consumers';

interface FileItem {
    uri: vscode.Uri;
    isDirectory: boolean;
}

let projectViewProvider: ProjectViewProvider | undefined;

export function init (context: vscode.ExtensionContext) {
    // Add remove folder commands
    let addFolderCmd = vscode.commands.registerCommand('fileExplorer.addFolderToProject', async () => {
        await addFolderToProject();
    });
    context.subscriptions.push(addFolderCmd);

    let removeFolderCmd = vscode.commands.registerCommand('fileExplorer.removeFolderFromProject', async (obj: any) => {
        if (!obj.uri) {
            vscode.window.showErrorMessage('No folder selected');
            return;
        }

        await removeFolderFromProject(obj.uri.fsPath);
    });
    context.subscriptions.push(removeFolderCmd);

    // Inclusions and exclusions
    let excludePathCmd = vscode.commands.registerCommand('fileExplorer.excludeFromCompilation', async (obj) => {
        core.sendCmd('excludeResource', { path: obj.uri.fsPath });
    });
    let includePathCmd = vscode.commands.registerCommand('fileExplorer.includeInCompilation', async (obj) => {
        core.sendCmd('includeResource', { path: obj.uri.fsPath });
    });
    context.subscriptions.push(excludePathCmd);
    context.subscriptions.push(includePathCmd);

    // Register the project view
    projectViewProvider = new ProjectViewProvider();
    context.subscriptions.push(vscode.window.registerTreeDataProvider('projectView', projectViewProvider));
}

export function refresh() {
    // Add core.getDependentPaths at root of view
    projectViewProvider?.refresh();
}

async function addFolderToProject() {
    const folder = await vscode.window.showOpenDialog({
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: 'Add to Project'
    });

    if (folder && folder.length > 0) {
        // Send request to backend
        const folderPath = folder[0].fsPath;
        await core.sendCmd('compiler/addRootUnit', { path: folderPath });
    }
}

async function removeFolderFromProject(folderPath: string) {
    // Send request to backend
    console.log('Removing folder from project: ' + folderPath);
    await core.sendCmd('compiler/removeRootUnit', { path: folderPath });
}

export class ProjectViewProvider implements vscode.TreeDataProvider<FileItem> {
    dispose(){
        // Do nothing
    }

    async getChildren(element?: FileItem): Promise<FileItem[]> {
        if (element) {
            // Return the children of the directory
            const directoryPath = element.uri.fsPath;
            const children = await fs.readdir(directoryPath);
            return Promise.all(children.map(async name => {
                const filePath = path.join(directoryPath, name);
                const stat = await fs.stat(filePath);
                // Only display .sv files
                return { uri: vscode.Uri.file(filePath), isDirectory: stat.isDirectory() };
            })).then(files => files.filter(f => {
                // TODO: have backend provide hierarchy.
                return true;
            }));
        } else {
            const items: FileItem[] = [];
            // Fetch the project directory
            const projectDir = core.getProjectDir();
            if (projectDir) {
                items.push({ uri: vscode.Uri.file(projectDir), isDirectory: true });
            }

            // Fetch dependent paths
            const nonPrPaths = await core.getImports();
            for (const path of nonPrPaths) {
                items.push({ uri: vscode.Uri.file(path), isDirectory: true });
            }

            return items;
        }
    }

    getTreeItem(element: FileItem): vscode.TreeItem {
        const treeItem = new vscode.TreeItem(
            element.uri,
            element.isDirectory ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
        );

        const projectDir = core.getProjectDir();

        if (!projectDir) {
            treeItem.label = "No project directory set";
            return treeItem;
        }
    
        if (!element.uri.path.endsWith(projectDir)) {
            // Set a more user-friendly label for the project directory
            treeItem.label = path.basename(element.uri.fsPath);
            // Check if contained by project directory
            if (!element.uri.fsPath.includes(projectDir)) {
                treeItem.description = '[import:' + element.uri.fsPath + ']';
            }
        } else {
            // Label for the project directory itself
            treeItem.label = path.basename(element.uri.fsPath);
            // Append small attribute
            treeItem.description = "[principal]";
        }

        if (element.isDirectory) {
            treeItem.contextValue = 'projectFolder';
        } else {
            treeItem.contextValue = 'projectFile';
            treeItem.command = {
                command: 'vscode.open',
                title: 'Open File',
                arguments: [element.uri],
            };
        }
    
        return treeItem;
    }
    private _onDidChangeTreeData: vscode.EventEmitter<FileItem | undefined | void> = new vscode.EventEmitter<FileItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<FileItem | undefined | void> = this._onDidChangeTreeData.event;

    public refresh(): void {
        this._onDidChangeTreeData.fire();
    }
}