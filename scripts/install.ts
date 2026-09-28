import { spawnSync } from 'node:child_process'

const result = spawnSync('npm', ['install'], { stdio: 'inherit', shell: true })
process.exit(result.status ?? 1)
