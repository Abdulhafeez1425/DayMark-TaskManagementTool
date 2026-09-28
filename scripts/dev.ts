import { spawn } from 'node:child_process'

const child = spawn('npm', ['run', 'dev'], { stdio: 'inherit', shell: true })
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  process.exit(code ?? 0)
})
