import { getPreferences } from "./extension";

export async function getPreferencesViewContent(): Promise<string> {
    const preferences = await getPreferences();
    const suppressions = preferences.projectSuppresions;
    const macros = preferences.macros;

    let suppressionsHtml = '';
    if (suppressions.length > 0) {
        suppressionsHtml += `
            <table class="suppressions-table">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>`;
        suppressions.forEach((suppression, index) => {
            suppressionsHtml += `
                <tr>
                    <td>${suppression}</td>
                    <td><button class="flat-button" onclick="deleteSuppression(${index})">Delete</button></td>
                </tr>`;
        });
        suppressionsHtml += `
                </tbody>
            </table>`;
    } else {
        suppressionsHtml = "<p>No suppressions set.</p>";
    }

    let macrosHtml = '';
    macros.forEach((macro, index) => {
        macrosHtml += `
            <div class="form-group">
                <input type="text" placeholder="Name" class="macro-name" value="${(macro.name)}">
                <input type="text" placeholder="Value" class="macro-value" value="${(macro.value)}">
                <button class="flat-button" onclick="this.parentNode.remove()">Delete</button>
            </div>`;
    });

    return `
    <!DOCTYPE html>
    <html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Preferences</title>
    <style>
    body {
        font-family: 'Segoe UI', Arial, sans-serif;
        padding: 20px;
        background-color: #1e1e1e;
        color: #c7c7c7;
    }
    h1 {
        font-size: 28px;
        margin-bottom: 30px;
        color: #fff;
    }
    .form-group {
        display: flex;
        align-items: center;
        margin-bottom: 15px;
    }
    .form-group label {
        margin-right: 10px;
        font-weight: 600;
        width: 180px;
        color: #d4d4d4;
    }
    input[type="text"] {
        flex: 1;
        padding: 8px;
        margin: 5px;
        font-size: 14px;
        background-color: #2d2d2d;
        border: 2px solid #3c3c3c;
        border-radius: 4px;
        color: #dcdcdc;
        box-sizing: border-box;
    }
    input[type="text"]:focus {
        outline: none;
        border-color: #0078d7;
    }
    .flat-button {
        background-color: #212121;
        color: #e0e0e0;
        padding: 6px 6px;
        border: 1px solid #000000;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
        transition: background-color 0.3s;
    }
    .flat-button:hover {
        background-color: #1c1c1c;
    }
    .section {
        border: 2px solid #3c3c3c;
        padding: 10px;
        margin-top: 20px;
        border-radius: 4px;
    }
    h2 {
        margin-top: 0;
        color: #d4d4d4;
    }
    .suppressions-table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 15px;
    }
    .suppressions-table, .suppressions-table th, .suppressions-table td {
        border: 1px solid #3c3c3c;
    }
    .suppressions-table tr {
        background-color: #2d2d2d;
    }
    .suppressions-table tr:hover {
        background-color: #2c2c2c;
    }
    .suppressions-table th, .suppressions-table td {
        text-align: left;
        padding: 8px;
    }
    .suppressions-table th {
        background-color: #2d2d2d;
        color: #dcdcdc;
    }
    </style>
</head>
<body>
        <h1>HDL Copilot</h1>
        <div class="section">
            <div>
                <h2>Project Suppressions</h2>
                ${suppressionsHtml}
            </div>
        </div>

        <div class="section">
            <h2>Macros</h2>
            <div id="macros">
                ${macrosHtml}
            </div>
            <button class="flat-button" id="addMacro">Add Macro</button>
            <button class="flat-button" id="saveMacros">Save Macros</button>
        </div>

        <p id="error" style="color: red; display: none;"></p>

        <script>
            const vscode = acquireVsCodeApi();

            function addMacroField(name = '', value = '') {
                const div = document.createElement('div');
                div.className = 'form-group';
                div.innerHTML = 
                    '<input type="text" placeholder="Name" class="macro-name" value="' + name + '">' +
                    '<input type="text" placeholder="Value" class="macro-value" value="' + value + '">' +
                    '<button class="flat-button" onclick="this.parentNode.remove()">Delete</button>';
                document.getElementById('macros').appendChild(div);
            }

            document.getElementById('addMacro').addEventListener('click', () => addMacroField());

            document.getElementById('saveMacros').addEventListener('click', () => {
                const macroElements = document.querySelectorAll('.form-group');
                const macros = Array.from(macroElements).map(group => {
                    return {
                        name: group.querySelector('.macro-name').value,
                        value: group.querySelector('.macro-value').value
                    };
                });
                vscode.postMessage({
                    command: 'saveMacros',
                    macros: macros
                });
            });
        </script>
    </body>
</html>
  `;
}
