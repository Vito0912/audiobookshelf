// Global type declarations for Audiobookshelf

import 'express-session'

declare global {
  namespace Express {
    interface Request {
      user?: import('../auth/types').OidcUser
    }
  }

  var Source: string
  var isWin: boolean
  var ConfigPath: string
  var MetadataPath: string
  var RouterBasePath: string
  var XAccel: string | undefined
  var AllowCors: boolean
  var DisableSsrfRequestFilter: ((url: string) => boolean) | undefined
  var PodcastDownloadTimeout: number
  var MaxFailedEpisodeChecks: number

  var ServerSettings: {
    authOpenIDSubfolderForRedirectURLs: string
    authOpenIDIssuerURL: string
    authOpenIDAuthorizationURL: string
    authOpenIDTokenURL: string
    authOpenIDUserInfoURL: string
    authOpenIDJwksURL: string
    authOpenIDLogoutURL: string
    authOpenIDClientID: string
    authOpenIDClientSecret: string
    authOpenIDTokenSigningAlgorithm: string
    authOpenIDGroupClaim: string
    authOpenIDAdvancedPermsClaim: string
    authOpenIDAutoRegister: boolean
    authOpenIDMobileRedirectURIs: string[]
    authActiveAuthMethods: string[]
  }

  namespace NodeJS {
    interface ProcessEnv {
      NODE_ENV: 'development' | 'production' | 'test'
      PORT?: string
      CONFIG_PATH?: string
      METADATA_PATH?: string
      FFMPEG_PATH?: string
      FFPROBE_PATH?: string
      NUSQLITE3_PATH?: string
      SKIP_BINARIES_CHECK?: string
      ALLOW_IFRAME?: string
      BACKUP_PATH?: string
      REACT_CLIENT_PATH?: string
      SOURCE?: string
      ROUTER_BASE_PATH?: string
      USE_X_ACCEL?: string
      ALLOW_CORS?: string
      EXP_PROXY_SUPPORT?: string
      DISABLE_SSRF_REQUEST_FILTER?: string
      SSRF_REQUEST_FILTER_WHITELIST?: string
      PODCAST_DOWNLOAD_TIMEOUT?: string
      MAX_FAILED_EPISODE_CHECKS?: string
      JWT_SECRET_KEY?: string
      REFRESH_TOKEN_EXPIRY?: string
      ACCESS_TOKEN_EXPIRY?: string
    }
  }
}

declare module 'express-session' {
  interface SessionData {
    [key: string]: any
  }
}

export {}
