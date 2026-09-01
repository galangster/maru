#!/usr/bin/env node
/**
 * maru-mcp — the stdio shim an agent launches to talk to a running Maru.
 *
 * From the agent's point of view this process IS the MCP server. It is not:
 * the real server lives inside the Maru app, which owns the mail store, the
 * grants and the approval queue. This is a pipe with a credential on the front
 * of it — stdio on one side, Maru's local socket on the other, newline-
 * delimited JSON in both directions.
 *
 *   USAGE
 *     maru-mcp [--token <credential>] [--socket <path>]
 *
 *   CREDENTIAL
 *     --token, or MARU_AGENT_TOKEN (WREN_AGENT_TOKEN still honored for
 *     configs from the Wren era). Create an agent in Maru under
 *     Settings -> Agents; the credential is shown once, when you create it.
 *
 *   SOCKET
 *     --socket, or MARU_GATEWAY_SOCKET (WREN_GATEWAY_SOCKET honored), or
 *     the per-OS default:
 *       macOS    ~/Library/Application Support/dev.wren.app/gateway.sock
 *       Linux    $XDG_DATA_HOME/dev.wren.app/gateway.sock
 *                (falling back to ~/.local/share)
 *       Windows  \\.\pipe\dev.wren.app-gateway
 *
 *   EXIT CODES
 *     0  the connection closed cleanly
 *     2  no credential was given
 *     3  Maru is not running, or the socket is not reachable
 *     4  Maru rejected the credential
 *     5  the connection dropped before the handshake finished
 *
 * Plain Node >= 20, no dependencies and no build step, because an agent host
 * launches this with whatever node is on PATH.
 */

import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

const EXIT_OK = 0
const EXIT_NO_TOKEN = 2
const EXIT_NO_SOCKET = 3
const EXIT_REJECTED = 4
const EXIT_DROPPED = 5

const USAGE = `maru-mcp — connect an agent to a running Maru.

  maru-mcp [--token <credential>] [--socket <path>]

  --token   <credential>  the credential Maru issued for this agent
                          (or set MARU_AGENT_TOKEN)
  --socket  <path>        override the gateway socket path
                          (or set MARU_GATEWAY_SOCKET)
  --help                  print this and exit

Create an agent in Maru under Settings -> Agents to get a credential.
`

function fail(message, code) {
  process.stderr.write(`maru-mcp: ${message}\n`)
  process.exit(code)
}

function parseArgs(argv) {
  const args = { token: null, socket: null, help: false }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') args.help = true
    else if (arg === '--token') args.token = argv[++i] ?? null
    else if (arg.startsWith('--token=')) args.token = arg.slice('--token='.length)
    else if (arg === '--socket') args.socket = argv[++i] ?? null
    else if (arg.startsWith('--socket=')) args.socket = arg.slice('--socket='.length)
    else fail(`unknown argument ${arg}. Try --help.`, EXIT_NO_TOKEN)
  }
  return args
}

/**
 * Must match `resolve_name` in src-tauri/src/gateway.rs.
 *
 * This resolves the RELEASE endpoint, deliberately: an agent connecting from
 * outside wants the installed app, not whatever happens to be running under a
 * developer's terminal. A debug build listens on `gateway.dev.sock` (and a
 * `-dev` pipe on Windows) so the two can never collide — before that split they
 * shared one socket and the second process to start silently stole the first
 * one's connections.
 *
 * To point an agent at a dev build, pass `--socket` or set
 * MARU_GATEWAY_SOCKET to the `.dev.sock` path.
 */
function defaultSocketPath() {
  if (process.platform === 'win32') return '\\\\.\\pipe\\dev.wren.app-gateway'
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'dev.wren.app', 'gateway.sock')
  }
  const dataHome = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share')
  return path.join(dataHome, 'dev.wren.app', 'gateway.sock')
}

const args = parseArgs(process.argv.slice(2))
if (args.help) {
  process.stdout.write(USAGE)
  process.exit(EXIT_OK)
}

// WREN_AGENT_TOKEN: the pre-rename name, honored so existing agent
// configs keep connecting.
const token = args.token || process.env.MARU_AGENT_TOKEN || process.env.WREN_AGENT_TOKEN || ''
if (!token.trim()) {
  fail(
    'no credential. Pass --token <credential> or set MARU_AGENT_TOKEN. Create an agent in Maru under Settings -> Agents to get one.',
    EXIT_NO_TOKEN,
  )
}

const socketPath = args.socket || process.env.MARU_GATEWAY_SOCKET || process.env.WREN_GATEWAY_SOCKET || defaultSocketPath()

const socket = net.connect(socketPath)
socket.setEncoding('utf8')

/** Flipped by the handshake. Until then nothing is piped in either direction. */
let authenticated = false
let settled = false
let inbound = ''

function exit(code) {
  if (settled) return
  settled = true
  process.exit(code)
}

socket.on('error', (error) => {
  if (authenticated) {
    fail(`the connection to Maru failed: ${error.message}`, EXIT_DROPPED)
    return
  }
  fail(
    `could not connect to Maru at ${socketPath} (${error.code || error.message}). Is Maru running?`,
    EXIT_NO_SOCKET,
  )
})

socket.on('connect', () => {
  // The auth frame. First frame of the connection, always, and the only one
  // this process composes itself.
  socket.write(`${JSON.stringify({ token: token.trim() })}\n`)
})

socket.on('data', (chunk) => {
  if (authenticated) {
    process.stdout.write(chunk)
    return
  }

  inbound += chunk
  const newline = inbound.indexOf('\n')
  if (newline === -1) return

  const line = inbound.slice(0, newline)
  const rest = inbound.slice(newline + 1)
  inbound = ''

  let ack
  try {
    ack = JSON.parse(line)
  } catch {
    fail(`Maru sent something that is not JSON during the handshake: ${line.slice(0, 200)}`, EXIT_DROPPED)
    return
  }

  if (ack.type !== 'auth_ok') {
    fail(ack.message || 'Maru rejected the credential.', EXIT_REJECTED)
    return
  }

  authenticated = true
  // Anything Maru sent in the same packet as the ack is already MCP traffic.
  if (rest) process.stdout.write(rest)

  // Only now does the agent's stdin reach the socket. Before the handshake it
  // sits in the pipe buffer, which is exactly where an `initialize` sent by an
  // eager client should wait.
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', (data) => socket.write(data))
  process.stdin.on('end', () => socket.end())
  process.stdin.resume()
})

socket.on('close', () => {
  exit(authenticated ? EXIT_OK : EXIT_DROPPED)
})

process.on('SIGINT', () => socket.end())
process.on('SIGTERM', () => socket.end())
