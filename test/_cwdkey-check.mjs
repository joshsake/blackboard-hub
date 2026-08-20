// Helper for test/register.sh. Lives in a file rather than `node -e` because
// the regexes below are pure backslashes, and escaping them through bash into
// an inline script is a reliable source of nonsense.
//
// Reads `board registrations --json` on stdin and confirms that a path written
// Windows-style (backslashes, uppercase) folds to the same cwdKey the CLI
// recorded -- which is what makes hub routing match a live session.
let data = ''
process.stdin.on('data', c => { data += c }).on('end', () => {
  const r = JSON.parse(data).find(x => x.lane === 'api')
  if (!r) { console.log('NO api REGISTRATION'); return }
  const winStyle = r.cwd.replace(/\//g, '\\').toUpperCase()
  const norm = s => String(s).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
  console.log(norm(winStyle) === r.cwdKey ? 'match' : `MISMATCH ${norm(winStyle)} vs ${r.cwdKey}`)
})
