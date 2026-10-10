(function () {
    'use strict';

    /**
     * Test platform for the feature whitelist: EchoText's own look without tapback
     * reactions. Picking it hides every reaction in the chat and keeps them out of
     * the model's context; picking EchoText again brings them all back.
     */
    const base = window.EchoTextPlatforms.echotext;

    window.EchoTextPlatforms['test-noreact'] = {
        ...base,
        id: 'test-noreact',
        name: 'Test: EchoText without reactions',
        features: ['photo', 'transfer'],
    };
})();
