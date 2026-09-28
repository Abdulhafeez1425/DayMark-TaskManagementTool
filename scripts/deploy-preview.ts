import { spawnSync } from 'node:child_process'

const build = spawnSync('npm', ['run', 'build', '--', '--mode', 'development'], {
  stdio: 'inherit',
  shell: true,
})
if (build.status !== 0) process.exit(build.status ?? 1)

const deploy = spawnSync('figma', ['make', 'deploy-preview', '--build-dir', 'dist'], {
  stdio: 'inherit',
  shell: true,
})
process.exit(deploy.status ?? 1)
