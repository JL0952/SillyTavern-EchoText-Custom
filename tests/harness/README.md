# Harness

Browser pages that run EchoText's real message-list code (extracted from
`index.js` by `gen.cjs`) on mock chats (`scenarios.js`), with SillyTavern
stubbed out. They compare the working tree against a git ref (HEAD by default)
and exercise what the Node tests in `tests/*.test.mjs` can't: rendering, clicks,
in-place updates, scrolling and the platform chrome.

## Run

```sh
sh tests/harness/build.sh          # or: sh tests/harness/build.sh <ref>
python3 tests/harness/serve.py     # serves the repo on http://127.0.0.1:8765, caching off
```

Rebuild after changing `index.js` (pages load the repo's own `lib/`, `platforms/`
and `style.css` directly). `build/` is generated and git-ignored; jQuery,
DOMPurify and Font Awesome are copied from SillyTavern.

| Page | What it checks | Result |
|---|---|---|
| `index.html` | Every scenario rendered by the ref and the working tree: same HTML and, per element, the same click → call (or, when the markup changed on purpose, the same set of calls). Then `refreshMessages`, in-place `renderMessages`, touch swipe, inline edit, the platform picker, for EchoText and WeChat. `?preview` shows only WeChat, light and dark. | On the page; `window.__results` (scenarios), `window.__refresh` (tests), `window.__done` |
| `chrome.html` | The panel header and input bar in each state (empty, draft, typing, generating, composing, menu open). `?platform=`, `?schemes=light,dark`, `?only=<state>` | Screenshots |
| `panel.html` | The "+" panel: `runPanelTest()` (opens, closes on "+" / tile / list / input, platform switch, "+" and 发送 never both shown) and `runAnchorTest()` (the list follows the panel, with and without the height transition). `runRevealTest()`: on touch screens a bubble's "⋯" shows only after the bubble is tapped (run with the Browser pane's mobile preset) | Returned objects |
| `scroll.html` | `runScroll('echotext' \| 'wechat')`: sending, a reply and a full render never scroll the list up | Returned string |

Animation-frame tests need the page visible (a hidden tab doesn't run frames).
Focus events don't fire in a window without focus, so "input focus closes the
panel" shows as failing there; dispatch a `focus` event to check it.

## Node scripts

```sh
node --test tests/*.test.mjs                 # view model and features
node tests/harness/undeclared.cjs [ref]      # names index.js uses but never declares, vs ref
node tests/harness/context-compare.cjs [ref] # what the model is sent, vs ref; then on WeChat
```
