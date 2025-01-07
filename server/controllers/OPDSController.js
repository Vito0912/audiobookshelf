const { Request, Response, NextFunction } = require('express')
const Database = require('../Database')
const Logger = require('../Logger')
const { buildOPDSXMLSkeleton, buildLibraryEntries, buildItemEntries, buildSearchDefinition } = require('../utils/opdsHelpers')
const libraryItemFilters = require('../utils/queries/libraryItemFilters')

/**
 * @typedef RequestUserObject
 * @property {import('../models/User')} user
 *
 * @typedef {Request & RequestUserObject} RequestWithUser
 */

class OPDSController {
  constructor() {}


  /**
   * GET: /api/opds
   *
   *
   * @this {import('../routers/ApiRouter')}
   *
   * @param {RequestWithUser} req
   * @param {Response} res
   */
  async get(req, res) {

    let libraries = await Database.libraryModel.getAllWithFolders()

    const librariesAccessible = req.user.permissions?.librariesAccessible || []
    if (librariesAccessible.length) {
      libraries = libraries.filter((lib) => librariesAccessible.includes(lib.id))
    }
    libraries = libraries.filter((lib) => lib.isBook)

    let entriesXML = buildLibraryEntries(libraries, req.user)

    // Use the first library or some default values if no libraries exist
    const xml = buildOPDSXMLSkeleton('abs', 'Audiobookshelf', entriesXML, req)
    return res.type('application/xml').send(xml)
  }

  /**
   * GET: /api/opds/libraries/:id
   *
   *
   * @this {import('../routers/ApiRouter')}
   *
   * @param {RequestWithUser} req
   * @param {Response} res
   */
  async getLibrary(req, res) {

    const limit = 20
    const page = parseInt(req.query.page) || 0

    const payload = {
      results: [],
      total: undefined,
      limit: limit,
      offset: page,
      sortBy: req.query.sort,
      sortDesc: false,
      filterBy: 'ebooks.ZWJvb2s%3D',
      mediaType: 'book',
      minified: false,
      collapseseries: false,
      include: []
    }

    const { libraryItems, count } = await Database.libraryItemModel.getByFilterAndSort(req.library, req.user, payload)

    if ((limit * (page + 1)) < count) req.enableNext = true

    let entriesXML = buildItemEntries(libraryItems, req.user)

    // Use the first library or some default values if no libraries exist
    const xml = buildOPDSXMLSkeleton(`urn:uuid:${req.library.id}`, req.library.name, entriesXML, req)
    return res.type('application/xml').send(xml)
  }

  /**
   * GET: /api/opds/libraries/:id/search
   *
   *
   * @this {import('../routers/ApiRouter')}
   *
   * @param {RequestWithUser} req
   * @param {Response} res
   */
  async search(req, res) {
    if (!req.query.q || typeof req.query.q !== 'string') {
      return res.status(400).send('Invalid request. Query param "q" must be a string')
    }

    const limit = req.query.limit || 20 //
    const query = req.query.q.trim()

    const matches = await libraryItemFilters.search(req.user, req.library, query, limit)

    // Map a list of [{'libraryItem':...},{'libraryItem':...}] to [..., ...]
    const bookMatches = matches['book'].map((el) => el.libraryItem)

    const entriesXML = buildItemEntries(bookMatches, req.user)

    // Use the first library or some default values if no libraries exist
    const xml = buildOPDSXMLSkeleton(`urn:uuid:${req.library.id}`, `${req.library.name} - ${query}`, entriesXML, req)
    return res.type('application/xml').send(xml)
  }

  /**
   * GET: /api/opds/libraries/:id/search-definition
   *
   * @param {RequestWithUser} req
   * @param {Response} res
   *
   * @returns {Response}
   */
  searchDefinition(req, res) {
    return res.type('application/xml').send(buildSearchDefinition(req))
  }

  /**
   *
   * @param {RequestWithUser} req
   * @param {Response} res
   * @param {NextFunction} next
   */
  async middleware(req, res, next) {
    if(req.params.id) {
      if (!req.user.checkCanAccessLibrary(req.params.id)) {
        Logger.warn(`[OPDSController] Library ${req.params.id} not accessible to user ${req.user.username}`)
        return res.sendStatus(403)
      }

      const library = await Database.libraryModel.findByIdWithFolders(req.params.id)
      if (!library) {
        return res.status(404).send('Library not found')
      }
      req.library = library
    }

    next()
  }
}
module.exports = new OPDSController()
