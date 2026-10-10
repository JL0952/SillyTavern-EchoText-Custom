(function () {
    'use strict';

    /**
     * EchoText Features
     *
     * Each rich-message feature — photos, tapback reactions, money transfers — as
     * a module: the canonical tags it owns, what happens to those tags in the
     * model's context when the current platform doesn't support it, its part of
     * the reply-format rules, and its entry in the composer's "+" menu. A platform
     * lists the features it supports; the chat history itself never changes.
     *
     *   contextPolicy 'strip'    the tag is removed from the context
     *   contextPolicy 'degrade'  the tag becomes a plain-text note ("[Transfer: ¥52.00]")
     *
     * Context filtering works on canonical tags, so run it on text that has been
     * through RichMessages.normalizeMessageTags().
     */

    const RichMessages = window.EchoTextRichMessages;

    // Order is the order of the format rules
    const FEATURES = [
        {
            id: 'photo',
            tags: ['photo'],
            contextPolicy: 'degrade',
            composer: { label: 'Photo', icon: 'fa-image', placeholder: 'Describe the photo you\'re sending...' },
            prompt: ({ charName, userName }) =>
                `PHOTOS: ${charName} can send photos. Write a photo on its own line as <photo>what the photo shows</photo> — a short, concrete description of the picture, written in the same language as the conversation — and ${userName} sees it as an actual picture. Write the description as a neutral caption of what is visible, with no first- or second-person pronouns: refer to people by name (${charName}, ${userName}) instead of I/me/my/you. Send one whenever ${charName} naturally would, such as when asked for a picture, but never use it to describe ${charName}'s own actions. A <photo> from ${userName} is a picture they sent: react to what it shows.`,
        },
        {
            id: 'react',
            tags: ['react'],
            contextPolicy: 'strip',
            prompt: ({ charName, userName, reactionIds }) =>
                `REACTIONS: ${charName} can react to ${userName}'s latest message with a tapback by writing <react>name</react> on its own line, where name is one of: ${reactionIds.join(', ')}. Use one only now and then, when a quick reaction genuinely fits — most replies need none. A reaction usually comes with text messages, but occasionally it can be the whole reply. A <react> from ${userName} is their tapback on ${charName}'s message just before it — ${charName} may notice it, but it doesn't need an answer of its own.`,
        },
        {
            id: 'transfer',
            tags: ['transfer', 'transfer_accept', 'transfer_decline'],
            contextPolicy: 'degrade',
            composer: { label: 'Transfer', icon: 'fa-money-bill-transfer', placeholder: 'Amount to transfer' },
            prompt: ({ charName, userName }) =>
                `TRANSFERS: ${charName} can send ${userName} money by writing <transfer>amount</transfer> on its own line, with the amount as a plain number. When ${userName} sends ${charName} a <transfer>, ${charName} can accept it with <transfer_accept/> or decline it with <transfer_decline/> on its own line, or leave it pending for now. A <transfer_accept> or <transfer_decline> from ${userName} means they accepted or declined ${charName}'s transfer. Only send or answer transfers when it fits the story.`,
        },
    ];

    const FEATURE_IDS = FEATURES.map(f => f.id);

    /** Composer modes ("+" menu entries) of the enabled features, by feature id. */
    function getComposerModes(enabled) {
        return Object.fromEntries(FEATURES.filter(f => f.composer && enabled.includes(f.id)).map(f => [f.id, f.composer]));
    }

    /** The reply-format rules for the enabled features, one paragraph each. */
    function buildFeaturePrompts(enabled, ctx) {
        return FEATURES.filter(f => enabled.includes(f.id)).map(f => f.prompt(ctx));
    }

    /**
     * A message's canonical text with the tags of features not in `enabled`
     * stripped or turned into plain-text notes, per their contextPolicy.
     * @returns {string|null} the text, unchanged when nothing applies; null when
     *   the message held only unsupported content and should be left out
     */
    function filterContextText(text, enabled) {
        const source = String(text ?? '');
        const disabled = FEATURES.filter(f => !enabled.includes(f.id));
        if (!disabled.length) return source;

        // Stripped tags leave a marker so only their own lines get tidied
        const MARK = '\u0000';
        let out = source;
        for (const feature of disabled) {
            const re = new RegExp(`<(${feature.tags.join('|')})>[^<\\n]*<\\/\\1>`, 'g');
            out = out.replace(re, match => feature.contextPolicy === 'degrade' ? RichMessages.toPlainText(match) : MARK);
        }
        if (out === source) return source;

        // A line that held only stripped tags goes; elsewhere their gap closes up
        out = out.split('\n')
            .map(line => line.includes(MARK) ? line.replace(/[ \t]*\u0000+[ \t]*/g, ' ').trim() || null : line)
            .filter(line => line !== null)
            .join('\n');
        return out.trim() || !source.trim() ? out : null;
    }

    window.EchoTextFeatures = {
        FEATURES,
        FEATURE_IDS,
        getComposerModes,
        buildFeaturePrompts,
        filterContextText,
    };
})();
