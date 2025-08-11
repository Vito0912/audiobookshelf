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
        <badge-card v-for="badge in displayedBadges" :key="badge.key" :badge="badge" :stages="badge.stages" :current-value="badge.current" :icon="badge.icon" :unit="badge.unit" />
      </div>
    </div>
  </div>
</template>

<script>
import BadgeCard from '@/components/stats/BadgeCard.vue'

function buildStages(thresholds, labelFormatter = (v) => v) {
  const five = thresholds
  return five.map((value, idx) => ({ value, label: labelFormatter(value, idx), index: idx }))
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
          unit: '',
          stages: buildStages([5, 10, 25, 50, 100])
        },
        {
          key: 'finished',
          title: this.$strings?.LabelBadgeFinishedItems || 'Finished Items',
          description: this.$strings?.DescBadgeFinishedItems || 'Number of items finished',
          current: b.numItemsFinished,
          icon: 'check_circle',
          unit: '',
          stages: buildStages([25, 75, 150, 300, 750])
        },
        {
          key: 'longestItem',
          title: this.$strings?.LabelBadgeLongestItem || 'Longest Item Finished',
          description: this.$strings?.DescBadgeLongestItem || 'Longest item duration finished (hours)',
          current: b.longestItemFinished ? Math.round((b.longestItemFinished.duration || 0) / 3600) : 0,
          icon: 'hourglass_bottom',
          unit: 'h',
          stages: buildStages([1, 5, 10, 20, 40, 60])
        },
        {
          key: 'longestSession',
          title: this.$strings?.LabelBadgeLongestSession || 'Longest Session',
          description: this.$strings?.DescBadgeLongestSession || 'Longest single listening session (minutes)',
          current: b.longestSession ? Math.round((b.longestSession.timeListening || 0) / 60) : 0,
          icon: 'schedule',
          unit: 'm',
          stages: buildStages([30, 60, 120, 240, 480])
        },
        {
          key: 'sevenDayBooks',
          title: this.$strings?.LabelBadge7DayBooks || '7 Day Book Streak',
          description: this.$strings?.DescBadge7DayBooks || 'Most unique books in any 7 day window',
          current: b.longestSevenDayWindowBooks ? b.longestSevenDayWindowBooks.uniqueBooks : 0,
          icon: 'auto_stories',
          unit: '',
          stages: buildStages([2, 3, 5, 7, 10])
        },
        {
          key: 'sevenDayListening',
          title: this.$strings?.LabelBadge7DayListening || '7 Day Listening',
          description: this.$strings?.DescBadge7DayListening || 'Most listening time (hours) in any 7 day window',
          current: b.longestSevenDayWindowListening ? Math.round((b.longestSevenDayWindowListening.totalListeningTime || 0) / 3600) : 0,
          icon: 'headphones',
          unit: 'h',
          stages: buildStages([3, 5, 10, 20, 40])
        },
        {
          key: 'maxStartsSameBook',
          title: this.$strings?.LabelBadgeReplays || 'Replays',
          description: this.$strings?.DescBadgeReplays || 'Number of restart sessions (start at 0) on a single book',
          current: b.maxStartsSameBook ? b.maxStartsSameBook.count : 0,
          icon: 'replay',
          unit: '',
          stages: buildStages([2, 3, 5, 10, 15])
        },
        {
          key: 'consecutiveDays',
          title: this.$strings?.LabelBadgeConsecutiveDays || 'Consecutive Days',
          description: this.$strings?.DescBadgeConsecutiveDays || 'Max consecutive listening days',
          current: b.maxConsecutiveDays ? b.maxConsecutiveDays.days : 0,
          icon: 'calendar_month',
          unit: 'd',
          stages: buildStages([15, 30, 90, 180, 365])
        },
        {
          key: 'libraryItems',
          title: this.$strings?.LabelBadgeLibrarySize || 'Library Size',
          description: this.$strings?.DescBadgeLibrarySize || 'Total accessible items across libraries',
          current: b.totalAccessibleLibraryItems || 0,
          icon: 'library_books',
          unit: '',
          stages: buildStages([50, 100, 250, 500, 1000])
        },
        {
          key: 'marathonDay',
          title: this.$strings?.LabelBadgeMarathonDay || 'Marathon Day',
          description: this.$strings?.DescBadgeMarathonDay || 'Best single day listening (hours)',
          current: b.bestMarathonDay ? Math.round((b.bestMarathonDay.timeListening || 0) / 3600) : 0,
          icon: 'bolt',
          unit: 'h',
          stages: buildStages([4, 6, 8, 12, 16])
        },
        {
          key: 'weeklyConsistency',
          title: this.$strings?.LabelBadgeWeeklyConsistency || 'Weekly Consistency',
          description: this.$strings?.DescBadgeWeeklyConsistency || 'Weeks with ≥4 active days',
          current: b.weeklyConsistencyWeeks || 0,
          icon: 'event_repeat',
          unit: 'w',
          stages: buildStages([4, 8, 16, 32, 52])
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
