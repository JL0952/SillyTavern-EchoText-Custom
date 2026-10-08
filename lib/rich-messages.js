(function () {
    'use strict';

    /**
     * EchoText Rich Messages
     *
     * Rich content lives inline in a message's `mes` as XML-style tags, so the
     * model sees its own past usage verbatim in the chat history:
     *
     *     <photo>what the photo shows</photo>
     *     <transfer>52.00</transfer>                  send money
     *     <transfer_accept>52.00</transfer_accept>    accept a transfer
     *     <transfer_decline>52.00</transfer_decline>  decline a transfer
     *
     * Character replies are also split into one bubble per line, the way people
     * send several short texts in a row. Everything here is pure string work —
     * rendering and transfer status live in index.js.
     *
     * Models drift from the canonical format, so parsing is deliberately lenient:
     * alias tag names, attributes, self-closing tags, unclosed tags, stray closers,
     * and contents broken across lines are all repaired by normalizeMessageTags().
     */

    const CURRENCY = '¥';

    // Canonical tag name → names models commonly use for it
    const TAG_ALIASES = {
        photo: ['photo', 'image', 'picture', 'pic', 'img', '照片', '图片'],
        transfer: ['transfer', 'money_transfer', '转账'],
        transfer_accept: ['transfer_accept', 'accept_transfer', 'transfer_accepted', 'receive_transfer', 'transfer_received', '收款', '接收转账', '已收款'],
        transfer_decline: ['transfer_decline', 'decline_transfer', 'transfer_declined', 'reject_transfer', 'refuse_transfer', 'return_transfer', 'transfer_returned', '拒绝转账', '退还转账', '已退还'],
    };
    const TAG_TYPES = Object.keys(TAG_ALIASES);
    const AMOUNT_TYPES = new Set(['transfer', 'transfer_accept', 'transfer_decline']);

    const ALIAS_TO_TYPE = new Map();
    for (const [type, aliases] of Object.entries(TAG_ALIASES)) {
        for (const alias of aliases) ALIAS_TO_TYPE.set(alias.toLowerCase(), type);
    }

    const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Longest first so alternation can't stop at a shorter alias; a name must be
    // followed by whitespace, '/' or '>' (\b doesn't work for CJK names)
    const ALIAS_GROUP = [...ALIAS_TO_TYPE.keys()].sort((a, b) => b.length - a.length).map(escapeRe).join('|');
    const ANY_ALIAS_RE = new RegExp(`<\\s*\\/?\\s*(?:${ALIAS_GROUP})(?=[\\s/>])`, 'i');
    const OPEN_TAG_RE = new RegExp(`<\\s*(${ALIAS_GROUP})(?=[\\s/>])([^>]*)>`, 'gi');
    const CLOSE_TAG_RE = new RegExp(`<\\s*\\/\\s*(${ALIAS_GROUP})\\s*>`, 'gi');
    const ATTR_VALUE_RE = /\b(?:desc|description|alt|caption|content|amount|value)\s*=\s*(["'])([\s\S]*?)\1/i;

    const TYPE_GROUP = TAG_TYPES.join('|');
    const ANY_OPEN = `<(?:${TYPE_GROUP})>`;
    const TOKEN_RE = new RegExp(`<(\\/?)(${TYPE_GROUP})>`, 'g');
    const CLOSED_TAG_RE = new RegExp(`<(${TYPE_GROUP})>((?:(?!${ANY_OPEN})[\\s\\S])*?)<\\/\\1>`, 'g');
    const PART_RE = new RegExp(`<(${TYPE_GROUP})>([\\s\\S]*?)<\\/\\1>`, 'g');
    const FENCE_RE = /^\s*```/;

    /**
     * Formats a transfer amount as "52.00"; unparseable contents are kept as-is
     * and an empty amount stays empty (a response can omit it).
     */
    function normalizeAmount(content) {
        const text = String(content ?? '').trim();
        const match = text.replace(/,/g, '').match(/\d+(?:\.\d+)?/);
        if (!match) return text;
        const value = Number(match[0]);
        return Number.isFinite(value) ? value.toFixed(2) : text;
    }

    /**
     * Rewrites every rich-content tag in `text` into its canonical single-line
     * `<type>content</type>` form. Text without such tags is returned as-is.
     */
    function normalizeMessageTags(text) {
        let out = String(text ?? '');
        if (!ANY_ALIAS_RE.test(out)) return out;

        // 1. Unify tag names; a self-closing tag carries its content in an attribute
        out = out.replace(OPEN_TAG_RE, (match, alias, attrs) => {
            const type = ALIAS_TO_TYPE.get(alias.toLowerCase());
            if (!/\/\s*$/.test(attrs)) return `<${type}>`;
            const content = (attrs.match(ATTR_VALUE_RE) || [])[2] || '';
            return `<${type}>${content}</${type}>`;
        });
        out = out.replace(CLOSE_TAG_RE, (match, alias) => `</${ALIAS_TO_TYPE.get(alias.toLowerCase())}>`);

        // 2. Closed contents that wrap across lines are joined back into one line
        out = out.replace(CLOSED_TAG_RE, (match, type, content) =>
            `<${type}>${content.replace(/\s*\n\s*/g, ' ')}</${type}>`);

        // 3. Per line: an unclosed tag runs to the next tag or the end of the line,
        //    and closers without an opener are dropped
        out = out.split('\n').map(normalizeLine).join('\n');

        // 4. Models sometimes wrap a tag in inline-code backticks
        out = out.replace(new RegExp(`\`+(<(${TYPE_GROUP})>[^\\n]*?<\\/\\2>)\`+`, 'g'), '$1');

        // 5. Transfer amounts are plain numbers with two decimals
        return out.replace(PART_RE, (match, type, content) =>
            AMOUNT_TYPES.has(type) ? `<${type}>${normalizeAmount(content)}</${type}>` : match);
    }

    function normalizeLine(line) {
        let result = '';
        let open = null; // { type, start }
        let i = 0;
        const closeOpen = (end) => {
            const content = line.slice(open.start, end).replace(TOKEN_RE, '').trim();
            result += `<${open.type}>${content}</${open.type}>`;
        };
        for (const token of line.matchAll(TOKEN_RE)) {
            const isClose = token[1] === '/';
            const type = token[2];
            const end = token.index + token[0].length;
            if (open) {
                if (isClose && type === open.type) {
                    closeOpen(token.index);
                    open = null;
                    i = end;
                } else if (!isClose) {
                    // A new tag ends the unclosed one
                    closeOpen(token.index);
                    open = { type, start: end };
                    i = end;
                }
                // A closer of another type inside the content is stripped by closeOpen
            } else if (isClose) {
                result += line.slice(i, token.index);
                i = end;
            } else {
                result += line.slice(i, token.index);
                open = { type, start: end };
                i = end;
            }
        }
        if (open) closeOpen(line.length);
        else result += line.slice(i);
        return result;
    }

    /**
     * Splits a text segment into one text per non-empty line. Fenced code blocks
     * stay together in a single text.
     */
    function splitIntoTexts(segment) {
        const texts = [];
        let fence = null;
        for (const line of segment.split('\n')) {
            if (fence !== null) {
                fence += '\n' + line;
                if (FENCE_RE.test(line)) {
                    texts.push(fence);
                    fence = null;
                }
                continue;
            }
            // A fence that also closes on its own line is ordinary text
            if (FENCE_RE.test(line) && !/```.*```/.test(line)) {
                fence = line;
                continue;
            }
            if (line.trim()) texts.push(line.trim());
        }
        if (fence !== null) texts.push(fence);
        return texts;
    }

    /**
     * Parses a message into display parts, in order:
     *   { type: 'text', text }
     *   { type: 'photo', desc }
     *   { type: 'transfer' | 'transfer_accept' | 'transfer_decline', amount }
     * `amount` is "52.00", or '' when a response omits it.
     * @param {string} text - the stored message text
     * @param {object} [options]
     * @param {boolean} [options.splitLines=false] - one text part per line (character
     *   replies); otherwise each run of text between tags stays a single part
     * @returns {Array<object>} parts; empty when the message has no visible content
     */
    function parseMessageParts(text, { splitLines = false } = {}) {
        const normalized = normalizeMessageTags(text);
        const parts = [];

        const pushText = (segment) => {
            if (splitLines) {
                for (const chunk of splitIntoTexts(segment)) parts.push({ type: 'text', text: chunk });
                return;
            }
            const trimmed = segment.trim();
            if (trimmed) parts.push({ type: 'text', text: trimmed });
        };

        let last = 0;
        for (const match of normalized.matchAll(PART_RE)) {
            pushText(normalized.slice(last, match.index));
            const [, type, content] = match;
            parts.push(type === 'photo'
                ? { type, desc: content.trim() }
                : { type, amount: content.trim() });
            last = match.index + match[0].length;
        }
        pushText(normalized.slice(last));
        return parts;
    }

    /**
     * The inverse of parseMessageParts: canonical message text for a list of parts,
     * one per line (used to drop a single bubble from a message).
     */
    function serializeParts(parts) {
        return parts.map(part => {
            if (part.type === 'text') return part.text;
            const content = part.type === 'photo' ? part.desc : part.amount;
            return `<${part.type}>${content ?? ''}</${part.type}>`;
        }).join('\n');
    }

    /** Whether the message contains any rich-content tag. */
    function hasRichContent(text) {
        return ANY_ALIAS_RE.test(String(text ?? ''));
    }

    /** "¥52.00" — or the raw content when it isn't a number. */
    function formatAmount(amount) {
        return /^\d+\.\d{2}$/.test(amount) ? `${CURRENCY}${amount}` : amount;
    }

    /**
     * Plain-text rendering for previews, exports and analysis, e.g.
     * "[Photo: …]", "[Transfer: ¥52.00]", "[Accepted transfer: ¥52.00]".
     */
    function toPlainText(text) {
        const labels = { transfer: 'Transfer', transfer_accept: 'Accepted transfer', transfer_decline: 'Declined transfer' };
        return normalizeMessageTags(text).replace(PART_RE, (match, type, content) => {
            const value = type === 'photo' ? content.trim() : formatAmount(content.trim());
            const label = type === 'photo' ? 'Photo' : labels[type];
            return value ? `[${label}: ${value}]` : `[${label}]`;
        });
    }

    window.EchoTextRichMessages = {
        CURRENCY,
        normalizeMessageTags,
        parseMessageParts,
        serializeParts,
        hasRichContent,
        formatAmount,
        toPlainText,
    };
})();
