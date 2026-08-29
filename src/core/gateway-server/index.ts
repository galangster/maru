// Public entry point for the MCP gateway server — M2.
//
// The app wires this up in `src/features/mail/service.tsx`: build the relay
// over Tauri, hand it the AgentGateway M1 built and the MailService the app is
// already running on, and every agent connection from then on is that object's
// problem.

export {
  encodeFrame,
  parseFrame,
  frameByteLength,
  FrameReader,
  FrameTooLargeError,
  MAX_FRAME_BYTES,
} from './frames'
export type {
  AuthEvent,
  CloseEvent,
  FrameEvent,
  GatewayInfo,
  GatewayRelay,
} from './relay'
export { RelayTransport, type FrameLink } from './transport'
export { GatewaySession, type SessionDeps } from './session'
export { TOOLS, callTool, type ToolContext } from './tools'
export { GatewayServer, UNKNOWN_CREDENTIAL_ID, type GatewayServerDeps } from './server'
