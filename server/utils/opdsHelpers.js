const builder = require('xmlbuilder');

module.exports = {

  /**
   * @param {string} id
   * @param {string} title
   * @param {string[]} entriesXML
   * @param {RequestWithUser} req
   *
   * @returns {string}
   */

  buildOPDSXMLSkeleton(id, title, entriesXML, req) {

    const xml = builder.create('feed', { version: '1.0', encoding: 'UTF-8' })
      .att('xmlns', 'http://www.w3.org/2005/Atom')
      .att('xmlns:opds', 'http://opds-spec.org/2010/catalog')
      .att('xmlns:dcterms', 'http://purl.org/dc/terms/')
      .att('xmlns:opensearch', 'http://a9.com/-/spec/opensearch/1.1/')
      .ele('id', id).up()
      .ele('title', title).up()
      .ele('updated', new Date().toISOString()).up();

    if(req.library && req.library.id) {
      xml.ele('link', {
        'rel': 'alternate',
        'type': 'text/html',
        'title': 'Web Interface',
        'href': `/library/${req.library.id}`
      })

      if(req.user) {
        // Search
        xml.ele('link', {
          'rel': 'search',
          'type': 'application/opensearchdescription+xml',
          'title': 'Search this library',
          'href': `/api/opds/libraries/${req.library.id}/search-definition?token=${req.user.token}`
        })
        // Pagination
        xml.ele('link', {
          'rel': 'start',
          'type': 'application/atom+xml;profile=opds-catalog;kind=navigation',
          'href': req.originalUrl.replace(/&?page=\d+/, '')
        })
        if (req.query.page && req.query.page > 0) {
          xml.ele('link', {
            'rel': 'previous',
            'type': 'application/atom+xml; profile=opds-catalog; kind=acquisition',
            'href': req.originalUrl.replace(/&?page=\d+/, '') + (((req.query.page - 1) >= 1) ? `&page=${req.query.page - 1}` : '')
          })
        }
        // Next page
        if(req.enableNext) {
          xml.ele('link', {
            'rel': 'next',
            'type': 'application/atom+xml; profile=opds-catalog; kind=acquisition',
            'href': req.originalUrl.replace(/&?page=\d+/, '') + (req.query.page ? `&page=${parseInt(req.query.page) + 1}` : '&page=1')
          })
        }
      }
    }

    // If there are entries, append them using raw
    if (entriesXML && entriesXML.length > 0) {
      entriesXML.forEach(entry => {
        xml.raw(entry);
      });
    }

    return xml.end({ pretty: true });
  },

  buildLibraryEntries(libraries, user) {
    // Create entries without XML declaration by using builder options
    return libraries.map(library => {
      return builder.create('entry', { headless: true }) // Set headless in create options instead
        .ele('id', library.id).up()
        .ele('title', library.name).up()
        .ele('updated', new Date().toISOString()).up()
        .ele('link', {'type': 'application/atom+xml;profile=opds-catalog', 'rel': 'subsection', 'href': `/api/opds/libraries/${library.id}?token=${user.token}`}).up()
        .end({ pretty: true });
    });
  },

  buildItemEntries(libraryItems, user) {
    return libraryItems.map(item => {
      const authors = item.media.metadata.authorName.split(', ')
      let xml = builder.create('entry', { headless: true }) // Set headless in create options instead
        .ele('id', `urn:uuid:${item.id}`).up()
        .ele('title', item.media.metadata.title).up()
        .ele('subtitle', item.media.metadata.subtitle).up()
        .ele('updated', new Date().toISOString()).up()
        .ele('content', {'type': 'text'}, item.media.metadata.description).up()
        .ele('publisher', item.media.metadata.publisher).up()
        .ele('isbn', item.media.metadata.isbn).up()
        .ele('published', (item.media.metadata.publishedDate ?? item.media.metadata.publishedYear)	).up()
        .ele('language', item.media.metadata.language).up()
        // Download Link
        // .ele('link', {'href': `/api/items/${item.id}/ebook?token=${user.token}`, 'rel': 'http://opds-spec.org/acquisition', 'type': 'application/epub+zip'}).up()
        // Cover Image
        .ele('link', {'href': `/api/items/${item.id}/cover?token=${user.token}`, 'rel': 'http://opds-spec.org/image'}).up()

      for (let author of authors) {
        xml.ele('author').ele('name', author).up().up()
      }
      for (let tag of [...item.media.metadata.genres, ...item.media.tags]) {
        xml.ele('category', {'label': tag, 'term': tag}).up()
      }

      return xml.end({ pretty: true });

    });
  },


  /**
   * @param {RequestWithUser} req
   *
   * @returns {string}
   */
  buildSearchDefinition(req) {
    return builder.create('OpenSearchDescription', { version: '1.0', encoding: 'UTF-8' })
      .ele('ShortName', 'ABS').up()
      .ele('LongName', 'Audiobookshelf').up()
      .ele('Description', 'Search for books in Audiobookshelf').up()
      .ele('Url', {
        'type': 'application/atom+xml',
        'template': `/api/opds/libraries/${req.library.id}/search?q={searchTerms}&token=${req.user.token}`
      }).up()
      .end({ pretty: true });
  }
};
