(function () {
    'use strict';

    /**
     * EchoText Rich Messages
     *
     * Rich content lives inline in a message's `mes` as XML-style tags, so the
     * model sees its own past usage verbatim in the chat history:
     *
     *     <photo>what the photo shows</photo>
     *
     * Character replies are also split into one bubble per line, the way people
     * send several short texts in a row. Everything here is pure string work —
     * rendering stays in index.js.
     *
     * Models drift from the canonical format, so parsing is deliberately lenient:
     * alias tag names, attributes, unclosed tags, stray closers, and descriptions
     * broken across lines are all repaired by normalizeMessageTags().
     */

    const OPEN = '<photo>';
    const CLOSE = '</photo>';

    // Tag names models commonly use for a photo; all normalise to <photo>.
    // A name must be followed by whitespace, '/' or '>' — \b doesn't work for CJK.
    const ALIASES = 'photo|image|picture|pic|img|照片|图片';
    const ANY_TAG_RE = new RegExp(`<\\s*\\/?\\s*(?:${ALIASES})(?=[\\s/>])`, 'i');
    const OPEN_TAG_RE = new RegExp(`<\\s*(?:${ALIASES})(?=[\\s/>])([^>]*)>`, 'gi');
    const CLOSE_TAG_RE = new RegExp(`<\\s*\\/\\s*(?:${ALIASES})\\s*>`, 'gi');
    const DESC_ATTR_RE = /\b(?:desc|description|alt|caption|content)\s*=\s*(["'])([\s\S]*?)\1/i;
    const PHOTO_RE = /<photo>([\s\S]*?)<\/photo>/g;
    const FENCE_RE = /^\s*```/;

    /**
     * Rewrites every photo tag in `text` into the canonical single-line
     * `<photo>description</photo>` form. Text without photo tags is returned as-is.
     */
    function normalizeMessageTags(text) {
        let out = String(text ?? '');
        if (!ANY_TAG_RE.test(out)) return out;

        // 1. Unify tag names; a self-closing tag carries its description in an attribute
        out = out.replace(OPEN_TAG_RE, (match, attrs) => {
            if (!/\/\s*$/.test(attrs)) return OPEN;
            const desc = (attrs.match(DESC_ATTR_RE) || [])[2] || '';
            return `${OPEN}${desc}${CLOSE}`;
        });
        out = out.replace(CLOSE_TAG_RE, CLOSE);

        // 2. A closed description that wraps across lines is joined back into one line
        out = out.replace(/<photo>((?:(?!<photo>)[\s\S])*?)<\/photo>/g,
            (match, desc) => `${OPEN}${desc.replace(/\s*\n\s*/g, ' ')}${CLOSE}`);

        // 3. Per line: an unclosed tag runs to the end of the line (or the next tag),
        //    and closers without an opener are dropped
        out = out.split('\n').map(normalizeLine).join('\n');

        // 4. Models sometimes wrap the tag in inline-code backticks
        return out.replace(/`+(<photo>[^\n]*?<\/photo>)`+/g, '$1');
    }

    function normalizeLine(line) {
        let result = '';
        let i = 0;
        while (i < line.length) {
            const open = line.indexOf(OPEN, i);
            const strayClose = line.indexOf(CLOSE, i);
            if (strayClose !== -1 && (open === -1 || strayClose < open)) {
                result += line.slice(i, strayClose);
                i = strayClose + CLOSE.length;
                continue;
            }
            if (open === -1) {
                result += line.slice(i);
                break;
            }
            result += line.slice(i, open);
            const start = open + OPEN.length;
            const close = line.indexOf(CLOSE, start);
            const nextOpen = line.indexOf(OPEN, start);
            let end = line.length;
            let skip = 0;
            if (close !== -1 && (nextOpen === -1 || close < nextOpen)) {
                end = close;
                skip = CLOSE.length;
            } else if (nextOpen !== -1) {
                end = nextOpen;
            }
            result += `${OPEN}${line.slice(start, end).trim()}${CLOSE}`;
            i = end + skip;
        }
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
     *   { type: 'text', text }  |  { type: 'photo', desc }
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
        let match;
        PHOTO_RE.lastIndex = 0;
        while ((match = PHOTO_RE.exec(normalized))) {
            pushText(normalized.slice(last, match.index));
            parts.push({ type: 'photo', desc: match[1].trim() });
            last = PHOTO_RE.lastIndex;
        }
        pushText(normalized.slice(last));
        return parts;
    }

    /** Whether the message contains any rich-content tag. */
    function hasRichContent(text) {
        return ANY_TAG_RE.test(String(text ?? ''));
    }

    /**
     * Plain-text rendering for previews, exports and analysis: photo tags become
     * "[Photo: description]".
     */
    function toPlainText(text) {
        return normalizeMessageTags(text).replace(PHOTO_RE, (match, desc) => {
            const d = desc.trim();
            return d ? `[Photo: ${d}]` : '[Photo]';
        });
    }

    window.EchoTextRichMessages = {
        normalizeMessageTags,
        parseMessageParts,
        hasRichContent,
        toPlainText,
    };
})();
