# TypeScript Integration

TypeScript PoC converting OIDC auth + demo examples.

## Quick Start

```bash
npm install
npm run build:ts
npm run dev:ts
```

Visit: `http://localhost:3333/audiobookshelf`

## What's Included

**TypeScript files:**

- `server/auth/OidcAuthStrategy.ts` - OIDC (562 lines)
- `server/auth/types.ts` + `server/types/global.d.ts`
- `server/utils/serverInfo.ts` - Simple demo
- `server/utils/libraryStats.ts` - Library statistics

**Build:** tsconfig files, npm scripts, Dockerfile + pkg updated

**Demos:**

- Simple demo page: http://localhost:3333/audiobookshelf/ts-demo (displays TypeScript server info)
- Simple API: http://localhost:3333/audiobookshelf/public/healthcheck (JSON response)
- Advanced: `/api/libraries/:id/stats-ts` → Stats page (yellow "TS" badge)

## Development

```bash
npm run dev:ts    # Watch + auto-restart
```

TypeScript auto-compiles (~200ms) → server restarts

**Client changes:** `cd client && npm run generate`

## Commands

```bash
npm run build:ts    # Compile
npm run dev:ts      # Dev mode
npm run prod        # Production
```

## Structure

```
server/auth/OidcAuthStrategy.ts  →  dist/server/auth/OidcAuthStrategy.js
```

Source (TypeScript) → Compiled (JavaScript, gitignored)

## ESM vs CommonJS

The new TypeScript files use **ESM syntax** (import/export) which provides better IDE support and type checking. TypeScript automatically compiles these to **CommonJS** (require/module.exports) for compatibility with the existing JavaScript codebase.

This approach gives us the benefits of modern ESM in development while maintaining full compatibility with:
- Existing JavaScript files using CommonJS
- The `pkg` build tool for creating binaries
- All current dependencies

Later, the entire codebase can be migrated to pure ESM when needed.

## Next: OpenAPI

Add tsoa decorators:

```typescript
@Route('auth/openid')
export class OidcAuthController {
  @Get('/')
  async getAuthorizationUrl(@Query() redirect_uri?: string) {
    // Auto-generates spec
  }
}
```

Results: OpenAPI spec, interactive docs at `/api-docs`, TypeScript clients.
