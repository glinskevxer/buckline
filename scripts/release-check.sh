#!/usr/bin/env bash
# Checks the things that are only wrong at the moment somebody ships.
#
# Every one of these has been wrong here at least once. The version drift is
# the worst of them: the smoke test asserted a version the last commit had
# bumped past, and the local run that passed had been made before the bump.
set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$HERE"

fail() { echo "release: $1" >&2; exit 1; }
ok() { echo "release: $1"; }

PKG_VERSION="$(node -p "require('./package.json').version")"
SRC_VERSION="$(node -e "import('./src/version.js').then(m => console.log(m.VERSION))")"
CLI_VERSION="$(node bin/buckline.js --version)"

[ "$PKG_VERSION" = "$SRC_VERSION" ] || fail "package.json says $PKG_VERSION and version.js says $SRC_VERSION"
[ "$PKG_VERSION" = "$CLI_VERSION" ] || fail "the command line reports $CLI_VERSION and package.json says $PKG_VERSION"
ok "version is $PKG_VERSION everywhere"

head -1 bin/buckline.js | grep -q '^#!/usr/bin/env node' || fail "bin/buckline.js has no shebang"
[ -x bin/buckline.js ] || fail "bin/buckline.js is not executable"
ok "the bin is runnable"

node -e "
  const pkg = require('./package.json');
  const files = pkg.files ?? [];
  for (const needed of ['bin', 'src']) {
    if (!files.includes(needed)) { console.error('release: package.json files does not carry ' + needed); process.exit(1); }
  }
  if (!pkg.bin || !pkg.bin.buckline) { console.error('release: package.json declares no bin'); process.exit(1); }
  if (!pkg.exports || !pkg.exports['.']) { console.error('release: package.json declares no exports'); process.exit(1); }
"
ok "the package declares what it ships"

if grep -rn --include='*.test.js' -E '\b(it|describe|test)\.only\b' tests >/dev/null 2>&1; then
  grep -rn --include='*.test.js' -E '\b(it|describe|test)\.only\b' tests >&2
  fail "a focused test would hide the rest of the suite"
fi
ok "no focused tests"

if grep -rn --include='*.js' -E '\bconsole\.(log|debug)\(' src >/dev/null 2>&1; then
  grep -rn --include='*.js' -E '\bconsole\.(log|debug)\(' src >&2
  fail "src writes to the console instead of through the context"
fi
ok "nothing in src writes to the console"

node -e "
  import('./src/index.js').then((surface) => {
    const missing = Object.entries(surface).filter(([, value]) => value === undefined);
    if (missing.length) { console.error('release: the public surface exports nothing for ' + missing.map(([k]) => k).join(', ')); process.exit(1); }
    console.log('release: the public surface resolves, ' + Object.keys(surface).length + ' names');
  }).catch((error) => { console.error('release: the public surface will not load: ' + error.message); process.exit(1); });
"

node -e "
  Promise.all([import('./src/version.js'), import('./src/store/migrate.js'), import('./src/store/snapshot.js')])
    .then(([v, m, s]) => {
      if (v.RELEASE.journalFormat !== m.CURRENT_VERSION) { console.error('release: the release notes say journal format ' + v.RELEASE.journalFormat + ' and the journal writes ' + m.CURRENT_VERSION); process.exit(1); }
      if (v.RELEASE.snapshotFormat !== s.SNAPSHOT_FORMAT) { console.error('release: the release notes say snapshot format ' + v.RELEASE.snapshotFormat + ' and the snapshot writes ' + s.SNAPSHOT_FORMAT); process.exit(1); }
      console.log('release: the formats the notes claim are the formats it writes');
    });
"

node bin/buckline.js doctor >/dev/null || fail "the doctor is not clean"
ok "the doctor is clean"

echo "release: ready"
