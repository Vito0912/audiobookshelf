const fs = require('../libs/fsExtra')
const Logger = require('../Logger')
const Path = require('path')
const Audible = require('../providers/Audible')

const { downloadImageFile } = require('../utils/fileUtils')

class AuthorFinder {
  constructor() {
    this.audible = new Audible()
  }

  findAuthorByASIN(asin, region) {
    if (!asin) return null
    return this.audible.findAuthorByASIN(asin, region)
  }

  /**
   *
   * @param {string} name
   * @param {string} region
   * @param {Object} [options={}]
   * @returns {Promise<Object>}
   */
  async findAuthorByName(name, region, options = {}) {
    if (!name) return null
    const maxLevenshtein = !isNaN(options.maxLevenshtein) ? Number(options.maxLevenshtein) : 3

    const author = await this.audible.findAuthorByName(name, region, maxLevenshtein)
    if (!author?.name) {
      return null
    }
    return author
  }

  /**
   * Download author image from url and save in authors folder
   *
   * @param {string} authorId
   * @param {string} url
   * @returns {Promise<{path:string, error:string}>}
   */
  async saveAuthorImage(authorId, url) {
    const authorDir = Path.join(global.MetadataPath, 'authors')

    if (!(await fs.pathExists(authorDir))) {
      await fs.ensureDir(authorDir)
    }

    const imageExtension = url.toLowerCase().split('.').pop()
    const ext = imageExtension === 'png' ? 'png' : 'jpg'
    const filename = authorId + '.' + ext
    const outputPath = Path.posix.join(authorDir, filename)

    return downloadImageFile(url, outputPath)
      .then(() => {
        return {
          path: outputPath
        }
      })
      .catch((err) => {
        let errorMsg = err.message || 'Unknown error'
        Logger.error(`[AuthorFinder] Download image file failed for "${url}"`, errorMsg)
        return {
          error: errorMsg
        }
      })
  }
}
module.exports = new AuthorFinder()
