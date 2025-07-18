const fs = require('fs');
const path = require('path');
const htmlparser2 = require('htmlparser2');

/**
 * The core auditing engine for VBCS components.
 * This class is self-contained and has no dependency on the VS Code API.
 */
class VBCSAuditTool {
    constructor() {
        this.issues = [];
        this.componentTree = {};
    }

    // Main audit function
    async auditVBCSComponent(htmlFilePath) {
        this.issues = [];
        this.componentTree = {};

        try {
            // Read HTML file
            if (!fs.existsSync(htmlFilePath)) {
                 this.addIssue('error', `HTML file not found: ${htmlFilePath}`, 0, 0);
                 return { tree: {}, issues: this.issues, summary: this.generateSummary() };
            }
            const htmlContent = fs.readFileSync(htmlFilePath, 'utf8');

            // Find corresponding JSON model file
            const jsonFilePath = this.getModelFilePath(htmlFilePath);
            let modelData = {};

            if (fs.existsSync(jsonFilePath)) {
                try {
                    const jsonContent = fs.readFileSync(jsonFilePath, 'utf8');
                    modelData = JSON.parse(jsonContent);
                } catch (e) {
                    this.addIssue('error', `Failed to parse model file ${path.basename(jsonFilePath)}: ${e.message}`, 0, 0);
                }
            } else {
                this.addIssue('warning', `Model file not found: ${path.basename(jsonFilePath)}`, 0, 0);
            }

            // Parse HTML and build component tree
            const componentTree = await this.parseHTMLToAST(htmlContent);

            // Perform comprehensive audits
            this.auditModelStructure(modelData);
            this.auditVariables(modelData);
            this.auditTypes(modelData);
            this.auditActionChains(modelData);
            this.auditEventListeners(modelData);
            this.auditBindings(componentTree, modelData);
            this.auditComponentStructure(componentTree);
            this.auditImports(modelData, componentTree);
            this.auditSecurity(modelData);
            this.auditTranslations(modelData, componentTree);
            this.auditFragments(componentTree);
            this.auditPerformance(modelData, componentTree);

            return {
                tree: componentTree,
                issues: this.issues,
                summary: this.generateSummary()
            };
        } catch (error) {
            this.addIssue('error', `Failed to audit file: ${error.message}`, 0, 0);
            return {
                tree: this.componentTree,
                issues: this.issues,
                summary: this.generateSummary()
            };
        }
    }

    // Get model file path from HTML file path
    getModelFilePath(htmlFilePath) {
        const dir = path.dirname(htmlFilePath);
        const basename = path.basename(htmlFilePath, '.html');
        return path.join(dir, `${basename}.json`);
    }

    // Parse HTML to AST-like structure
    parseHTMLToAST(htmlContent) {
        return new Promise((resolve) => {
            const ast = { type: 'root', children: [], bindings: [], variables: new Set(), events: [], components: [], fragments: [] };
            const stack = [ast];
            let currentLine = 1;

            const parser = new htmlparser2.Parser({
                onopentag: (name, attributes) => {
                    const node = { type: 'element', tagName: name, attributes, children: [], bindings: [], line: parser.startIndex, column: 0, variables: new Set(), events: [] };
                    if (name.startsWith('oj-')) { node.isOracleJET = true; ast.components.push({ name, line: currentLine, attributes }); }
                    if (name === 'oj-vb-fragment') { node.isFragment = true; ast.fragments.push({ name: attributes.name, id: attributes.id, line: currentLine }); }
                    for (const [attr, value] of Object.entries(attributes)) {
                        if (value) {
                            const readOnlyBindings = value.match(/\[\[([^\]]+)\]\]/g);
                            if (readOnlyBindings) { readOnlyBindings.forEach(b => { const expr = b.slice(2, -2).trim(); node.bindings.push({ attribute: attr, expression: expr, type: 'read-only' }); this.extractVariablesFromExpression(expr, node.variables, ast.variables); }); }
                            const twoWayBindings = value.match(/\{\{([^\}]+)\}\}/g);
                            if (twoWayBindings) { twoWayBindings.forEach(b => { const expr = b.slice(2, -2).trim(); node.bindings.push({ attribute: attr, expression: expr, type: 'two-way' }); this.extractVariablesFromExpression(expr, node.variables, ast.variables); }); }
                        }
                        if (attr.startsWith('on-')) { node.events.push({ event: attr, handler: value }); ast.events.push({ element: name, event: attr, handler: value }); }
                    }
                    stack[stack.length - 1].children.push(node);
                    stack.push(node);
                },
                onclosetag: () => stack.pop(),
                ontext: (text) => { currentLine += text.split('\n').length - 1; }
            }, { recognizeSelfClosing: true, lowerCaseTags: false, withStartIndices: true });
            parser.write(htmlContent);
            parser.end();
            resolve(ast);
        });
    }

    extractVariablesFromExpression(expression, nodeVars = new Set(), astVars = new Set()) {
        const patterns = [/\$(\w+)\.variables\.(\w+)/g, /\$variables\.(\w+)/g, /\$current\.(\w+)/g];
        patterns.forEach(pattern => {
            let match;
            while ((match = pattern.exec(expression)) !== null) {
                const varName = match[match.length - 1];
                if (nodeVars) nodeVars.add(varName);
                if (astVars) astVars.add(varName);
            }
        });
    }
    
    // Stubs for all audit methods. The engine developer will implement these.
    auditModelStructure(modelData) { if(!modelData.title) { this.addIssue('warning', `Page is missing a title in its settings.`, 0, 0); }}
    auditVariables(modelData) { /* Implement logic */ }
    auditTypes(modelData) { /* Implement logic */ }
    auditActionChains(modelData) { /* Implement logic */ }
    auditEventListeners(modelData) { /* Implement logic */ }
    auditBindings(ast, modelData) {
        const modelVarNames = new Set(Object.keys(modelData.variables || {}));
        ast.variables.forEach(viewVar => {
            if (!modelVarNames.has(viewVar)) {
                this.addIssue('error', `Variable '${viewVar}' is used in the view but not defined in the model.`, 0, 0);
            }
        });
    }
    auditComponentStructure(ast) { /* Implement logic */ }
    auditImports(modelData, componentTree) { /* Implement logic */ }
    auditSecurity(modelData) { /* Implement logic */ }
    auditTranslations(modelData, componentTree) { /* Implement logic */ }
    auditFragments(componentTree) { /* Implement logic */ }
    auditPerformance(modelData, componentTree) { /* Implement logic */ }

    // Helper to add an issue
    addIssue(severity, message, line, column, details = {}) {
        this.issues.push({ severity, message, line, column, details });
    }

    // Helper to generate a summary
    generateSummary() {
        return {
            totalIssues: this.issues.length,
            errors: this.issues.filter(i => i.severity === 'error').length,
            warnings: this.issues.filter(i => i.severity === 'warning').length,
            info: this.issues.filter(i => i.severity === 'info').length,
        };
    }
}

// Export the class for consumption by other modules.
module.exports = VBCSAuditTool;
