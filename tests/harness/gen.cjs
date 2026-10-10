// Extracts EchoText's real message-list functions from an index.js into a
// browser bundle the harness pages can run, with everything else stubbed.
// usage: node gen.cjs <index.js> <label> <out.js>   (EXTRA=name,name adds functions)
//
// The bundle registers window.EchoTextHarness[label] = env => { ...functions },
// where env supplies the stubbed values and functions (see the pages).
const fs = require('fs');
const path = require('path');

// acorn comes with SillyTavern (this repo lives in data/default-user/extensions/)
const ST_ROOT = process.env.ST_ROOT || path.resolve(__dirname, '../../../../../..');
const acorn = require(path.join(ST_ROOT, 'node_modules/acorn'));

const [, , src, label, out] = process.argv;
const code = fs.readFileSync(src, 'utf8');
const ast = acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'script' });

// The IIFE body: (function () { ... })();
const iife = ast.body.find(n => n.type === 'ExpressionStatement');
const body = (iife.expression.callee || iife.expression.expression.callee).body.body;

const WANT = [
    // data / view model
    'RichMessages', 'Features', 'ChatViewModel', 'Platform', 'Platforms', 'PLATFORM_IDS', 'activePlatformMemo', 'getActivePlatform',
    'syncPlatformChrome', 'populatePlatformSelects', 'bindPlatformSelects', 'onPlatformChoiceChanged', 'getColorScheme', 'getReactionIds', 'startInlineEdit', 'getActiveFeatures', 'platformHas',
    'getMessageDisplayParts', 'getMessageReactions', 'staggeredMessageKeys', 'shouldStaggerReveal', 'staggerRevealParts',
    // html
    'escapeHtml', 'convertEmoticonsToEmojis', 'formatMessageText', 'buildAvatarHtml', 'applyMemoryHighlights', '_highlightTextNode',
    // rendering and actions
    'renderMessages', 'showPrevSwipe', 'showNextSwipe', 'openImageAttachment', 'MESSAGE_ACTIONS', 'onMessageAction', 'bindMessageActions', 'onBubbleTap',
    'renderedViews', 'renderedFrame', 'getRenderFrame', 'updateMessageList', 'replaceMessageElement', 'scrollMessagesToEnd',
    'getChatViewOptions', 'getMessageRenderContext', 'findMessageElement', 'decorateMessage', 'refreshMessages',
    // the "+" panel (syncPlatformChrome closes it)
    'closeAttachPanel', 'followAttachPanel', 'attachPanelDuration', 'messagesFromBottom',
    // older index.js versions (before step 2c) built the message HTML themselves
    'resolveTransfers', 'normalizeReactionStore', 'MESSAGE_GROUP_WINDOW_MS', 'buildReactionNoteHtml', 'buildPhotoCardHtml',
    'buildTransferCardHtml', 'buildPartContentHtml', 'partBubbleClass', 'buildLeadingPartBubblesHtml', 'buildImageAttachmentHtml',
    'buildReceiptHtml', 'RECEIPT_STATES', 'buildReactionPillsHtml', 'renderStoredReactions', 'renderCharacterReaction', 'buildMessageHtml',
];
const VALUE_STUBS = ['settings', 'groupManager', 'FA_REACTIONS', 'showTypingIndicator', 'isGenerating', 'BASE_URL', 'VERSION_QUERY', 'composeMode', 'panelOpen'];
const FUNC_STUBS = [
    'getCurrentCharacter', 'showNoCharacterMessage', 'getCharacterName', 'isTetheredMode', 'getUserName',
    'getCharacterKey', 'getCharAvatarUrl', '_pickerAvatarBg', '_fingerprintAvatarImg', 'isMobileDevice',
    'closeAllDotMenus', 'closeAllReactOverlays', 'toggleReactOverlay', 'toggleDotsMenu', 'addReaction',
    'getChatHistory', 'syncMsgFromSwipe', 'saveChatHistory', 'updateSwipeInPlace', 'generateEchoTextSwipe',
    'openTransferResponseMenu', 'openGeneratedImageLightbox', 'bindBubbleTouchSwipe',
    'showMemorySaveModal', 'showMemoryRemoveModal', 'setComposeMode', 'saveSettings',
    'getAvatarUrlForCharacter', 'isCombinedGroupMode', 'getUserAvatarUrl',
];

for (const name of (process.env.EXTRA || '').split(',').filter(Boolean)) WANT.push(name);

const found = new Map();
const functions = [];
for (const node of body) {
    if (node.type === 'FunctionDeclaration' && WANT.includes(node.id.name)) {
        found.set(node.id.name, code.slice(node.start, node.end));
        functions.push(node.id.name);
    } else if (node.type === 'VariableDeclaration') {
        for (const d of node.declarations) {
            if (d.id.type === 'Identifier' && WANT.includes(d.id.name)) {
                found.set(d.id.name, code.slice(node.start, node.end));
            }
        }
    }
}

const lines = [];
lines.push('window.EchoTextHarness = window.EchoTextHarness || {};');
lines.push(`window.EchoTextHarness[${JSON.stringify(label)}] = function (env) {`);
for (const name of VALUE_STUBS) if (!found.has(name)) lines.push(`let ${name} = env.${name};`);
for (const name of FUNC_STUBS) {
    if (!found.has(name)) lines.push(`function ${name}(...a) { return env.${name} ? env.${name}(...a) : undefined; }`);
}
for (const name of WANT) if (found.has(name)) lines.push(found.get(name));
lines.push(`return { ${functions.join(', ')} };`);
lines.push('};');
fs.writeFileSync(out, lines.join('\n'));
console.log(`${label}: ${functions.length} functions from ${path.relative(process.cwd(), src) || src}`);
