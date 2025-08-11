<template>
  <div class="relative rounded-xl p-5 flex flex-col border backdrop-blur bg-white/5 border-white/10 hover:border-primary/60 transition-colors overflow-hidden group">
    <div class="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-br from-primary/10 via-transparent to-white/5" />

    <div class="flex items-start mb-3">
      <div class="w-11 h-11 rounded-lg mr-3 flex items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5 text-primary shadow-inner">
        <span class="material-symbols icon-text text-2xl">{{ icon }}</span>
      </div>
      <div class="min-w-0 flex-1">
        <h3 class="font-semibold text-lg leading-tight tracking-tight flex items-center">
          {{ badge.title }}
          <span v-if="currentStageIdx >= 0" class="ml-2 text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full border" :style="currentStageChipStyle">
            {{ currentStageName }}
          </span>
        </h3>
        <p class="text-xs text-gray-300 leading-snug mt-1 line-clamp-2">{{ badge.description }}</p>
      </div>
    </div>

    <div class="flex items-end mb-4">
      <div>
        <p class="text-3xl font-bold mr-2 flex items-baseline">
          <span>{{ currentValue }}</span>
          <span v-if="unit" class="ml-1 text-xs font-medium text-gray-300">{{ unit }}</span>
        </p>
        <p class="text-[10px] uppercase tracking-wider text-gray-400">{{ $strings?.LabelCurrent || 'Current' }}</p>
      </div>
      <div class="grow" />
      <div class="text-right max-w-[55%]">
        <p v-if="nextStageData" class="text-xs text-gray-300">
          <span class="font-medium text-gray-200">{{ percentRemainingToNext }}%</span>
          <span class="text-gray-400"> {{ $strings?.LabelTo || 'to' }} {{ stageNames[nextStageData.index] }}</span>
        </p>
        <p v-if="nextStageData" class="text-[11px] text-gray-400">{{ remainingToNext }} {{ unit }} {{ $strings?.LabelRemaining || 'remaining' }}</p>
        <p v-else class="text-xs font-medium text-emerald-300">{{ $strings?.LabelMaxStage || 'Max stage achieved' }}</p>
      </div>
    </div>

    <div class="flex items-center space-x-1 mb-3">
      <div v-for="(stage, idx) in normalizedStages" :key="stage.value + '_' + idx" class="relative h-3 flex-1 rounded-sm overflow-hidden bg-white/10 ring-1 ring-inset ring-white/5" :title="segmentTitle(idx, stage)">
        <div v-if="idx > currentStageIdx" class="absolute inset-0 bg-gradient-to-br from-white/5 to-white/0" />
        <div v-if="idx < currentStageIdx" class="absolute inset-0" :style="segmentStyle(idx, 1)" />
        <div v-else-if="idx === currentStageIdx && !atMaxStage" class="absolute inset-0" :style="segmentStyle(idx, partialWithinSegment)" />
        <div v-else-if="idx === currentStageIdx && atMaxStage" class="absolute inset-0" :style="segmentStyle(idx, 1)" />
        <div v-if="idx === currentStageIdx" class="absolute inset-0 ring-1 ring-offset-0 ring-white/40 rounded-sm mix-blend-screen" />
      </div>
    </div>

    <div class="flex justify-between mt-auto">
      <div v-for="(name, idx) in stageNames" :key="name" class="flex flex-col items-center flex-1">
        <span class="h-2 w-2 rounded-full mb-1" :style="dotStyle(idx)" />
        <span class="text-[10px] font-medium tracking-wider" :class="idx <= currentStageIdx ? 'text-gray-200' : 'text-gray-500'">{{ name }}</span>
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
    icon: { type: String, default: 'military_tech' },
    unit: { type: String, default: '' }
  },
  computed: {
    stageNames() {
      return ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond']
    },
    stageStyles() {
      return [
        { from: '#a97142', to: '#cd7f32', text: '#fce9d2' }, // Bronze
        { from: '#9e9e9e', to: '#d4d4d4', text: '#1a1a1a' }, // Silver
        { from: '#b8860b', to: '#ffd700', text: '#1a1a1a' }, // Gold
        { from: '#6e7c7c', to: '#e5e4e2', text: '#1a1a1a' }, // Platinum
        { from: '#3bc9f5', to: '#b3ecff', text: '#082836' } // Diamond
      ]
    },
    normalizedStages() {
      return this.stages
        .map((v, i) => (typeof v === 'object' ? { ...v, index: i } : { value: v, index: i }))
        .sort((a, b) => a.value - b.value)
        .slice(0, 5)
    },
    currentStageIdx() {
      let idx = -1
      for (let i = 0; i < this.normalizedStages.length; i++) {
        if (this.currentValue >= this.normalizedStages[i].value) idx = i
        else break
      }
      return idx
    },
    atMaxStage() {
      return this.currentStageIdx >= this.normalizedStages.length - 1 && this.currentStageIdx !== -1
    },
    currentStageName() {
      if (this.currentStageIdx === -1) return this.stageNames[0]
      return this.stageNames[this.currentStageIdx]
    },
    nextStageData() {
      if (this.atMaxStage) return null
      return this.normalizedStages[this.currentStageIdx + 1] || this.normalizedStages[0]
    },
    previousThresholdValue() {
      if (this.currentStageIdx === -1) return 0
      return this.normalizedStages[this.currentStageIdx].value
    },
    nextThresholdValue() {
      return this.nextStageData ? this.nextStageData.value : this.previousThresholdValue
    },
    partialWithinSegment() {
      if (this.atMaxStage) return 1
      const prev = this.currentStageIdx === -1 ? 0 : this.previousThresholdValue
      const next = this.nextThresholdValue
      if (next === prev) return 0
      return Math.min(1, Math.max(0, (this.currentValue - prev) / (next - prev)))
    },
    remainingToNext() {
      if (!this.nextStageData) return 0
      return Math.max(0, this.nextThresholdValue - this.currentValue)
    },
    percentRemainingToNext() {
      if (!this.nextStageData) return 0
      const prev = this.currentStageIdx === -1 ? 0 : this.previousThresholdValue
      const span = this.nextThresholdValue - prev
      if (span <= 0) return 0
      const remaining = this.nextThresholdValue - this.currentValue
      return Math.max(0, Math.min(100, Math.round((remaining / span) * 100)))
    },
    currentStageChipStyle() {
      const idx = Math.max(0, this.currentStageIdx)
      const st = this.stageStyles[idx]
      return {
        background: `linear-gradient(135deg, ${st.from}, ${st.to})`,
        color: st.text,
        borderColor: st.to + '40'
      }
    },
    progressValue() {
      return this.currentValue
    }
  },
  methods: {
    formatStage(stage) {
      return stage.label || stage.value
    },
    segmentStyle(idx, fillRatio) {
      const st = this.stageStyles[idx]
      const pct = Math.round(fillRatio * 100)
      return {
        background: `linear-gradient(90deg, ${st.from}, ${st.to})`,
        width: pct + '%'
      }
    },
    dotStyle(idx) {
      const st = this.stageStyles[idx]
      const active = idx <= this.currentStageIdx
      return {
        background: active ? `linear-gradient(135deg, ${st.from}, ${st.to})` : 'linear-gradient(135deg, rgba(255,255,255,0.09), rgba(255,255,255,0.03))',
        boxShadow: active ? '0 0 0 1px rgba(255,255,255,0.25), 0 0 0 3px rgba(255,255,255,0.08)' : '0 0 0 1px rgba(255,255,255,0.1)'
      }
    },
    segmentTitle(idx, stage) {
      const name = this.stageNames[idx]
      return `${name}: ${this.formatStage(stage)}${this.unit ? ' ' + this.unit : ''}`
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
