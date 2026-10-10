// Run: node --test tests/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Loaded the way index.js loads its modules: each file sets a global on `window`
globalThis.window = {};
for (const file of ['rich-messages.js', 'features.js', 'chat-view-model.js']) {
    new Function(readFileSync(new URL(`../lib/${file}`, import.meta.url), 'utf8'))();
}
const { buildChatViewModel, getMessageDisplayParts, getStoredReactions, normalizeReactionStore } = window.EchoTextChatViewModel;

const T0 = new Date(2026, 9, 8, 14, 0, 0).getTime();
const at = min => T0 + min * 60000;
const user = (mes, min, extra = {}) => ({ is_user: true, mes, send_date: at(min), ...extra });
const char = (mes, min, extra = {}) => ({ is_user: false, mes, send_date: at(min), ...extra });
const build = (history, options = {}) => buildChatViewModel(history, { charName: 'Mira', userName: 'Me', ...options }).messages;

test('character replies split into one bubble per line; user messages only around rich content', () => {
    const [u, c] = build([
        user('line one\nline two <photo>my lunch</photo> after', 0),
        char('hi\n\nhow are you\n<photo>a cat</photo>', 1),
    ]);
    assert.deepEqual(u.parts, [
        { type: 'text', text: 'line one\nline two' },
        { type: 'photo', desc: 'my lunch' },
        { type: 'text', text: 'after' },
    ]);
    assert.deepEqual(c.parts, [
        { type: 'text', text: 'hi' },
        { type: 'text', text: 'how are you' },
        { type: 'photo', desc: 'a cat' },
    ]);
});

test('script-style name prefixes are stripped from character lines', () => {
    const [c] = build([char('Mira: hey\nMira：you there?\nMiranda: not me', 0)]);
    assert.deepEqual(c.parts.map(p => p.text), ['hey', 'you there?', 'Miranda: not me']);
    const [g] = build([char('Joi: yo', 0, { charName: 'Joi' })]);
    assert.equal(g.parts[0].text, 'yo');
});

test('a reply that is only a reaction becomes a note; an empty message keeps one empty bubble', () => {
    const [, r, e] = build([user('hi', 0), char('<react>❤️</react>', 1), char('', 2)]);
    assert.deepEqual(r.parts, [{ type: 'reaction_note', reaction: 'heart' }]);
    assert.deepEqual(e.parts, [{ type: 'text', text: '' }]);
    assert.deepEqual(getMessageDisplayParts({ is_user: false, mes: 'Mira:' }, 'Mira'), [{ type: 'text', text: '' }]);
});

test('transfers are settled by later responses from the other side', () => {
    const view = build([
        char('<transfer>52</transfer>', 0),
        user('<transfer>$20</transfer>', 1),
        char('<transfer_accept></transfer_accept>', 2),
        user('<transfer_decline>52</transfer_decline>', 3),
        char('<transfer>8</transfer>', 4),
    ]);
    const [charTransfer, userTransfer, accept, decline, pending] = view.map(m => m.parts[0]);
    assert.deepEqual(charTransfer, { type: 'transfer', amount: '52.00', status: 'declined', displayAmount: '¥52.00', actionable: false });
    assert.deepEqual(userTransfer, { type: 'transfer', amount: '$20.00', status: 'accepted', displayAmount: '$20.00', actionable: false });
    // A response without an amount takes the transfer's
    assert.deepEqual(accept, { type: 'transfer_accept', amount: '', status: 'accepted', displayAmount: '$20.00' });
    assert.deepEqual(decline, { type: 'transfer_decline', amount: '52.00', status: 'declined', displayAmount: '¥52.00' });
    // Only a pending transfer from the character waits on the user; a bare amount uses the chat's last currency
    assert.deepEqual(pending, { type: 'transfer', amount: '8.00', status: 'pending', displayAmount: '$8.00', actionable: true });
});

test('a response settles the latest pending transfer with the same value, else the latest one', () => {
    const view = build([
        char('<transfer>10</transfer>\n<transfer>20</transfer>\n<transfer>30</transfer>', 0),
        user('<transfer_accept>20</transfer_accept>', 1),
        user('<transfer_decline>99</transfer_decline>', 2),
    ]);
    assert.deepEqual(view[0].parts.map(p => p.status), ['pending', 'accepted', 'declined']);
    assert.equal(view[2].parts[0].displayAmount, '¥99.00');
});

test('a user transfer is never actionable', () => {
    const [u] = build([user('<transfer>5</transfer>', 0)]);
    assert.equal(u.parts[0].status, 'pending');
    assert.equal(u.parts[0].actionable, false);
});

test("a character's <react> lands on the user's latest message before the reply", () => {
    const view = build([
        user('one', 0),
        user('two', 1),
        char('<react>haha</react>\nlol', 2),
        char('<react>fire</react>\n<react>wow</react>', 3),
        user('three', 4, { charReaction: 'like' }),
        user('four', 5, { charReaction: 'not-a-reaction' }),
    ]);
    assert.deepEqual(view.map(m => m.charReaction), [null, 'wow', null, null, 'like', null]);
    // <react> is not a bubble
    assert.deepEqual(view[2].parts, [{ type: 'text', text: 'lol' }]);
});

test('reactions outside the screen\'s reaction set are dropped everywhere', () => {
    const view = build([
        user('hi', 0, { charReaction: 'like' }),
        char('<react>heart</react>\nok', 1, { reactions: { heart: { count: 1, mine: true } } }),
    ], { reactionIds: [] });
    assert.equal(view[0].charReaction, null);
    assert.deepEqual(view[1].reactions, []);
});

test("the user's tapbacks are normalized and limited to known reactions", () => {
    const reactions = { haha: { count: 1, mine: true }, unknown: { count: 2 }, fire: { count: 0 }, star: { count: '2', mine: 'yes' } };
    assert.deepEqual(normalizeReactionStore(reactions), {
        haha: { count: 1, mine: true }, unknown: { count: 2, mine: false }, star: { count: 2, mine: false },
    });
    assert.deepEqual(getStoredReactions({ is_user: false, reactions }), [
        { id: 'haha', count: 1, mine: true }, { id: 'star', count: 2, mine: false },
    ]);
    assert.deepEqual(getStoredReactions({ is_user: true, reactions }), []);
    assert.deepEqual(normalizeReactionStore([1, 2]), {});
    const [u, c] = build([user('hi', 0), char('yo', 1, { reactions })]);
    assert.deepEqual(u.reactions, []);
    assert.equal(c.reactions.length, 2);
});

test('consecutive user messages within the window are grouped; only the last shows its footer', () => {
    const view = build([
        user('a', 0), user('b', 1), user('c', 2),
        user('d', 10),
        char('x', 11), char('y', 12),
        user('e', 13),
    ]);
    assert.deepEqual(view.map(m => m.groupedWithNext), [true, true, false, false, false, false, false]);
});

test('time dividers show at the start, after a gap since the last divider, and on a new day', () => {
    const view = build([
        user('a', 0), user('b', 3), char('c', 6), user('d', 7), user('e', 9), user('f', 9 + 60 * 24),
    ]);
    assert.deepEqual(view.map(m => m.showTimeDivider), [true, false, true, false, false, true]);
    const [late, early] = build([user('late', 23 * 60 - 14 * 60 + 59), user('early', 24 * 60 - 14 * 60 + 1)], { timeDividerGapMs: 60 * 60000 });
    assert.equal(late.showTimeDivider, true);
    assert.equal(early.showTimeDivider, true, 'crossing midnight starts a new divider');
});

test('receipts: user messages only, sent by default', () => {
    const view = build([
        user('a', 0),
        user('b', 1, { meta: { receipt: { state: 'ghosted', note: 'seen' } } }),
        char('c', 2),
    ]);
    assert.deepEqual(view.map(m => m.receipt), [{ state: 'sent', note: '' }, { state: 'ghosted', note: 'seen' }, null]);
});

test('swipe state shows only on the last character message, with swipes on', () => {
    const history = [
        char('a', 0, { swipes: [{}, {}], swipeIndex: 1 }),
        user('b', 1),
        char('c', 2, { swipes: [{}, {}, {}], swipeIndex: 9 }),
        user('d', 3),
    ];
    const view = build(history, { swipes: true });
    assert.deepEqual(view.map(m => m.swipe), [null, null, { index: 2, count: 3, isLast: true }, null]);
    assert.deepEqual(build(history).map(m => m.swipe), [null, null, null, null]);
    assert.deepEqual(build([char('x', 0)], { swipes: true })[0].swipe, { index: 0, count: 1, isLast: true });
    assert.deepEqual(build([char('x', 0, { swipes: [{}, {}], swipeIndex: 0 })], { swipes: true })[0].swipe, { index: 0, count: 2, isLast: false });
    assert.equal(buildChatViewModel(history).lastCharIndex, 2);
});

test('senders: combine mode keeps each message\'s own character', () => {
    const history = [user('hi', 0), char('hey', 1, { charName: 'Amy', charKey: 'amy.png' }), char('yo', 2)];
    const combined = build(history, { combineMode: true });
    assert.deepEqual(combined.map(m => [m.senderName, m.charKey]), [['Me', null], ['Amy', 'amy.png'], ['Mira', null]]);
    const single = build(history);
    assert.deepEqual(single.map(m => [m.senderName, m.charKey]), [['Me', null], ['Mira', null], ['Mira', null]]);
});

test('memory highlights and image attachments pass through', () => {
    const highlights = [{ text: 'pizza', category: 'preference', label: 'Likes' }];
    const attachment = { type: 'image', status: 'ready', url: 'x.png' };
    const history = [user('pizza', 0, { memoryHighlights: highlights }), char('look', 1, { imageAttachment: attachment })];
    const on = build(history, { memoryHighlights: true });
    assert.deepEqual(on[0].memoryHighlights, highlights);
    assert.deepEqual(on[1].imageAttachment, attachment);
    assert.deepEqual(build(history)[0].memoryHighlights, []);
    assert.equal(on[0].imageAttachment, null);
});

test('messages without a send_date have no timestamp and do not break grouping', () => {
    const view = build([{ is_user: true, mes: 'a' }, { is_user: true, mes: 'b' }], { now: at(0) });
    assert.equal(view[0].timestamp, null);
    assert.equal(view[0].groupedWithNext, true);
    assert.deepEqual(view.map(m => m.showTimeDivider), [true, false]);
});

test('the history is not modified', () => {
    const history = [
        user('<transfer>5</transfer>', 0),
        char('Mira: <transfer_accept/>\n<react>heart</react>', 1, { reactions: { heart: { count: '1', mine: true }, sad: { count: 0 } }, swipes: [{ mes: 'x' }], swipeIndex: 3 }),
    ];
    const before = JSON.stringify(history);
    build(history, { swipes: true, combineMode: true, memoryHighlights: true });
    assert.equal(JSON.stringify(history), before);
});

test('an empty or missing history gives an empty list', () => {
    assert.deepEqual(buildChatViewModel([]), { messages: [], lastCharIndex: -1 });
    assert.deepEqual(buildChatViewModel(null), { messages: [], lastCharIndex: -1 });
});

test('without reactions: reaction-only replies, tapbacks and character reactions disappear', () => {
    const history = [
        user('one', 0, { charReaction: 'like' }),
        char('<react>heart</react>', 1),
        user('two', 2),
        char('ok\n<react>haha</react>', 3, { reactions: { fire: { count: 1, mine: true } } }),
        char('<react>wow</react>', 4, { imageAttachment: { type: 'image', status: 'ready', url: 'x.png' } }),
    ];
    const view = build(history, { features: ['photo', 'transfer'] });
    assert.deepEqual(view.map(m => m.index), [0, 2, 3, 4]);
    assert.deepEqual(view.map(m => m.charReaction), [null, null, null, null]);
    assert.deepEqual(view[2].reactions, []);
    assert.deepEqual(view[2].parts, [{ type: 'text', text: 'ok' }]);
    // A reply that was only a reaction still shows its image
    assert.deepEqual(view[3].parts, [{ type: 'text', text: '' }]);
    // The history keeps everything, and all features show it again
    assert.deepEqual(build(history).map(m => m.index), [0, 1, 2, 3, 4]);
    assert.equal(build(history)[0].charReaction, 'heart');
});

test('hidden messages do not split groups or time dividers', () => {
    const history = [user('a', 0), char('<react>heart</react>', 1), user('b', 2), char('c', 3)];
    const view = build(history, { features: ['photo', 'transfer'] });
    assert.deepEqual(view.map(m => [m.index, m.groupedWithNext, m.showTimeDivider]), [[0, true, true], [2, false, false], [3, false, false]]);
});

test('without photos or transfers, their cards become the same notes the model sees', () => {
    const history = [char('look\n<photo>a cat</photo>\n<transfer>52</transfer>', 0), user('<transfer_accept></transfer_accept>', 1)];
    const view = build(history, { features: ['react'] });
    assert.deepEqual(view[0].parts, [
        { type: 'text', text: 'look' },
        { type: 'text', text: '[Photo: a cat]' },
        { type: 'text', text: '[Transfer: ¥52.00]' },
    ]);
    assert.deepEqual(view[1].parts, [{ type: 'text', text: '[Accepted transfer]' }]);
});
