import type { Settings } from '../types'

export type OAuthClientSource = 'official' | 'custom'

export interface OAuthClientConfig {
  source: OAuthClientSource
  clientId: string
  clientSecret?: string
}

/** The stored issuer half of a config: what a token record knows. */
export type IssuingClient = Omit<OAuthClientConfig, 'clientSecret'>

export const OFFICIAL_GOOGLE_CLIENT_ID =
  import.meta.env.WREN_OFFICIAL_GOOGLE_CLIENT_ID?.trim() || undefined

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed || undefined
}

/**
 * Existing accounts stay bound to their issuer. Settings and release inputs
 * select a client only for accounts that do not hold a refresh token yet.
 */
export function resolveOAuthClient({
  issuingClient,
  settings,
  officialClientId = OFFICIAL_GOOGLE_CLIENT_ID,
}: {
  issuingClient?: IssuingClient | null
  settings: Pick<Settings, 'googleClientId' | 'googleClientSecret'>
  officialClientId?: string
}): OAuthClientConfig | null {
  const customClientId = nonEmpty(settings.googleClientId)
  const customClientSecret = nonEmpty(settings.googleClientSecret)

  if (issuingClient?.clientId) {
    return {
      source: issuingClient.source,
      clientId: issuingClient.clientId,
      // A secret belongs to the stored issuer only when the IDs still match.
      ...(issuingClient.source === 'custom' && issuingClient.clientId === customClientId
        ? { clientSecret: customClientSecret }
        : {}),
    }
  }

  if (customClientId) {
    return {
      source: 'custom',
      clientId: customClientId,
      ...(customClientSecret ? { clientSecret: customClientSecret } : {}),
    }
  }

  const builtClientId = nonEmpty(officialClientId)
  return builtClientId ? { source: 'official', clientId: builtClientId } : null
}

export function isOfficialGoogleClientId(
  clientId: string | undefined,
  officialClientId = OFFICIAL_GOOGLE_CLIENT_ID,
): boolean {
  const candidate = nonEmpty(clientId)
  const official = nonEmpty(officialClientId)
  return Boolean(candidate && official && candidate === official)
}
