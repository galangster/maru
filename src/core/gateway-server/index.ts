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
export { TOOLS, TOOL_CAPABILITIES, callTool, ToolRefusal, type ToolContext } from './tools'
export {
  ATTACHMENT_BYTES_MAX,
  ATTACHMENT_DELIVERABLE_BYTES,
  BODY_CHARS_MAX,
  SEARCH_LIMIT_DEFAULT,
  SEARCH_LIMIT_MAX,
  SNIPPET_CHARS,
} from './tools-read'
export { markdownToHtml, textToHtml, MARKDOWN_SUBSET } from './body'
export { GatewayServer, UNKNOWN_CREDENTIAL_ID, type GatewayServerDeps } from './server'
