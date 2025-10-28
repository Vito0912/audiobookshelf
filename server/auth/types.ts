import { Request as ExpressRequest, Response as ExpressResponse } from 'express'
import { Client, Issuer, Strategy, TokenSet, UserinfoResponse } from 'openid-client'

/**
 * OpenID Connect issuer configuration from well-known endpoint
 */
export interface OpenIdIssuerConfig {
  issuer: string
  authorization_endpoint: string
  token_endpoint: string
  userinfo_endpoint: string
  end_session_endpoint: string
  jwks_uri: string
  id_token_signing_alg_values_supported: string[]
}

/**
 * Error response for OIDC operations
 */
export interface OidcErrorResponse {
  status: number
  error: string
}

/**
 * PKCE parameters for authorization
 */
export interface PkceParams {
  code_challenge: string
  code_challenge_method: string
  code_verifier?: string
  error?: string
}

/**
 * Authorization URL response
 */
export interface AuthorizationUrlResponse {
  authorizationUrl: string
  isMobileFlow: boolean
}

/**
 * Session data stored for OpenID authentication
 */
export interface OpenIdSessionData {
  mobile_redirect_uri: string
}

/**
 * Express session with OpenID strategy key
 */
export interface OpenIdSession {
  state: string
  max_age?: number
  response_type: string
  code_verifier?: string
  mobile?: string
  sso_redirect_uri: string
}

/**
 * User model instance from database (minimal interface for OIDC)
 */
export interface OidcUser {
  id: string
  username: string
  type: 'root' | 'admin' | 'user' | 'guest'
  isActive: boolean
  openid_id_token?: string
  error?: boolean
  save(): Promise<void>
  destroy(): Promise<void>
  updatePermissionsFromExternalJSON(permissions: unknown): Promise<boolean>
}

/**
 * Extended Express Request with user property
 */
export interface AuthenticatedRequest extends ExpressRequest {
  user: OidcUser
}

/**
 * Express Request type alias for OIDC operations
 */
export type Request = ExpressRequest

/**
 * Express Response type alias for OIDC operations
 */
export type Response = ExpressResponse

/**
 * Passport verify callback type
 */
export type PassportDoneCallback = (error: Error | null, user?: OidcUser | null | false, info?: string) => void

/**
 * OpenID Client types re-export for convenience
 */
export type { Client, Issuer, Strategy, TokenSet, UserinfoResponse }
