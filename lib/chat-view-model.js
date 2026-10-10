(function () {
    'use strict';

    /**
     * EchoText Chat View Model
     *
     * Turns a stored chat history into what a chat screen shows: the bubbles of
     * each message, every transfer's status, which message a reaction lands on,
     * grouping, time dividers, read receipts and swipe state. Pure data — no HTML,
     * no DOM, no settings — so each platform's templates render from the same
     * list, and the logic runs under Node tests.
     *
     *     buildChatViewModel(history, options) → { messages: [MessageView], lastCharIndex }
     *
     * Only the platform's features show (options.features, lib/features.js): a
     * missing 'strip' feature's parts and reactions are left out, a missing
     * 'degrade' feature's parts become the plain-text note the model sees, and a
     * message left with nothing to show isn't in the list at all.
     *
     * MessageView:
     *   index            position in `history` (what data-index refers to)
     *   isUser
     *   senderName       user name, or the character's (its own name in combine mode)
     *   charKey          combine mode only: the sending member's key, else null
     *   timestamp        msg.send_date, or null when the message has none
     *   parts            PartView[], never empty
     *   groupedWithNext  user messages: the next message is the user's too, sent within
     *                    `groupWindowMs` — only the last of a run shows its footer
     *   showTimeDivider  a time divider goes before this message (unused by the native look)
     *   receipt          user messages: { state, note }, else null
     *   reactions        character messages: the user's tapbacks [{ id, count, mine }]
     *   charReaction     user messages: the character's reaction id, else null
     *   swipe            last character message with swipes on: { index, count, isLast }, else null
     *   imageAttachment  msg.imageAttachment, or null
     *   memoryHighlights user messages with highlights on: msg.memoryHighlights, else []
     *
     * PartView is a parsed part from RichMessages.parseMessageParts():
     *   { type: 'text', text } | { type: 'photo', desc } | { type: 'reaction_note', reaction }
     *   { type: 'transfer', amount, status, displayAmount, actionable }
     *   { type: 'transfer_accept' | 'transfer_decline', amount, status, displayAmount }
     */

    const RichMessages = window.EchoTextRichMessages;
    const Features = window.EchoTextFeatures;

    // Consecutive user messages sent within this window render as one group
    const DEFAULT_GROUP_WINDOW_MS = 5 * 60 * 1000;
    // A time divider shows when this long has passed since the last one, or the day changed
    const DEFAULT_TIME_DIVIDER_GAP_MS = 5 * 60 * 1000;

    const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    /**
     * Display parts for a message. Character replies get one bubble per line;
     * user messages only split around rich content. <react> tags aren't bubbles
     * (they show on the user's message — see getMessageReactions); a reply that
     * is only a reaction gets a small note instead. Always returns at least one
     * part so empty turns (e.g. a silent image reply) still get their bubble.
     * @param {object} msg
     * @param {string} charName - the active character, for messages without a charName
     */
    function getMessageDisplayParts(msg, charName = '') {
        const allParts = RichMessages.parseMessageParts(msg?.mes, { splitLines: !msg?.is_user });
        const parts = allParts.filter(part => part.type !== 'react');
        if (!parts.length) {
            const reaction = allParts.find(part => part.reaction)?.reaction;
            return [reaction ? { type: 'reaction_note', reaction } : { type: 'text', text: '' }];
        }

        // Weaker models sometimes prefix every line script-style ("Name: ...")
        if (!msg.is_user) {
            const senderName = msg.charName || charName;
            const prefix = new RegExp(`^${escapeRe(senderName)}\\s*[:：]\\s*`);
            for (const part of parts) {
                if (part.type === 'text') part.text = part.text.replace(prefix, '');
            }
        }
        const visible = parts.filter(part => part.type !== 'text' || part.text);
        return visible.length ? visible : [{ type: 'text', text: '' }];
    }

    /** Reaction ids (among `reactionIds`) a character's message applies with <react> tags. */
    function getMessageReactions(msg, reactionIds = RichMessages.REACTION_IDS) {
        if (!msg || msg.is_user) return [];
        return RichMessages.parseMessageParts(msg.mes)
            .filter(part => part.type === 'react' && reactionIds.includes(part.reaction))
            .map(part => part.reaction);
    }

    /**
     * Works out every transfer's status from the responses that follow it. A
     * <transfer_accept>/<transfer_decline> settles a pending transfer from the
     * other side — the latest one with the same value, else the latest one — and
     * takes that transfer's amount when it names none.
     *
     * Currency: an amount without a symbol (models usually write a bare number)
     * uses the last currency named earlier in the chat, else the default.
     * @param {Array<object>} history
     * @param {Array<Array<object>>} allParts - each message's display parts
     * @returns {Map<string, object>} keyed "messageIndex:partIndex" — transfers get
     *   { status, amount, symbol }, responses get { amount, symbol }
     */
    function resolveTransfers(history, allParts) {
        const info = new Map();
        const pending = { user: [], char: [] };
        let chatCurrency = RichMessages.DEFAULT_CURRENCY;
        history.forEach((msg, i) => {
            const side = msg.is_user ? 'user' : 'char';
            const other = msg.is_user ? 'char' : 'user';
            allParts[i].forEach((part, j) => {
                if (part.type !== 'transfer' && part.type !== 'transfer_accept' && part.type !== 'transfer_decline') return;
                const { symbol: ownSymbol, value } = RichMessages.splitAmount(part.amount);
                if (part.type === 'transfer') {
                    const entry = { status: 'pending', amount: part.amount, value, symbol: ownSymbol || chatCurrency };
                    info.set(`${i}:${j}`, entry);
                    pending[side].push(entry);
                } else {
                    const queue = pending[other];
                    let k = value ? queue.map(t => t.value).lastIndexOf(value) : -1;
                    if (k === -1) k = queue.length - 1;
                    const target = k >= 0 ? queue.splice(k, 1)[0] : null;
                    if (target) target.status = part.type === 'transfer_accept' ? 'accepted' : 'declined';
                    info.set(`${i}:${j}`, {
                        amount: part.amount || target?.amount || '',
                        symbol: ownSymbol || target?.symbol || chatCurrency,
                    });
                }
                if (ownSymbol) chatCurrency = ownSymbol;
            });
        });
        return info;
    }

    /** A part with its transfer state filled in; other parts are returned as-is. */
    function toPartView(part, transfer, isUser) {
        if (part.type !== 'transfer' && part.type !== 'transfer_accept' && part.type !== 'transfer_decline') return part;
        const displayAmount = RichMessages.formatAmount(transfer?.amount || part.amount, transfer?.symbol);
        if (part.type !== 'transfer') {
            return { ...part, status: part.type === 'transfer_accept' ? 'accepted' : 'declined', displayAmount };
        }
        const status = transfer?.status || 'pending';
        // Only a pending transfer from the character waits on the user
        return { ...part, status, displayAmount, actionable: status === 'pending' && !isUser };
    }

    /** The feature a display part belongs to ('reaction_note' stands in for a reply that was only a <react>). */
    function partFeature(type) {
        if (type === 'reaction_note') return 'react';
        return Features.FEATURES.find(f => f.tags.includes(type))?.id || null;
    }

    /**
     * A message's parts on a platform with only `features`: parts of a missing
     * 'strip' feature are dropped, parts of a missing 'degrade' feature become the
     * same plain-text note the model sees.
     */
    function applyFeatures(parts, features) {
        return parts.flatMap(part => {
            const id = partFeature(part.type);
            if (!id || features.includes(id)) return [part];
            if (Features.FEATURES.find(f => f.id === id).contextPolicy === 'strip') return [];
            return [{ type: 'text', text: RichMessages.toPlainText(RichMessages.serializeParts([part])) }];
        });
    }

    /** The user's tapbacks stored on a character message: { id: { count, mine } }, zero counts dropped. */
    function normalizeReactionStore(reactions) {
        if (!reactions || typeof reactions !== 'object' || Array.isArray(reactions)) return {};
        const normalized = {};
        for (const [reactionId, data] of Object.entries(reactions)) {
            const count = Math.max(0, parseInt(data?.count, 10) || 0);
            if (count <= 0) continue;
            normalized[reactionId] = {
                count,
                mine: data?.mine === true
            };
        }
        return normalized;
    }

    /** The user's tapbacks on a character message as a list, limited to `reactionIds`. */
    function getStoredReactions(msg, reactionIds = RichMessages.REACTION_IDS) {
        if (!msg || msg.is_user) return [];
        return Object.entries(normalizeReactionStore(msg.reactions))
            .filter(([id]) => reactionIds.includes(id))
            .map(([id, data]) => ({ id, ...data }));
    }

    function isSameLocalDay(a, b) {
        const da = new Date(a), db = new Date(b);
        return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
    }

    /**
     * @param {Array<object>} history - stored messages, oldest first
     * @param {object} [options]
     * @param {string} [options.charName] - the active character
     * @param {string} [options.userName]
     * @param {string[]} [options.reactionIds] - reactions this screen can show
     * @param {string[]} [options.features] - the platform's features (default: all)
     * @param {boolean} [options.combineMode] - group combine mode: messages keep their own sender
     * @param {boolean} [options.swipes] - swipe navigation on the last character message
     * @param {boolean} [options.memoryHighlights] - mark remembered phrases in user messages
     * @param {number} [options.groupWindowMs]
     * @param {number} [options.timeDividerGapMs]
     * @param {number} [options.now] - stands in for messages without a send_date
     */
    function buildChatViewModel(history, options = {}) {
        const {
            charName = '',
            userName = '',
            reactionIds = RichMessages.REACTION_IDS,
            features = Features.FEATURE_IDS,
            combineMode = false,
            swipes = false,
            memoryHighlights = false,
            groupWindowMs = DEFAULT_GROUP_WINDOW_MS,
            timeDividerGapMs = DEFAULT_TIME_DIVIDER_GAP_MS,
            now = Date.now(),
        } = options;
        const messages = Array.isArray(history) ? history : [];

        // Swipe navigation only shows on the last character message
        const lastCharIndex = messages.reduce((last, msg, i) => (!msg.is_user ? i : last), -1);

        // A transfer's status depends on later messages, so parse everything first
        const allParts = messages.map(msg => getMessageDisplayParts(msg, charName));
        const transfers = resolveTransfers(messages, allParts);

        // A character's <react> applies to the user's latest message before the reply
        const tagReactions = new Map();
        let lastUserIndex = -1;
        messages.forEach((msg, i) => {
            if (msg.is_user) lastUserIndex = i;
            else if (lastUserIndex >= 0) {
                for (const reaction of getMessageReactions(msg, reactionIds)) tagReactions.set(lastUserIndex, reaction);
            }
        });

        // Each message's bubbles on this platform; null when nothing is left to show
        const shownParts = messages.map((msg, index) => {
            const parts = applyFeatures(allParts[index].map((part, j) =>
                toPartView(part, transfers.get(`${index}:${j}`), !!msg.is_user)), features);
            if (parts.length) return parts;
            // A reply that was only an unsupported reaction still shows its image
            return msg.imageAttachment ? [{ type: 'text', text: '' }] : null;
        });

        // Grouping looks past hidden messages to the next one on screen
        const nextShown = new Array(messages.length).fill(null);
        for (let i = messages.length - 1, next = null; i >= 0; i--) {
            nextShown[i] = next;
            if (shownParts[i]) next = messages[i];
        }
        const showReactions = features.includes('react');

        let lastDividerTime = null;
        const views = [];
        messages.forEach((msg, index) => {
            if (!shownParts[index]) return;
            const isUser = !!msg.is_user;
            const next = nextShown[index];
            const time = msg.send_date || now;
            const showTimeDivider = lastDividerTime === null
                || time - lastDividerTime >= timeDividerGapMs || !isSameLocalDay(time, lastDividerTime);
            if (showTimeDivider) lastDividerTime = time;

            let swipe = null;
            if (swipes && index === lastCharIndex) {
                const count = Array.isArray(msg.swipes) && msg.swipes.length > 0 ? msg.swipes.length : 1;
                const swipeIndex = msg.swipes ? Math.max(0, Math.min(msg.swipeIndex ?? 0, count - 1)) : 0;
                swipe = { index: swipeIndex, count, isLast: swipeIndex >= count - 1 };
            }

            // Reaction from a <react> tag, else one stored by the former auto-reaction
            const charReaction = isUser ? (tagReactions.get(index) || msg.charReaction || null) : null;

            views.push({
                index,
                isUser,
                senderName: isUser ? userName : ((combineMode && msg.charName) ? msg.charName : charName),
                charKey: !isUser && combineMode && msg.charKey ? msg.charKey : null,
                timestamp: msg.send_date || null,
                parts: shownParts[index],
                groupedWithNext: isUser && !!next?.is_user
                    && (next.send_date || 0) - (msg.send_date || 0) < groupWindowMs,
                showTimeDivider,
                receipt: isUser
                    ? { state: String(msg.meta?.receipt?.state || 'sent'), note: msg.meta?.receipt?.note || '' }
                    : null,
                reactions: isUser || !showReactions ? [] : getStoredReactions(msg, reactionIds),
                charReaction: showReactions && charReaction && reactionIds.includes(charReaction) ? charReaction : null,
                swipe,
                imageAttachment: msg.imageAttachment || null,
                memoryHighlights: isUser && memoryHighlights && Array.isArray(msg.memoryHighlights) ? msg.memoryHighlights : [],
            });
        });

        return { messages: views, lastCharIndex };
    }

    window.EchoTextChatViewModel = {
        DEFAULT_GROUP_WINDOW_MS,
        DEFAULT_TIME_DIVIDER_GAP_MS,
        buildChatViewModel,
        getMessageDisplayParts,
        getMessageReactions,
        resolveTransfers,
        normalizeReactionStore,
        getStoredReactions,
    };
})();
