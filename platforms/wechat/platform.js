(function () {
    'use strict';

    /**
     * WeChat, as a platform pack. Markup and look are ported from
     * soloshow-labs/chat-screenshot-generator (MessageBubble, ImageMessage,
     * PaymentCard, TimeDivider, SystemMessage); see platform.css.
     *
     * Every message part is its own row with the sender's avatar, the way WeChat
     * shows consecutive texts. No reactions and no read receipts. Templates follow
     * the contract in platforms/echotext/platform.js: pure functions, clickable
     * elements carry data-et-action, looked-up elements carry data-et-role.
     *
     * The header and input bar are EchoText's own elements restyled by
     * platform.css (ChatHeader, InputBar, ChatGlyphs), so all their behaviour
     * stays EchoText's.
     */

    const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

    // Transfer-card glyph for the refunded state (the others are images in platform.css)
    const REFUNDED_GLYPH = 'M7.26862907,9.20000005 L8.6769553,10.6083263 L7.82842712,11.4568544 L5.84852817,9.47695549 L5.35355339,8.98198071 C5.15829124,8.78671856 5.15829124,8.47013607 5.35355339,8.27487392 L7.82842712,5.80000019 L8.6769553,6.64852836 L7.32548366,8 L12,8 C13.6568542,8 15,9.34314575 15,11 C15,12.6568542 13.6568542,14 12,14 L10,14.0000002 L10,12.8000002 L12,12.8000002 C12.9941125,12.8 13.8,11.9941125 13.8,11 C13.8,10.0058875 12.9941125,9.2 12,9.2 L7.26862907,9.20000005 Z M10,20 C4.4771525,20 0,15.5228475 0,10 C0,4.4771525 4.4771525,0 10,0 C15.5228475,0 20,4.4771525 20,10 C20,15.5228475 15.5228475,20 10,20 Z M10,18.8 C14.8601058,18.8 18.8,14.8601058 18.8,10 C18.8,5.1398942 14.8601058,1.2 10,1.2 C5.1398942,1.2 1.2,5.1398942 1.2,10 C1.2,14.8601058 5.1398942,18.8 10,18.8 Z';

    const PHOTO_GLYPH = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M19 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 14H5l4.5-6 3.5 4.5 2.5-3L19 18zM8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z"/></svg>';

    const pad = n => String(n).padStart(2, '0');

    /** WeChat's time-divider text: "14:32", "昨天 14:32", "星期二 14:32", "10月8日 14:32", "2025年10月8日 14:32". */
    function dividerTime(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const hm = `${date.getHours()}:${pad(date.getMinutes())}`;
        const dayStart = d => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
        const days = Math.round((dayStart(now) - dayStart(date)) / 86400000);
        if (days === 0) return hm;
        if (days === 1) return `昨天 ${hm}`;
        if (days > 1 && days < 7) return `${WEEKDAYS[date.getDay()]} ${hm}`;
        if (date.getFullYear() === now.getFullYear()) return `${date.getMonth() + 1}月${date.getDate()}日 ${hm}`;
        return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${hm}`;
    }

    function avatar(m, ctx) {
        const a = ctx.avatar(m);
        const img = a.url ? `<img src="${a.url}" alt="">` : '';
        return `<div class="wx-avatar" style="background:${a.color}"><span>${ctx.escapeHtml(a.initial)}</span>${img}</div>`;
    }

    /** A transfer or its accept / decline receipt, as WeChat's orange card. */
    function transferCard(p, m, ctx) {
        const side = m.isUser ? 'right' : 'left';
        const original = p.type === 'transfer';
        const status = original ? p.status : p.type === 'transfer_accept' ? 'accepted' : 'declined';
        let note;
        if (!original) note = status === 'accepted' ? '已收款' : '已退还';
        else if (status === 'accepted') note = '已被接受';
        else if (status === 'declined') note = '已被退还';
        else note = m.isUser ? `转账给${ctx.sanitize(ctx.charName)}` : '转账给你';

        const glyph = status === 'declined'
            ? `<svg class="wx-pay-glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="${REFUNDED_GLYPH}" transform="translate(2 2)" fill="#fff" fill-rule="evenodd"/></svg>`
            : `<span class="wx-pay-glyph wx-pay-glyph-${status === 'accepted' ? 'received' : 'pending'}"></span>`;
        // Handled cards go pale; a refunded one is also terminal (its own shade)
        const stateClass = status === 'accepted' ? ' wx-pay-handled' : status === 'declined' ? ' wx-pay-handled wx-pay-terminal' : '';
        // Only a pending transfer from the character waits on the user
        const actionAttrs = p.actionable
            ? ` data-et-action="transfer-respond" data-amount="${ctx.escapeHtml(p.displayAmount)}" role="button" tabindex="0"`
            : '';
        return `<div class="wx-pay${stateClass}" data-side="${side}"${actionAttrs}><span class="wx-pay-tail"></span><div class="wx-pay-body">${glyph}<div class="wx-pay-text"><div class="wx-pay-title">${ctx.escapeHtml(p.displayAmount || '¥')}</div><div class="wx-pay-note">${note}</div></div></div><div class="wx-pay-footer">微信转账</div></div>`;
    }

    /** A photo is a picture frame; tapping it shows the description inside the frame. */
    function photo(p, ctx) {
        const desc = ctx.escapeHtml(p.desc);
        return `<div class="wx-photo" role="button" tabindex="0" aria-expanded="false" title="点击查看" data-et-action="photo-toggle">${PHOTO_GLYPH}<div class="wx-photo-caption" data-et-role="caption"><span>${desc || '图片'}</span></div></div>`;
    }

    /** Inner content of one row: a text bubble, a photo, or a transfer card. */
    function part(p, ctx, m) {
        if (p.type === 'photo') return photo(p, ctx);
        if (p.type.startsWith('transfer')) return transferCard(p, m, ctx);
        if (p.type !== 'text') return '';
        const side = m.isUser ? 'right' : 'left';
        return `<div class="wx-bubble wx-bubble-${side}"><div class="wx-text" data-et-role="text">${ctx.formatText(p.text)}</div></div>`;
    }

    function imageAttachment(attachment) {
        if (!attachment || attachment.type !== 'image') return '';
        if (attachment.status === 'error') {
            return `<div class="wx-placeholder">${attachment.error || '图片发送失败'}</div>`;
        }
        if (attachment.status !== 'ready' || !attachment.url) {
            return '<div class="wx-placeholder">图片加载中…</div>';
        }
        return `<div class="wx-image" role="button" tabindex="0" data-et-action="image-open"><img src="${attachment.url}" alt=""></div>`;
    }

    /** One message, from its view-model entry: a row per part, the last one the message's main row. */
    function message(m, ctx) {
        const side = m.isUser ? 'right' : 'left';
        const time = new Date(m.timestamp || Date.now());
        const tip = `${time.getMonth() + 1}月${time.getDate()}日 ${time.getHours()}:${pad(time.getMinutes())}`;
        const avatarHtml = avatar(m, ctx);
        // WeChat names senders only in group chats
        const senderHtml = ctx.groupChat && !m.isUser ? `<div class="wx-sender">${ctx.sanitize(m.senderName)}</div>` : '';
        const last = m.parts.length - 1;

        const rows = m.parts.map((p, j) => {
            // A bubble's own menu, except the last row, whose menu covers the whole message
            const menu = j === last
                ? `data-et-action="menu" data-index="${m.index}"`
                : `data-et-action="part-menu" data-index="${m.index}" data-part="${j}"`;
            return `<div class="wx-row wx-row-${side}" data-et-role="bubble${j === last ? ' main' : ''}" title="${tip}">${avatarHtml}<div class="wx-bubble-wrap">${senderHtml}${part(p, ctx, m)}${j === last ? imageAttachment(m.imageAttachment) : ''}</div><button class="wx-more" ${menu} data-is-user="${m.isUser ? 1 : 0}" title="更多">⋯</button></div>`;
        }).join('');

        const swipe = m.swipe
            ? `<div class="wx-swipe"><button data-et-action="swipe-prev" data-index="${m.index}" title="上一版"${m.swipe.index === 0 ? ' disabled' : ''}>‹</button><span>${m.swipe.index + 1} / ${m.swipe.count}</span><button data-et-action="swipe-next" data-index="${m.index}" title="${m.swipe.isLast ? '重新生成' : '下一版'}">›</button></div>`
            : '';

        const divider = m.showTimeDivider ? `<div class="wx-time">${dividerTime(time)}</div>` : '';
        return `<div class="wx-message" data-et-role="message" data-index="${m.index}" data-is-user="${m.isUser ? 1 : 0}">${divider}${rows}${swipe}</div>`;
    }

    /** WeChat shows nothing in an empty chat. */
    function emptyChat() {
        return '';
    }

    /** WeChat says the other side is typing in the title (platform.css, on data-et-typing), not in the list. */
    function typing() {
        return '';
    }

    function imageGenerating(ctx) {
        const m = { isUser: false, senderName: ctx.charName };
        return `<div class="wx-message" data-et-role="image-generating"><div class="wx-row wx-row-left">${avatar(m, ctx)}<div class="wx-bubble-wrap"><div class="wx-placeholder">图片加载中…</div></div></div></div>`;
    }

    /** Between the texts of a reply arriving one by one, WeChat shows nothing. */
    function bubbleTyping() {
        return '';
    }

    window.EchoTextPlatforms = window.EchoTextPlatforms || {};
    window.EchoTextPlatforms.wechat = {
        id: 'wechat',
        name: '微信 WeChat',
        features: ['photo', 'transfer'],
        stylesheet: 'platform.css',
        // "+" raises a panel of tiles (lib/features.js composer entries), labelled the WeChat way
        composerPanel: {
            photo: { label: '照片', icon: 'fa-image' },
            transfer: { label: '转账', icon: 'fa-right-left' },
        },
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
