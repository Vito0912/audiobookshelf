<template>
  <div class="bg-white/5 rounded-lg p-4 flex flex-col border border-white/10 hover:border-primary transition-colors">
    <div class="flex items-center mb-2">
      <span class="material-symbols icon-text text-primary mr-2">{{ icon }}</span>
      <h3 class="font-semibold text-lg leading-tight">{{ badge.title }}</h3>
    </div>
    <p class="text-xs text-gray-300 leading-snug mb-3 line-clamp-2">{{ badge.description }}</p>

    <div class="flex items-end mb-4">
      <p class="text-3xl font-bold mr-2">{{ currentValue }}</p>
      <p class="text-xs text-gray-400 uppercase tracking-wide">{{ $strings?.LabelCurrent || 'Current' }}</p>
      <div class="grow" />
      <p v-if="nextStage" class="text-xs text-gray-400">{{ $strings?.LabelNext || 'Next' }}: {{ formatStage(nextStage) }}</p>
    </div>

    <div class="flex space-x-1">
      <div
        v-for="stage in stages"
        :key="stage.value + '_' + stage.index"
        class="h-2 rounded-sm flex-1 bg-white/10 relative overflow-hidden"
        :class="stage.value <= progressValue ? 'bg-primary' : ''"
        :title="formatStage(stage)"
      >
        <div v-if="stage.value <= progressValue" class="absolute inset-0 bg-gradient-to-r from-primary to-primary/70" />
      </div>
    </div>
  </div>
</template>

<script>
export default {
  props: {
    badge: { type: Object, required: true },
    stages: { type: Array, required: true },
    currentValue: { type: Number, required: true },
    icon: { type: String, default: 'military_tech' }
  },
  computed: {
    progressValue() {
      return this.currentValue
    },
    nextStage() {
      return this.stages.find((s) => s.value > this.progressValue) || null
    }
  },
  methods: {
    formatStage(stage) {
      return stage.label || stage.value
    }
  }
}
</script>

<style scoped>
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
