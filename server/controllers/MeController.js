const { Request, Response } = require('express')
const Logger = require('../Logger')
const SocketAuthority = require('../SocketAuthority')
const Database = require('../Database')
const { sort } = require('../libs/fastSort')
const { toNumber, isNullOrNaN } = require('../utils/index')
const userStats = require('../utils/queries/userStats')

/**
 * @typedef RequestUserObject
 * @property {import('../models/User')} user
 *
 * @typedef {Request & RequestUserObject} RequestWithUser
 */

class MeController {
  constructor() {}

  /**
   * GET: /api/me
   *
   * @param {RequestWithUser} req
   * @param {Response} res
   */
  getCurrentUser(req, res) {
    res.json(req.user.toOldJSONForBrowser())
  }

  /**
   * GET: /api/me/listening-sessions
   *
   * @this import('../routers/ApiRouter')
   *
   * @param {RequestWithUser} req
   * @param {Response} res
   */
  async getListeningSessions(req, res) {
    const listeningSessions = await this.getUserListeningSessionsHelper(req.user.id)

    const itemsPerPage = toNumber(req.query.itemsPerPage, 10) || 10
    const page = toNumber(req.query.page, 0)

    const start = page * itemsPerPage
    const sessions = listeningSessions.slice(start, start + itemsPerPage)

    const payload = {
      total: listeningSessions.length,
      numPages: Math.ceil(listeningSessions.length / itemsPerPage),
      page,
      itemsPerPage,
      sessions
    }

    res.json(payload)
  }

  /**
   * GET: /api/me/item/listening-sessions/:libraryItemId/:episodeId
   *
   * @this import('../routers/ApiRouter')
   *
   * @param {RequestWithUser} req
   * @param {Response} res
   */
  async getItemListeningSessions(req, res) {
    const libraryItem = await Database.libraryItemModel.findByPk(req.params.libraryItemId)
    const episode = await Database.podcastEpisodeModel.findByPk(req.params.episodeId)

    if (!libraryItem || (libraryItem.isPodcast && !episode)) {
      Logger.error(`[MeController] Media item not found for library item id "${req.params.libraryItemId}"`)
      return res.sendStatus(404)
    }

    const mediaItemId = episode?.id || libraryItem.mediaId
    let listeningSessions = await this.getUserItemListeningSessionsHelper(req.user.id, mediaItemId)

    const itemsPerPage = toNumber(req.query.itemsPerPage, 10) || 10
    const page = toNumber(req.query.page, 0)

    const start = page * itemsPerPage
    const sessions = listeningSessions.slice(start, start + itemsPerPage)

    const payload = {
      total: listeningSessions.length,
      numPages: Math.ceil(listeningSessions.length / itemsPerPage),
      page,
      itemsPerPage,
      sessions
    }

    res.json(payload)
  }

  /**
   * GET: /api/me/listening-stats
   *
   * @this import('../routers/ApiRouter')
   *
   * @param {RequestWithUser} req
   * @param {Response} res
   */
  async getListeningStats(req, res) {
    const listeningStats = await this.getUserListeningStatsHelpers(req.user.id)
    res.json(listeningStats)
  }

  /**
   * GET: /api/me/progress/:id/:episodeId?
   *
   * @param {RequestWithUser} req
   * @param {Response} res
   */
  async getMediaProgress(req, res) {
    const mediaProgress = req.user.getOldMediaProgress(req.params.id, req.params.episodeId || null)
    if (!mediaProgress) {
      return res.sendStatus(404)
    }
    res.json(mediaProgress)
  }

  /**
   * DELETE: /api/me/progress/:id
   *
   * @param {RequestWithUser} req
   * @param {Response} res
   */
  async removeMediaProgress(req, res) {
    await Database.mediaProgressModel.removeById(req.params.id)
    req.user.mediaProgresses = req.user.mediaProgresses.filter((mp) => mp.id !== req.params.id)

    SocketAuthority.clientEmitter(req.user.id, 'user_updated', req.user.toOldJSONForBrowser())
    res.sendStatus(200)
  }

  /**
   * PATCH: /api/me/progress/:libraryItemId/:episodeId?
   * TODO: Update to use mediaItemId and mediaItemType
   *
   * @param {RequestWithUser} req
   * @param {Response} res
   */
  async createUpdateMediaProgress(req, res) {
    const progressUpdatePayload = {
      ...req.body,
      libraryItemId: req.params.libraryItemId,
      episodeId: req.params.episodeId
    }
    const mediaProgressResponse = await req.user.createUpdateMediaProgressFromPayload(progressUpdatePayload)
    if (mediaProgressResponse.error) {
      return res.status(mediaProgressResponse.statusCode || 400).send(mediaProgressResponse.error)
    }

    SocketAuthority.clientEmitter(req.user.id, 'user_updated', req.user.toOldJSONForBrowser())
    res.sendStatus(200)
  }

  /**
   * PATCH: /api/me/progress/batch/update
   * TODO: Update to use mediaItemId and mediaItemType
   *
   * @param {RequestWithUser} req
   * @param {Response} res
   */
  async batchUpdateMediaProgress(req, res) {
    const itemProgressPayloads = req.body
    if (!itemProgressPayloads?.length) {
      return res.status(400).send('Missing request payload')
    }

    let hasUpdated = false
    for (const itemProgress of itemProgressPayloads) {
      const mediaProgressResponse = await req.user.createUpdateMediaProgressFromPayload(itemProgress)
      if (mediaProgressResponse.error) {
        Logger.error(`[MeController] batchUpdateMediaProgress: ${mediaProgressResponse.error}`)
        continue
      } else {
        hasUpdated = true
      }
    }

    if (hasUpdated) {
      SocketAuthority.clientEmitter(req.user.id, 'user_updated', req.user.toOldJSONForBrowser())
    }

    res.sendStatus(200)
  }

  /**
   * POST: /api/me/item/:id/bookmark
   *
   * @param {RequestWithUser} req
   * @param {Response} res
   */
  async createBookmark(req, res) {
    if (!(await Database.libraryItemModel.checkExistsById(req.params.id))) return res.sendStatus(404)

    const { time, title } = req.body
    if (isNullOrNaN(time)) {
      Logger.error(`[MeController] createBookmark invalid time`, time)
      return res.status(400).send('Invalid time')
    }
    if (!title || typeof title !== 'string') {
      Logger.error(`[MeController] createBookmark invalid title`, title)
      return res.status(400).send('Invalid title')
    }

    const bookmark = await req.user.createBookmark(req.params.id, time, title)
    SocketAuthority.clientEmitter(req.user.id, 'user_updated', req.user.toOldJSONForBrowser())
    res.json(bookmark)
  }

  /**
   * PATCH: /api/me/item/:id/bookmark
   *
   * @param {RequestWithUser} req
   * @param {Response} res
   */
  async updateBookmark(req, res) {
    if (!(await Database.libraryItemModel.checkExistsById(req.params.id))) return res.sendStatus(404)

    const { time, title } = req.body
    if (isNullOrNaN(time)) {
      Logger.error(`[MeController] updateBookmark invalid time`, time)
      return res.status(400).send('Invalid time')
    }
    if (!title || typeof title !== 'string') {
      Logger.error(`[MeController] updateBookmark invalid title`, title)
      return res.status(400).send('Invalid title')
    }

    const bookmark = await req.user.updateBookmark(req.params.id, time, title)
    if (!bookmark) {
      Logger.error(`[MeController] updateBookmark not found for library item id "${req.params.id}" and time "${time}"`)
      return res.sendStatus(404)
    }

    SocketAuthority.clientEmitter(req.user.id, 'user_updated', req.user.toOldJSONForBrowser())
    res.json(bookmark)
  }

  /**
   * DELETE: /api/me/item/:id/bookmark/:time
   *
   * @param {RequestWithUser} req
   * @param {Response} res
   */
  async removeBookmark(req, res) {
    if (!(await Database.libraryItemModel.checkExistsById(req.params.id))) return res.sendStatus(404)

    const time = Number(req.params.time)
    if (isNaN(time)) {
      return res.status(400).send('Invalid time')
    }

    if (!req.user.findBookmark(req.params.id, time)) {
      Logger.error(`[MeController] removeBookmark not found`)
      return res.sendStatus(404)
    }

    await req.user.removeBookmark(req.params.id, time)

    SocketAuthority.clientEmitter(req.user.id, 'user_updated', req.user.toOldJSONForBrowser())
    res.sendStatus(200)
  }

  /**
   * PATCH: /api/me/password
   * User change password. Requires current password.
   * Guest users cannot change password.
   *
   * @this import('../routers/ApiRouter')
   *
   * @param {RequestWithUser} req
   * @param {Response} res
   */
  async updatePassword(req, res) {
    if (req.user.isGuest) {
      Logger.error(`[MeController] Guest user "${req.user.username}" attempted to change password`)
      return res.sendStatus(403)
    }

    const { password, newPassword } = req.body
    if ((typeof password !== 'string' && password !== null) || (typeof newPassword !== 'string' && newPassword !== null)) {
      return res.status(400).send('Missing or invalid password or new password')
    }

    const result = await this.auth.localAuthStrategy.changePassword(req.user, password, newPassword)

    if (result.error) {
      return res.status(400).send(result.error)
    }

    res.sendStatus(200)
  }

  /**
   * GET: /api/me/items-in-progress
   * Pull items in progress for all libraries
   * Used in Android Auto in progress list since there is no easy library selection
   * TODO: Update to use mediaItemId and mediaItemType. Use sort & limit in query
   *
   * @param {RequestWithUser} req
   * @param {Response} res
   */
  async getAllLibraryItemsInProgress(req, res) {
    const limit = !isNaN(req.query.limit) ? Number(req.query.limit) || 25 : 25

    const mediaProgressesInProgress = req.user.mediaProgresses.filter((mp) => !mp.isFinished && (mp.currentTime > 0 || mp.ebookProgress > 0))

    const libraryItemsIds = [...new Set(mediaProgressesInProgress.map((mp) => mp.extraData?.libraryItemId).filter((id) => id))]
    const libraryItems = await Database.libraryItemModel.findAllExpandedWhere({ id: libraryItemsIds })

    let itemsInProgress = []

    for (const mediaProgress of mediaProgressesInProgress) {
      const oldMediaProgress = mediaProgress.getOldMediaProgress()
      const libraryItem = libraryItems.find((li) => li.id === oldMediaProgress.libraryItemId)
      if (libraryItem) {
        if (oldMediaProgress.episodeId && libraryItem.isPodcast) {
          const episode = libraryItem.media.podcastEpisodes.find((ep) => ep.id === oldMediaProgress.episodeId)
          if (episode) {
            const libraryItemWithEpisode = {
              ...libraryItem.toOldJSONMinified(),
              recentEpisode: episode.toOldJSON(libraryItem.id),
              progressLastUpdate: oldMediaProgress.lastUpdate
            }
            itemsInProgress.push(libraryItemWithEpisode)
          }
        } else if (!oldMediaProgress.episodeId) {
          itemsInProgress.push({
            ...libraryItem.toOldJSONMinified(),
            progressLastUpdate: oldMediaProgress.lastUpdate
          })
        }
      }
    }

    itemsInProgress = sort(itemsInProgress)
      .desc((li) => li.progressLastUpdate)
      .slice(0, limit)
    res.json({
      libraryItems: itemsInProgress
    })
  }

  /**
   * GET: /api/me/series/:id/remove-from-continue-listening
   *
   * @param {RequestWithUser} req
   * @param {Response} res
   */
  async removeSeriesFromContinueListening(req, res) {
    if (!(await Database.seriesModel.checkExistsById(req.params.id))) {
      Logger.error(`[MeController] removeSeriesFromContinueListening: Series ${req.params.id} not found`)
      return res.sendStatus(404)
    }

    const hasUpdated = await req.user.addSeriesToHideFromContinueListening(req.params.id)
    if (hasUpdated) {
      SocketAuthority.clientEmitter(req.user.id, 'user_updated', req.user.toOldJSONForBrowser())
    }
    res.json(req.user.toOldJSONForBrowser())
  }

  /**
   * GET: api/me/series/:id/readd-to-continue-listening
   *
   * @param {RequestWithUser} req
   * @param {Response} res
   */
  async readdSeriesFromContinueListening(req, res) {
    if (!(await Database.seriesModel.checkExistsById(req.params.id))) {
      Logger.error(`[MeController] readdSeriesFromContinueListening: Series ${req.params.id} not found`)
      return res.sendStatus(404)
    }

    const hasUpdated = await req.user.removeSeriesFromHideFromContinueListening(req.params.id)
    if (hasUpdated) {
      SocketAuthority.clientEmitter(req.user.id, 'user_updated', req.user.toOldJSONForBrowser())
    }
    res.json(req.user.toOldJSONForBrowser())
  }

  /**
   * GET: api/me/progress/:id/remove-from-continue-listening
   *
   * @param {RequestWithUser} req
   * @param {Response} res
   */
  async removeItemFromContinueListening(req, res) {
    const mediaProgress = req.user.mediaProgresses.find((mp) => mp.id === req.params.id)
    if (!mediaProgress) {
      return res.sendStatus(404)
    }

    // Already hidden
    if (mediaProgress.hideFromContinueListening) {
      return res.json(req.user.toOldJSONForBrowser())
    }

    mediaProgress.hideFromContinueListening = true
    await mediaProgress.save()

    SocketAuthority.clientEmitter(req.user.id, 'user_updated', req.user.toOldJSONForBrowser())

    res.json(req.user.toOldJSONForBrowser())
  }

  /**
   * POST: /api/me/ereader-devices
   *
   * @param {RequestWithUser} req
   * @param {Response} res
   */
  async updateUserEReaderDevices(req, res) {
    if (!req.body.ereaderDevices || !Array.isArray(req.body.ereaderDevices)) {
      return res.status(400).send('Invalid payload. ereaderDevices array required')
    }

    const userEReaderDevices = req.body.ereaderDevices
    for (const device of userEReaderDevices) {
      if (!device.name || !device.email) {
        return res.status(400).send('Invalid payload. ereaderDevices array items must have name and email')
      } else if (device.availabilityOption !== 'specificUsers' || device.users?.length !== 1 || device.users[0] !== req.user.id) {
        return res.status(400).send('Invalid payload. ereaderDevices array items must have availabilityOption "specificUsers" and only the current user')
      }
    }

    const otherDevices = Database.emailSettings.ereaderDevices.filter((device) => {
      return !Database.emailSettings.checkUserCanAccessDevice(device, req.user) || device.users?.length !== 1
    })

    const ereaderDevices = otherDevices.concat(userEReaderDevices)

    // Check for duplicate names
    const nameSet = new Set()
    const hasDupes = ereaderDevices.some((device) => {
      if (nameSet.has(device.name)) {
        return true // Duplicate found
      }
      nameSet.add(device.name)
      return false
    })

    if (hasDupes) {
      return res.status(400).send('Invalid payload. Duplicate "name" field found.')
    }

    const updated = Database.emailSettings.update({ ereaderDevices })
    if (updated) {
      await Database.updateSetting(Database.emailSettings)
      SocketAuthority.clientEmitter(req.user.id, 'ereader-devices-updated', {
        ereaderDevices: Database.emailSettings.getEReaderDevices(req.user)
      })
    }
    res.json({
      ereaderDevices: Database.emailSettings.getEReaderDevices(req.user)
    })
  }

  /**
   * GET: /api/me/stats/year/:year
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async getStatsForYear(req, res) {
    const year = Number(req.params.year)
    if (isNaN(year) || year < 2000 || year > 9999) {
      Logger.error(`[MeController] Invalid year "${year}"`)
      return res.status(400).send('Invalid year')
    }
    const data = await userStats.getStatsForYear(req.user.id, year)
    res.json(data)
  }

  /**
   * GET: /api/me/badges
   * Returns badge style aggregate stats for current user only
   *
   * @this import('../routers/ApiRouter')
   * @param {RequestWithUser} req
   * @param {Response} res
   */
  async getBadges(req, res) {
    try {
      const bookmarksCount = Array.isArray(req.user.bookmarks) ? req.user.bookmarks.length : 0

      const finishedProgresses = (req.user.mediaProgresses || []).filter((mp) => mp.isFinished)
      const numItemsFinished = finishedProgresses.length
      let longestItemFinished = null
      for (const mp of finishedProgresses) {
        if (!mp.duration) continue
        if (!longestItemFinished || mp.duration > longestItemFinished.duration) {
          longestItemFinished = {
            mediaProgressId: mp.id,
            mediaItemId: mp.mediaItemId,
            mediaItemType: mp.mediaItemType,
            libraryItemId: mp.extraData?.libraryItemId || null,
            duration: Math.round(mp.duration),
            finishedAt: mp.finishedAt ? mp.finishedAt.valueOf() : null
          }
        }
      }

      const sessions = await this.getUserListeningSessionsHelper(req.user.id)

      let longestSession = null
      for (const s of sessions) {
        const tl = s.timeListening || 0
        if (!longestSession || tl > longestSession.timeListening) {
          longestSession = {
            id: s.id,
            libraryItemId: s.libraryItemId,
            mediaItemId: s.bookId || s.episodeId || null,
            mediaType: s.mediaType,
            timeListening: tl,
            date: s.date,
            updatedAt: s.updatedAt
          }
        }
      }

      const bookStartCounts = {}
      sessions.forEach((s) => {
        if (s.mediaType === 'book' && (s.startTime === 0 || s.startTime === null || s.startTime === undefined)) {
          const lid = s.libraryItemId
          if (!lid) return
          bookStartCounts[lid] = (bookStartCounts[lid] || 0) + 1
        }
      })
      let maxStartsSameBook = null
      Object.keys(bookStartCounts).forEach((lid) => {
        const count = bookStartCounts[lid]
        if (!maxStartsSameBook || count > maxStartsSameBook.count) {
          maxStartsSameBook = { libraryItemId: lid, count }
        }
      })

      const uniqueDates = [...new Set(sessions.map((s) => s.date).filter(Boolean))].sort()
      let maxConsecutiveDays = { days: 0, startDate: null, endDate: null }
      let streakStart = null
      let prevDateVal = null
      const oneDayMs = 24 * 60 * 60 * 1000
      for (const d of uniqueDates) {
        const dateVal = new Date(d + 'T00:00:00Z').valueOf()
        if (streakStart === null) {
          streakStart = dateVal
          prevDateVal = dateVal
        } else if (dateVal - prevDateVal === oneDayMs) {
          prevDateVal = dateVal
        } else if (dateVal === prevDateVal) {
        } else {
          const days = Math.round((prevDateVal - streakStart) / oneDayMs) + 1
          days > maxConsecutiveDays.days && (maxConsecutiveDays = { days, startDate: new Date(streakStart).toISOString().slice(0, 10), endDate: new Date(prevDateVal).toISOString().slice(0, 10) })
          streakStart = dateVal
          prevDateVal = dateVal
        }
      }
      if (streakStart !== null) {
        const days = Math.round((prevDateVal - streakStart) / oneDayMs) + 1
        if (days > maxConsecutiveDays.days) {
          maxConsecutiveDays = { days, startDate: new Date(streakStart).toISOString().slice(0, 10), endDate: new Date(prevDateVal).toISOString().slice(0, 10) }
        }
      }
      if (maxConsecutiveDays.days === 0) maxConsecutiveDays = null

      const sessionsWithDate = sessions.filter((s) => s.date).map((s) => ({ ...s, _dateVal: new Date(s.date + 'T00:00:00Z').valueOf() }))
      sessionsWithDate.sort((a, b) => a._dateVal - b._dateVal)

      let windowBookBest = null
      let windowListeningBest = null
      let left = 0
      const bookCountsInWindow = {}
      let totalListeningInWindow = 0
      for (let right = 0; right < sessionsWithDate.length; right++) {
        const rs = sessionsWithDate[right]
        if (rs.mediaType === 'book' && rs.libraryItemId) {
          bookCountsInWindow[rs.libraryItemId] = (bookCountsInWindow[rs.libraryItemId] || 0) + 1
        }
        totalListeningInWindow += rs.timeListening || 0
        while (sessionsWithDate[right]._dateVal - sessionsWithDate[left]._dateVal > 6 * oneDayMs) {
          const ls = sessionsWithDate[left]
          if (ls.mediaType === 'book' && ls.libraryItemId) {
            bookCountsInWindow[ls.libraryItemId] -= 1
            if (bookCountsInWindow[ls.libraryItemId] <= 0) delete bookCountsInWindow[ls.libraryItemId]
          }
          totalListeningInWindow -= ls.timeListening || 0
          left++
        }

        const uniqueBooks = Object.keys(bookCountsInWindow).length
        const startDate = new Date(sessionsWithDate[left]._dateVal).toISOString().slice(0, 10)
        const endDate = new Date(rs._dateVal).toISOString().slice(0, 10)
        if (!windowBookBest || uniqueBooks > windowBookBest.uniqueBooks) {
          windowBookBest = { uniqueBooks, startDate, endDate }
        }
        if (!windowListeningBest || totalListeningInWindow > windowListeningBest.totalListeningTime) {
          windowListeningBest = { totalListeningTime: Math.round(totalListeningInWindow), startDate, endDate }
        }
      }

      let totalAccessibleLibraryItems = 0
      try {
        if (req.user.permissions?.accessAllLibraries) {
          totalAccessibleLibraryItems = await Database.libraryItemModel.count()
        } else {
          const librariesAccessible = req.user.permissions?.librariesAccessible || []
          if (librariesAccessible.length) {
            totalAccessibleLibraryItems = await Database.libraryItemModel.count({ where: { libraryId: librariesAccessible } })
          } else {
            totalAccessibleLibraryItems = 0
          }
        }
      } catch (err) {}

      res.json({
        bookmarks: bookmarksCount,
        numItemsFinished,
        longestItemFinished,
        longestSession,
        maxStartsSameBook,
        maxConsecutiveDays,
        longestSevenDayWindowBooks: windowBookBest,
        longestSevenDayWindowListening: windowListeningBest,
        totalAccessibleLibraryItems
      })
    } catch (error) {
      Logger.error(`[MeController] getBadges error: ${error.message}`)
      res.status(500).send('Failed to compute badges')
    }
  }
}
module.exports = new MeController()
