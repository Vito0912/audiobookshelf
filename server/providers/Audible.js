const axios = require('axios').default
const Logger = require('../Logger')
const { isValidASIN, levenshteinDistance } = require('../utils/index')

const PRODUCT_RESPONSE_GROUPS = ['contributors', 'media', 'product_attrs', 'product_desc', 'product_details', 'product_extended_attrs', 'series', 'relationships', 'category_ladders'].join(',')
const PRODUCT_IMAGE_SIZES = '500,3200'
const CHAPTER_RESPONSE_GROUPS = 'chapter_info'
const AUTHOR_LOCALE_MAP = {
  us: 'en-US',
  ca: 'en-CA',
  uk: 'en-GB',
  au: 'en-AU',
  fr: 'fr-FR',
  de: 'de-DE',
  jp: 'ja-JP',
  it: 'it-IT',
  in: 'en-IN',
  es: 'es-ES',
  br: 'pt-BR'
}
const REQUEST_HEADERS = {
  'User-Agent': 'audiobookshelf (+https://audiobookshelf.org)',
  'Content-Type': 'application/json',
  'Accept-Encoding': 'gzip',
  'Accept-Charset': 'utf-8',
  Accept: 'application/json'
}

class Audible {
  #responseTimeout = 10000

  constructor() {
    this.regionMap = {
      us: '.com',
      ca: '.ca',
      uk: '.co.uk',
      au: '.com.au',
      fr: '.fr',
      de: '.de',
      jp: '.co.jp',
      it: '.it',
      in: '.in',
      es: '.es',
      br: '.com.br'
    }
  }

  normalizeRegion(region, context = 'request') {
    const cleanRegion = region ? String(region).toLowerCase() : ''
    if (cleanRegion && !this.regionMap[cleanRegion]) {
      Logger.error(`[Audible] ${context}: Invalid region ${region}`)
      return ''
    }
    return cleanRegion
  }

  getBaseUrl(region) {
    const tld = region ? this.regionMap[region] : '.com'
    return `https://api.audible${tld}`
  }

  getProductQueryParams(asins = null) {
    const params = {
      response_groups: PRODUCT_RESPONSE_GROUPS,
      image_sizes: PRODUCT_IMAGE_SIZES
    }
    if (asins) params.asins = asins
    return params
  }

  getAudibleExtraHeaders(region) {
    const locale = AUTHOR_LOCALE_MAP[region || 'us']
    return {
      'ACCEPTED-LANGUAGE': locale,
      'accept-language': locale
    }
  }

  getRequestConfig(timeout, params = {}, extraHeaders = {}) {
    return {
      timeout,
      headers: {
        ...REQUEST_HEADERS,
        ...extraHeaders
      },
      params
    }
  }

  normalizeAuthorName(name) {
    return String(name || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  hasSharedAuthorToken(authorA, authorB) {
    const tokensA = new Set(authorA.split(' ').filter((token) => token.length > 2))
    const tokensB = authorB.split(' ').filter((token) => token.length > 2)
    return tokensB.some((token) => tokensA.has(token))
  }

  isReasonableAuthorMatch(candidateName, searchName, distance, maxLevenshtein) {
    const normalizedCandidate = this.normalizeAuthorName(candidateName)
    const normalizedSearch = this.normalizeAuthorName(searchName)
    if (!normalizedCandidate || !normalizedSearch) return false

    if (normalizedCandidate === normalizedSearch) return true
    if (normalizedCandidate.includes(normalizedSearch) || normalizedSearch.includes(normalizedCandidate)) return true

    if (!this.hasSharedAuthorToken(normalizedCandidate, normalizedSearch)) return false

    const maxLen = Math.max(normalizedCandidate.length, normalizedSearch.length)
    const similarity = maxLen ? 1 - distance / maxLen : 0
    return distance <= maxLevenshtein && similarity >= 0.55
  }

  /**
   *
   * @param {string} name
   * @param {string} region
   * @param {number} [timeout] response timeout in ms
   * @returns {Promise<{asin:string,name:string}[]>}
   */
  authorASINsRequest(name, region, timeout = this.#responseTimeout) {
    if (!name) return []

    region = this.normalizeRegion(region, 'authorASINsRequest')
    if (!timeout || isNaN(timeout)) timeout = this.#responseTimeout

    const url = `${this.getBaseUrl(region)}/1.0/catalog/products`
    const queryParams = {
      author: name,
      num_results: '10',
      response_groups: 'contributors'
    }

    Logger.info(`[Audible] Searching for author "${url}"`)
    return axios
      .get(url, this.getRequestConfig(timeout, queryParams, this.getAudibleExtraHeaders(region)))
      .then((res) => {
        const products = Array.isArray(res?.data?.products) ? res.data.products : []
        const authorMap = new Map()

        Logger.debug(`[Audible] Author ASIN search returned ${products.length} products for "${name}"`)

        products.forEach((product) => {
          const authors = Array.isArray(product?.authors) ? product.authors : []
          authors.forEach((authorObj) => {
            const asin = authorObj?.asin ? String(authorObj.asin).trim().toUpperCase() : ''
            if (!isValidASIN(asin)) return

            const authorName = authorObj?.name ? String(authorObj.name).trim() : ''
            if (!authorName) return

            if (!authorMap.has(asin)) {
              authorMap.set(asin, {
                asin,
                name: authorName
              })
            }
          })
        })

        return [...authorMap.values()]
      })
      .catch((error) => {
        Logger.error(`[Audible] Author ASIN request failed for ${name}`, error.message)
        return []
      })
  }

  /**
   *
   * @param {string} asin
   * @param {string} region
   * @param {number} [timeout] response timeout in ms
   * @returns {Promise<Object>}
   */
  authorRequest(asin, region, timeout = this.#responseTimeout) {
    if (!isValidASIN(String(asin || '').toUpperCase())) {
      Logger.error(`[Audible] Invalid ASIN ${asin}`)
      return null
    }

    region = this.normalizeRegion(region, 'authorRequest')
    if (!timeout || isNaN(timeout)) timeout = this.#responseTimeout

    const encodedAsin = encodeURIComponent(String(asin).toUpperCase())
    const url = `${this.getBaseUrl(region)}/1.0/catalog/contributors/${encodedAsin}`
    const queryParams = {
      locale: AUTHOR_LOCALE_MAP[region || 'us']
    }

    Logger.info(`[Audible] Searching for author "${url}"`)
    return axios
      .get(url, this.getRequestConfig(timeout, queryParams, this.getAudibleExtraHeaders(region)))
      .then((res) => res?.data?.contributor || null)
      .catch((error) => {
        Logger.error(`[Audible] Author request failed for ${asin}`, error.message)
        return null
      })
  }

  /**
   *
   * @param {string} asin
   * @param {string} region
   * @param {number} [timeout] response timeout in ms
   * @returns {Promise<{asin:string,description:string,image:string,name:string}>}
   */
  async findAuthorByASIN(asin, region, timeout = this.#responseTimeout) {
    const author = await this.authorRequest(asin, region, timeout)
    if (!author?.name) return null

    return {
      asin: author.contributor_id || String(asin).toUpperCase(),
      description: author.bio || null,
      image: author.profile_image_url || null,
      name: author.name
    }
  }

  /**
   *
   * @param {string} name
   * @param {string} region
   * @param {number} maxLevenshtein
   * @param {number} [timeout] response timeout in ms
   * @returns {Promise<{asin:string,description:string,image:string,name:string}>}
   */
  async findAuthorByName(name, region, maxLevenshtein = 3, timeout = this.#responseTimeout) {
    const authorAsinObjs = await this.authorASINsRequest(name, region, timeout)
    const normalizedSearchName = this.normalizeAuthorName(name)

    let closestMatch = null
    authorAsinObjs.forEach((authorAsinObj) => {
      const normalizedCandidateName = this.normalizeAuthorName(authorAsinObj.name)
      if (!normalizedCandidateName) return

      authorAsinObj.levenshteinDistance = levenshteinDistance(normalizedCandidateName, normalizedSearchName)
      if (!this.isReasonableAuthorMatch(normalizedCandidateName, normalizedSearchName, authorAsinObj.levenshteinDistance, maxLevenshtein)) return

      if (!closestMatch || closestMatch.levenshteinDistance > authorAsinObj.levenshteinDistance) {
        closestMatch = authorAsinObj
      }
    })

    if (!closestMatch || closestMatch.levenshteinDistance > maxLevenshtein) {
      return null
    }

    return this.findAuthorByASIN(closestMatch.asin, region, timeout)
  }

  extractProducts(data) {
    if (!data) return []
    if (Array.isArray(data.products)) return data.products.filter(Boolean)
    if (data.product) return [data.product]
    return []
  }

  getHighestResolutionImage(product) {
    if (product?.image) return product.image

    const imageMap = product?.product_images
    if (!imageMap || typeof imageMap !== 'object') return null

    const numericSizes = Object.keys(imageMap)
      .map((key) => Number(key))
      .filter((size) => !isNaN(size))
      .sort((a, b) => b - a)

    if (numericSizes.length) {
      const image = imageMap[String(numericSizes[0])]
      return image ? String(image).replace(/\._\w+_/g, '') : null
    }

    const firstImage = Object.values(imageMap).find(Boolean)
    return firstImage ? String(firstImage).replace(/\._\w+_/g, '') : null
  }

  extractGenresAndTags(item) {
    if (Array.isArray(item?.genres)) {
      const genres = [
        ...new Set(
          item.genres
            .filter((g) => g?.type === 'genre')
            .map((g) => g.name)
            .filter(Boolean)
        )
      ]
      const tags = [
        ...new Set(
          item.genres
            .filter((g) => g?.type === 'tag')
            .map((g) => g.name)
            .filter(Boolean)
        )
      ]
      return { genres, tags }
    }

    const genres = new Set()
    const tags = new Set()
    if (Array.isArray(item?.category_ladders)) {
      item.category_ladders.forEach((ladderObj) => {
        const ladder = Array.isArray(ladderObj?.ladder) ? ladderObj.ladder : []
        ladder.forEach((node, index) => {
          const name = node?.name?.trim?.()
          if (!name) return
          if (index === 0) genres.add(name)
          else tags.add(name)
        })
      })
    }

    return {
      genres: [...genres],
      tags: [...tags]
    }
  }

  extractSeries(item) {
    const series = []

    if (item?.seriesPrimary) {
      series.push({
        series: item.seriesPrimary.name,
        sequence: this.cleanSeriesSequence(item.seriesPrimary.name, item.seriesPrimary.position || '')
      })
    }
    if (item?.seriesSecondary) {
      series.push({
        series: item.seriesSecondary.name,
        sequence: this.cleanSeriesSequence(item.seriesSecondary.name, item.seriesSecondary.position || '')
      })
    }

    if (Array.isArray(item?.series)) {
      item.series.forEach((seriesItem) => {
        const seriesName = seriesItem?.title || seriesItem?.name
        if (!seriesName) return
        series.push({
          series: seriesName,
          sequence: this.cleanSeriesSequence(seriesName, seriesItem?.sequence || seriesItem?.position || '')
        })
      })
    }

    if (!series.length && String(item?.content_type || '').toLowerCase() === 'podcast' && Array.isArray(item?.relationships)) {
      item.relationships.forEach((relation) => {
        if (!relation?.title) return
        series.push({
          series: relation.title,
          sequence: this.cleanSeriesSequence(relation.title, relation.sort || '')
        })
      })
    }

    return series.filter((seriesItem) => seriesItem.series)
  }

  hasFullProductDetails(product) {
    return Boolean(product?.runtime_length_min || product?.publisher_name || product?.product_images || product?.series || product?.category_ladders)
  }

  async fetchProductsByASINs(asins, region, timeout = this.#responseTimeout) {
    const normalizedAsins = [...new Set((Array.isArray(asins) ? asins : [asins]).filter(Boolean).map((asin) => String(asin).toUpperCase()))].filter((asin) => isValidASIN(asin))

    if (!normalizedAsins.length) return []

    if (normalizedAsins.length === 1) {
      const asin = encodeURIComponent(normalizedAsins[0])
      const url = `${this.getBaseUrl(region)}/1.0/catalog/products/${asin}`

      return axios
        .get(url, this.getRequestConfig(timeout, this.getProductQueryParams()))
        .then((res) => this.extractProducts(res?.data))
        .catch((error) => {
          Logger.error('[Audible] ASIN search error', error.message)
          return []
        })
    }

    const url = `${this.getBaseUrl(region)}/1.0/catalog/products`
    const asinsQuery = normalizedAsins.join(',')
    Logger.debug(`[Audible] ASIN batch url: ${url} (${normalizedAsins.length} ASINs)`)

    return axios
      .get(url, this.getRequestConfig(timeout, this.getProductQueryParams(asinsQuery)))
      .then((res) => this.extractProducts(res?.data))
      .catch((error) => {
        Logger.error('[Audible] ASIN batch search error', error.message)
        return []
      })
  }

  searchProducts(title, author, region, timeout = this.#responseTimeout) {
    const url = `${this.getBaseUrl(region)}/1.0/catalog/products`
    const queryParams = {
      num_results: '10',
      products_sort_by: 'Relevance',
      title,
      ...this.getProductQueryParams()
    }
    if (author) queryParams.author = author

    Logger.debug(`[Audible] Search url: ${url}`)
    return axios
      .get(url, this.getRequestConfig(timeout, queryParams))
      .then((res) => this.extractProducts(res?.data))
      .catch((error) => {
        Logger.error('[Audible] query search error', error.message)
        return []
      })
  }

  /**
   * Audible will sometimes send sequences with "Book 1" or "2, Dramatized Adaptation"
   * @see https://github.com/advplyr/audiobookshelf/issues/2380
   * @see https://github.com/advplyr/audiobookshelf/issues/1339
   *
   * @param {string} seriesName
   * @param {string} sequence
   * @returns {string}
   */
  cleanSeriesSequence(seriesName, sequence) {
    if (!sequence) return ''
    // match any number with optional decimal (e.g, 1 or 1.5 or .5)
    let numberFound = sequence.match(/\.\d+|\d+(?:\.\d+)?/)
    let updatedSequence = numberFound ? numberFound[0] : sequence
    if (sequence !== updatedSequence) {
      Logger.debug(`[Audible] Series "${seriesName}" sequence was cleaned from "${sequence}" to "${updatedSequence}"`)
    }
    return updatedSequence
  }

  cleanResult(item, region = null) {
    const title = item?.title
    if (!title) return null

    const authors = Array.isArray(item?.authors) ? item.authors : []
    const narrators = Array.isArray(item?.narrators) ? item.narrators : []
    const authorNames = authors.map(({ name }) => name).filter(Boolean)
    const narratorNames = narrators.map(({ name }) => name).filter(Boolean)

    const releaseDate = item?.releaseDate || item?.release_date
    const formatType = item?.formatType || item?.format_type
    const runtimeLengthMin = item?.runtimeLengthMin || item?.runtime_length_min
    const publisher = item?.publisherName || item?.publisher_name || null
    const description = item?.summary || item?.merchandising_summary || item?.publisher_summary || null
    const rating = typeof item?.rating === 'number' ? item.rating : item?.rating?.overall_distribution?.average_rating || null
    const series = this.extractSeries(item)
    const { genres, tags } = this.extractGenresAndTags(item)
    const cover = this.getHighestResolutionImage(item)
    const normalizedDuration = Number(runtimeLengthMin)

    return {
      title,
      subtitle: item?.subtitle || null,
      author: authorNames.length ? authorNames.join(', ') : null,
      narrator: narratorNames.length ? narratorNames.join(', ') : null,
      publisher,
      publishedYear: releaseDate ? String(releaseDate).split('-')[0] : null,
      description,
      cover,
      asin: item?.asin,
      isbn: item?.isbn || null,
      genres: genres.length ? genres : null,
      tags: tags.length ? tags : null,
      series: series.length ? series : null,
      language: item?.language ? item.language.charAt(0).toUpperCase() + item.language.slice(1) : null,
      duration: !isNaN(normalizedDuration) ? normalizedDuration : 0,
      region: item?.region || region || null,
      rating,
      abridged: String(formatType || '').toLowerCase() === 'abridged'
    }
  }

  /**
   *
   * @param {string} asin
   * @param {string} region
   * @param {number} [timeout] response timeout in ms
   * @returns {Promise<Object>}
   */
  asinSearch(asin, region, timeout = this.#responseTimeout) {
    if (!asin) return null
    region = this.normalizeRegion(region, 'asinSearch')
    if (!timeout || isNaN(timeout)) timeout = this.#responseTimeout
    return this.fetchProductsByASINs([asin], region, timeout).then((products) => products[0] || null)
  }

  /**
   *
   * @param {string} title
   * @param {string} author
   * @param {string} asin
   * @param {string} region
   * @param {number} [timeout] response timeout in ms
   * @returns {Promise<Object[]>}
   */
  async search(title, author, asin, region, timeout = this.#responseTimeout) {
    region = this.normalizeRegion(region, 'search')
    if (!timeout || isNaN(timeout)) timeout = this.#responseTimeout

    let items = []
    const asinCandidates = []

    if (asin && isValidASIN(String(asin).toUpperCase())) {
      asinCandidates.push(String(asin).toUpperCase())
    }

    if (!asinCandidates.length && title && isValidASIN(String(title).toUpperCase())) {
      asinCandidates.push(String(title).toUpperCase())
    }

    if (asinCandidates.length) {
      items = await this.fetchProductsByASINs(asinCandidates, region, timeout)
    } else {
      items = await this.searchProducts(title, author, region, timeout)

      if (items.length && items.some((item) => !this.hasFullProductDetails(item))) {
        const resultAsins = items.map((item) => item?.asin).filter((itemAsin) => itemAsin && isValidASIN(String(itemAsin).toUpperCase()))
        if (resultAsins.length) {
          items = await this.fetchProductsByASINs(resultAsins, region, timeout)
        }
      }
    }

    return items
      .filter(Boolean)
      .map((item) => this.cleanResult(item, region || null))
      .filter(Boolean)
  }

  cleanChapter(chapter) {
    const startOffsetMs = Number(chapter?.startOffsetMs ?? chapter?.start_offset_ms ?? 0)
    return {
      lengthMs: Number(chapter?.lengthMs ?? chapter?.length_ms ?? 0),
      startOffsetMs,
      startOffsetSec: Number(chapter?.startOffsetSec ?? chapter?.start_offset_sec ?? Math.floor(startOffsetMs / 1000)),
      title: chapter?.title || ''
    }
  }

  normalizeChapterData(chapterInfo) {
    const runtimeLengthMs = Number(chapterInfo?.runtimeLengthMs ?? chapterInfo?.runtime_length_ms ?? 0)
    return {
      brandIntroDurationMs: Number(chapterInfo?.brandIntroDurationMs ?? chapterInfo?.brand_intro_duration_ms ?? 0),
      brandOutroDurationMs: Number(chapterInfo?.brandOutroDurationMs ?? chapterInfo?.brand_outro_duration_ms ?? 0),
      isAccurate: Boolean(chapterInfo?.isAccurate ?? chapterInfo?.is_accurate ?? false),
      runtimeLengthMs,
      runtimeLengthSec: Number(chapterInfo?.runtimeLengthSec ?? chapterInfo?.runtime_length_sec ?? Math.floor(runtimeLengthMs / 1000)),
      chapters: Array.isArray(chapterInfo?.chapters) ? chapterInfo.chapters.map((chapter) => this.cleanChapter(chapter)) : []
    }
  }

  /**
   *
   * @param {string} asin
   * @param {string} region
   * @param {number} [timeout] response timeout in ms
   * @returns {Promise<Object>}
   */
  getChaptersByASIN(asin, region, timeout = this.#responseTimeout) {
    if (!isValidASIN(String(asin || '').toUpperCase())) {
      Logger.error(`[Audible] Invalid ASIN ${asin}`)
      return null
    }

    region = this.normalizeRegion(region, 'getChaptersByASIN')
    if (!timeout || isNaN(timeout)) timeout = this.#responseTimeout

    const encodedAsin = encodeURIComponent(String(asin).toUpperCase())
    const url = `${this.getBaseUrl(region)}/1.0/content/${encodedAsin}/metadata`
    const queryParams = {
      response_groups: CHAPTER_RESPONSE_GROUPS
    }

    return axios
      .get(url, this.getRequestConfig(timeout, queryParams))
      .then((res) => {
        const chapterInfo = res?.data?.content_metadata?.chapter_info
        if (!chapterInfo) return null
        return this.normalizeChapterData(chapterInfo)
      })
      .catch((error) => {
        Logger.error(`[Audible] Chapter ASIN request failed for ${asin}/${region || 'us'}`, error.message)
        return null
      })
  }
}

module.exports = Audible
