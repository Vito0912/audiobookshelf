const express = require('express')
const ShareController = require('../controllers/ShareController')
const SessionController = require('../controllers/SessionController')

// Load TypeScript-compiled server info utility
const { getServerInfo } = require('../../dist/server/utils/serverInfo')

class PublicRouter {
  constructor(playbackSessionManager) {
    /** @type {import('../managers/PlaybackSessionManager')} */
    this.playbackSessionManager = playbackSessionManager

    this.router = express()
    this.router.disable('x-powered-by')
    this.init()
  }

  init() {
    // TypeScript Demo: Simple health check endpoint (no auth required)
    this.router.get('/healthcheck', this.getHealthCheck.bind(this))

    this.router.get('/share/:slug', ShareController.getMediaItemShareBySlug.bind(this))
    this.router.get('/share/:slug/track/:index', ShareController.getMediaItemShareAudioTrack.bind(this))
    this.router.get('/share/:slug/cover', ShareController.getMediaItemShareCoverImage.bind(this))
    this.router.get('/share/:slug/download', ShareController.downloadMediaItemShare.bind(this))
    this.router.patch('/share/:slug/progress', ShareController.updateMediaItemShareProgress.bind(this))
    this.router.get('/session/:id/track/:index', SessionController.getTrack.bind(this))
  }

  /**
   * GET /api/healthcheck
   * Simple health check endpoint that demonstrates TypeScript integration
   * Returns server info using TypeScript-compiled utility
   *
   * @param {express.Request} req
   * @param {express.Response} res
   */
  getHealthCheck(req, res) {
    try {
      const serverInfo = getServerInfo()
      res.json({
        success: true,
        serverInfo,
        message: '✅ Server is healthy! TypeScript is working!'
      })
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      })
    }
  }
}
module.exports = PublicRouter
