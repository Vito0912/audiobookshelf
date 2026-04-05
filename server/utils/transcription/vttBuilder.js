function normalizeTimeToMilliseconds(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return 0
  return Math.round(seconds * 1000)
}

function formatVttTimestamp(seconds, compact = true) {
  const totalMilliseconds = normalizeTimeToMilliseconds(seconds)
  const hours = Math.floor(totalMilliseconds / 3600000)
  const minutes = Math.floor((totalMilliseconds % 3600000) / 60000)
  const totalMinutes = Math.floor(totalMilliseconds / 60000)
  const secs = Math.floor((totalMilliseconds % 60000) / 1000)
  const millis = totalMilliseconds % 1000

  if (compact && hours === 0) {
    return `${String(totalMinutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(millis).padStart(3, '0')}`
  }

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(millis).padStart(3, '0')}`
}

function escapeCueText(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;')
}

function shouldSkipLeadingSpace(tokenText) {
  return /^[,.;:!?%\]\)}]/.test(tokenText) || /^["'’]/.test(tokenText)
}

function normalizeWordText(word) {
  let text = (word.text || '').replace(/\s+/g, ' ').trim()
  if (!text) return ''

  if (word.type === 'audio_event' && !/^\(.*\)$/.test(text)) {
    text = `(${text})`
  }

  return text
}

function isStrongSentenceBoundary(wordText) {
  return /[.!?]["'”’)]*$/.test(wordText)
}

function maybePushCue(cues, cueWords, options, speakerIdsToLabels) {
  if (!cueWords.length) return

  const cueStart = cueWords[0].start
  const cueEnd = Math.max(cueWords[cueWords.length - 1].end, cueStart + 0.05)
  if (!Number.isFinite(cueStart) || !Number.isFinite(cueEnd) || cueEnd <= cueStart) {
    return
  }

  const firstSpeakerId = cueWords.find((word) => word.speakerId)?.speakerId
  let cueText = ''

  if (options.diarize && firstSpeakerId) {
    if (!speakerIdsToLabels[firstSpeakerId]) {
      speakerIdsToLabels[firstSpeakerId] = Object.keys(speakerIdsToLabels).length + 1
    }
    cueText = `<v ${speakerIdsToLabels[firstSpeakerId]}>`
  }

  cueWords.forEach((word) => {
    const wordText = normalizeWordText(word)
    if (!wordText) return

    const clampedStart = Math.max(cueStart, Math.min(word.start, cueEnd - 0.001))
    const taggedWord = `<${formatVttTimestamp(clampedStart, options.compactTimestamps)}>${escapeCueText(wordText)}`

    if (cueText && !shouldSkipLeadingSpace(wordText)) {
      cueText += ' '
    }

    cueText += taggedWord
  })

  if (!cueText.trim()) return

  cues.push({
    start: cueStart,
    end: cueEnd,
    text: cueText
  })
}

function shouldSplitCue(cueWords, nextWord, options) {
  if (!cueWords.length) return false

  const firstWord = cueWords[0]
  const lastWord = cueWords[cueWords.length - 1]

  if (options.diarize && lastWord.speakerId && nextWord.speakerId && lastWord.speakerId !== nextWord.speakerId) {
    return true
  }

  const gap = nextWord.start - lastWord.end
  if (gap > options.breakOnGapSeconds) {
    return true
  }

  const cueDuration = lastWord.end - firstWord.start
  if (cueDuration >= options.maxCueDurationSeconds) {
    return true
  }

  if (cueWords.length >= options.maxWordsPerCue) {
    return true
  }

  const currentChars = cueWords.reduce((sum, word) => sum + normalizeWordText(word).length + 1, 0)
  if (currentChars + normalizeWordText(nextWord).length > options.maxCharsPerCue) {
    return true
  }

  const lastWordText = normalizeWordText(lastWord)
  if (lastWordText && isStrongSentenceBoundary(lastWordText) && cueDuration >= options.minCueDurationSeconds && cueWords.length >= 4) {
    return true
  }

  return false
}

/**
 * @typedef BuildWebVttWord
 * @property {string} text
 * @property {number} start
 * @property {number} end
 * @property {'word' | 'audio_event' | string} [type]
 * @property {string} [speakerId]
 */

/**
 * @param {BuildWebVttWord[]} words
 * @param {{
 *  diarize?: boolean,
 *  compactTimestamps?: boolean,
 *  maxCueDurationSeconds?: number,
 *  minCueDurationSeconds?: number,
 *  breakOnGapSeconds?: number,
 *  maxWordsPerCue?: number,
 *  maxCharsPerCue?: number
 * }} [inputOptions]
 */
function buildWebVtt(words, inputOptions = {}) {
  const options = {
    diarize: !!inputOptions.diarize,
    compactTimestamps: inputOptions.compactTimestamps !== false,
    maxCueDurationSeconds: Number.isFinite(inputOptions.maxCueDurationSeconds) ? Number(inputOptions.maxCueDurationSeconds) : 6,
    minCueDurationSeconds: Number.isFinite(inputOptions.minCueDurationSeconds) ? Number(inputOptions.minCueDurationSeconds) : 1,
    breakOnGapSeconds: Number.isFinite(inputOptions.breakOnGapSeconds) ? Number(inputOptions.breakOnGapSeconds) : 1.25,
    maxWordsPerCue: Number.isFinite(inputOptions.maxWordsPerCue) ? Number(inputOptions.maxWordsPerCue) : 18,
    maxCharsPerCue: Number.isFinite(inputOptions.maxCharsPerCue) ? Number(inputOptions.maxCharsPerCue) : 90
  }

  const normalizedWords = (words || [])
    .filter((word) => Number.isFinite(word?.start) && Number.isFinite(word?.end) && word.end > word.start)
    .map((word) => ({
      text: word.text || '',
      start: Number(word.start),
      end: Number(word.end),
      type: word.type || 'word',
      speakerId: word.speakerId || null
    }))
    .sort((a, b) => {
      if (a.start !== b.start) return a.start - b.start
      return a.end - b.end
    })

  const cues = []
  const speakerIdsToLabels = {}
  let currentCueWords = []

  normalizedWords.forEach((word) => {
    if (!normalizeWordText(word)) {
      return
    }

    if (!currentCueWords.length) {
      currentCueWords.push(word)
      return
    }

    if (shouldSplitCue(currentCueWords, word, options)) {
      maybePushCue(cues, currentCueWords, options, speakerIdsToLabels)
      currentCueWords = [word]
      return
    }

    currentCueWords.push(word)
  })

  maybePushCue(cues, currentCueWords, options, speakerIdsToLabels)

  let webVtt = 'WEBVTT\n\n'
  cues.forEach((cue) => {
    webVtt += `${formatVttTimestamp(cue.start, options.compactTimestamps)} --> ${formatVttTimestamp(cue.end, options.compactTimestamps)}\n`
    webVtt += `${cue.text}\n\n`
  })

  return webVtt
}

module.exports = {
  buildWebVtt,
  formatVttTimestamp
}
