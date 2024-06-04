import * as vscode from 'vscode';
import { sendTlm } from './tlm';

let userPrompt = "";

export function cachePrompt(p: string) { userPrompt = p; }

const suggestedDecorationType = vscode.window.createTextEditorDecorationType({
  backgroundColor: 'rgba(67, 148, 58, 0.3)', // Green
  isWholeLine: true
});

const originalDecorationType = vscode.window.createTextEditorDecorationType({
  backgroundColor: 'rgba(255, 0, 0, 0.3)', // Red
  isWholeLine: true
});

function findRegexRanges(document: vscode.TextDocument, regexPattern: RegExp) {
  let text = document.getText();
  let matches;
  let ranges = [];
  while ((matches = regexPattern.exec(text)) !== null) {
    const start = document.positionAt(matches.index);
    const end = document.positionAt(matches.index + matches[0].length);
    ranges.push(new vscode.Range(start, end));
  }
  return ranges;
}

export function init(context: vscode.ExtensionContext) {
  // register commands for accept and reject changes
  let disposableAccept = vscode.commands.registerCommand('extension.acceptChanges', acceptChanges);
  let disposableReject = vscode.commands.registerCommand('extension.rejectChanges', rejectChanges);

  // highlight code
  let disposableHighlight = vscode.commands.registerCommand('extension.highlightCode', highlightCode);
  context.subscriptions.push(disposableHighlight);

  vscode.window.onDidChangeActiveTextEditor(editor => {
    if (editor) highlightCode();
  }, null, context.subscriptions);

  vscode.workspace.onDidChangeTextDocument(event => {
    if (vscode.window.activeTextEditor && event.document === vscode.window.activeTextEditor.document) {
      highlightCode();
    }
  }, null, context.subscriptions);

  // code lens
  let provider = new AcceptRejectCodeLensProvider();
  context.subscriptions.push(vscode.languages.registerCodeLensProvider('SystemVerilog', provider));
}

function highlightCode() {
  const editor = vscode.window.activeTextEditor;
  if (editor) {
    const suggestedRanges = findRegexRanges(editor.document, /\/\/ \[HDL Copilot: Suggested\](.*?)\/\/ \[HDL Copilot: Original\]/gs);
    const originalRanges = findRegexRanges(editor.document, /\/\/ \[HDL Copilot: Original\](.*?)\/\/ \[HDL Copilot: EOS\]/gs);

    editor.setDecorations(suggestedDecorationType, suggestedRanges);
    editor.setDecorations(originalDecorationType, originalRanges);
  }
}

function acceptChanges(range: vscode.Range) {
  const editor = vscode.window.activeTextEditor;
  if (editor) {
    const [suggestedCode, originalCode] = extractSuggestedAndOriginalCode(range);
    if (suggestedCode) {
      editor.edit(editBuilder => {
        editBuilder.replace(range, suggestedCode.trim());
      });
      sendTlm('accept_codegen', { suggested: suggestedCode, original: originalCode, prompt: userPrompt });
    } else {
      vscode.window.showErrorMessage("No suggested changes found in the selected range.");
    }
  }
}

export function containsPendingSuggestion(): boolean {
  const editor = vscode.window.activeTextEditor;
  if (editor) {
    const suggestedRanges = findRegexRanges(editor.document, /\/\/ \[HDL Copilot: Suggested\](.*?)\/\/ \[HDL Copilot: Original\]/gs);
    return suggestedRanges.length > 0;
  }
  return false;
}

function extractSuggestedAndOriginalCode(range: vscode.Range): [string | null, string | null] {
  const editor = vscode.window.activeTextEditor;
  let originalCode = null;
  let suggestedCode = null;

  if (editor) {
    const document = editor.document;
    const text = document.getText(range);
    const originalMatch = text.match(/\/\/ \[HDL Copilot: Original\](.*?)\/\/ \[HDL Copilot: EOS\]/s);
    const suggestedMatch = text.match(/\/\/ \[HDL Copilot: Suggested\]([\s\S]*?)\/\/ \[HDL Copilot: Original\][\s\S]*?\/\/ \[HDL Copilot: EOS\]/);

    if (originalMatch && originalMatch[1]) {  // Check if the match and the capture group are not null
      originalCode = originalMatch[1];
    }

    if (suggestedMatch && suggestedMatch[1]) {  // Check if the match and the capture group are not null
      suggestedCode = suggestedMatch[1];
    }
  }
  return [suggestedCode, originalCode];
}

function rejectChanges(range: vscode.Range) {
  const editor = vscode.window.activeTextEditor;

  if (editor) {
    const [suggestedCode, originalCode] = extractSuggestedAndOriginalCode(range);
    // Active editor contents
    const ctx = editor.document.getText();

    if (originalCode) {
      editor.edit(editBuilder => {
        editBuilder.replace(range, originalCode.trim());
      });
      sendTlm('reject_codegen', { suggested: suggestedCode, original: originalCode, prompt: userPrompt });
    } else {
      vscode.window.showErrorMessage("No original code found in the selected range.");
    }
  }
}

export class AcceptRejectCodeLensProvider implements vscode.CodeLensProvider {
  provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.CodeLens[] {
    const suggestedRanges = findRegexRanges(document, /\/\/ \[HDL Copilot: Suggested\](.*?)\/\/ \[HDL Copilot: EOS\]/gs);
    return suggestedRanges.map(range => [
      new vscode.CodeLens(range, {
        title: "Accept Changes",
        command: 'extension.acceptChanges',
        arguments: [range]
      }),
      new vscode.CodeLens(range, {
        title: "Reject Changes",
        command: 'extension.rejectChanges',
        arguments: [range]
      })
    ]).flat();
  }
}