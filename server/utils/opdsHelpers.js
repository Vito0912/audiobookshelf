const builder = require('xmlbuilder');

module.exports = {
  buildOPDSXMLSkeleton(id, title, entriesXML) {

    const xml = builder.create('feed', { version: '1.0', encoding: 'UTF-8' })
      .att('xmlns', 'http://www.w3.org/2005/Atom')
      .ele('id', id).up()
      .ele('title', title).up()
      .ele('updated', new Date().toISOString()).up();

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
  }
};
