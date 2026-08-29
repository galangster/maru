// The seam between this layer and the socket.
//
// Two implementations: `src/platform/tauri-gateway.ts` over Tauri events and
// commands, and a mock in the tests. Everything below this interface — session
// lifecycle, credential verification, the MCP server itself — runs in plain
// Node under vitest, which is the whole reason the protocol lives in
// TypeScript and the socket lives in Rust.

/** The first frame of a connection. Its payload is an unverified token. */
export interface AuthEvent {
  connId: number
  frame: string
}

/**
 * Every frame after a successful auth. `agentId` is the relay's own tag from
 * the verified credential — never anything the frame claimed about itself.
 */
export interface FrameEvent {
  connId: number
  agentId: string
  frame: string
}

export interface CloseEvent {
  connId: number
}

/** What the socket tells the app about itself. */
export interface GatewayInfo {
  socketPath: string | null
  running: boolean
  version: string
}

/**
 * Subscriptions resolve to their own unsubscribe function, matching the shape
 * of `MailService.onEvent` and `AgentGateway.onEvent`.
 */
export interface GatewayRelay {
  onAuth(cb: (event: AuthEvent) => void): Promise<() => void>
  onFrame(cb: (event: FrameEvent) => void): Promise<() => void>
  onClose(cb: (event: CloseEvent) => void): Promise<() => void>
  /**
   * The verdict on an auth frame. `agentId` is required on an accept and is
   * what every later frame from this connection is tagged with.
   */
  authResult(
    connId: number,
    verdict: { accepted: boolean; agentId?: string; message?: string },
  ): Promise<void>
  /** One frame back out to a connection. */
  reply(connId: number, frame: string): Promise<void>
  /**
   * Stop serving a connection from this side.
   *
   * Wren never yanks the socket out from under a running agent: the shim owns
   * the connection's lifetime, and the relay drops its registry entry so no
   * further frame is written. The file descriptor itself goes when the shim
   * exits, or when Wren does.
   */
  close(connId: number): Promise<void>
  info(): Promise<GatewayInfo>
}
