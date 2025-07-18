//const fs = require('fs');
//const path = require('path');
//const htmlparser2 = require('htmlparser2');

/**
 * The core auditing engine for VBCS components.
 * This class is self-contained and has no dependency on the VS Code API.
 */
class VBCSAuditTool {
    constructor(dependencies) {
        if (!dependencies || !dependencies.fs || !dependencies.path || !dependencies.htmlparser2) {
            throw new Error("VBCSAuditTool is missing required dependencies (fs, path, htmlparser2).");
        }
        // 3. STORE the dependencies on the instance.
        this.fs = dependencies.fs;
        this.path = dependencies.path;
        this.htmlparser2 = dependencies.htmlparser2;

        this.issues = [];
        this.componentTree = {};
    }


    // Main audit function
    async auditVBCSComponent(htmlFilePath) {
        console.log('VBCS Audit: Starting audit for file:', htmlFilePath);
        console.log('VBCS Audit: Using fallback-engine.js custom audits');
        this.issues = [];
        this.componentTree = {};

        try {
            // Read HTML file
            if (!this.fs.existsSync(htmlFilePath)) {
                 this.addIssue('error', `HTML file not found: ${htmlFilePath}`, 0, 0);
                 return { tree: {}, issues: this.issues, summary: this.generateSummary() };
            }
            const htmlContent = this.fs.readFileSync(htmlFilePath, 'utf8');

            // Find corresponding JSON model file
            const jsonFilePath = this.getModelFilePath(htmlFilePath);
            let modelData = {};

            if (this.fs.existsSync(jsonFilePath)) {
                try {
                    const jsonContent = this.fs.readFileSync(jsonFilePath, 'utf8');
                    modelData = JSON.parse(jsonContent);
                } catch (e) {
                    this.addIssue('warning', `Model file not found: ${this.path.basename(jsonFilePath)}`, 0, 0);
                    this.addIssue('error', `Failed to parse model file ${this.path.basename(jsonFilePath)}: ${e.message}`, 0, 0);
                }
            } else {
                this.addIssue('warning', `Model file not found: ${this.path.basename(jsonFilePath)}`, 0, 0);
            }

            // Parse HTML and build component tree
            const componentTree = await this.parseHTMLToAST(htmlContent);

            // Perform comprehensive audits
            console.log('VBCS Audit: Running custom audit methods...');
            const safeAudit = (fn, ...args) => {
                try {
                    fn.apply(this, args);
                } catch (error) {
                    this.addIssue('error', `Failed to audit file: ${error.message}`, 0, 0);
                }
            };

            safeAudit(this.auditModelStructure, modelData);
            safeAudit(this.auditVariables, modelData);
            safeAudit(this.auditTypes, modelData);
            safeAudit(this.auditActionChains, modelData);
            safeAudit(this.auditEventListeners, modelData);
            safeAudit(this.auditBindings, componentTree, modelData);
            safeAudit(this.auditComponentStructure, componentTree);
            safeAudit(this.auditImports, modelData, componentTree);
            safeAudit(this.auditSecurity, modelData);
            safeAudit(this.auditTranslations, modelData, componentTree);
            safeAudit(this.auditFragments, componentTree, modelData);
            safeAudit(this.auditPerformance, modelData, componentTree);
            console.log('VBCS Audit: Completed all audit methods. Total issues found:', this.issues.length);

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
        const dir = this.path.dirname(htmlFilePath);
        const basename = this.path.basename(htmlFilePath, '.html');
        return this.path.join(dir, `${basename}.json`);
    }

    // Parse HTML to AST-like structure
    parseHTMLToAST(htmlContent) {
        return new Promise((resolve) => {
            const ast = { type: 'root', children: [], bindings: [], variables: new Set(), events: [], components: [], fragments: [] };
            const stack = [ast];
            let currentLine = 1;

            const parser = new this.htmlparser2.Parser({
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
    auditModelStructure(modelData) {
        // Check for required model version
        if (!modelData.pageModelVersion && !modelData.flowModelVersion && !modelData.applicationModelVersion) {
            //this.addIssue('warning', 'Model version not specified', 0, 0);
        }
 
        // Check for description
        if (!modelData.description) {
            this.addIssue('info', 'Consider adding a description to the model', 0, 0);
        }
 
        // Check for title
        if (!modelData.title) {
            this.addIssue('warning', `Page is missing a title in its settings.Add Page title in corresponding JSON file of the page`, 0, 0);
        }
 
        // Check for deprecated properties
        if (modelData.requiresAuthentication !== undefined) {
            this.addIssue('warning', 'Use security.access.requiresAuthentication instead of top-level requiresAuthentication', 0, 0);
        }
    }
 

    // Audit variables
    auditVariables(modelData) {
        const variables = modelData.variables || {};
        const types = modelData.types || {};
       
        Object.entries(variables).forEach(([varName, varDef]) => {
            // Check for type definition
            if (!varDef.type) {
                this.addIssue('error', `Variable '${varName}' is missing type definition`, 0, 0);
            }
           
            // Check for deprecated idAttribute
            if (varDef.idAttribute) {
                this.addIssue('warning', `Variable '${varName}' uses deprecated 'idAttribute'. Use 'keyAttributes' instead`, 0, 0);
            }
           
            // Check input variables
            if (varDef.input) {
                if (!['fromCaller', 'fromUrl', 'none'].includes(varDef.input)) {
                    this.addIssue('error', `Variable '${varName}' has invalid input type '${varDef.input}'`, 0, 0);
                }
               
                if (varDef.input === 'fromCaller' && varDef.required && !varDef.defaultValue) {
                    this.addIssue('warning', `Required input variable '${varName}' should have a defaultValue`, 0, 0);
                }
            }
           
            // Check persisted variables
            if (varDef.persisted) {
                if (!['history', 'session', 'device'].includes(varDef.persisted)) {
                    this.addIssue('error', `Variable '${varName}' has invalid persisted value '${varDef.persisted}'`, 0, 0);
                }
               
                // Check for sensitive data in persisted variables
                if (varName.toLowerCase().includes('password') || varName.toLowerCase().includes('token')) {
                    this.addIssue('warning', `Sensitive variable '${varName}' should not be persisted`, 0, 0);
                }
            }
           
            // Check ServiceDataProvider configuration
            if (varDef.type === 'vb/ServiceDataProvider') {
                this.auditServiceDataProvider(varName, varDef.defaultValue || {});
            }
           
            // Check ArrayDataProvider configuration
            if (varDef.type === 'vb/ArrayDataProvider' || varDef.type === 'vb/ArrayDataProvider2') {
                this.auditArrayDataProvider(varName, varDef);
            }
           
            // Check for circular references in default values
            if (varDef.defaultValue && typeof varDef.defaultValue === 'string') {
                if (varDef.defaultValue.includes(`$variables.${varName}`)) {
                    this.addIssue('error', `Variable '${varName}' has circular reference in defaultValue`, 0, 0);
                }
            }
 
            // Check onValueChanged event
            if (varDef.onValueChanged) {
                if (!varDef.onValueChanged.chains || !Array.isArray(varDef.onValueChanged.chains)) {
                    this.addIssue('error', `Variable '${varName}' has invalid onValueChanged configuration`, 0, 0);
                }
            }
 
            // Check rateLimit
            if (varDef.rateLimit) {
                if (typeof varDef.rateLimit.timeout !== 'number' || varDef.rateLimit.timeout < 0) {
                    this.addIssue('warning', `Variable '${varName}' has invalid rateLimit timeout`, 0, 0);
                }
            }
        });
    }
 
    // Audit ServiceDataProvider
    auditServiceDataProvider(varName, config) {
        if (varDef.input === 'fromCaller') {
        // Add informational note about parent dependency
        this.addIssue('info',
            `ServiceDataProvider '${varName}' expects configuration from parent component`,
            0, 0,
            { type: 'fromCaller', dependency: 'parent' }
        );
        return;  // Skip local configuration validation
    }
        if (!config.endpoint && !config.fetchChainId) {
            this.addIssue('error', `ServiceDataProvider '${varName}' must have either endpoint or fetchChainId`, 0, 0);
        }
       
        if (!config.keyAttributes && !config.idAttribute) {
            this.addIssue('warning', `ServiceDataProvider '${varName}' should specify keyAttributes`, 0, 0);
        }
       
        if (config.capabilities) {
            // Validate capabilities structure
            const validCapabilities = ['fetchFirst', 'fetchByKeys', 'fetchByOffset', 'filter', 'sort'];
            Object.keys(config.capabilities).forEach(cap => {
                if (!validCapabilities.includes(cap)) {
                    this.addIssue('warning', `ServiceDataProvider '${varName}' has unknown capability '${cap}'`, 0, 0);
                }
            });
        }
       
        // Check for responseType
        if (!config.responseType) {
            this.addIssue('info', `ServiceDataProvider '${varName}' should specify responseType for better type safety`, 0, 0);
        }
    }
 
    // Audit ArrayDataProvider
    auditArrayDataProvider(varName, varDef) {
        const config = varDef.defaultValue || {};
       
        if (varDef.type === 'vb/ArrayDataProvider') {
            this.addIssue('info', `Consider using vb/ArrayDataProvider2 instead of legacy ArrayDataProvider for '${varName}'`, 0, 0);
        }
       
        if (!config.keyAttributes && !config.idAttribute) {
            this.addIssue('warning', `ArrayDataProvider '${varName}' should specify keyAttributes`, 0, 0);
        }
       
        if (!config.itemType) {
            this.addIssue('warning', `ArrayDataProvider '${varName}' should specify itemType`, 0, 0);
        }
    }
 
    // Audit types
    auditTypes(modelData) {
        const types = modelData.types || {};
       
        Object.entries(types).forEach(([typeName, typeDef]) => {
            // Check for circular type references
            this.checkCircularTypeReference(typeName, typeDef, types, new Set());
           
            // Check naming conventions
            if (!/^[A-Z][a-zA-Z0-9]*$/.test(typeName)) {
                this.addIssue('info', `Type '${typeName}' should follow PascalCase naming convention`, 0, 0);
            }
        });
    }
 
    // Check for circular type references
    checkCircularTypeReference(typeName, typeDef, allTypes, visited) {
        if (visited.has(typeName)) {
            this.addIssue('error', `Circular type reference detected for type '${typeName}'`, 0, 0);
            return;
        }
       
        visited.add(typeName);
       
        if (typeof typeDef === 'object' && typeDef !== null) {
            Object.values(typeDef).forEach(prop => {
                if (typeof prop === 'string' && prop.includes(':')) {
                    const [scope, refType] = prop.split(':');
                    if (allTypes[refType]) {
                        this.checkCircularTypeReference(refType, allTypes[refType], allTypes, visited);
                    }
                }
            });
        }
       
        visited.delete(typeName);
    }
 
    // Audit action chains
    auditActionChains(modelData) {
        const chains = modelData.chains || {};
       
        Object.entries(chains).forEach(([chainName, chainDef]) => {
            // Check for root action
            if (!chainDef.root) {
                this.addIssue('error', `Action chain '${chainName}' is missing root action`, 0, 0);
            }
           
            // Check chain variables
            if (chainDef.variables) {
                Object.entries(chainDef.variables).forEach(([varName, varDef]) => {
                    if (varDef.input === 'fromCaller' && varDef.required && !varDef.defaultValue) {
                        this.addIssue('warning', `Chain variable '${varName}' in '${chainName}' is required but has no defaultValue`, 0, 0);
                    }
                });
            }
           
            // Check actions
            if (chainDef.actions) {
                this.auditActions(chainName, chainDef.actions, chainDef.root);
            }
           
            // Check return type
            if (chainDef.returnType && chainDef.outcomes) {
                this.addIssue('info', `Action chain '${chainName}' specifies both returnType and outcomes`, 0, 0);
            }
        });
    }
 
    // Audit actions in a chain
    auditActions(chainName, actions, rootAction) {
        const actionIds = new Set(Object.keys(actions));
        const referencedActions = new Set();
       
        // Check root action exists
        if (!actions[rootAction]) {
            this.addIssue('error', `Root action '${rootAction}' not found in chain '${chainName}'`, 0, 0);
        }
       
        Object.entries(actions).forEach(([actionId, action]) => {
            // Check for module
            if (!action.module) {
                this.addIssue('error', `Action '${actionId}' in chain '${chainName}' is missing module`, 0, 0);
            }
           
            // Check outcomes reference valid actions
            if (action.outcomes) {
                Object.values(action.outcomes).forEach(outcomeAction => {
                    if (outcomeAction && !actionIds.has(outcomeAction)) {
                        this.addIssue('error', `Action '${actionId}' references non-existent action '${outcomeAction}'`, 0, 0);
                    } else if (outcomeAction) {
                        referencedActions.add(outcomeAction);
                    }
                });
            }
           
            // Check specific action types
            this.auditSpecificAction(chainName, actionId, action);
        });
       
        // Check for unreachable actions
        actionIds.forEach(actionId => {
            if (actionId !== rootAction && !referencedActions.has(actionId)) {
                this.addIssue('warning', `Action '${actionId}' in chain '${chainName}' is unreachable`, 0, 0);
            }
        });
    }
 
    // Audit specific action types
    auditSpecificAction(chainName, actionId, action) {
        switch (action.module) {
            case 'vb/action/builtin/restAction':
                if (!action.parameters?.endpoint) {
                    this.addIssue('error', `REST action '${actionId}' is missing endpoint parameter`, 0, 0);
                }
                break;
               
            case 'vb/action/builtin/assignVariablesAction':
                if (!action.parameters || Object.keys(action.parameters).length === 0) {
                    this.addIssue('warning', `Assign variables action '${actionId}' has no assignments`, 0, 0);
                }
                break;
               
            case 'vb/action/builtin/callChainAction':
                if (!action.parameters?.id) {
                    this.addIssue('error', `Call chain action '${actionId}' is missing chain id`, 0, 0);
                }
                break;
               
            case 'vb/action/builtin/fireDataProviderEventAction':
                if (!action.parameters?.target) {
                    this.addIssue('error', `Fire data provider event action '${actionId}' is missing target`, 0, 0);
                }
                if (!action.parameters?.refresh && !action.parameters?.add &&
                    !action.parameters?.remove && !action.parameters?.update) {
                    this.addIssue('warning', `Fire data provider event action '${actionId}' has no event type specified`, 0, 0);
                }
                break;
        }
    }
 
    // Audit event listeners
    auditEventListeners(modelData) {
        const eventListeners = modelData.eventListeners || {};
        const declaredEvents = modelData.events || {};
       
        Object.entries(eventListeners).forEach(([eventName, listener]) => {
            // Check listener structure
            if (!listener.chains || !Array.isArray(listener.chains)) {
                this.addIssue('error', `Event listener '${eventName}' has invalid structure`, 0, 0);
                return;
            }
           
            // Check each chain reference
            listener.chains.forEach((chainRef, index) => {
                if (!chainRef.chainId) {
                    this.addIssue('error', `Event listener '${eventName}' chain[${index}] is missing chainId`, 0, 0);
                }
               
                // Validate chain exists
                const chains = modelData.chains || {};
                const chainId = chainRef.chainId.replace(/^(application:|flow:|page:)/, '');
                if (!chains[chainId] && !chainRef.chainId.includes(':')) {
                    this.addIssue('warning', `Event listener '${eventName}' references non-existent chain '${chainId}'`, 0, 0);
                }
            });
           
            // Check for asyncBehavior on component events
            if (listener.asyncBehavior === 'enabled' && !eventName.startsWith('on')) {
                this.addIssue('warning', `asyncBehavior is only valid for component event listeners`, 0, 0);
            }
        });
    }
 
    // Audit bindings against model
    auditBindings(ast, modelData) {
        const modelVariables = this.extractModelVariables(modelData);
        const constants = this.extractConstants(modelData);
        const imports = modelData.imports || {};
       
        // Check each binding
        this.traverseAST(ast, (node) => {
            if (node.bindings && node.bindings.length > 0) {
                node.bindings.forEach(binding => {
                    // Check variable exists
                    const varPath = binding.expression.split('.')[0];
                    if (varPath.startsWith('$variables') || varPath.startsWith('$page.variables')) {
                        const varName = binding.expression.match(/variables\.(\w+)/)?.[1];
                        if (varName && !this.variableExistsInModel(varName, modelVariables)) {
                            this.addIssue(
                                'error',
                                `Variable '${varName}' is bound in HTML but not found in model`,
                                node.line,
                                node.column,
                                {
                                    element: node.tagName,
                                    attribute: binding.attribute,
                                    expression: binding.expression
                                }
                            );
                        }
                    }
                   
                    // Check two-way binding on read-only properties
                    if (binding.type === 'two-way' && this.isReadOnlyAttribute(node.tagName, binding.attribute)) {
                        this.addIssue(
                            'warning',
                            `Two-way binding used on read-only attribute '${binding.attribute}'`,
                            node.line,
                            node.column
                        );
                    }
                   
                    // Check for null safety
                    if (binding.expression.includes('.') && !binding.expression.includes('?.')) {
                        this.addIssue(
                            'info',
                            `Consider using optional chaining (?.) in expression '${binding.expression}'`,
                            node.line,
                            node.column
                        );
                    }
                });
            }
 
            // Check event handlers
            if (node.events && node.events.length > 0) {
                node.events.forEach(event => {
                    // Check if event handler exists
                    if (event.handler.includes('$listeners')) {
                        const listenerName = event.handler.match(/\$listeners\.(\w+)/)?.[1];
                        if (listenerName && !modelData.eventListeners?.[listenerName]) {
                            this.addIssue(
                                'error',
                                `Event listener '${listenerName}' not found in model`,
                                node.line,
                                node.column
                            );
                        }
                    }
                });
            }
        });
       
        // Check for unused variables
        modelVariables.forEach(modelVar => {
            if (!ast.variables.has(modelVar.name) && !modelVar.name.startsWith('_')) {
                this.addIssue(
                    'info',
                    `Variable '${modelVar.name}' is defined but not used in HTML`,
                    0,
                    0
                );
            }
        });
    }
 
    // Check if attribute is read-only
    isReadOnlyAttribute(tagName, attribute) {
        const readOnlyAttrs = {
            'oj-table': ['columns-default', 'current-row'],
            'oj-list-view': ['current-item'],
            'oj-chart': ['hidden-categories', 'highlighted-categories']
        };
       
        return readOnlyAttrs[tagName]?.includes(attribute) || false;
    }
 
    // Extract model variables
    extractModelVariables(modelData) {
        const variables = [];
        const extractVars = (obj, prefix = '') => {
            if (obj.variables) {
                Object.entries(obj.variables).forEach(([key, value]) => {
                    variables.push({
                        name: prefix ? `${prefix}.${key}` : key,
                        type: value.type,
                        value: value
                    });
                });
            }
        };
       
        extractVars(modelData);
        return variables;
    }
 
    // Extract constants
    extractConstants(modelData) {
        const constants = [];
        if (modelData.constants) {
            Object.entries(modelData.constants).forEach(([key, value]) => {
                constants.push({
                    name: key,
                    type: value.type,
                    value: value
                });
            });
        }
        return constants;
    }
 
    // Check if variable exists in model
    variableExistsInModel(variableName, modelVariables) {
        return modelVariables.some(v => v.name === variableName);
    }
 
    // Audit component structure for best practices
    auditComponentStructure(ast) {
        // Check for deeply nested components
        this.checkNestingDepth(ast, 0);
       
        // Check for missing required attributes on OJ components
        this.checkOracleJETComponents(ast);
       
        // Check for duplicate IDs
        this.checkDuplicateIds(ast);
       
        // Check for deprecated components
        this.checkDeprecatedComponents(ast);
       
        // Check for accessibility
        this.checkAccessibility(ast);
    }
 
    // Check nesting depth
    checkNestingDepth(node, depth) {
        const MAX_DEPTH = 10;
       
        if (depth > MAX_DEPTH) {
            this.addIssue(
                'warning',
                `Component nesting depth (${depth}) exceeds recommended maximum (${MAX_DEPTH})`,
                node.line || 0,
                node.column || 0
            );
        }
       
        if (node.children) {
            node.children.forEach(child => {
                this.checkNestingDepth(child, depth + 1);
            });
        }
    }
 
    // Check Oracle JET components for common issues
    checkOracleJETComponents(ast) {
        this.traverseAST(ast, (node) => {
            if (node.isOracleJET) {
                // Check for common required attributes
                const requiredAttrs = {
                    'oj-input-text': ['value'],
                    'oj-select-one': ['value', 'data'],
                    'oj-select-many': ['value', 'data'],
                    'oj-table': ['data', 'columns'],
                    'oj-list-view': ['data'],
                    'oj-chart': ['type', 'data'],
                    'oj-dialog': ['id'],
                    'oj-button': ['id']
                };
               
                const required = requiredAttrs[node.tagName];
                if (required) {
                    required.forEach(attr => {
                        if (!node.attributes[attr]) {
                            this.addIssue(
                                'warning',
                                `${node.tagName} is missing recommended attribute '${attr}'`,
                                node.line,
                                node.column
                            );
                        }
                    });
                }
               
                // Check for label hints on input components
                const inputComponents = ['oj-input-text', 'oj-input-number', 'oj-input-date', 'oj-select-one', 'oj-select-many'];
                if (inputComponents.includes(node.tagName) && !node.attributes['label-hint']) {
                    this.addIssue(
                        'info',
                        `${node.tagName} should have a label-hint for accessibility`,
                        node.line,
                        node.column
                    );
                }
            }
        });
    }
 
    // Check for duplicate IDs
    checkDuplicateIds(ast) {
        const ids = new Map();
       
        this.traverseAST(ast, (node) => {
            if (node.attributes && node.attributes.id) {
                const id = node.attributes.id;
                if (ids.has(id)) {
                    this.addIssue(
                        'error',
                        `Duplicate ID '${id}' found`,
                        node.line,
                        node.column
                    );
                } else {
                    ids.set(id, node);
                }
            }
        });
    }
 
    // Check for deprecated components
    checkDeprecatedComponents(ast) {
        const deprecatedComponents = {
            'oj-input': 'Use oj-input-text, oj-input-number, etc. instead',
            'oj-select': 'Use oj-select-one or oj-select-many instead',
            'oj-dialog-footer': 'Use slot="footer" instead'
        };
       
        this.traverseAST(ast, (node) => {
            if (deprecatedComponents[node.tagName]) {
                this.addIssue(
                    'warning',
                    `Deprecated component '${node.tagName}'. ${deprecatedComponents[node.tagName]}`,
                    node.line,
                    node.column
                );
            }
        });
    }
 
    // Check accessibility
    checkAccessibility(ast) {
        this.traverseAST(ast, (node) => {
            // Check images for alt text
            if (node.tagName === 'img' && !node.attributes.alt) {
                this.addIssue(
                    'warning',
                    'Image missing alt attribute for accessibility',
                    node.line,
                    node.column
                );
            }
           
            // Check buttons for accessible text
            if (node.tagName === 'oj-button' && !node.attributes.label && !node.attributes['aria-label']) {
                this.addIssue(
                    'warning',
                    'Button should have label or aria-label for accessibility',
                    node.line,
                    node.column
                );
            }
           
            // Check form inputs for labels
            const formInputs = ['oj-input-text', 'oj-input-number', 'oj-select-one', 'oj-select-many'];
            if (formInputs.includes(node.tagName) && !node.attributes['label-hint'] && !node.attributes['aria-label']) {
                this.addIssue(
                    'warning',
                    `${node.tagName} should have label-hint or aria-label for accessibility`,
                    node.line,
                    node.column
                );
            }
        });
    }
 
    // Audit data references
    auditDataReferences(ast, modelData) {
        this.traverseAST(ast, (node) => {
            // Check for hardcoded values that should be in variables
            if (node.isOracleJET && node.attributes) {
                Object.entries(node.attributes).forEach(([attr, value]) => {
                    if (typeof value === 'string' &&
                        !value.includes('[[') &&
                        !value.includes('{{') &&
                        this.shouldBeVariable(attr, value)) {
                        this.addIssue(
                            'info',
                            `Consider moving hardcoded value '${value}' to a variable`,
                            node.line,
                            node.column
                        );
                    }
                });
            }
        });
    }
 
    // Check if a value should be a variable
    shouldBeVariable(attr, value) {
        // Skip common attributes that are often hardcoded
        const skipAttrs = ['id', 'class', 'style', 'slot', 'span'];
        if (skipAttrs.includes(attr)) return false;
       
        // Check if it looks like data
        return value.length > 10 ||
               /^\d+$/.test(value) ||
               value.includes(',') ||
               value.includes('http');
    }
 
    // Audit imports
    auditImports(modelData, componentTree) {
        const imports = modelData.imports || {};
        const usedComponents = new Set();
       
        // Collect used components
        this.traverseAST(componentTree, (node) => {
            if (node.tagName && node.tagName.startsWith('oj-')) {
                usedComponents.add(node.tagName);
            }
        });
       
        // Check for unused imports
        if (imports.components) {
            Object.keys(imports.components).forEach(componentName => {
                if (!usedComponents.has(componentName)) {
                    this.addIssue(
                        'info',
                        `Component '${componentName}' is imported but not used`,
                        0,
                        0
                    );
                }
            });
        }
       
        // Check for missing imports
        usedComponents.forEach(componentName => {
            if (!imports.components?.[componentName]) {
                // Some components are auto-imported
                const autoImported = ['oj-bind-if', 'oj-bind-text', 'oj-bind-for-each'];
                if (!autoImported.includes(componentName)) {
                    this.addIssue(
                        'warning',
                        `Component '${componentName}' is used but not imported`,
                        0,
                        0
                    );
                }
            }
        });
    }
 
    // Audit security configuration
    auditSecurity(modelData) {
        const security = modelData.security;
       
        if (security) {
            if (security.access) {
                // Check for valid security configuration
                if (security.access.requiresAuthentication === false &&
                    (security.access.roles || security.access.permissions)) {
                    this.addIssue(
                        'error',
                        'Roles/permissions specified but authentication not required',
                        0,
                        0
                    );
                }
               
                // Check for empty security arrays
                if (Array.isArray(security.access.roles) && security.access.roles.length === 0) {
                    this.addIssue(
                        'warning',
                        'Empty roles array in security configuration',
                        0,
                        0
                    );
                }
            }
        }
    }
 
    // Audit translations
    auditTranslations(modelData, componentTree) {
        const translations = modelData.translations || {};
        const usedTranslations = new Set();
       
        // Find translation usage in HTML
        this.traverseAST(componentTree, (node) => {
            if (node.bindings) {
                node.bindings.forEach(binding => {
                    const translationMatch = binding.expression.match(/\$translations\.(\w+)\.(\w+)/);
                    if (translationMatch) {
                        usedTranslations.add(`${translationMatch[1]}.${translationMatch[2]}`);
                    }
                });
            }
        });
       
        // Check translation bundle paths
        Object.entries(translations).forEach(([bundleName, bundleConfig]) => {
            if (!bundleConfig.path) {
                this.addIssue(
                    'error',
                    `Translation bundle '${bundleName}' is missing path`,
                    0,
                    0
                );
            }
           
            // Check for valid path format
            if (bundleConfig.path && !bundleConfig.path.includes('/nls/')) {
                this.addIssue(
                    'warning',
                    `Translation bundle path should contain '/nls/' folder`,
                    0,
                    0
                );
            }
        });
    }
 
    // Audit fragments
    auditFragments(componentTree, modelData) {
        const fragments = componentTree.fragments || [];
       
        fragments.forEach(fragment => {
            // Check fragment has name
            if (!fragment.name) {
                this.addIssue(
                    'error',
                    'Fragment is missing name attribute',
                    fragment.line,
                    0
                );
            }
           
            // Check fragment has ID for persistence
            if (!fragment.id) {
                this.addIssue(
                    'info',
                    `Fragment '${fragment.name}' should have an ID for variable persistence`,
                    fragment.line,
                    0
                );
            }
           
            // Check for bridge attribute in VDOM
            this.traverseAST(componentTree, (node) => {
                if (node.tagName === 'oj-vb-fragment' &&
                    node.attributes.name === fragment.name &&
                    !node.attributes.bridge) {
                    this.addIssue(
                        'warning',
                        `Fragment '${fragment.name}' should have bridge="[[vbBridge]]" attribute`,
                        node.line,
                        node.column
                    );
                }
            });
        });
    }
 
    // Audit performance considerations
    auditPerformance(modelData, componentTree) {
        // Check for large default values
        const variables = modelData.variables || {};
        Object.entries(variables).forEach(([varName, varDef]) => {
            if (varDef.defaultValue &&
                JSON.stringify(varDef.defaultValue).length > 1000) {
                this.addIssue(
                    'warning',
                    `Variable '${varName}' has large defaultValue. Consider loading data asynchronously`,
                    0,
                    0
                );
            }
        });
       
        // Check for excessive watchers
        let watcherCount = 0;
        Object.values(variables).forEach(varDef => {
            if (varDef.onValueChanged) watcherCount++;
        });
       
        if (watcherCount > 20) {
            this.addIssue(
                'warning',
                `High number of onValueChanged watchers (${watcherCount}). May impact performance`,
                0,
                0
            );
        }
       
        // Check for non-deferred heavy components
        this.traverseAST(componentTree, (node) => {
            const heavyComponents = ['oj-chart', 'oj-gantt', 'oj-nbox', 'oj-diagram'];
            if (heavyComponents.includes(node.tagName)) {
                // Check if wrapped in oj-defer
                let parent = node;
                let isDeferred = false;
                while (parent && !isDeferred) {
                    if (parent.tagName === 'oj-defer') {
                        isDeferred = true;
                    }
                    parent = parent.parent;
                }
               
                if (!isDeferred) {
                    this.addIssue(
                        'info',
                        `Consider wrapping ${node.tagName} in oj-defer for better performance`,
                        node.line,
                        node.column
                    );
                }
            }
        });
    }
 
    // Traverse AST helper
    traverseAST(node, callback, parent = null) {
        node.parent = parent;
        callback(node);
        if (node.children) {
            node.children.forEach(child => {
                this.traverseAST(child, callback, node);
            });
        }
    }
     // Helper to add an issue
    addIssue(severity, message, line, column, details = {}) {
        this.issues.push({ severity, message, line, column, details });
    }

    // Generate audit summary
    generateSummary() {
        const summary = {
            totalIssues: this.issues.length,
            errors: this.issues.filter(i => i.severity === 'error').length,
            warnings: this.issues.filter(i => i.severity === 'warning').length,
            info: this.issues.filter(i => i.severity === 'info').length,
            categories: {}
        };
 
        // Categorize issues
        this.issues.forEach(issue => {
            const category = this.categorizeIssue(issue);
            summary.categories[category] = (summary.categories[category] || 0) + 1;
        });
 
        return summary;
    }
 
    // Categorize issues for better reporting
    categorizeIssue(issue) {
        const message = issue.message.toLowerCase();
       
        if (message.includes('variable')) {return 'Variables';}
        if (message.includes('type')) {return 'Types';}
        if (message.includes('action') || message.includes('chain')) {return 'Action Chains';}
        if (message.includes('event') || message.includes('listener')) {return 'Events';}
        if (message.includes('component')) {return 'Components';}
        if (message.includes('import')) {return 'Imports';}
        if (message.includes('security')) {return 'Security';}
        if (message.includes('translation')) {return 'Translations';}
        if (message.includes('fragment')) {return 'Fragments';}
        if (message.includes('performance')) {return 'Performance';}
        if (message.includes('accessibility')) {return 'Accessibility';}
        if (message.includes('binding')) {return 'Data Binding';}
        if (message.includes('oracle jet') || message.includes('oj-')) {return 'Oracle JET';}
       
        return 'Other';
    }
}

// Export the class for consumption by other modules.
module.exports = VBCSAuditTool;
