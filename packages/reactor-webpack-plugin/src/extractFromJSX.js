"use strict";

import { parse } from 'babylon';
import traverse from 'ast-traverse';
import generate from 'babel-generator';

const OLD_MODULE_PATTERN = /^@extjs\/reactor\/modern$/;
const MODULE_PATTERN = /^@extjs\/(ext-react.*|reactor\/(classic|modern))$/;

/**
 * Extracts Ext.create equivalents from jsx tags so that cmd knows which classes to include in the bundle
 * @param {String} js The javascript code
 * @param {Compilation} compilation The webpack compilation object
 * @returns {Array} An array of Ext.create statements
 */
module.exports = function extractFromJSX(js, compilation, module) {
    const statements = [];
    const types = {};

    // Aliases used for reactify
    const reactifyAliases = new Set([]);

    const extReactPackages = {};

    const ast = parse(js, {
        plugins: [
            'jsx',
            'flow',
            'doExpressions',
            'objectRestSpread',
            'classProperties',
            'exportExtensions',
            'asyncGenerators',
            'functionBind',
            'functionSent',
            'dynamicImport'
        ],
        sourceType: 'module'
    });

    /**
     * Adds a type mapping for a reactify call
     * @param {String} varName The name of the local variable being defined.
     * @param {Node} reactifyArgNode The argument passed to reactify()
     */
    function addType(varName, reactifyArgNode) {
        if (reactifyArgNode.type === 'StringLiteral') {
            types[varName] = { xtype: reactifyArgNode.value };
        } else {
            types[varName] = { xclass: `"${js.slice(reactifyArgNode.start, reactifyArgNode.end)}"` };
        }
    }

    traverse(ast, {
        pre: function(node) {
            if (node.type == 'ImportDeclaration') {
                if (node.source.value.match(OLD_MODULE_PATTERN) || node.source.value.match(MODULE_PATTERN)) {

                    if (node.source.value.match(OLD_MODULE_PATTERN)) {
                        compilation.warnings.push(`${module.resource}: ${node.source.value} is deprecated, use @extjs/ext-react instead.`);
                    }

                    // look for: import { Grid } from '@extjs/reactor
                    for (let spec of node.specifiers) {
                        types[spec.local.name] = {xtype: `"${spec.imported.name.toLowerCase().replace(/_/g, '-')}"`};
                    }
                } else if (node.source.value === '@extjs/reactor') {
                    // identify local names of reactify based on import { reactify as foo } from '@extjs/reactor';
                    for (let spec of node.specifiers) {
                        if (spec.imported.name === 'reactify') {
                            reactifyAliases.add(spec.local.name);
                        }
                    }
                }
            }

            if (isExtReactPackageRequire(node)) {
                extReactPackages[node.id.name] = true;
            }

            // Look for reactify calls. Keep track of the names of each component so we can map JSX tags to xtypes and
            // convert props to configs so Sencha Cmd can discover automatic dependencies in the manifest.
            if (node.type == 'VariableDeclarator' && node.init && node.init.type === 'CallExpression' && node.init.callee && reactifyAliases.has(node.init.callee.name)) {
                if (node.id.elements) {
                    // example: const [ Panel, Grid ] = reactify('Panel', 'Grid');
                    for (let i = 0; i < node.id.elements.length; i++) {
                        const tagName = node.id.elements[i].name;
                        if (!tagName) continue;

                        const valueNode = node.init.arguments[i];
                        if (!valueNode) continue;

                        addType(tagName, valueNode);
                    }
                } else {
                    // example: const Grid = reactify('grid');
                    const varName = node.id.name;
                    const arg = node.init.arguments && node.init.arguments[0];
                    if (varName && arg) addType(varName, arg);
                }
            }

            // Convert React.createElement(...) calls to the equivalent Ext.create(...) calls to put in the manifest.
            if (node.type === 'CallExpression' && node.callee.object && node.callee.object.name === 'React' && node.callee.property.name === 'createElement') {
                const [tag, props] = node.arguments;
                let type = types[tag.name];

                if (tag.object && extReactPackages[tag.object.name]) {
                    type = { xtype: tag.property.name.toLowerCase() }
                }

                if (type) {
                    let config;

                    if (Array.isArray(props.properties)) {
                        config = generate(props).code;
                        for (let key in type) {
                            config = `{\n  ${key}: '${type[key]}',${config.slice(1)}`;
                        }
                    } else {
                        config = JSON.stringify(type);
                    }

                    statements.push(`Ext.create(${config})`);
                }
            }
        }
    });

    // ensure that all imported classes are present in the build even if they aren't used,
    // otherwise the call to reactify will fail
    for (let key in types) {
        statements.push(`Ext.create(${JSON.stringify(types[key])})`)
    }

    return statements;
};

/**
 * Returns true if the node is a variable declaration like:
 * 
 * var ext_react_1 = require('@extjs/ext-react*');
 * var ext_react_1 = require('@extjs/reactor/modern');
 * var ext_react_1 = require('@extjs/reactor/classic');
 * 
 * @param {ASTNode} node 
 */
function isExtReactPackageRequire(node) {
    const callee = node.type == 'VariableDeclarator' && 
        node.init && 
        node.init.type === 'CallExpression' && 
        node.init.callee;

    if (!callee) return;

    const value = node.init.arguments[0];

    return callee &&
        callee.name === 'require' &&
        value && 
        value.type === 'StringLiteral' && 
        value.value.match(MODULE_PATTERN);
}