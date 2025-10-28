import { Request, Response } from 'express'
import passport from 'passport'
import * as OpenIDClient from 'openid-client'
import axios from 'axios'
// @ts-ignore - Database is a JS file, path is relative to compiled location in dist/server/auth/
const Database = require('../../../server/Database')
// @ts-ignore - Logger is a JS file, path is relative to compiled location in dist/server/auth/
const Logger = require('../../../server/Logger')
import {
  OpenIdIssuerConfig,
  OidcErrorResponse,
  PkceParams,
  AuthorizationUrlResponse,
  OpenIdSession,
  OpenIdSessionData,
  OidcUser,
  PassportDoneCallback,
  Client,
  Strategy,
  TokenSet,
  UserinfoResponse
} from './types'

/**
 * OpenID Connect authentication strategy
 */
class OidcAuthStrategy {
  readonly name: string
  private strategy: Strategy<OidcUser, Client> | null
  private client: Client | null
  private openIdAuthSession: Map<string, OpenIdSessionData>

  constructor() {
    this.name = 'openid-client'
    this.strategy = null
    this.client = null
    // Map of openId sessions indexed by oauth2 state-variable
    this.openIdAuthSession = new Map()
  }

  /**
   * Get the passport strategy instance
   */
  getStrategy(): Strategy<OidcUser, Client> {
    if (!this.strategy) {
      this.strategy = new OpenIDClient.Strategy(
        {
          client: this.getClient(),
          params: {
            redirect_uri: `${global.ServerSettings.authOpenIDSubfolderForRedirectURLs}/auth/openid/callback`,
            scope: this.getScope()
          }
        },
        this.verifyCallback.bind(this)
      )
    }
    return this.strategy
  }

  /**
   * Get the OpenID Connect client
   */
  getClient(): Client {
    if (!this.client) {
      if (!Database.serverSettings.isOpenIDAuthSettingsValid) {
        throw new Error('OpenID Connect settings are not valid')
      }

      // Custom req timeout see: https://github.com/panva/node-openid-client/blob/main/docs/README.md#customizing
      OpenIDClient.custom.setHttpOptionsDefaults({ timeout: 10000 })

      const openIdIssuerClient = new OpenIDClient.Issuer({
        issuer: global.ServerSettings.authOpenIDIssuerURL,
        authorization_endpoint: global.ServerSettings.authOpenIDAuthorizationURL,
        token_endpoint: global.ServerSettings.authOpenIDTokenURL,
        userinfo_endpoint: global.ServerSettings.authOpenIDUserInfoURL,
        jwks_uri: global.ServerSettings.authOpenIDJwksURL,
        end_session_endpoint: global.ServerSettings.authOpenIDLogoutURL
      }).Client

      this.client = new openIdIssuerClient({
        client_id: global.ServerSettings.authOpenIDClientID,
        client_secret: global.ServerSettings.authOpenIDClientSecret,
        id_token_signed_response_alg: global.ServerSettings.authOpenIDTokenSigningAlgorithm
      })
    }
    return this.client
  }

  /**
   * Get the scope string for the OpenID Connect request
   */
  getScope(): string {
    let scope = 'openid profile email'
    if (global.ServerSettings.authOpenIDGroupClaim) {
      scope += ' ' + global.ServerSettings.authOpenIDGroupClaim
    }
    if (global.ServerSettings.authOpenIDAdvancedPermsClaim) {
      scope += ' ' + global.ServerSettings.authOpenIDAdvancedPermsClaim
    }
    return scope
  }

  /**
   * Initialize the strategy with passport
   */
  init(): void {
    if (!Database.serverSettings.isOpenIDAuthSettingsValid) {
      Logger.error(`[OidcAuth] Cannot init openid auth strategy - invalid settings`)
      return
    }
    passport.use(this.name, this.getStrategy())
  }

  /**
   * Remove the strategy from passport
   */
  unuse(): void {
    passport.unuse(this.name)
    this.strategy = null
    this.client = null
  }

  /**
   * Verify callback for OpenID Connect authentication
   */
  async verifyCallback(tokenset: TokenSet, userinfo: UserinfoResponse, done: PassportDoneCallback): Promise<void> {
    let isNewUser = false
    let user: OidcUser | null = null
    try {
      Logger.debug(`[OidcAuth] openid callback userinfo=`, JSON.stringify(userinfo, null, 2))

      if (!userinfo.sub) {
        throw new Error('Invalid userinfo, no sub')
      }

      if (!this.validateGroupClaim(userinfo)) {
        throw new Error(`Group claim ${Database.serverSettings.authOpenIDGroupClaim} not found or empty in userinfo`)
      }

      user = (await Database.userModel.findUserFromOpenIdUserInfo(userinfo)) as OidcUser | null

      if (user?.error) {
        throw new Error('Invalid userinfo or already linked')
      }

      if (!user) {
        // If no existing user was matched, auto-register if configured
        if (global.ServerSettings.authOpenIDAutoRegister) {
          Logger.info(`[User] openid: Auto-registering user with sub "${userinfo.sub}"`, userinfo)
          user = (await Database.userModel.createUserFromOpenIdUserInfo(userinfo)) as OidcUser
          isNewUser = true
        } else {
          Logger.warn(`[User] openid: User not found and auto-register is disabled`)
        }
      }

      if (!user?.isActive) {
        throw new Error('User not active or not found')
      }

      await this.setUserGroup(user, userinfo)
      await this.updateUserPermissions(user, userinfo)

      // We also have to save the id_token for later (used for logout) because we cannot set cookies here
      user.openid_id_token = tokenset.id_token

      return done(null, user)
    } catch (error) {
      const err = error as Error
      Logger.error(`[OidcAuth] openid callback error: ${err?.message}\n${err?.stack}`)
      // Remove new user if an error occurs
      if (isNewUser && user) {
        await user.destroy()
      }
      return done(null, null, 'Unauthorized')
    }
  }

  /**
   * Validates the presence and content of the group claim in userinfo.
   */
  validateGroupClaim(userinfo: UserinfoResponse): boolean {
    const groupClaimName = Database.serverSettings.authOpenIDGroupClaim
    if (!groupClaimName)
      // Allow no group claim when configured like this
      return true

    // If configured it must exist in userinfo
    if (!userinfo[groupClaimName]) {
      return false
    }
    return true
  }

  /**
   * Sets the user group based on group claim in userinfo.
   */
  async setUserGroup(user: OidcUser, userinfo: UserinfoResponse): Promise<void> {
    const groupClaimName = Database.serverSettings.authOpenIDGroupClaim
    if (!groupClaimName)
      // No group claim configured, don't set anything
      return

    const groupClaimValue = userinfo[groupClaimName]
    if (!groupClaimValue) throw new Error(`Group claim ${groupClaimName} not found in userinfo`)

    const groupsList = (Array.isArray(groupClaimValue) ? groupClaimValue : [groupClaimValue]).map((group: string) => group.toLowerCase())
    const rolesInOrderOfPriority: Array<'admin' | 'user' | 'guest'> = ['admin', 'user', 'guest']

    const userType = rolesInOrderOfPriority.find((role) => groupsList.includes(role))
    if (userType) {
      if (user.type === 'root') {
        // Check OpenID Group
        if (userType !== 'admin') {
          throw new Error(`Root user "${user.username}" cannot be downgraded to ${userType}. Denying login.`)
        } else {
          // If root user is logging in via OpenID, we will not change the type
          return
        }
      }

      if (user.type !== userType) {
        Logger.info(`[OidcAuth] openid callback: Updating user "${user.username}" type to "${userType}" from "${user.type}"`)
        user.type = userType
        await user.save()
      }
    } else {
      throw new Error(`No valid group found in userinfo: ${JSON.stringify(userinfo[groupClaimName], null, 2)}`)
    }
  }

  /**
   * Updates user permissions based on the advanced permissions claim.
   */
  async updateUserPermissions(user: OidcUser, userinfo: UserinfoResponse): Promise<void> {
    const absPermissionsClaim = Database.serverSettings.authOpenIDAdvancedPermsClaim
    if (!absPermissionsClaim)
      // No advanced permissions claim configured, don't set anything
      return

    if (user.type === 'admin' || user.type === 'root') return

    const absPermissions = userinfo[absPermissionsClaim]
    if (!absPermissions) throw new Error(`Advanced permissions claim ${absPermissionsClaim} not found in userinfo`)

    if (await user.updatePermissionsFromExternalJSON(absPermissions)) {
      Logger.info(`[OidcAuth] openid callback: Updating advanced perms for user "${user.username}" using "${JSON.stringify(absPermissions)}"`)
    }
  }

  /**
   * Generate PKCE parameters for the authorization request
   */
  generatePkce(req: Request, isMobileFlow: boolean): PkceParams {
    if (isMobileFlow) {
      if (!req.query.code_challenge) {
        return {
          code_challenge: '',
          code_challenge_method: '',
          error: 'code_challenge required for mobile flow (PKCE)'
        }
      }
      if (req.query.code_challenge_method && req.query.code_challenge_method !== 'S256') {
        return {
          code_challenge: '',
          code_challenge_method: '',
          error: 'Only S256 code_challenge_method method supported'
        }
      }
      return {
        code_challenge: req.query.code_challenge as string,
        code_challenge_method: (req.query.code_challenge_method as string) || 'S256'
      }
    } else {
      const code_verifier = OpenIDClient.generators.codeVerifier()
      const code_challenge = OpenIDClient.generators.codeChallenge(code_verifier)
      return { code_challenge, code_challenge_method: 'S256', code_verifier }
    }
  }

  /**
   * Check if a redirect URI is valid
   */
  isValidRedirectUri(uri: string): boolean {
    // Check if the redirect_uri is in the whitelist
    return Database.serverSettings.authOpenIDMobileRedirectURIs.includes(uri) || (Database.serverSettings.authOpenIDMobileRedirectURIs.length === 1 && Database.serverSettings.authOpenIDMobileRedirectURIs[0] === '*')
  }

  /**
   * Get the authorization URL for OpenID Connect
   * Calls client manually because the strategy does not support forwarding the code challenge for the mobile flow
   */
  getAuthorizationUrl(req: Request): AuthorizationUrlResponse | OidcErrorResponse {
    const client = this.getClient()
    const strategy = this.getStrategy()
    const sessionKey = (strategy as any)._key

    try {
      const protocol = req.secure || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http'
      const hostUrl = new URL(`${protocol}://${req.get('host')}`)
      const isMobileFlow = req.query.response_type === 'code' || !!req.query.redirect_uri || !!req.query.code_challenge

      // Only allow code flow (for mobile clients)
      if (req.query.response_type && req.query.response_type !== 'code') {
        Logger.debug(`[OidcAuth] OIDC Invalid response_type=${req.query.response_type}`)
        return {
          status: 400,
          error: 'Invalid response_type, only code supported'
        }
      }

      // Generate a state on web flow or if no state supplied
      const state = !isMobileFlow || !req.query.state ? OpenIDClient.generators.random() : (req.query.state as string)

      // Redirect URL for the SSO provider
      let redirectUri: string
      if (isMobileFlow) {
        // Mobile required redirect uri
        // If it is in the whitelist, we will save into this.openIdAuthSession and set the redirect uri to /auth/openid/mobile-redirect
        //    where we will handle the redirect to it
        if (!req.query.redirect_uri || !this.isValidRedirectUri(req.query.redirect_uri as string)) {
          Logger.debug(`[OidcAuth] Invalid redirect_uri=${req.query.redirect_uri}`)
          return {
            status: 400,
            error: 'Invalid redirect_uri'
          }
        }
        // We cannot save the supplied redirect_uri in the session, because it the mobile client uses browser instead of the API
        //   for the request to mobile-redirect and as such the session is not shared
        this.openIdAuthSession.set(state, { mobile_redirect_uri: req.query.redirect_uri as string })

        redirectUri = new URL(`${global.ServerSettings.authOpenIDSubfolderForRedirectURLs}/auth/openid/mobile-redirect`, hostUrl).toString()
      } else {
        redirectUri = new URL(`${global.ServerSettings.authOpenIDSubfolderForRedirectURLs}/auth/openid/callback`, hostUrl).toString()

        if (req.query.state) {
          Logger.debug(`[OidcAuth] Invalid state - not allowed on web openid flow`)
          return {
            status: 400,
            error: 'Invalid state, not allowed on web flow'
          }
        }
      }

      // Update the strategy's redirect_uri for this request
      ;(strategy as any)._params.redirect_uri = redirectUri
      Logger.debug(`[OidcAuth] OIDC redirect_uri=${redirectUri}`)

      const pkceData = this.generatePkce(req, isMobileFlow)
      if (pkceData.error) {
        return {
          status: 400,
          error: pkceData.error
        }
      }

      // @ts-ignore - Express session is extended dynamically
      const session = req.session as any
      session[sessionKey] = {
        ...session[sessionKey],
        state: state,
        max_age: (strategy as any)._params.max_age,
        response_type: 'code',
        code_verifier: pkceData.code_verifier, // not null if web flow
        mobile: req.query.redirect_uri, // Used in the abs callback later, set mobile if redirect_uri is filled out
        sso_redirect_uri: redirectUri // Save the redirect_uri (for the SSO Provider) for the callback
      } as OpenIdSession

      const authorizationUrl = client.authorizationUrl({
        ...(strategy as any)._params,
        redirect_uri: redirectUri,
        state: state,
        response_type: 'code',
        scope: this.getScope(),
        code_challenge: pkceData.code_challenge,
        code_challenge_method: pkceData.code_challenge_method
      })

      return {
        authorizationUrl,
        isMobileFlow
      }
    } catch (error) {
      const err = error as Error
      Logger.error(`[OidcAuth] Error generating authorization URL: ${err}\n${err?.stack}`)
      return {
        status: 500,
        error: err.message || 'Unknown error'
      }
    }
  }

  /**
   * Get the end session URL for logout
   */
  getEndSessionUrl(req: Request, idToken: string | undefined, authMethod: string): string | null {
    const client = this.getClient()

    // @ts-ignore - Issuer types are incomplete
    if (client.issuer.end_session_endpoint && client.issuer.end_session_endpoint.length > 0) {
      let postLogoutRedirectUri: string | null = null

      if (authMethod === 'openid') {
        const protocol = req.secure || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http'
        const host = req.get('host')
        // TODO: ABS does currently not support subfolders for installation
        // If we want to support it we need to include a config for the serverurl
        postLogoutRedirectUri = `${protocol}://${host}${global.RouterBasePath}/login`
      }
      // else for openid-mobile we keep postLogoutRedirectUri on null
      //  nice would be to redirect to the app here, but for example Authentik does not implement
      //  the post_logout_redirect_uri parameter at all and for other providers
      //  we would also need again to implement (and even before get to know somehow for 3rd party apps)
      //  the correct app link like audiobookshelf://login (and maybe also provide a redirect like mobile-redirect).
      //   Instead because its null (and this way the parameter will be omitted completly), the client/app can simply append something like
      //  &post_logout_redirect_uri=audiobookshelf://login to the received logout url by itself which is the simplest solution
      //   (The URL needs to be whitelisted in the config of the SSO/ID provider)

      return client.endSessionUrl({
        id_token_hint: idToken,
        post_logout_redirect_uri: postLogoutRedirectUri ?? undefined
      })
    }

    return null
  }

  /**
   * Get OpenID Connect configuration from an issuer URL
   */
  async getIssuerConfig(issuerUrl: string): Promise<OpenIdIssuerConfig | OidcErrorResponse> {
    // Strip trailing slash
    let cleanedIssuerUrl = issuerUrl
    if (cleanedIssuerUrl.endsWith('/')) cleanedIssuerUrl = cleanedIssuerUrl.slice(0, -1)

    // Append config pathname and validate URL
    let configUrl: URL | null = null
    try {
      configUrl = new URL(`${cleanedIssuerUrl}/.well-known/openid-configuration`)
      if (!configUrl.pathname.endsWith('/.well-known/openid-configuration')) {
        throw new Error('Invalid pathname')
      }
    } catch (error) {
      const err = error as Error
      Logger.error(`[OidcAuth] Failed to get openid configuration. Invalid URL "${configUrl}"`, err)
      return {
        status: 400,
        error: "Invalid request. Query param 'issuer' is invalid"
      }
    }

    try {
      const { data } = await axios.get(configUrl.toString())
      return {
        issuer: data.issuer,
        authorization_endpoint: data.authorization_endpoint,
        token_endpoint: data.token_endpoint,
        userinfo_endpoint: data.userinfo_endpoint,
        end_session_endpoint: data.end_session_endpoint,
        jwks_uri: data.jwks_uri,
        id_token_signing_alg_values_supported: data.id_token_signing_alg_values_supported
      }
    } catch (error) {
      const err = error as Error
      Logger.error(`[OidcAuth] Failed to get openid configuration at "${configUrl}"`, err)
      return {
        status: 400,
        error: 'Failed to get openid configuration'
      }
    }
  }

  /**
   * Handle mobile redirect for OAuth2 callback
   */
  handleMobileRedirect(req: Request, res: Response): void {
    try {
      // Extract the state parameter from the request
      const { state, code } = req.query

      // Check if the state provided is in our list
      if (!state || typeof state !== 'string' || !this.openIdAuthSession.has(state)) {
        Logger.error('[OidcAuth] /auth/openid/mobile-redirect route: State parameter mismatch')
        res.status(400).send('State parameter mismatch')
        return
      }

      const mobile_redirect_uri = this.openIdAuthSession.get(state)?.mobile_redirect_uri

      if (!mobile_redirect_uri) {
        Logger.error('[OidcAuth] No redirect URI')
        res.status(400).send('No redirect URI')
        return
      }

      this.openIdAuthSession.delete(state)

      const redirectUri = `${mobile_redirect_uri}?code=${encodeURIComponent(code as string)}&state=${encodeURIComponent(state)}`
      // Redirect to the overwrite URI saved in the map
      res.redirect(redirectUri)
    } catch (error) {
      const err = error as Error
      Logger.error(`[OidcAuth] Error in /auth/openid/mobile-redirect route: ${err}\n${err?.stack}`)
      res.status(500).send('Internal Server Error')
    }
  }

  /**
   * Validates if a callback URL is safe for redirect (same-origin only)
   */
  isValidWebCallbackUrl(callbackUrl: string | undefined, req: Request): boolean {
    if (!callbackUrl) return false

    try {
      // Handle relative URLs - these are always safe if they start with router base path
      if (callbackUrl.startsWith('/')) {
        // Only allow relative paths that start with the router base path
        if (callbackUrl.startsWith(global.RouterBasePath + '/')) {
          return true
        }
        Logger.warn(`[OidcAuth] Rejected callback URL outside router base path: ${callbackUrl}`)
        return false
      }

      // For absolute URLs, ensure they point to the same origin
      const callbackUrlObj = new URL(callbackUrl)
      // NPM appends both http and https in x-forwarded-proto sometimes, so we need to check for both
      const xfp = (req.get('x-forwarded-proto') || '').toLowerCase()
      const currentProtocol =
        req.secure ||
        xfp
          .split(',')
          .map((s) => s.trim())
          .includes('https')
          ? 'https'
          : 'http'
      const currentHost = req.get('host')

      // Check if protocol and host match exactly
      if (callbackUrlObj.protocol === currentProtocol + ':' && callbackUrlObj.host === currentHost) {
        // Additional check: ensure path starts with router base path
        if (callbackUrlObj.pathname.startsWith(global.RouterBasePath + '/')) {
          return true
        }
        Logger.warn(`[OidcAuth] Rejected same-origin callback URL outside router base path: ${callbackUrl}`)
        return false
      }

      Logger.warn(`[OidcAuth] Rejected callback URL to different origin: ${callbackUrl} (expected ${currentProtocol}://${currentHost})`)
      return false
    } catch (error) {
      const err = error as Error
      Logger.error(`[OidcAuth] Invalid callback URL format: ${callbackUrl}`, err)
      return false
    }
  }
}

export default OidcAuthStrategy
