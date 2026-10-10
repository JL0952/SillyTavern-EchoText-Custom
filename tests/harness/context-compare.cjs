(async () => {
// Compares what the model is sent (context helpers) between index.js at REF
// (default HEAD) and the working index.js, on the harness's mock chats; then
// shows the main chat as sent on a platform without reactions (WeChat).
// usage: node tests/harness/context-compare.cjs [REF]
const fs = require('fs');
const path = require('path');
const REPO = path.resolve(__dirname, '../..');
const ST_ROOT = process.env.ST_ROOT || path.resolve(REPO, '../../../..');
const acorn = require(path.join(ST_ROOT, 'node_modules/acorn'));
const REF = process.argv[2] || 'HEAD';
const H = __dirname;

global.window = {};
for (const f of ['lib/rich-messages.js', 'lib/features.js', 'lib/chat-view-model.js', 'platforms/echotext/platform.js', 'platforms/wechat/platform.js']) new Function(fs.readFileSync(`${REPO}/${f}`, 'utf8'))();
new Function(fs.readFileSync(`${H}/scenarios.js`, 'utf8'))();

const NAMES = ['RichMessages', 'Features', 'ChatViewModel', 'Platform', 'Platforms', 'activePlatformMemo', 'getActivePlatform', 'getReactionIds', 'getActiveFeatures', 'platformHas',
    'getContextMessageText', 'buildCombinedReactionTurns', 'getUserReactionIds', 'buildUserReactionText', 'resolveHistoryMessageText', 'buildMessageFormatPrompt'];
function load(code) {
    const ast = acorn.parse(code, { ecmaVersion: 'latest' });
    const body = ast.body.find(n => n.type === 'ExpressionStatement').expression.callee.body.body;
    const parts = [];
    for (const node of body) {
        const names = node.type === 'FunctionDeclaration' ? [node.id.name] : node.type === 'VariableDeclaration' ? node.declarations.map(d => d.id.name) : [];
        if (names.some(n => NAMES.includes(n))) parts.push(code.slice(node.start, node.end));
    }
    return new Function('env', `const FA_REACTIONS = env.FA_REACTIONS; const settings = env.settings; const getCharacterKey = () => 'mira.png'; const getUserName = () => 'Me'; const getCharacterName = () => 'Mira'; const stripThinkingTags = t => t;
        ${parts.join('\n')}
        return { getContextMessageText, resolveHistoryMessageText, buildUserReactionText, buildCombinedReactionTurns, buildMessageFormatPrompt };`);
}
const { execSync } = require('child_process');
const settings = { defaultPlatform: 'echotext', platformByCharacter: {} };
const oldApi = load(execSync(`git show ${REF}:index.js`, { cwd: REPO }).toString())({ FA_REACTIONS: window.EchoTextScenarioReactions, settings });
const newApi = load(fs.readFileSync(`${REPO}/index.js`, 'utf8'))({ FA_REACTIONS: window.EchoTextScenarioReactions, settings });

const run = api => {
    const out = [api.buildMessageFormatPrompt('Mira', 'Me')];
    for (const sc of window.EchoTextScenarios) for (const msg of sc.history) {
        out.push(api.getContextMessageText(msg.mes), api.resolveHistoryMessageText(msg), api.buildUserReactionText(msg), JSON.stringify(api.buildCombinedReactionTurns(msg, 'Mira')));
    }
    return out;
};
const a = run(oldApi), b = run(newApi);
const diffs = a.map((v, i) => v === b[i] ? null : { i, old: v, new: b[i] }).filter(Boolean);
console.log(`compared ${a.length} values; differences: ${diffs.length}`);
diffs.slice(0, 5).forEach(d => console.log(d));

// The same chat with the character on a platform without reactions
settings.platformByCharacter['mira.png'] = 'wechat';
await new Promise(r => setTimeout(r));
const sc = window.EchoTextScenarios[0];
console.log('\n--- main chat, react disabled: what each turn sends ---');
sc.history.forEach((msg, i) => {
    const text = newApi.resolveHistoryMessageText(msg);
    const tap = newApi.buildUserReactionText(msg);
    console.log(`${String(i).padStart(2)} ${msg.is_user ? 'user' : 'char'}  ${text === null ? '(left out)' : JSON.stringify(text)}${tap ? '  + tapbacks ' + JSON.stringify(tap) : ''}`);
});
console.log('\nformat rules mention REACTIONS:', /REACTIONS:/.test(newApi.buildMessageFormatPrompt('Mira', 'Me')));

})();
