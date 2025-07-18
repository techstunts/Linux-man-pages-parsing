// src/extension.ts
import * as vscode from 'vscode';
import axios from 'axios';
import { ReviewViewProvider } from './ReviewViewProvider'; 
import { ExecutionResultsViewProvider } from './ExecutionResultsViewProvider';
import { FeedbackPanel } from './FeedbackViewProvider';
import { marked } from 'marked';
import * as path from 'path';
import { spawn } from 'child_process';
import * as util from 'util';
import * as os from 'os';
import * as fs from 'fs/promises';

// --- START: CONFIGURATION MANAGEMENT ---

// Hardcoded default configurations
const DEFAULT_CONFIG = {
    reviewApiUrl: "https://phoenix714428.appsdev.fusionappsdphx1.oraclevcn.com:5000/api/vblens/code-review",
    actionTestApiUrl: "https://phoenix714428.appsdev.fusionappsdphx1.oraclevcn.com:5000/api/vblens/code-assist",
    prompt_created_by_user: "",
    debug: "false",
    psrApiUrl: "http://phoenix645167.appsdev.fusionappsdphx1.oraclevcn.com:8001/api/v1/psr-code-review"
};

type ConfigKeys = keyof typeof DEFAULT_CONFIG;
let fileConfig: Partial<typeof DEFAULT_CONFIG> | null = null;

// Define a global constant to hold the fetched requestId
let REQUEST_ID: string | undefined = undefined;
export { REQUEST_ID };

/**
 * Reads the config file from ~/.oraclelens/config.json and caches the result.
 */
/**
 * Reads the config file from ~/.oraclelens/config.json and caches the result.
 */
/**
 * Reads the config file from ~/.oraclelens/config.json and caches the result.
 */
async function getFileConfig(): Promise<Partial<typeof DEFAULT_CONFIG>> {
    if (fileConfig !== null) {
        return fileConfig;
    }

    let loadedConfig: Partial<typeof DEFAULT_CONFIG> = {}; // Initialize as an empty object
    const configPath = path.join(os.homedir(), '.oraclelens', 'config.json');

    try {
        const fileContent = await fs.readFile(configPath, 'utf-8');
        // Parse into the local variable first
        const parsedConfig = JSON.parse(fileContent); 
        if (typeof parsedConfig === 'object' && parsedConfig !== null) {
            loadedConfig = parsedConfig;
            console.log(`Loaded override config from ${configPath}`);
        } else {
             console.log(`Config file at ${configPath} is not a valid object. Using defaults.`);
        }
    } catch (error) {
        // This primarily catches file-not-found errors.
        console.log(`No override config file found at ${configPath}. Using defaults.`);
    }

    // Now, assign the definitively non-null object to the cache
    fileConfig = loadedConfig;
    
    // And return it. TypeScript knows 'fileConfig' is not null here.
    return fileConfig;
}

/**
 * Gets a configuration value by checking the override file first, then falling back to the hardcoded default.
 * @param key The configuration key to retrieve.
 */
export async function getConfigValue(key: ConfigKeys): Promise<string> {
    const localConfig = await getFileConfig();
    if (localConfig && typeof localConfig[key] === 'string' && localConfig[key]) {
        return localConfig[key]!;
    }
    return DEFAULT_CONFIG[key];
}

// --- END: CONFIGURATION MANAGEMENT ---

function getConfiguration() {
    return vscode.workspace.getConfiguration('oracleCodeReviewAssistant');
}
export async function runCommandInOutputChannel(command: string, args: string[] = []): Promise<void> {
  const outputChannel = vscode.window.createOutputChannel('VBCS Audit');
  outputChannel.clear();

  try {
    const debug = await getConfigValue('debug'); // Fetch the debug config

    outputChannel.show(true);

    const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
    if (debug !== 'false') {
        outputChannel.appendLine(`Running command: ${command} ${args.join(' ')}`);
        outputChannel.appendLine(`Working directory: ${cwd}\n`);
    }

    const child = spawn(command, args, { shell: true, cwd });

    // Only append output to the channel if debug is not 'false'
    if (debug !== 'false') {
      child.stdout.on('data', (data) => outputChannel.append(data.toString()));
      child.stderr.on('data', (data) => outputChannel.append(data.toString()));
    }

    // Wait for process to exit
    const exitCode = await new Promise<number>((resolve, reject) => {
      child.on('close', (code) => {
        resolve(code ?? 1);  // Default to 1 if code is null/undefined
      });

      child.on('error', (err) => {
        outputChannel.appendLine(`\nError: ${err.message}`);
        vscode.window.showErrorMessage(`Failed to run command: ${err.message}`);
        reject(err);
      });
    });

    if (debug !== 'false') {
        outputChannel.appendLine(`\nProcess exited with code ${exitCode}`);
    }   

    if (exitCode !== 0) {
      vscode.window.showErrorMessage(`Command failed with exit code ${exitCode}`);
      throw new Error(`Command failed with exit code ${exitCode}`);
    }

  } catch (error: any) {  // Typing error as 'any' or 'unknown' and accessing 'message' safely
    // Handle any errors (e.g., failed to get config value, or command failure)
    vscode.window.showErrorMessage(`Error: ${error.message}`);
    throw error; // Re-throw error for further handling, if needed
  }
}
  

export function getAuditFilePaths(editor: vscode.TextEditor): string | undefined {
  if (!editor) {
    vscode.window.showErrorMessage('No active editor found.');
    return;
  }

  const fileUri = editor.document.uri;
  const filePath = fileUri.fsPath;
  const ext = path.extname(filePath).toLowerCase();
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(fileUri);

  if (!workspaceFolder) {
    vscode.window.showErrorMessage('File is not inside a workspace folder.');
    return;
  }

  const fileName = path.basename(filePath, ext);
  const relDir = path.relative(workspaceFolder.uri.fsPath, path.dirname(filePath)).replace(/\\/g, '/');

  const filesToAudit = [
    `${relDir}/${fileName}.json`,
    `${relDir}/${fileName}.js`,
    `${relDir}/${fileName}.html`
  ].join(',');

  return filesToAudit;
}

async function ensureValidOracleUser(): Promise<boolean> {
  const userSetting = vscode.workspace.getConfiguration('oracleCodeReviewAssistant').get<string>('user');
  if (!isValidOracleEmail(userSetting)) {
    const action = 'Open Settings';
    await vscode.window.showErrorMessage('Please set a valid @oracle.com email in your settings before using this command.', action)
      .then(selection => {
        if (selection === action) {
          vscode.commands.executeCommand('workbench.action.openSettings', 'oracleCodeReviewAssistant.user');
        }
      });
    return false;
  }
  return true;
}

export async function activate(context: vscode.ExtensionContext) {
    console.log('Oracle Code Review Assistant is now active!');

    let showAuditExecutionResults = false; // Control visibility of Audit Execution Results webview

    const provider = new ReviewViewProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(ReviewViewProvider.viewType, provider)
    );

    // Always create, but only register if allowed
    const executionResultsProvider = new ExecutionResultsViewProvider(context.extensionUri);
    if (showAuditExecutionResults) {
        context.subscriptions.push(
            vscode.window.registerWebviewViewProvider(ExecutionResultsViewProvider.viewType, executionResultsProvider)
        );
    }

    const commandRunAuditReview = vscode.commands.registerCommand('oracle-code-review-assistant.runAuditReview', async () => {
        if (!(await ensureValidOracleUser())) return;
        if (showAuditExecutionResults) {
            executionResultsProvider.refreshContent('audit');
        }

        provider.revealView();         
        provider.showReviewGenerationInProgressMessage('Running Audit ...');

        const editor = vscode.window.activeTextEditor;
        if (!editor) return;

        const filesToAudit = getAuditFilePaths(editor);

        if (filesToAudit) {
            console.log('Files to audit:', filesToAudit);
        }

        const code = editor.document.getText();    

        // var filesToAudit = vscode.window.activeTextEditor.document.uri.path;
        const cmd = `./node_modules/.bin/grunt vb-audit --url:ce=http://exchange.oraclecorp.com/api/0.2.0 --audit.outputformat=jet --audit.outputfile=auditoutput.json --audit.customauditorsmanifesturls='https://fre.appoci.oraclecorp.com/vbaudits/2510.0.0' --audit.files=${filesToAudit} --force`;
        // const cmd = `ls`;

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            cancellable: false,
            title: 'VB Lens: Running Audit ...'
        }, async () => {

            await runCommandInOutputChannel(cmd);
        });
 
        const workspaceFolders = vscode.workspace.workspaceFolders;

        if (!workspaceFolders) {
            vscode.window.showErrorMessage('No folder opened in VS Code.');
            return;
        }

        const rootUri = workspaceFolders[0].uri;
        const filePath = vscode.Uri.joinPath(rootUri, 'auditoutput.json'); 
        
        try {
            const auditOutputBytes = await vscode.workspace.fs.readFile(filePath);
            const auditOutput = new TextDecoder().decode(auditOutputBytes);
            console.log(`File content: ${auditOutput}`);

            if (showAuditExecutionResults) {
                executionResultsProvider.updateContent(auditOutput, true);
            }
            provider.updateContent(auditOutput, true);
            vscode.window.showInformationMessage('✅ Audit complete. Results shown in "Execution Results" view.');

            await callApi('Generating Code Review', code, JSON.parse(auditOutput));

        } catch (error) {
            vscode.window.showErrorMessage(`Error reading file: ${error}`);
        }        
    });

    async function callApi(action: string, codeToReview: string, auditOutput: Object) {
        if (!codeToReview.trim()) {
            vscode.window.showInformationMessage('No code selected or file is empty.');
            return;
        }

        REQUEST_ID = '';

        const config = getConfiguration();
        const reviewApiUrl = await getConfigValue('reviewApiUrl');
        const model = config.get<string>('model');
        const family = config.get<string>('family');
        const user = config.get<string>('user');
        const prompt_created_by_user = await getConfigValue('prompt_created_by_user');

        provider.showReviewGenerationInProgressMessage(`${action} ...`);

        console.log("------Model----", model);

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification, // Show progress in the window status bar
            cancellable: false,
            title: `VB Lens: ${action}...`
        }, async () => {
            try {
                const requestPayload = {
                    query: codeToReview,
                    model: model,
                    family: family,
                    user: user,
                    audit_data: auditOutput,
                    prompt_created_by_user: prompt_created_by_user
                    // rag: "yes",
                    // agent: "vbcs",
                    // embeddings_model: "openai",
                    // family: "all",
                    // intent: "code_review"
                };
                console.log(requestPayload);
                const https = require('https');
                const httpsAgent = new https.Agent({ rejectUnauthorized: false });
                process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

                const response = await axios.post(reviewApiUrl, requestPayload, {
                    httpsAgent,      
                    timeout: 120000   
                });

                console.log(response);

                const issue = [{
                    severity: "medium",
                    line: 1,
                    description: response.data.response.ai_analysis
                }];
                const requestId = response.data?.response.request_id[0];
                REQUEST_ID = requestId;
                        
                provider.updateReview(issue);
            } catch (error: any) {
                console.error(`Error during ${action}:`, error);
                vscode.window.showErrorMessage(`Error during ${action}: ${error.message}`);
                // You could even send an error to the webview
                // provider.showError(error.message);
            }
        });
    }
      
    const codeLensProvider = vscode.languages.registerCodeLensProvider(['html', 'javascript'], {
        provideCodeLenses(document) {
            const range = new vscode.Range(0, 0, 0, 1);
            let lenses = [
                new vscode.CodeLens(range, { command: 'oracle-code-review-assistant.reviewFile', title: '📝 Review File' }),
                new vscode.CodeLens(range, { command: 'oracle-code-review-assistant.runAuditReview', title: '🛡️ Run Audit & Review' })
            ];
            if (document.languageId === "javascript") {
                const text = document.getText();
                if (text.includes('extends ActionChain')) {
                    lenses.splice(1, 0, new vscode.CodeLens(range, { command: 'oracle-code-review-assistant.generateChainActionTest', title: '🔗 Generate Action Chain Tests' }));
                }
            }
            return lenses;
        }
    });

    context.subscriptions.push(commandRunAuditReview, codeLensProvider);

    context.subscriptions.push(
        vscode.commands.registerCommand('oracle-code-review-assistant.reviewFile', async () => {
            if (!(await ensureValidOracleUser())) return;
            executionResultsProvider.refreshContent();

            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showInformationMessage('No active editor to review.');
                return;
            }
            
            const document = editor.document;
            const selection = editor.selection;
            const codeToReview = !selection.isEmpty ? document.getText(selection) : document.getText();

            if (!codeToReview.trim()) {
                vscode.window.showInformationMessage('No code selected or file is empty.');
                return;
            }

            const config = getConfiguration();
            const reviewApiUrl = await getConfigValue('reviewApiUrl');
            const user = config.get<string>('user');
            const prompt_created_by_user = await getConfigValue('prompt_created_by_user');
            
            const model = config.get<string>('model');
            const family = config.get<string>('family');

            provider.revealView(); 
            provider.showReviewGenerationInProgressMessage('Reviewing ...');

            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification, // Show progress in the window status bar
                cancellable: false,
                title: 'VB Lens: Reviewing...'
            }, async () => {
                try {
                    const requestPayload = {
                        query: codeToReview,
                        language: document.languageId,
                        model: model,
                        family: family,
                        user: user,
                        prompt_created_by_user: prompt_created_by_user
                        // rag: "yes",
                        // agent: "vbcs",
                        // embeddings_model: "openai",
                        // family: "all",
                        // intent: "code_review"
                    };
                    console.log(requestPayload);
                    const https = require('https');
                    const httpsAgent = new https.Agent({ rejectUnauthorized: false });

                    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

                    console.log('Requesting:', reviewApiUrl);
                    const response = await axios.post(reviewApiUrl, requestPayload, {
                        httpsAgent,      
                        timeout: 120000   
                    });
                    console.log(response);
                    const requestId = response.data?.response.request_id[0];
                    REQUEST_ID = requestId;
                    console.log("Request ID:", REQUEST_ID);

                    const issue = [{
                        severity: "medium",
                        line: 1,
                        description: response.data.response.ai_analysis
                    }];
                    
                    provider.updateReview(issue);
                } catch (error: any) {
                    console.error('Error during code review:', error);
                    vscode.window.showErrorMessage(`Failed to get code review: ${error.message}`);
                    // You could even send an error to the webview
                    // provider.showError(error.message);
                }
            });
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('oracle-code-review-assistant.generateChainActionTest', async () => {
            if (!(await ensureValidOracleUser())) return;
            executionResultsProvider.refreshContent();

            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showInformationMessage('No active editor found.');
                return;
            }
    
            // const selection = editor.selection;
            // if (selection.isEmpty) {
            //     vscode.window.showInformationMessage('Please select the action chain code to generate a test for.');
            //     return;
            // }
    
            const selectedCode = editor.document.getText();
            const config = getConfiguration();
            const actionTestApiUrl = await getConfigValue('actionTestApiUrl');
            const model = config.get<string>('model');
            const family = config.get<string>('family');
            const user = config.get<string>('user');
            const prompt_created_by_user = await getConfigValue('prompt_created_by_user');

            provider.revealView(); 
            provider.showReviewGenerationInProgressMessage('Generating Test ...');

            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                cancellable: false,
                title: 'VB Lens: Generating Test...'
            }, async () => {
                try {
                    const requestPayload = {
                        query: selectedCode,
                        model: model,
                        family: family,
                        user: user,
                        prompt_created_by_user: prompt_created_by_user,
                        intent: "action_chain_test"
                        // rag: "yes",
                        // agent: "vbcs",
                        // embeddings_model: "openai",
                        // family: "all",
                    };
                    
                    const https = require('https');
                    const httpsAgent = new https.Agent({ rejectUnauthorized: false });
                    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
                    console.log('Requesting:', actionTestApiUrl);

                    const response = await axios.post(actionTestApiUrl, requestPayload, {
                        httpsAgent,
                        timeout: 120000
                    });
    
                    // const panel = vscode.window.createWebviewPanel(
                    //     'chainActionTestView',
                    //     'Generated Chain Action Test',
                    //     vscode.ViewColumn.Beside,
                    //     { enableScripts: true }
                    // );

                    // // Assuming the response text is in `response.data.response`
                    // panel.webview.html = getWebviewContent(response.data.response.ai_analysis);
                    const requestId = response.data?.response?.request_id ? response.data.response.request_id[0] : '';

                    // const requestId = response.data?.response.request_id[0];
                    REQUEST_ID = requestId;
                    console.log("Request ID:", REQUEST_ID);
                    console.log(response.data?.response);

                    const issue = [{
                        severity : "medium",
                        line : 1,
                        description: response.data.response.ai_analysis
                    }];
                    
                    // Send the data to our persistent view
                    provider.updateReview(issue);


    
                } catch (error: any) {
                    console.error('Error during test generation:', error);
                    vscode.window.showErrorMessage(`Failed to generate test: ${error.message}`);
                }
            });
        })
    );

    context.subscriptions.push(vscode.commands.registerCommand('oracle-code-review-assistant.openFeedbackView', () => {
        FeedbackPanel.show();
    }));

    context.subscriptions.push(
        vscode.commands.registerCommand('oracle-code-review-assistant.generatePSR', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showInformationMessage('No active editor found.');
                return;
            }
            const config = getConfiguration();
            const psrEnabled = config.get<boolean>('psr');
            if (!psrEnabled) {
                vscode.window.showWarningMessage('PSR command is disabled in settings.');
                return;
            }
            const psrApiUrl = await getConfigValue('psrApiUrl') || 'http://phoenix645167.appsdev.fusionappsdphx1.oraclevcn.com:8001/api/v1/psr-code-review';
            const user = config.get<string>('user');
            const model = config.get<string>('model');
            const code = editor.document.getText();
            provider.revealView();
            provider.showReviewGenerationInProgressMessage('Generating PSR ...');
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                cancellable: false,
                title: 'VB Lens: Generating PSR...'
            }, async () => {
                try {
                    const axios = require('axios');
                    const https = require('https');
                    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
                    const httpsAgent = new https.Agent({ rejectUnauthorized: false });
                    const payload = {
                        query: code,
                        user: user,
                        model: model
                    };
                    const response = await axios.post(psrApiUrl, payload, { httpsAgent, timeout: 180000 });
                    // Match review formatting:
                    const ai_analysis = response.data?.response?.ai_analysis || 'No answer received.';
                    const requestId = response.data?.response?.request_id ? response.data.response.request_id[0] : '';
                    REQUEST_ID = requestId;
                    const issue = [{
                        severity: "medium",
                        line: 1,
                        description: ai_analysis
                    }];
                    provider.updateReview(issue);
                } catch (err: any) {
                    console.log('Full PSR API error:', err);
                    let msg = err.message || 'Unknown error';
                    if (err.code === 'ECONNABORTED') {
                        msg = 'The request timed out. This may be due to a slow network, VPN, or firewall. Try increasing the timeout in settings or check your connection.';
                    }
                    vscode.window.showErrorMessage('PSR API error: ' + msg);
                    // Additional diagnostic call to a public API
                    try {
                        const axios = require('axios');
                        const diagResp = await axios.get('https://api.github.com', { timeout: 10000 });
                        console.log('Diagnostic public API response:', diagResp.status, diagResp.data);
                    } catch (diagErr) {
                        console.log('Diagnostic public API call failed:', diagErr);
                    }
                }
            });
        })
    );

    // Set context key for ActionChain eligibility
    function updateActionChainContext(editor?: vscode.TextEditor) {
        const activeEditor = editor || vscode.window.activeTextEditor;
        if (activeEditor && activeEditor.document.languageId === 'javascript') {
            const text = activeEditor.document.getText();
            vscode.commands.executeCommand('setContext', 'vbLensIsActionChain', text.includes('extends ActionChain'));
        } else {
            vscode.commands.executeCommand('setContext', 'vbLensIsActionChain', false);
        }
    }
    // Update context on editor and document change
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(updateActionChainContext),
        vscode.workspace.onDidChangeTextDocument(e => {
            if (vscode.window.activeTextEditor && e.document === vscode.window.activeTextEditor.document) {
                updateActionChainContext(vscode.window.activeTextEditor);
            }
        })
    );
    // Initial context set
    updateActionChainContext();

}

function isValidOracleEmail(email: string | undefined): boolean {
  return typeof email === 'string' && /^[A-Za-z0-9._%+-]+@oracle\.com$/.test(email);
}

export function deactivate() {}
