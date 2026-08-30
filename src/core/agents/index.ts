// Public entry point for the agent trust substrate. The UI imports from here.
//
// M2's MCP server will import from here too, and from nothing deeper: the
// three things it needs are `AgentRegistry.verifyCredential` (connection auth),
// `AgentGateway.authorize` (per tool call) and `AgentGateway.requestSend` (the
// send gate). Everything else on the gateway is the human's half.

export type {
  Agent,
  AgentEvent,
  AgentStore,
  Approval,
  ApprovalKind,
  ApprovalStatus,
  AuditDraft,
  AuditEntry,
  AuditOutcome,
  Capability,
  Grant,
  GrantScope,
} from './types'
export { CAPABILITIES, SCOPE_ALL } from './types'

export { AuditLog, AUDIT_READ_CAP } from './audit'
export {
  evaluate,
  liveGrants,
  scopeAdmits,
  domainOf,
  recipientsOf,
  GrantBook,
  type Decision,
  type DenyReason,
  type EvaluationContext,
} from './grants'
export {
  AgentRegistry,
  issueCredential,
  hashCredential,
  CREDENTIAL_BYTES,
  CREDENTIAL_PREFIX,
  type IssuedAgent,
} from './registry'
export { ApprovalQueue, APPROVAL_TTL_MS, describeDraft, type SendSeam } from './approvals'
export {
  SessionConsent,
  SESSION_DURATIONS_MS,
  DEFAULT_SESSION_MS,
  humanDuration,
  minutesLeft,
  type AgentSession,
} from './sessions'
export { MemoryAgentStore, SqlAgentStore, publicAgent } from './store'
export {
  AgentGateway,
  createSqlGateway,
  type AgentGatewayOptions,
  type AuthorizeResult,
} from './gateway'
export { seedDemoAgents, DEMO_AGENT, DEMO_AGENT_CREDENTIAL } from './demo-fixtures'
