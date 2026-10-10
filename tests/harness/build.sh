#!/bin/sh
# Builds the harness bundles into tests/harness/build/ (git-ignored).
#   new   = the working tree's index.js
#   old   = index.js at REF (default HEAD), to compare against; it renders with
#           REF's own EchoText pack, registered as window.EchoTextPlatformsOld
# usage: sh tests/harness/build.sh [REF]
set -e
H=$(cd "$(dirname "$0")" && pwd)
REPO=$(cd "$H/../.." && pwd)
ST_ROOT=${ST_ROOT:-$(cd "$REPO/../../../.." && pwd)}
REF=${1:-HEAD}
B="$H/build"
mkdir -p "$B/vendor/css" "$B/vendor/webfonts"

# jQuery, DOMPurify and Font Awesome, from SillyTavern itself
cp "$ST_ROOT/public/lib/jquery-3.5.1.min.js" "$ST_ROOT/node_modules/dompurify/dist/purify.min.js" "$B/vendor/"
cp "$ST_ROOT/public/css/fontawesome.min.css" "$ST_ROOT/public/css/solid.min.css" "$B/vendor/css/"
cp "$ST_ROOT/public/webfonts/fa-solid-900.woff2" "$ST_ROOT/public/webfonts/fa-solid-900.ttf" "$B/vendor/webfonts/"

git -C "$REPO" show "$REF:index.js" > "$B/index.old.js"
git -C "$REPO" show "$REF:platforms/echotext/platform.js" | sed 's/window\.EchoTextPlatforms/window.EchoTextPlatformsOld/g' > "$B/platform.old.js"

node "$H/gen.cjs" "$B/index.old.js" old "$B/bundle-old.js"
# REF's index.js reads the registry as `Platforms` (or `Platform` before step 3): give it REF's native pack
sed -i '' 's/window\.EchoTextPlatforms\.echotext/window.EchoTextPlatformsOld.echotext/' "$B/bundle-old.js"
sed -i '' 's/^const Platforms = window\.EchoTextPlatforms;/const Platforms = { ...window.EchoTextPlatforms, ...window.EchoTextPlatformsOld };/' "$B/bundle-old.js"

node "$H/gen.cjs" "$REPO/index.js" new "$B/bundle-new.js"
EXTRA=bindBubbleTouchSwipe,updateSwipeInPlace node "$H/gen.cjs" "$REPO/index.js" touch "$B/bundle-touch.js"
EXTRA=buildPanelHtml,modeMenuItemInner,toggleAttachMenu,toggleAttachPanel,bindAttachPanel node "$H/gen.cjs" "$REPO/index.js" chrome "$B/bundle-chrome.js"
echo "Built against $REF. Serve with: python3 tests/harness/serve.py"
