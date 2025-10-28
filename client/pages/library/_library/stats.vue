<template>
  <div class="page relative" :class="streamLibraryItem ? 'streaming' : ''">
    <app-book-shelf-toolbar page="library-stats" is-home />
    <div id="bookshelf" class="w-full h-full px-1 py-4 md:p-8 relative overflow-y-auto">
      <div class="w-full max-w-4xl mx-auto">
        <stats-preview-icons v-if="totalItems" :library-stats="libraryStats" />

        <!-- TypeScript Demo Section -->
        <div v-if="typeScriptStats" class="mt-8 bg-primary border-2 border-yellow-400/50 rounded-lg p-6">
          <div class="flex items-center mb-4">
            <h1 class="text-2xl font-bold">TypeScript Advanced Statistics</h1>
            <div class="ml-3 px-3 py-1 bg-yellow-400 text-black text-xs font-bold rounded">TS</div>
          </div>
          <p class="text-gray-300 text-sm mb-4">
            {{ typeScriptStats.message }}
          </p>

          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <!-- Duration Stats -->
            <div class="bg-bg border border-gray-600 rounded p-4">
              <div class="text-gray-400 text-sm mb-1">Total Duration</div>
              <div class="text-white text-2xl font-bold">{{ typeScriptStats.stats.totalDurationFormatted }}</div>
              <div class="text-gray-400 text-xs mt-2">Average: {{ typeScriptStats.stats.averageDurationFormatted }}</div>
            </div>

            <!-- Size Stats -->
            <div class="bg-bg border border-gray-600 rounded p-4">
              <div class="text-gray-400 text-sm mb-1">Total Size</div>
              <div class="text-white text-2xl font-bold">{{ typeScriptStats.stats.totalSizeFormatted }}</div>
              <div class="text-gray-400 text-xs mt-2">Average: {{ typeScriptStats.stats.averageSizeFormatted }}</div>
            </div>

            <!-- Items Stats -->
            <div class="bg-bg border border-gray-600 rounded p-4">
              <div class="text-gray-400 text-sm mb-1">Library Items</div>
              <div class="text-white text-2xl font-bold">{{ typeScriptStats.stats.totalItems }}</div>
              <div class="text-gray-400 text-xs mt-2">
                Books: {{ typeScriptStats.stats.totalBooks }} | Podcasts: {{ typeScriptStats.stats.totalPodcasts }}
              </div>
            </div>

            <!-- Longest Item -->
            <div v-if="typeScriptStats.stats.longestItem" class="bg-bg border border-gray-600 rounded p-4">
              <div class="text-gray-400 text-sm mb-1">Longest Item</div>
              <div class="text-white font-bold truncate">{{ typeScriptStats.stats.longestItem.title }}</div>
              <div class="text-gray-400 text-xs mt-2">{{ typeScriptStats.stats.longestItem.durationFormatted }}</div>
            </div>

            <!-- Shortest Item -->
            <div v-if="typeScriptStats.stats.shortestItem" class="bg-bg border border-gray-600 rounded p-4">
              <div class="text-gray-400 text-sm mb-1">Shortest Item</div>
              <div class="text-white font-bold truncate">{{ typeScriptStats.stats.shortestItem.title }}</div>
              <div class="text-gray-400 text-xs mt-2">{{ typeScriptStats.stats.shortestItem.durationFormatted }}</div>
            </div>

            <!-- Recent Activity -->
            <div class="bg-bg border border-gray-600 rounded p-4">
              <div class="text-gray-400 text-sm mb-1">Recent Activity</div>
              <div class="text-white font-bold">{{ typeScriptStats.stats.itemsAddedLastWeek }} this week</div>
              <div class="text-gray-400 text-xs mt-2">{{ typeScriptStats.stats.itemsAddedLastMonth }} this month</div>
            </div>
          </div>

          <!-- Top Narrators (if books) -->
          <div v-if="typeScriptStats.stats.topNarrators && typeScriptStats.stats.topNarrators.length" class="mt-4">
            <h3 class="text-lg font-semibold mb-2">Top Narrators</h3>
            <div class="grid grid-cols-2 md:grid-cols-5 gap-2">
              <div v-for="narrator in typeScriptStats.stats.topNarrators.slice(0, 5)" :key="narrator.narrator" class="bg-bg border border-gray-600 rounded p-2 text-center">
                <div class="text-white text-sm truncate">{{ narrator.narrator }}</div>
                <div class="text-yellow-400 text-xs font-bold">{{ narrator.count }}</div>
              </div>
            </div>
          </div>

          <!-- Languages -->
          <div v-if="typeScriptStats.stats.languages && typeScriptStats.stats.languages.length" class="mt-4">
            <h3 class="text-lg font-semibold mb-2">Languages</h3>
            <div class="flex flex-wrap gap-2">
              <div v-for="lang in typeScriptStats.stats.languages" :key="lang.language" class="bg-bg border border-gray-600 rounded px-3 py-1">
                <span class="text-white text-sm">{{ lang.language }}</span>
                <span class="text-yellow-400 text-xs font-bold ml-2">{{ lang.count }}</span>
              </div>
            </div>
          </div>

          <div class="mt-4 text-xs text-gray-400">
            Calculated at {{ typeScriptStats.stats.calculatedAt }} with {{ typeScriptStats.stats.calculatedWith }}
          </div>
        </div>

        <div class="flex lg:flex-row flex-wrap justify-between flex-col mt-8">
          <div class="w-80 my-6 mx-auto">
            <h1 class="text-2xl mb-4">{{ $strings.HeaderStatsTop5Genres }}</h1>
            <p v-if="!top5Genres.length">{{ $strings.MessageNoGenres }}</p>
            <template v-for="genre in top5Genres">
              <div :key="genre.genre" class="w-full py-2">
                <div class="flex items-end mb-1">
                  <p class="text-2xl font-bold">{{ Math.round((100 * genre.count) / totalItems) }}&nbsp;%</p>
                  <div class="grow" />
                  <nuxt-link :to="`/library/${currentLibraryId}/bookshelf?filter=genres.${$encode(genre.genre)}`" class="text-base text-white/70 hover:underline">
                    {{ genre.genre }}
                  </nuxt-link>
                </div>
                <div class="w-full rounded-full h-3 bg-primary/50 overflow-hidden">
                  <div class="bg-yellow-400 h-full rounded-full" :style="{ width: Math.round((100 * genre.count) / totalItems) + '%' }" />
                </div>
              </div>
            </template>
          </div>
          <div v-if="isBookLibrary" class="w-80 my-6 mx-auto">
            <h1 class="text-2xl mb-4">{{ $strings.HeaderStatsTop10Authors }}</h1>
            <p v-if="!top10Authors.length">{{ $strings.MessageNoAuthors }}</p>
            <template v-for="(author, index) in top10Authors">
              <div :key="author.id" class="w-full py-2">
                <div class="flex items-center mb-1">
                  <p class="text-sm text-white/70 w-36 pr-2 truncate">
                    {{ index + 1 }}.&nbsp;&nbsp;&nbsp;&nbsp;<nuxt-link :to="`/author/${author.id}`" class="hover:underline">{{ author.name }}</nuxt-link>
                  </p>
                  <div class="grow rounded-full h-2.5 bg-primary/0 overflow-hidden">
                    <div class="bg-yellow-400 h-full rounded-full" :style="{ width: Math.round((100 * author.count) / mostUsedAuthorCount) + '%' }" />
                  </div>
                  <div class="w-4 ml-3">
                    <p class="text-sm font-bold">{{ author.count }}</p>
                  </div>
                </div>
              </div>
            </template>
          </div>
          <div class="w-80 my-6 mx-auto">
            <h1 class="text-2xl mb-4">{{ $strings.HeaderStatsLongestItems }}</h1>
            <p v-if="!top10LongestItems.length">{{ $strings.MessageNoItems }}</p>
            <template v-for="(ab, index) in top10LongestItems">
              <div :key="index" class="w-full py-2">
                <div class="flex items-center mb-1">
                  <p class="text-sm text-white/70 w-44 pr-2 truncate">
                    {{ index + 1 }}.&nbsp;&nbsp;&nbsp;&nbsp;<nuxt-link :to="`/item/${ab.id}`" class="hover:underline">{{ ab.title }}</nuxt-link>
                  </p>
                  <div class="grow rounded-full h-2.5 bg-primary/0 overflow-hidden">
                    <div class="bg-yellow-400 h-full rounded-full" :style="{ width: Math.round((100 * ab.duration) / longestItemDuration) + '%' }" />
                  </div>
                  <div class="w-4 ml-3">
                    <p class="text-sm font-bold">{{ (ab.duration / 3600).toFixed(1) }}</p>
                  </div>
                </div>
              </div>
            </template>
          </div>
          <div class="w-80 my-6 mx-auto">
            <h1 class="text-2xl mb-4">{{ $strings.HeaderStatsLargestItems }}</h1>
            <p v-if="!top10LargestItems.length">{{ $strings.MessageNoItems }}</p>
            <template v-for="(ab, index) in top10LargestItems">
              <div :key="index" class="w-full py-2">
                <div class="flex items-center mb-1">
                  <p class="text-sm text-white/70 w-44 pr-2 truncate">
                    {{ index + 1 }}.&nbsp;&nbsp;&nbsp;&nbsp;<nuxt-link :to="`/item/${ab.id}`" class="hover:underline">{{ ab.title }}</nuxt-link>
                  </p>
                  <div class="grow rounded-full h-2.5 bg-primary/0 overflow-hidden">
                    <div class="bg-yellow-400 h-full rounded-full" :style="{ width: Math.round((100 * ab.size) / largestItemSize) + '%' }" />
                  </div>
                  <div class="w-4 ml-3">
                    <p class="text-sm font-bold whitespace-nowrap">{{ $bytesPretty(ab.size) }}</p>
                  </div>
                </div>
              </div>
            </template>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  async asyncData({ redirect, store, params }) {
    if (!store.getters['user/getIsAdminOrUp']) {
      redirect('/')
      return
    }

    const libraryId = params.library
    const library = await store.dispatch('libraries/fetch', libraryId)
    if (!library) {
      return redirect(`/oops?message=Library "${libraryId}" not found`)
    }
    return {}
  },
  data() {
    return {
      libraryStats: null,
      typeScriptStats: null
    }
  },
  watch: {
    currentLibraryId(newVal, oldVal) {
      if (newVal) {
        this.init()
      }
    }
  },
  computed: {
    streamLibraryItem() {
      return this.$store.state.streamLibraryItem
    },
    user() {
      return this.$store.state.user.user
    },
    totalItems() {
      return this.libraryStats?.totalItems || 0
    },
    genresWithCount() {
      return this.libraryStats?.genresWithCount || []
    },
    top5Genres() {
      return this.genresWithCount?.slice(0, 5) || []
    },
    top10LongestItems() {
      return this.libraryStats?.longestItems || []
    },
    longestItemDuration() {
      if (!this.top10LongestItems.length) return 0
      return this.top10LongestItems[0].duration
    },
    top10LargestItems() {
      return this.libraryStats?.largestItems || []
    },
    largestItemSize() {
      if (!this.top10LargestItems.length) return 0
      return this.top10LargestItems[0].size
    },
    authorsWithCount() {
      return this.libraryStats?.authorsWithCount || []
    },
    mostUsedAuthorCount() {
      if (!this.authorsWithCount.length) return 0
      return this.authorsWithCount[0].count
    },
    top10Authors() {
      return this.authorsWithCount?.slice(0, 10) || []
    },
    currentLibraryId() {
      return this.$store.state.libraries.currentLibraryId
    },
    currentLibraryName() {
      return this.$store.getters['libraries/getCurrentLibraryName']
    },
    currentLibraryMediaType() {
      return this.$store.getters['libraries/getCurrentLibraryMediaType']
    },
    isBookLibrary() {
      return this.currentLibraryMediaType === 'book'
    }
  },
  methods: {
    async init() {
      this.libraryStats = await this.$axios.$get(`/api/libraries/${this.currentLibraryId}/stats`).catch((err) => {
        console.error('Failed to get library stats', err)
        var errorMsg = err.response ? err.response.data || 'Unknown Error' : 'Unknown Error'
        this.$toast.error(`Failed to get library stats: ${errorMsg}`)
      })

      // Fetch TypeScript-powered advanced statistics
      this.typeScriptStats = await this.$axios.$get(`/api/libraries/${this.currentLibraryId}/stats-ts`).catch((err) => {
        console.error('Failed to get TypeScript stats', err)
        // Don't show error toast for TypeScript stats - it's optional demo feature
      })
    }
  },
  mounted() {
    this.init()
  }
}
</script>
