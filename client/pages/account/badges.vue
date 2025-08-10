<template>
  <div class="page p-6 overflow-y-auto" :class="streamLibraryItem ? 'streaming' : ''">
    <div class="max-w-5xl mx-auto">
      <div class="flex items-center mb-6">
        <ui-icon-btn icon="arrow_back" class="mr-4" @click="$router.push('/account')" />
        <h1 class="text-2xl font-semibold flex items-center">
          <span class="material-symbols mr-2 icon-text">military_tech</span>
          {{ $strings?.LabelBadges || 'Badges' }}
        </h1>
        <div class="grow" />
        <ui-btn small :loading="loading" @click="loadBadges">{{ $strings?.ButtonRefresh || 'Refresh' }}</ui-btn>
      </div>

      <div v-if="error" class="p-4 bg-error/20 border border-error rounded mb-4">
        <p class="text-error text-sm">{{ error }}</p>
      </div>

      <div v-if="loading" class="py-16 flex justify-center">
        <ui-loading-indicator />
      </div>

      <div v-else class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <badge-card v-for="badge in displayedBadges" :key="badge.key" :badge="badge" :stages="badge.stages" :current-value="badge.current" :icon="badge.icon" />
      </div>
    </div>
  </div>
</template>

<script>
import BadgeCard from '@/components/stats/BadgeCard.vue'

function buildStages(thresholds, labelFormatter = (v) => v) {
  return thresholds.map((value, idx) => ({
    value,
    label: labelFormatter(value, idx),
    index: idx
  }))
}

export default {
  components: { BadgeCard },
  data() {
    return {
      loading: false,
      error: null,
      badges: null
    }
  },
  computed: {
    streamLibraryItem() {
      return this.$store.state.streamLibraryItem
    },
    displayedBadges() {
      if (!this.badges) return []
      const b = this.badges
      return [
        {
          key: 'bookmarks',
          title: this.$strings?.LabelBadgeBookmarks || 'Bookmarks',
          description: this.$strings?.DescBadgeBookmarks || 'Total bookmarks created',
          current: b.bookmarks,
          icon: 'bookmark',
          stages: buildStages([1, 5, 10, 25, 50, 100])
        },
        {
          key: 'finished',
          title: this.$strings?.LabelBadgeFinishedItems || 'Finished Items',
          description: this.$strings?.DescBadgeFinishedItems || 'Number of items finished',
          current: b.numItemsFinished,
          icon: 'check_circle',
          stages: buildStages([1, 5, 10, 25, 50, 100, 250])
        },
        {
          key: 'longestItem',
          title: this.$strings?.LabelBadgeLongestItem || 'Longest Item Finished',
          description: this.$strings?.DescBadgeLongestItem || 'Longest item duration finished (hours)',
          current: b.longestItemFinished ? Math.round((b.longestItemFinished.duration || 0) / 3600) : 0,
          icon: 'hourglass_bottom',
          stages: buildStages([1, 5, 10, 20, 40, 60], (v) => v + 'h')
        },
        {
          key: 'longestSession',
          title: this.$strings?.LabelBadgeLongestSession || 'Longest Session',
          description: this.$strings?.DescBadgeLongestSession || 'Longest single listening session (minutes)',
          current: b.longestSession ? Math.round((b.longestSession.timeListening || 0) / 60) : 0,
          icon: 'schedule',
          stages: buildStages([10, 30, 60, 120, 240, 480], (v) => v + 'm')
        },
        {
          key: 'sevenDayBooks',
          title: this.$strings?.LabelBadge7DayBooks || '7 Day Book Streak',
          description: this.$strings?.DescBadge7DayBooks || 'Most unique books in any 7 day window',
          current: b.longestSevenDayWindowBooks ? b.longestSevenDayWindowBooks.uniqueBooks : 0,
          icon: 'auto_stories',
          stages: buildStages([1, 2, 3, 5, 7, 10])
        },
        {
          key: 'sevenDayListening',
          title: this.$strings?.LabelBadge7DayListening || '7 Day Listening',
          description: this.$strings?.DescBadge7DayListening || 'Most listening time (hours) in any 7 day window',
          current: b.longestSevenDayWindowListening ? Math.round((b.longestSevenDayWindowListening.totalListeningTime || 0) / 3600) : 0,
          icon: 'headphones',
          stages: buildStages([1, 3, 5, 10, 20, 40], (v) => v + 'h')
        },
        {
          key: 'maxStartsSameBook',
          title: this.$strings?.LabelBadgeReplays || 'Replays',
          description: this.$strings?.DescBadgeReplays || 'Number of restart sessions (start at 0) on a single book',
          current: b.maxStartsSameBook ? b.maxStartsSameBook.count : 0,
          icon: 'replay',
          stages: buildStages([2, 3, 5, 10, 15])
        },
        {
          key: 'consecutiveDays',
          title: this.$strings?.LabelBadgeConsecutiveDays || 'Consecutive Days',
          description: this.$strings?.DescBadgeConsecutiveDays || 'Max consecutive listening days',
          current: b.maxConsecutiveDays ? b.maxConsecutiveDays.days : 0,
          icon: 'calendar_month',
          stages: buildStages([2, 3, 5, 7, 14, 30, 60, 100, 200, 365])
        },
        {
          key: 'libraryItems',
          title: this.$strings?.LabelBadgeLibrarySize || 'Library Size',
          description: this.$strings?.DescBadgeLibrarySize || 'Total accessible items across libraries',
          current: b.totalAccessibleLibraryItems || 0,
          icon: 'library_books',
          stages: buildStages([10, 25, 50, 100, 250, 500, 1000])
        }
      ]
    }
  },
  methods: {
    loadBadges() {
      this.loading = true
      this.error = null
      this.$axios
        .$get('/api/me/badges')
        .then((data) => {
          this.badges = data
        })
        .catch((err) => {
          console.error('Failed to load badges', err)
          this.error = this.$strings?.ToastUnknownError || 'Failed to load badges'
        })
        .finally(() => {
          this.loading = false
        })
    }
  },
  mounted() {
    this.loadBadges()
  }
}
</script>
