export const GOOGLE_CLIENT_ID_SUFFIX = '.apps.googleusercontent.com'
export const IOS_GOOGLE_CLIENT_ID_PLACEHOLDER = `PLACEHOLDER${GOOGLE_CLIENT_ID_SUFFIX}`

export function iosCallbackScheme(clientId: string): string {
  const normalized = clientId.trim()
  if (!normalized.endsWith(GOOGLE_CLIENT_ID_SUFFIX)) {
    throw new Error(`The iOS Google client ID must end with ${GOOGLE_CLIENT_ID_SUFFIX}`)
  }
  const clientName = normalized.slice(0, -GOOGLE_CLIENT_ID_SUFFIX.length)
  if (!clientName || !/^[A-Za-z0-9._-]+$/u.test(clientName)) {
    throw new Error('The iOS Google client ID contains an invalid URL-scheme character')
  }
  return `com.googleusercontent.apps.${clientName}`
}
