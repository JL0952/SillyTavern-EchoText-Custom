// Mock chats and settings for comparing renderMessages before/after a refactor.
(function () {
    const t0 = new Date(2026, 9, 8, 14, 0, 0).getTime();
    const m = min => t0 + min * 60000;
    const IMG = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="120" height="80" fill="#4da6ff"/></svg>');

    const FA_REACTIONS = [
        { id: 'heart', icon: 'fa-solid fa-heart', label: 'Love', color: '#ff4d6d' },
        { id: 'haha', icon: 'fa-solid fa-face-laugh-squint', label: 'Haha', color: '#fbbf24' },
        { id: 'wow', icon: 'fa-solid fa-face-surprise', label: 'Wow', color: '#fb923c' },
        { id: 'sad', icon: 'fa-solid fa-face-sad-tear', label: 'Sad', color: '#60a5fa' },
        { id: 'fire', icon: 'fa-solid fa-fire', label: 'Fire', color: '#f97316' },
        { id: 'like', icon: 'fa-solid fa-thumbs-up', label: 'Like', color: 'var(--et-theme-color)' },
        { id: 'star', icon: 'fa-solid fa-star', label: 'Star', color: '#facc15' },
        { id: 'bolt', icon: 'fa-solid fa-bolt', label: 'Zap', color: '#a78bfa' },
    ];

    const main = () => [
        { is_user: true, mes: 'hey :) are you **free** tonight?', send_date: m(0), meta: { receipt: { state: 'read' } } },
        { is_user: false, mes: 'Mira: sure!\nMira：what\'s up\n<photo>a cat on the windowsill</photo>', send_date: m(1) },
        { is_user: true, mes: '<transfer>$20</transfer>', send_date: m(2), meta: { receipt: { state: 'delivered' } } },
        { is_user: true, mes: 'for the pizza 🍕 <b>bold</b> & "quotes"', send_date: m(3), meta: { receipt: { state: 'ghosted', note: 'seen <i>5m</i> ago' } },
            memoryHighlights: [{ text: 'pizza', category: 'preference', label: 'Likes' }] },
        { is_user: false, mes: '<transfer_accept></transfer_accept>\nthanks!!\n<react>heart</react>', send_date: m(4),
            reactions: { haha: { count: 1, mine: true }, unknown: { count: 2 }, fire: { count: 0 }, star: { count: '2', mine: 'yes' } } },
        { is_user: false, mes: '<transfer>52</transfer>\nfor the tickets', send_date: m(5) },
        { is_user: true, mes: 'ok', send_date: m(30), meta: { receipt: { state: 'weird' } } },
        { is_user: false, mes: '<react>wow</react>', send_date: m(31), imageAttachment: { type: 'image', status: 'loading' } },
        { is_user: true, mes: '<transfer_decline>52</transfer_decline>\nnah keep it', send_date: m(32), charReaction: 'fire' },
        { is_user: true, mes: '<photo>my lunch</photo>\nlook', send_date: m(33) },
        { is_user: true, mes: '', send_date: m(34) },
        { is_user: true, mes: '<transfer>20</transfer>', send_date: m(40) },
        { is_user: false, mes: 'oops', send_date: m(41), imageAttachment: { type: 'image', status: 'error', error: 'No GPU' } },
        { is_user: true, mes: '<transfer>¥8.8</transfer>', send_date: m(42), charReaction: 'unknown-legacy' },
        { is_user: false, mes: '<transfer_accept>8.8</transfer_accept>', send_date: m(43) },
        { is_user: true, mes: 'next day', send_date: m(60 * 24) },
        { is_user: false, mes: '```js\nconst a = 1;\n\nconst b = 2;\n```\n*smiles* ~~no~~ `code` __u__ :D\n<transfer>€5</transfer>', send_date: m(60 * 24 + 1),
            swipes: [{ mes: 'a', send_date: m(1440) }, { mes: 'b', send_date: m(1441) }, { mes: 'c', send_date: m(1442) }], swipeIndex: 1,
            imageAttachment: { type: 'image', status: 'ready', url: IMG, prompt: 'a blue rectangle' },
            reactions: { heart: { count: 2, mine: false } } },
    ];

    const groupedAndLegacy = () => [
        { is_user: false, mes: 'hi', send_date: m(0), swipes: [{ mes: 'hi', send_date: m(0) }], swipeIndex: 0 },
        { is_user: true, mes: 'one', send_date: m(1), charReaction: 'like' },
        { is_user: true, mes: 'two\nlines', send_date: m(2) },
        { is_user: true, mes: 'three', send_date: m(3) },
        { is_user: true, mes: 'later', send_date: m(20) },
        { is_user: false, mes: 'a\nb', send_date: m(21), swipes: [], swipeIndex: 4 },
        { is_user: false, mes: 'last one', send_date: m(22), swipes: [{ mes: 'x' }, { mes: 'y' }], swipeIndex: 9 },
        { is_user: true, mes: 'no date' },
    ];

    const combine = () => [
        { is_user: true, mes: 'hi all', send_date: m(0) },
        { is_user: false, mes: 'hey!', send_date: m(1), charName: 'Amy', charKey: 'amy.png' },
        { is_user: false, mes: 'Joi: yo\nsup', send_date: m(2), charName: 'Joi', charKey: 'joi.png' },
        { is_user: false, mes: 'who is this', send_date: m(3), charName: 'Ghost', charKey: 'ghost.png' },
        { is_user: false, mes: 'no name', send_date: m(4) },
        { is_user: true, mes: 'cool', send_date: m(5) },
        { is_user: false, mes: '<react>haha</react>\nlol', send_date: m(6), charName: 'Amy', charKey: 'amy.png' },
    ];

    const baseSettings = {
        showAvatar: true, swipedMessages: true, memoryEnabled: true, memoryAutoExtract: true,
        memoryHighlightStyle: 'underline', autoScroll: true, verbosityByCharacter: { 'mira.png': 'short' },
    };

    const groupManager = {
        isGroupSession: () => true,
        isCombineMode: () => true,
        getGroupMemberByKey: key => ({ 'amy.png': { name: 'Amy' }, 'joi.png': { name: 'Joi' } })[key] || null,
        buildAvatarHtmlForChar: (c, cls, id, small) => `<div class="et-char-avatar-small ${cls}" data-member="${c.name}">${c.name[0]}</div>`,
    };

    window.EchoTextScenarios = [
        { name: 'main', history: main(), settings: { ...baseSettings } },
        { name: 'main, avatars off, swipes off, memory off, medium', history: main(),
            settings: { ...baseSettings, showAvatar: false, swipedMessages: false, memoryEnabled: false, verbosityByCharacter: { 'mira.png': 'medium' } } },
        { name: 'main, long verbosity, typing', history: main(), typing: true,
            settings: { ...baseSettings, verbosityByCharacter: { 'mira.png': 'long' }, memoryAutoExtract: false } },
        { name: 'grouped + legacy', history: groupedAndLegacy(), settings: { ...baseSettings, verbosityByCharacter: null } },
        { name: 'combine mode', history: combine(), groupManager, typing: true, settings: { ...baseSettings } },
        { name: 'combine off (not combine)', history: combine(), groupManager: { ...groupManager, isCombineMode: () => false }, settings: { ...baseSettings } },
        { name: 'empty', history: [], settings: { ...baseSettings } },
        { name: 'empty, no character', history: [], noChar: true, settings: { ...baseSettings } },
    ];
    window.EchoTextScenarioReactions = FA_REACTIONS;
})();
