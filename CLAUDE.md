# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Audiobookshelf is a self-hosted audiobook and podcast server with a client-server architecture. The backend is Node.js/Express with Sequelize ORM (SQLite), and the frontend is Nuxt.js 2 (Vue.js framework).

## Development Setup

### Prerequisites
- Node.js 20
- FFmpeg and FFprobe binaries

### Initial Setup

1. **Create development configuration file** (`dev.js` in project root):
   ```javascript
   const Path = require('path')
   module.exports.config = {
     Port: 3333,
     ConfigPath: Path.resolve('config'),
     MetadataPath: Path.resolve('metadata'),
     FFmpegPath: '/usr/bin/ffmpeg',
     FFProbePath: '/usr/bin/ffprobe',
     SkipBinariesCheck: false
   }
   ```
   See `.devcontainer/dev.js` for reference.

2. **Install dependencies and build client**:
   ```bash
   npm ci
   cd client
   npm ci
   npm run generate
   cd ..
   ```

### Development Commands

**Run server with static client** (requires client to be built first):
```bash
npm run dev
```
Server runs at `localhost:3333` (or port specified in `dev.js`). Requires manual restart on server changes.

**Run client with live reload** (run in separate terminal while server is running):
```bash
cd client
npm run dev
```
Client runs at `localhost:3000` with hot module replacement.

**Run both** (alternative client dev server on different port):
```bash
cd client
npm run dev2
```
Runs on `localhost:1337`.

### Testing

**Run all tests**:
```bash
npm test
```

**Run tests with coverage**:
```bash
npm run coverage
```

**Run client component tests**:
```bash
cd client
npm run test              # headless
npm run test-visually     # interactive
```

Tests are located in `test/server/` and use Mocha/Chai/Sinon. Client uses Cypress for component testing.

## Architecture

### Backend Structure (Node.js/Express)

**Entry point**: `index.js` → instantiates `Server` class from `server/Server.js`

**Core services** (`server/`):
- `Server.js` - Main Express application setup, initializes all managers and routers
- `Database.js` - Sequelize connection, model references, settings cache
- `Auth.js` - Passport-based authentication (JWT + local + OIDC strategies)
- `SocketAuthority.js` - Socket.io event handling and real-time updates
- `Watcher.js` - File system monitoring for library changes
- `Logger.js` - Application-wide logging

**Routers** (`server/routers/`):
- `ApiRouter.js` - Main REST API router, delegates to controllers
- `HlsRouter.js` - HLS streaming endpoints
- `PublicRouter.js` - Public/unauthenticated routes (RSS feeds, shares)

**Controllers** (`server/controllers/`) handle HTTP request logic:
- `LibraryController`, `LibraryItemController` - Library and item CRUD
- `AuthorController`, `SeriesController` - Metadata management
- `PodcastController` - Podcast-specific operations
- `SessionController` - Playback session tracking
- `UserController`, `MeController` - User management and profile
- `BackupController`, `ToolsController` - Admin utilities
- Controllers receive dependencies (managers, auth) via constructor injection

**Models** (`server/models/`) - Sequelize models:
- `LibraryItem.js` - Base model for books/podcasts
- `Book.js`, `Podcast.js` - Media type-specific models
- `Author.js`, `Series.js` - Metadata entities
- `User.js`, `Session.js` - User auth and playback tracking
- Many-to-many relationships: `BookAuthor`, `BookSeries`, `CollectionBook`

**Managers** (`server/managers/`) encapsulate business logic:
- `PodcastManager` - Podcast feed parsing, episode downloads
- `PlaybackSessionManager` - Playback state and progress tracking
- `BackupManager` - Database backup/restore
- `CacheManager`, `ApiCacheManager` - Response caching
- `AudioMetadataManager` - FFmpeg-based metadata extraction
- `AbMergeManager` - Audio file merging to m4b
- `NotificationManager`, `EmailManager` - Notifications
- `CronManager` - Scheduled tasks
- `BinaryManager` - FFmpeg/FFprobe binary management

**Finders** (`server/finders/`) - External metadata lookups:
- `BookFinder.js`, `AuthorFinder.js` - Search external sources for metadata
- `PodcastFinder.js` - Podcast feed discovery

**Providers** (`server/providers/`) - Individual metadata provider implementations

**Scanner** (`server/scanner/`) - Library scanning and auto-import logic

**Migrations** (`server/migrations/`) - Database migration files

### Frontend Structure (Nuxt.js 2)

**Location**: `client/`

**Key directories**:
- `pages/` - Nuxt.js file-based routing
- `components/` - Vue components
- `store/` - Vuex state management
- `middleware/` - Nuxt middleware (auth checks, etc.)
- `mixins/` - Reusable Vue mixins
- `strings/` - Localization files

**Build process**: `npm run generate` creates static site in `client/dist/` that the server serves

### Database Layer

- **ORM**: Sequelize 6
- **Database**: SQLite (`config/absdatabase.sqlite`)
- **Migrations**: Versioned in `server/migrations/`, managed by `MigrationManager`
- **Unicode search**: Supports unaccent and unicode folding extensions for better search

### Authentication

Multiple strategies via Passport.js:
- **Local**: Username/password with JWT tokens
- **JWT**: Token-based API authentication
- **OIDC**: OpenID Connect integration

Managed by `Auth.js`, tokens issued by `auth/TokenManager.js`

### Real-time Communication

Socket.io integration via `SocketAuthority.js`:
- Client updates (progress sync, library changes)
- Server-initiated notifications
- Playback coordination across devices

### Environment Variables

Key environment variables (set in `dev.js` for development):
- `PORT` - Server port (default: 3333)
- `CONFIG_PATH` - Config directory
- `METADATA_PATH` - Media metadata storage
- `FFMPEG_PATH`, `FFPROBE_PATH` - Binary paths
- `ROUTER_BASE_PATH` - Base path for reverse proxy (default: `/audiobookshelf`)
- `NODE_ENV` - `development` or `production`

## Build and Deployment

**Production build**:
```bash
npm run prod
```
Builds client and starts server in production mode.

**Binary builds**:
- Windows: `npm run build-win`
- Linux: `npm run build-linux`

Uses `pkg` to bundle Node.js + dependencies into executable.

**Docker**:
```bash
npm run docker              # multi-arch build and push
npm run docker-amd64-local  # local amd64 build
npm run docker-arm64-local  # local arm64 build
```

## Code Patterns

### Controller Pattern
Controllers receive all dependencies in constructor and define route handlers as methods. Example:
```javascript
class LibraryItemController {
  constructor() {}

  async middleware(req, res, next) {
    req.libraryItem = await Database.libraryItemModel.findByPk(req.params.id)
    next()
  }

  getLibraryItem(req, res) {
    res.json(req.libraryItem.toJSON())
  }
}
```

### Database Access Pattern
Access models via `Database` singleton's getter properties:
```javascript
const Database = require('./Database')
const users = await Database.userModel.findAll()
```

### Real-time Updates
Emit socket events to notify clients of changes:
```javascript
SocketAuthority.emitter('item_updated', libraryItem.toJSON())
```

## Important Notes

- **File paths**: Use `fileUtils.filePathToPOSIX()` for cross-platform path handling
- **Migrations**: Database changes must have corresponding migration files
- **API versioning**: Not currently versioned, maintain backward compatibility
- **SSRF protection**: Requests to external URLs go through `ssrf-req-filter` by default
- **Websocket requirement**: Reverse proxy configs must support websocket upgrade
- **Subfolder routing**: Fixed to `/audiobookshelf`, configured via `ROUTER_BASE_PATH`
