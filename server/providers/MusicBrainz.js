const axios = require('axios')
const packageJson = require('../../package.json')
const Logger = require('../Logger')
const { isNullOrNaN } = require('../utils/index')

class MusicBrainz {
  constructor() { }

  get userAgentString() {
    return `audiobookshelf/${packageJson.version} (https://audiobookshelf.org)`
  }

  // https://musicbrainz.org/doc/MusicBrainz_API/Search
  searchTrack(title, author) {
    let luceneParts = [`${title}`, 'type:Audiobook']


    const query = {
      query: luceneParts.join(' AND '),
      limit: 10,
      fmt: 'json'
    }
    const config = {
      headers: {
        'User-Agent': this.userAgentString
      }
    }

    Logger.debug(`[MusicBrainz] Search query: ${JSON.stringify(query)}`)

    return axios.get('https://musicbrainz.org/ws/2/release-group', { params: query, }, config).then((response) => {
      console.dir(response.data, { depth: null });

      return response.data['release-groups'].map((recording) => {
        return {
          title: recording.title,
          author: recording['artist-credit'] !== undefined ? recording['artist-credit'].filter((artist) => artist['joinphrase']).map((artist) => artist.name).join(', ') : null,
          narrator: recording['artist-credit'] !== undefined ? recording['artist-credit'].filter((artist) => !artist['joinphrase']).map((artist) => artist.name).join(', ') : null,
          duration: recording['length'] !== undefined ? recording['length'] : null,
        }
      })
    }).catch((error) => {
      Logger.error(`[MusicBrainz] search request error`, error)
      return []
    })
  }
}
module.exports = MusicBrainz
