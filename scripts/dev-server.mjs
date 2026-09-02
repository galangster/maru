// The dev-server handshake the capture scripts share: probe the port, start
// vite only if nobody else is serving it, and hand back the child to kill —
// or null, meaning the server belongs to someone else and stays up.

import { spawn } from 'node:child_process'
import { createConnection } from 'node:net'

/**
 * 1420 is Tauri's fixed port and stays the default.
 *
 * `WREN_DEV_PORT` overrides it, and the reason is not preference. Several
 * worktrees of this repository are driven at once, and `startServerIfNeeded`
 * REUSES whatever is already answering on the port — so a capture run in one
 * worktree silently photographed another worktree's build. A run that must be
 * of its own code names its own port.
 */
export const PORT = Number(process.env.WREN_DEV_PORT ?? 1420)
export const ORIGIN = `http://localhost:${PORT}`

function portOpen(port) {
  return new Promise((resolve) => {
    // vite binds localhost, which resolves to ::1 first on macOS — probing
    // 127.0.0.1 alone reports the port closed while the server is up.
    const socket = createConnection({ port, host: 'localhost' })
    socket.on('connect', () => {
      socket.end()
      resolve(true)
    })
    socket.on('error', () => resolve(false))
    socket.setTimeout(500, () => {
      socket.destroy()
      resolve(false)
    })
  })
}

async function waitForPort(port, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await portOpen(port)) return true
    await new Promise((r) => setTimeout(r, 300))
  }
  return false
}

export async function startServerIfNeeded(root, port = PORT) {
  if (await portOpen(port)) {
    console.log(`vite already serving on ${port}; reusing it`)
    return null
  }
  console.log('starting vite…')
  // `--strictPort`, so a port already taken by another worktree fails here
  // rather than letting vite pick a free one that nothing is pointed at.
  const child = spawn('npm', ['run', 'dev', '--', '--port', String(port), '--strictPort'], {
    cwd: root,
    stdio: 'ignore',
    detached: false,
  })
  if (!(await waitForPort(port))) {
    child.kill('SIGTERM')
    throw new Error(`vite did not come up on ${port}`)
  }
  return child
}
