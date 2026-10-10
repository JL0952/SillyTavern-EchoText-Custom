// Names index.js uses but never declares (scope-insensitive), working tree vs
// REF (default HEAD): a name only in the working tree is likely a typo or a
// function that was renamed or removed while something still calls it.
// usage: node tests/harness/undeclared.cjs [REF]
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const REPO = path.resolve(__dirname, '../..');
const ST_ROOT = process.env.ST_ROOT || path.resolve(REPO, '../../../..');
const acorn = require(path.join(ST_ROOT, 'node_modules/acorn'));
const REF = process.argv[2] || 'HEAD';

function undeclared(code) {
    const ast = acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'script' });
    const declared = new Set(), used = new Set();
    const declarePattern = p => {
        if (!p) return;
        if (p.type === 'Identifier') declared.add(p.name);
        else if (p.type === 'ObjectPattern') p.properties.forEach(q => declarePattern(q.type === 'RestElement' ? q.argument : q.value));
        else if (p.type === 'ArrayPattern') p.elements.forEach(declarePattern);
        else if (p.type === 'AssignmentPattern') declarePattern(p.left);
        else if (p.type === 'RestElement') declarePattern(p.argument);
    };
    const walk = (node, parent, key) => {
        if (!node || typeof node.type !== 'string') return;
        switch (node.type) {
            case 'VariableDeclarator': declarePattern(node.id); break;
            case 'FunctionDeclaration': case 'FunctionExpression': case 'ArrowFunctionExpression':
                if (node.id) declared.add(node.id.name); node.params.forEach(declarePattern); break;
            case 'CatchClause': declarePattern(node.param); break;
            case 'ClassDeclaration': if (node.id) declared.add(node.id.name); break;
            case 'Identifier': {
                const isProp = (parent?.type === 'MemberExpression' && key === 'property' && !parent.computed)
                    || ((parent?.type === 'Property' || parent?.type === 'MethodDefinition') && key === 'key' && !parent.computed)
                    || parent?.type === 'LabeledStatement' || parent?.type === 'BreakStatement' || parent?.type === 'ContinueStatement';
                if (!isProp) used.add(node.name);
            }
        }
        for (const [k, v] of Object.entries(node)) {
            if (Array.isArray(v)) v.forEach(c => walk(c, node, k));
            else if (v && typeof v.type === 'string') walk(v, node, k);
        }
    };
    walk(ast);
    return [...used].filter(n => !declared.has(n) && !(n in globalThis)).sort();
}
const a = undeclared(execSync(`git show ${REF}:index.js`, { cwd: REPO }).toString());
const b = undeclared(fs.readFileSync(path.join(REPO, 'index.js'), 'utf8'));
console.log(`undeclared only in the working tree (vs ${REF}):`, b.filter(n => !a.includes(n)));
console.log(`undeclared only in ${REF}:`, a.filter(n => !b.includes(n)));
