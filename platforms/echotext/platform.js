(function () {
    'use strict';

    /**
     * EchoText's own look, as a platform pack: the templates for everything in
     * the message list. Its CSS is still style.css.
     *
     * Templates are pure — (view, ctx) → HTML string. A message's view is its
     * entry from lib/chat-view-model.js; ctx comes from index.js:
     *   showAvatar, verbosity ('short' | 'medium' | 'long' | null), charName
     *   animateReaction       message(): pop the character's reaction in
     *   escapeHtml(text)      text for HTML
     *   sanitize(text)        plain text with any tags stripped
     *   formatText(text)      message text as safe HTML (markdown, emoticons)
     *   reaction(id)          { icon, color, label }, or null for an unknown id
     *   avatarHtml(name, className, charKey)   EchoText's avatar markup
     *
     * No event code: clickable elements carry data-et-action, and the elements
     * core code looks up carry data-et-role (see docs/platform-plan.md).
     */

    const RECEIPT_STATES = {
        sent: { icon: 'fa-paper-plane', label: 'Sent' },
        delivered: { icon: 'fa-check', label: 'Delivered' },
        read: { icon: 'fa-check-double', label: 'Read' },
        ghosted: { icon: 'fa-eye-slash', label: 'Read, then paused (ghosting)' }
    };

    const VERBOSITY_BADGES = {
        short: { label: '📏', tip: 'Short: 1–2 texts per reply' },
        long: { label: '📜', tip: 'Long: 4–7 texts per reply' },
    };

    /** Stand-in for a reply that is only a reaction (the reaction itself shows on the user's message). */
    function reactionNote(reactionId, ctx) {
        const def = ctx.reaction(reactionId);
        const icon = def ? `<i class="${def.icon}" style="--react-color:${def.color}"></i>` : '';
        return `<div class="et-reaction-note">${icon}<span>Reacted to your message</span></div>`;
    }

    /** A photo shows only its frame; tapping it reveals the description inside. */
    function photoCard(desc, ctx) {
        const safeDesc = ctx.escapeHtml(desc);
        return `<div class="et-photo-card" role="button" tabindex="0" aria-expanded="false" title="Tap to view" data-et-action="photo-toggle"><div class="et-photo-card-frame"><i class="fa-regular fa-image et-photo-card-icon"></i><div class="et-photo-card-caption" data-et-role="caption"><span>${safeDesc || 'Photo'}</span></div></div></div>`;
    }

    /** A transfer or transfer-response card, from a view-model part (its status and display amount). */
    function transferCard(part, ctx) {
        const { status: state, actionable } = part;
        let icon, label;
        if (part.type === 'transfer') {
            icon = { accepted: 'fa-circle-check', declined: 'fa-arrow-rotate-left' }[state] || 'fa-money-bill-transfer';
            label = { accepted: 'Accepted', declined: 'Declined' }[state] || (actionable ? 'Tap to accept' : 'Pending');
        } else {
            const accepted = part.type === 'transfer_accept';
            icon = accepted ? 'fa-circle-check' : 'fa-arrow-rotate-left';
            label = accepted ? 'Received' : 'Declined';
        }
        const amountText = ctx.escapeHtml(part.displayAmount || 'Transfer');
        // The response tag names the currency explicitly ("$20.00")
        const actionAttrs = actionable ? ` data-et-action="transfer-respond" data-amount="${ctx.escapeHtml(part.displayAmount)}" role="button" tabindex="0"` : '';
        return `<div class="et-transfer-card et-transfer-${state}${actionable ? ' et-transfer-actionable' : ''}"${actionAttrs}><div class="et-transfer-body"><div class="et-transfer-icon"><i class="fa-solid ${icon}"></i></div><div class="et-transfer-info"><div class="et-transfer-amount">${amountText}</div><div class="et-transfer-status">${label}</div></div></div><div class="et-transfer-footer">Transfer</div></div>`;
    }

    /** Inner content of one bubble: formatted text, a photo card, or a transfer card. */
    function part(p, ctx) {
        if (p.type === 'photo') return photoCard(p.desc, ctx);
        if (p.type === 'reaction_note') return reactionNote(p.reaction, ctx);
        if (p.type !== 'text') return transferCard(p, ctx);
        return `<div class="et-bubble-text" data-et-role="text">${ctx.formatText(p.text)}</div>`;
    }

    /** Extra bubble classes for a part: cards get a snug, card-hugging bubble. */
    function partBubbleClass(p) {
        if (p.type === 'text') return '';
        // Transfers and their accept/decline responses share the standalone card style
        const kind = p.type.startsWith('transfer') ? 'transfer' : p.type === 'reaction_note' ? 'reaction' : p.type;
        return ` et-bubble-card et-bubble-${kind}`;
    }

    /**
     * Bubbles shown before a message's main (footer-bearing) bubble — one per part
     * except the last, which goes in the main bubble itself.
     */
    function leadingBubbles(m, sideClass, ctx) {
        return m.parts.slice(0, -1).map((p, j) =>
            `<div class="et-bubble ${sideClass} et-bubble-part${partBubbleClass(p)}" data-et-role="bubble">${part(p, ctx)}<button class="et-part-dots-btn" data-et-action="part-menu" data-index="${m.index}" data-part="${j}" data-is-user="${m.isUser ? 1 : 0}" title="More options"><i class="fa-solid fa-ellipsis-vertical"></i></button></div>`
        ).join('');
    }

    function imageAttachment(attachment) {
        if (!attachment || attachment.type !== 'image') return '';

        if (attachment.status === 'error') {
            return `<div class="et-image-attachment et-image-attachment-error"><div class="et-image-error"><i class="fa-solid fa-triangle-exclamation"></i><span>${attachment.error || 'Sorry, I could not generate an image right now.'}</span></div></div>`;
        }

        if (attachment.status !== 'ready' || !attachment.url) {
            return `<div class="et-image-attachment et-image-attachment-loading"><div class="et-image-gen-indicator"><div class="et-image-gen-ring"><svg viewBox="0 0 36 36" class="et-image-gen-svg"><circle class="et-image-gen-track" cx="18" cy="18" r="14" fill="none" stroke-width="2.5"/><circle class="et-image-gen-arc" cx="18" cy="18" r="14" fill="none" stroke-width="2.5" stroke-dasharray="22 66" stroke-linecap="round"/></svg><i class="fa-solid fa-camera et-image-gen-icon"></i></div><span class="et-image-gen-label">Generating image…</span></div></div>`;
        }

        return `<div class="et-image-attachment et-image-attachment-ready" data-et-action="image-open"><img src="${attachment.url}" alt="Generated image" class="et-generated-image"><div class="et-image-attachment-meta"><i class="fa-solid fa-expand"></i><span>Tap to enlarge</span></div></div>`;
    }

    /** Read-receipt icon for a user message's view-model receipt ({ state, note }). */
    function receipt(r, ctx) {
        const def = RECEIPT_STATES[r.state] || RECEIPT_STATES.sent;
        const tip = ctx.sanitize(r.note || def.label);
        return `<span class="et-read-receipt et-read-receipt-${r.state}" title="${tip}"><i class="fa-solid ${def.icon}"></i></span>`;
    }

    function verbosityBadge(verbosity) {
        const badge = VERBOSITY_BADGES[verbosity];
        if (!verbosity || verbosity === 'medium') return '';
        return `<span class="et-verbosity-badge" title="${badge?.tip || 'Verbosity'}">${badge?.label || ''}</span>`;
    }

    /** The user's tapbacks under a character message. */
    function reactionPills(reactions, ctx) {
        return reactions.map((reaction) => {
            const def = ctx.reaction(reaction.id);
            if (!def) return '';
            return `<button class="et-reaction-pill${reaction.mine ? ' et-reaction-mine' : ''}" data-et-action="reaction-toggle" data-reaction="${reaction.id}" title="${def.label}" style="--react-color:${def.color}">
                    <i class="${def.icon} et-reaction-icon"></i>
                    <span class="et-reaction-count">${reaction.count}</span>
                </button>`;
        }).join('');
    }

    /** The character's reaction pill under a user message. */
    function charReaction(reactionId, ctx) {
        const def = ctx.reaction(reactionId);
        if (!def) return '';
        return `<div class="et-char-reaction-pill${ctx.animateReaction ? ' et-reaction-new' : ''}" style="--react-color:${def.color}" title="${def.label}">
                <i class="${def.icon} et-char-reaction-icon"></i>
            </div>`;
    }

    /** One message, from its view-model entry. */
    function message(m, ctx) {
        const index = m.index;
        const mainPart = m.parts[m.parts.length - 1];
        const mainCardClass = partBubbleClass(mainPart);
        const msgDate = new Date(m.timestamp || Date.now());
        const time = msgDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        const fullDateToolip = msgDate.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

        if (m.isUser) {
            const safeUserName = ctx.sanitize(m.senderName);
            return `
            <div class="et-message et-message-user${m.groupedWithNext ? ' et-message-grouped' : ''}" data-et-role="message" data-index="${index}">
                ${leadingBubbles(m, 'et-bubble-user', ctx)}
                <div class="et-bubble et-bubble-user et-bubble-main${mainCardClass}" data-et-role="bubble main">
                    ${part(mainPart, ctx)}
                    ${m.groupedWithNext ? `<button class="et-part-dots-btn et-msg-dots-hover" data-et-action="menu" data-index="${index}" data-is-user="1" title="More options"><i class="fa-solid fa-ellipsis-vertical"></i></button>` : ''}
                    <div class="et-message-footer">
                        <span class="et-message-time" title="${fullDateToolip}">${time}</span>
                        <span class="et-user-name">${safeUserName}</span>
                        ${receipt(m.receipt, ctx)}
                        <div class="et-bubble-actions">
                            <button class="et-dots-btn" data-et-action="menu" data-index="${index}" data-is-user="1" title="More options"><i class="fa-solid fa-ellipsis-vertical"></i></button>
                        </div>
                    </div>
                </div>
                <div class="et-char-reaction-bar" id="et-char-reaction-${index}" data-et-role="char-reaction">${m.charReaction ? charReaction(m.charReaction, ctx) : ''}</div>
            </div>`;
        }

        // Combine mode: each character message carries its own name + avatar
        const safeCharName = ctx.sanitize(m.senderName);
        const avatarHtml = ctx.showAvatar
            ? ctx.avatarHtml(m.senderName, 'et-bubble-avatar et-bubble-avatar-footer', m.charKey)
            : '';

        // Swipe navigation — only on the last character message
        const swipe = m.swipe;
        const swipeNavHtml = swipe ? `
                        <div class="et-swipe-nav">
                            <button class="et-swipe-btn et-swipe-prev" data-et-action="swipe-prev" data-index="${index}" title="Previous version"${swipe.index === 0 ? ' disabled' : ''}><i class="fa-solid fa-chevron-left"></i></button>
                            <span class="et-swipe-counter">${swipe.index + 1} / ${swipe.count}</span>
                            <button class="et-swipe-btn et-swipe-next${swipe.isLast ? ' et-swipe-regen' : ''}" data-et-action="swipe-next" data-index="${index}" title="${swipe.isLast ? 'Regenerate (new version)' : 'Next version'}"><i class="fa-solid fa-chevron-right"></i></button>
                        </div>` : '';

        return `
            <div class="et-message et-message-char" data-et-role="message" data-index="${index}">
                <div class="et-message-body">
                    ${leadingBubbles(m, 'et-bubble-char', ctx)}
                    <div class="et-bubble et-bubble-char et-bubble-main${mainCardClass}" data-et-role="bubble main">
                        ${part(mainPart, ctx)}
                        ${imageAttachment(m.imageAttachment)}
                        ${swipeNavHtml}
                        <div class="et-message-footer">
                            <div class="et-char-info-pill${ctx.showAvatar ? '' : ' et-pill-no-avatar'}">
                                ${avatarHtml}
                                <span class="et-footer-name" title="${safeCharName}">${safeCharName}</span>
                            </div>
                            <span class="et-message-time" title="${fullDateToolip}">${time}</span>
                            ${verbosityBadge(ctx.verbosity)}
                            <div class="et-bubble-actions">
                                <button class="et-react-btn" data-et-action="react" data-index="${index}" title="React"><i class="fa-regular fa-face-smile"></i></button>
                                <button class="et-dots-btn" data-et-action="menu" data-index="${index}" data-is-user="0" title="More options"><i class="fa-solid fa-ellipsis-vertical"></i></button>
                            </div>
                        </div>
                    </div>
                    <div class="et-bubble-reactions-bar" id="et-reactions-bar-${index}">
                        <div class="et-active-reactions" id="et-reactions-${index}" data-et-role="reactions">${reactionPills(m.reactions, ctx)}</div>
                    </div>
                </div>
            </div>`;
    }

    /** Shown in place of the message list when the chat is empty. */
    function emptyChat() {
        return '<div class="et-empty-chat"><i class="fa-regular fa-comment-dots"></i><p>Start a conversation!</p></div>';
    }

    /** The character is typing: a message at the end of the list. */
    function typing(ctx) {
        const avatarHtml = ctx.showAvatar ? ctx.avatarHtml(ctx.charName, 'et-bubble-avatar') : '';
        return `
            <div class="et-message et-message-char et-message-typing" id="et-typing-indicator-msg" data-et-role="typing">
                <div class="et-message-body">
                    <div class="et-bubble et-bubble-char et-typing-bubble" title="Character is typing">
                        <div class="et-typing-dots"><span></span><span></span><span></span></div>
                        ${avatarHtml}
                    </div>
                </div>
            </div>`;
    }

    /** An image is being generated: shown instead of the typing indicator. */
    function imageGenerating(ctx) {
        const avatarHtml = ctx.showAvatar ? ctx.avatarHtml(ctx.charName, 'et-bubble-avatar') : '';
        return `
            <div class="et-message et-message-char et-message-typing" id="et-image-gen-indicator-msg" data-et-role="image-generating">
                <div class="et-message-body">
                    <div class="et-bubble et-bubble-char et-image-gen-bubble" title="Generating image…">
                        <div class="et-image-gen-indicator">
                            <div class="et-image-gen-ring">
                                <svg viewBox="0 0 36 36" class="et-image-gen-svg">
                                    <circle class="et-image-gen-track" cx="18" cy="18" r="14" fill="none" stroke-width="2.5"/>
                                    <circle class="et-image-gen-arc" cx="18" cy="18" r="14" fill="none" stroke-width="2.5" stroke-dasharray="22 66" stroke-linecap="round"/>
                                </svg>
                                <i class="fa-solid fa-camera et-image-gen-icon"></i>
                            </div>
                            <span class="et-image-gen-label">Generating image…</span>
                        </div>
                        ${avatarHtml}
                    </div>
                </div>
            </div>`;
    }

    /** The typing bubble shown between the bubbles of a reply arriving one by one. */
    function bubbleTyping() {
        return '<div class="et-bubble et-bubble-char et-typing-bubble"><div class="et-typing-dots"><span></span><span></span><span></span></div></div>';
    }

    window.EchoTextPlatforms = window.EchoTextPlatforms || {};
    window.EchoTextPlatforms.echotext = {
        id: 'echotext',
        name: 'EchoText',
        // Rich-message features this look supports (lib/features.js)
        features: ['photo', 'react', 'transfer'],
        templates: {
            message,
            part,
            emptyChat,
            typing,
            imageGenerating,
            bubbleTyping,
        },
    };
})();
