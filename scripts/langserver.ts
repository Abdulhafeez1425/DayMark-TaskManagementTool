import { spawnSync } from 'node:child_process'

const result = spawnSync(
  'npx',
  ['--yes', '--package=@vtsls/language-server@^0.3.0', 'vtsls', '--stdio'],
  { stdio: 'inherit', shell: true },
)
process.exit(result.status ?? 1)
