// Newline-delimited JSON framing — the one wire format on the shim<->app
// channel, below MCP entirely.
//
// Three parties speak it: the Rust relay (src-tauri/src/gateway.rs), the stdio
// shim (bin/maru-mcp.mjs) and this file. Rust already splits complete lines
// before it emits them, and the shim has its own four-line splitter because it
// runs as plain Node with no build step and cannot import TypeScript. So this
// module is not the only implementation of the rule — it is the one that is
// tested, and the other two are written to match it.
//
// `FrameReader` is still load-bearing rather than decorative: every inbound
// line passes through it, which enforces the size cap a second time inside the
// webview. The relay is the trust boundary, but a cap that only exists on one
// side of a boundary is a cap that stops existing the day someone reworks that
// side.

/**
 * One frame's ceiling, matching `MAX_FRAME_BYTES` in gateway.rs. Measured in
 * UTF-8 bytes, not UTF-16 code units, because the socket carries bytes.
 */
export const MAX_FRAME_BYTES = 1024 * 1024

const encoder = new TextEncoder()

export class FrameTooLargeError extends Error {
  constructor(bytes: number) {
    super(`Frame is ${bytes} bytes; the limit is ${MAX_FRAME_BYTES}.`)
    this.name = 'FrameTooLargeError'
  }
}

export function frameByteLength(text: string): number {
  return encoder.encode(text).length
}

/**
 * JSON, one line, newline-terminated. Throws rather than truncating: a
 * truncated JSON-RPC frame desynchronises the stream, which is a worse failure
 * than a loud one.
 */
export function encodeFrame(value: unknown): string {
  const json = JSON.stringify(value)
  const bytes = frameByteLength(json)
  if (bytes > MAX_FRAME_BYTES) throw new FrameTooLargeError(bytes)
  return `${json}\n`
}

/** Parse one frame's payload. Returns null for anything that is not JSON. */
export function parseFrame(line: string): unknown {
  try {
    return JSON.parse(line) as unknown
  } catch {
    return null
  }
}

/**
 * Splits a byte stream into frames across arbitrary chunk boundaries.
 *
 * Holds at most one partial frame. A partial frame that grows past the cap is
 * an error the caller must close the connection on — it cannot be recovered
 * from, because the reader can no longer tell where the next frame starts.
 */
export class FrameReader {
  private buffer = ''

  /** Complete frames from this chunk, in order. Blank lines are dropped. */
  push(chunk: string): string[] {
    this.buffer += chunk
    const frames: string[] = []
    let index = this.buffer.indexOf('\n')
    while (index !== -1) {
      const line = this.buffer.slice(0, index).replace(/\r$/, '')
      this.buffer = this.buffer.slice(index + 1)
      if (line.trim() !== '') frames.push(line)
      index = this.buffer.indexOf('\n')
    }
    const pending = frameByteLength(this.buffer)
    if (pending > MAX_FRAME_BYTES) {
      this.buffer = ''
      throw new FrameTooLargeError(pending)
    }
    return frames
  }

  /** True while a partial frame is held. Useful in tests and on close. */
  get pendingBytes(): number {
    return frameByteLength(this.buffer)
  }
}
