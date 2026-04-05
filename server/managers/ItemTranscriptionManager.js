const Path = require('path')
const crypto = require('crypto')
const nodeFs = require('fs')
const fs = require('../libs/fsExtra')
const { ElevenLabsClient } = require('@elevenlabs/elevenlabs-js')

const Logger = require('../Logger')
const Database = require('../Database')
const SocketAuthority = require('../SocketAuthority')
const Task = require('../objects/Task')
const TaskManager = require('./TaskManager')
const LibraryFile = require('../objects/files/LibraryFile')
const Ffmpeg = require('../libs/fluentFfmpeg')
const { filePathToPOSIX } = require('../utils/fileUtils')
const { buildWebVtt } = require('../utils/transcription/vttBuilder')

const TRANSCRIPTION_MODEL_ID = 'scribe_v2'
const MAX_CHUNK_DURATION_SECONDS = 8 * 60 * 60
const FULL_TRACK_EPSILON_SECONDS = 0.001

class ItemTranscriptionManager {
  constructor() {
    this.itemsCacheDir = Path.join(global.MetadataPath, 'cache/items')
    this.MAX_CONCURRENT_TASKS = 1

    /** @type {Task[]} */
    this.tasksRunning = []
    /** @type {Task[]} */
    this.tasksQueued = []

    /** @type {Map<string, {apiKey: string}>} */
    this.taskSecrets = new Map()
  }

  /**
   * @param {string} libraryItemId
   * @returns {boolean}
   */
  getIsLibraryItemQueuedOrProcessing(libraryItemId) {
    return this.tasksRunning.some((task) => task.data.libraryItemId === libraryItemId) || this.tasksQueued.some((task) => task.data.libraryItemId === libraryItemId)
  }

  /**
   * @param {string} userId
   * @param {import('../models/LibraryItem')} libraryItem
   * @param {{apiKey: string, languageCode?: string|null, diarize?: boolean, tagAudioEvents?: boolean}} options
   */
  startTranscription(userId, libraryItem, options) {
    const normalizedOptions = this.normalizeOptions(options)

    const task = new Task()
    task.setData(
      'transcribe-audio',
      {
        text: 'Transcribing Audio',
        key: 'MessageTaskTranscribingAudio'
      },
      {
        text: `Transcribing audiobook "${libraryItem.media.title}" and generating subtitles.`,
        key: 'MessageTaskTranscribingAudioDescription',
        subs: [libraryItem.media.title]
      },
      true,
      {
        libraryItemId: libraryItem.id,
        userId,
        languageCode: normalizedOptions.languageCode,
        diarize: normalizedOptions.diarize,
        tagAudioEvents: normalizedOptions.tagAudioEvents
      }
    )

    this.taskSecrets.set(task.id, {
      apiKey: normalizedOptions.apiKey
    })

    if (this.tasksRunning.length >= this.MAX_CONCURRENT_TASKS) {
      Logger.info(`[ItemTranscriptionManager] Queueing transcription task for "${libraryItem.media.title}"`)
      this.tasksQueued.push(task)
      return
    }

    this.runTask(task)
  }

  /**
   * @param {Task} task
   */
  async runTask(task) {
    this.tasksRunning.push(task)
    TaskManager.addTask(task)

    let generatedSubtitle = null

    try {
      const taskSecret = this.taskSecrets.get(task.id)
      if (!taskSecret?.apiKey) {
        throw new Error('Missing transcription API key for task')
      }

      generatedSubtitle = await this.executeTranscriptionTask(task, taskSecret.apiKey)
      task.setFinished({
        text: `Transcription complete: "${generatedSubtitle.filename}"`,
        key: 'MessageTaskTranscriptionComplete',
        subs: [generatedSubtitle.filename]
      })
    } catch (error) {
      Logger.error(`[ItemTranscriptionManager] Transcription task failed (${task.id})`, error)
      task.setFailed({
        text: this.getErrorMessage(error),
        key: 'MessageTaskTranscriptionFailed'
      })
    } finally {
      await this.handleTaskFinished(task)
    }
  }

  /**
   * @param {Task} task
   * @param {string} apiKey
   */
  async executeTranscriptionTask(task, apiKey) {
    const libraryItem = await Database.libraryItemModel.getExpandedById(task.data.libraryItemId)
    if (!libraryItem?.media) {
      throw new Error('Library item not found')
    }

    if (libraryItem.isMissing || libraryItem.isInvalid || !libraryItem.isBook || !libraryItem.media.includedAudioFiles?.length) {
      throw new Error('Invalid library item for transcription')
    }

    const options = {
      languageCode: task.data.languageCode || null,
      diarize: !!task.data.diarize,
      tagAudioEvents: !!task.data.tagAudioEvents
    }

    const cacheDir = Path.join(this.itemsCacheDir, libraryItem.id, 'transcription')
    await fs.ensureDir(cacheDir)
    await fs.ensureDir(Path.join(cacheDir, 'chunks'))

    const cacheKey = this.getCacheKey(options)
    const cacheFilePath = Path.join(cacheDir, `transcription-${cacheKey}.json`)
    const cacheData = await this.loadCache(cacheFilePath, {
      version: 1,
      modelId: TRANSCRIPTION_MODEL_ID,
      libraryItemId: libraryItem.id,
      options,
      files: {},
      chunks: {},
      createdAt: Date.now(),
      updatedAt: Date.now()
    })

    const chunks = this.buildChunksFromAudioFiles(libraryItem.media.includedAudioFiles)
    if (!chunks.length) {
      throw new Error('No audio chunks were generated from this audiobook')
    }

    const elevenlabs = new ElevenLabsClient({ apiKey })

    const totalDuration = chunks.reduce((sum, chunk) => sum + chunk.duration, 0)
    let completedDuration = 0

    /** @type {Array<{chunk: ReturnType<ItemTranscriptionManager['buildChunksFromAudioFiles']>[number], transcript: {languageCode: string|null, text: string, words: Array<{text: string, start: number, end: number, type: string, speakerId: string|null}>}}>} */
    const chunkTranscripts = []

    let activeTrackIndex = -1

    for (const chunk of chunks) {
      if (activeTrackIndex !== chunk.trackIndex) {
        if (activeTrackIndex !== -1) {
          const previousTrack = chunks.find((existingChunk) => existingChunk.trackIndex === activeTrackIndex)
          if (previousTrack?.ino) {
            SocketAuthority.adminEmitter('track_finished', {
              libraryItemId: libraryItem.id,
              ino: previousTrack.ino
            })
          }
        }

        activeTrackIndex = chunk.trackIndex
        if (chunk.ino) {
          SocketAuthority.adminEmitter('track_started', {
            libraryItemId: libraryItem.id,
            ino: chunk.ino
          })
        }
      }

      const trackHash = await this.getTrackHash(chunk.trackPath, cacheData, cacheFilePath)
      const chunkHash = this.getChunkHash(trackHash, chunk.startInTrack, chunk.duration)

      /** @type {null | {languageCode: string|null, text: string, words: Array<{text: string, start: number, end: number, type: string, speakerId: string|null}>}} */
      let transcript = cacheData.chunks?.[chunkHash]?.transcript || null

      if (!transcript?.words?.length) {
        const uploadInfo = await this.getUploadSourceForChunk(chunk, chunkHash, cacheDir)
        const response = await elevenlabs.speechToText.convert(
          {
            enableLogging: true,
            modelId: TRANSCRIPTION_MODEL_ID,
            file: {
              path: uploadInfo.uploadPath
            },
            languageCode: options.languageCode || undefined,
            diarize: options.diarize,
            tagAudioEvents: options.tagAudioEvents,
            timestampsGranularity: 'word'
          },
          {
            timeoutInSeconds: 7200
          }
        )

        transcript = this.normalizeTranscriptionResponse(response)

        cacheData.chunks[chunkHash] = {
          chunkHash,
          trackPath: filePathToPOSIX(chunk.trackPath),
          startInTrack: chunk.startInTrack,
          duration: chunk.duration,
          timelineOffset: chunk.timelineOffset,
          createdAt: Date.now(),
          transcript
        }
        cacheData.updatedAt = Date.now()
        await this.saveCache(cacheFilePath, cacheData)
      }

      chunkTranscripts.push({ chunk, transcript })

      completedDuration += chunk.duration
      const progress = totalDuration > 0 ? (completedDuration / totalDuration) * 100 : 100
      SocketAuthority.adminEmitter('task_progress', {
        libraryItemId: libraryItem.id,
        progress: Math.max(0, Math.min(100, progress))
      })
    }

    if (activeTrackIndex !== -1) {
      const previousTrack = chunks.find((existingChunk) => existingChunk.trackIndex === activeTrackIndex)
      if (previousTrack?.ino) {
        SocketAuthority.adminEmitter('track_finished', {
          libraryItemId: libraryItem.id,
          ino: previousTrack.ino
        })
      }
    }

    const timelineWords = this.buildTimelineWords(chunkTranscripts, options.tagAudioEvents)
    if (!timelineWords.length) {
      throw new Error('No transcribed words were produced for this audiobook')
    }

    const webVtt = buildWebVtt(timelineWords, {
      diarize: options.diarize,
      compactTimestamps: true
    })

    const subtitleFile = this.getSubtitleFileDetails(libraryItem, options.languageCode)
    await fs.writeFile(subtitleFile.path, webVtt, 'utf8')

    await this.attachSubtitleFileToLibraryItem(libraryItem, subtitleFile)

    cacheData.lastGeneratedSubtitle = {
      path: filePathToPOSIX(subtitleFile.path),
      relPath: subtitleFile.relPath,
      filename: subtitleFile.filename,
      generatedAt: Date.now()
    }
    cacheData.updatedAt = Date.now()
    await this.saveCache(cacheFilePath, cacheData)

    SocketAuthority.adminEmitter('task_progress', {
      libraryItemId: libraryItem.id,
      progress: 100
    })

    return subtitleFile
  }

  /**
   * @param {import('../models/Book')['includedAudioFiles']} audioFiles
   */
  buildChunksFromAudioFiles(audioFiles) {
    const chunks = []

    let timelineOffset = 0
    audioFiles.forEach((audioFile, trackIndex) => {
      const trackDuration = Number(audioFile.duration || 0)
      const safeTrackDuration = Number.isFinite(trackDuration) && trackDuration > 0 ? trackDuration : 0

      if (safeTrackDuration <= 0) {
        chunks.push({
          trackIndex,
          ino: audioFile.ino,
          trackPath: audioFile.metadata.path,
          trackDuration: 0,
          startInTrack: 0,
          duration: MAX_CHUNK_DURATION_SECONDS,
          timelineOffset
        })
        timelineOffset += MAX_CHUNK_DURATION_SECONDS
        return
      }

      let startInTrack = 0
      while (startInTrack < safeTrackDuration - FULL_TRACK_EPSILON_SECONDS) {
        const chunkDuration = Math.min(MAX_CHUNK_DURATION_SECONDS, safeTrackDuration - startInTrack)
        chunks.push({
          trackIndex,
          ino: audioFile.ino,
          trackPath: audioFile.metadata.path,
          trackDuration: safeTrackDuration,
          startInTrack,
          duration: chunkDuration,
          timelineOffset: timelineOffset + startInTrack
        })
        startInTrack += chunkDuration
      }

      timelineOffset += safeTrackDuration
    })

    return chunks
  }

  /**
   * @param {Array<{chunk: ReturnType<ItemTranscriptionManager['buildChunksFromAudioFiles']>[number], transcript: {words: Array<{text: string, start: number, end: number, type: string, speakerId: string|null}>}}>} chunkTranscripts
   * @param {boolean} includeAudioEvents
   */
  buildTimelineWords(chunkTranscripts, includeAudioEvents) {
    const timelineWords = []

    chunkTranscripts.forEach(({ chunk, transcript }) => {
      ;(transcript.words || []).forEach((word) => {
        if (!includeAudioEvents && word.type === 'audio_event') {
          return
        }

        if (!Number.isFinite(word.start) || !Number.isFinite(word.end) || word.end <= word.start) {
          return
        }

        timelineWords.push({
          text: word.text,
          start: word.start + chunk.timelineOffset,
          end: word.end + chunk.timelineOffset,
          type: word.type,
          speakerId: word.speakerId || null
        })
      })
    })

    return timelineWords.sort((a, b) => {
      if (a.start !== b.start) return a.start - b.start
      return a.end - b.end
    })
  }

  /**
   * @param {any} response
   */
  normalizeTranscriptionResponse(response) {
    if (!response || typeof response !== 'object') {
      throw new Error('Invalid transcription response')
    }

    if (Array.isArray(response.transcripts)) {
      const words = []
      const texts = []
      response.transcripts.forEach((transcript) => {
        if (transcript?.text) texts.push(transcript.text)
        ;(transcript?.words || []).forEach((word) => words.push(word))
      })

      return {
        languageCode: response.transcripts[0]?.languageCode || null,
        text: texts.join(' '),
        words: this.normalizeWords(words)
      }
    }

    if (Array.isArray(response.words)) {
      return {
        languageCode: response.languageCode || null,
        text: response.text || '',
        words: this.normalizeWords(response.words)
      }
    }

    if (response.requestId) {
      throw new Error('Transcription API returned a webhook acknowledgement instead of a transcript')
    }

    throw new Error('Transcription API returned an unsupported response shape')
  }

  /**
   * @param {any[]} words
   */
  normalizeWords(words) {
    return (words || [])
      .map((word) => ({
        text: typeof word?.text === 'string' ? word.text : '',
        start: Number(word?.start),
        end: Number(word?.end),
        type: typeof word?.type === 'string' ? word.type : 'word',
        speakerId: word?.speakerId ? String(word.speakerId) : null
      }))
      .filter((word) => !!word.text)
  }

  /**
   * @param {ReturnType<ItemTranscriptionManager['buildChunksFromAudioFiles']>[number]} chunk
   * @param {string} chunkHash
   * @param {string} cacheDir
   */
  async getUploadSourceForChunk(chunk, chunkHash, cacheDir) {
    const isWholeTrack = chunk.startInTrack <= FULL_TRACK_EPSILON_SECONDS && (chunk.trackDuration <= 0 || chunk.duration >= chunk.trackDuration - FULL_TRACK_EPSILON_SECONDS)

    if (isWholeTrack) {
      return {
        uploadPath: chunk.trackPath,
        isTemp: false
      }
    }

    const chunksDir = Path.join(cacheDir, 'chunks')
    await fs.ensureDir(chunksDir)

    const sourceExt = Path.extname(chunk.trackPath) || '.m4a'
    const copyChunkPath = Path.join(chunksDir, `${chunkHash}${sourceExt}`)

    if (await fs.pathExists(copyChunkPath)) {
      return {
        uploadPath: copyChunkPath,
        isTemp: true
      }
    }

    try {
      await this.extractChunkAudio(chunk.trackPath, chunk.startInTrack, chunk.duration, copyChunkPath, true)
      return {
        uploadPath: copyChunkPath,
        isTemp: true
      }
    } catch (error) {
      Logger.warn(`[ItemTranscriptionManager] Copy-based chunk extraction failed for "${chunk.trackPath}", retrying with AAC encode`, error.message)
    }

    const transcodedChunkPath = Path.join(chunksDir, `${chunkHash}.m4a`)
    if (!(await fs.pathExists(transcodedChunkPath))) {
      await this.extractChunkAudio(chunk.trackPath, chunk.startInTrack, chunk.duration, transcodedChunkPath, false)
    }

    return {
      uploadPath: transcodedChunkPath,
      isTemp: true
    }
  }

  /**
   * @param {string} sourcePath
   * @param {number} startInTrack
   * @param {number} duration
   * @param {string} outputPath
   * @param {boolean} copyCodec
   */
  extractChunkAudio(sourcePath, startInTrack, duration, outputPath, copyCodec) {
    return new Promise(async (resolve, reject) => {
      if (await fs.pathExists(outputPath)) {
        await fs.remove(outputPath)
      }

      const ffmpeg = Ffmpeg()
      ffmpeg.input(sourcePath)
      if (startInTrack > 0) {
        ffmpeg.seekInput(startInTrack)
      }
      ffmpeg.duration(duration)

      if (copyCodec) {
        ffmpeg.outputOptions(['-vn', '-acodec copy'])
      } else {
        ffmpeg.outputOptions(['-vn', '-ac', '1', '-ar', '16000', '-c:a', 'aac', '-b:a', '64k'])
      }

      ffmpeg
        .output(outputPath)
        .on('start', (commandLine) => {
          Logger.debug(`[ItemTranscriptionManager] Extracting chunk with command: ${commandLine}`)
        })
        .on('error', (error, stdout, stderr) => {
          Logger.error(`[ItemTranscriptionManager] Failed to extract chunk "${outputPath}"`, error)
          Logger.debug(`[ItemTranscriptionManager] Chunk extraction stdout: ${stdout}`)
          Logger.debug(`[ItemTranscriptionManager] Chunk extraction stderr: ${stderr}`)
          reject(error)
        })
        .on('end', () => {
          resolve()
        })
        .run()
    })
  }

  /**
   * @param {string} trackPath
   * @param {any} cacheData
   * @param {string} cacheFilePath
   */
  async getTrackHash(trackPath, cacheData, cacheFilePath) {
    const normalizedPath = filePathToPOSIX(trackPath)
    const trackStats = await fs.stat(trackPath)

    cacheData.files = cacheData.files || {}
    const cachedFileHash = cacheData.files[normalizedPath]
    if (cachedFileHash && cachedFileHash.size === trackStats.size && cachedFileHash.mtimeMs === trackStats.mtimeMs && cachedFileHash.hash) {
      return cachedFileHash.hash
    }

    const hash = await this.hashFile(trackPath)
    cacheData.files[normalizedPath] = {
      hash,
      size: trackStats.size,
      mtimeMs: trackStats.mtimeMs,
      updatedAt: Date.now()
    }
    cacheData.updatedAt = Date.now()
    await this.saveCache(cacheFilePath, cacheData)

    return hash
  }

  /**
   * @param {string} filePath
   * @returns {Promise<string>}
   */
  hashFile(filePath) {
    return new Promise((resolve, reject) => {
      const sha256 = crypto.createHash('sha256')
      const readStream = nodeFs.createReadStream(filePath)

      readStream.on('data', (chunk) => sha256.update(chunk))
      readStream.on('error', reject)
      readStream.on('end', () => resolve(sha256.digest('hex')))
    })
  }

  /**
   * @param {import('../models/LibraryItem')} libraryItem
   * @param {string|null} languageCode
   */
  getSubtitleFileDetails(libraryItem, languageCode) {
    const languageSuffix = languageCode || 'auto'
    const itemBaseName = libraryItem.isFile ? Path.basename(libraryItem.path, Path.extname(libraryItem.path)) : Path.basename(libraryItem.path)
    const safeBaseName = itemBaseName.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim() || 'transcription'

    const directoryPath = libraryItem.isFile ? Path.dirname(libraryItem.path) : libraryItem.path
    const filename = `${safeBaseName}.transcription.${languageSuffix}.vtt`
    const filePath = Path.join(directoryPath, filename)
    const relPath = libraryItem.isFile ? filename : Path.relative(libraryItem.path, filePath)

    return {
      filename,
      path: filePath,
      relPath: filePathToPOSIX(relPath)
    }
  }

  /**
   * @param {import('../models/LibraryItem')} libraryItem
   * @param {{filename: string, path: string, relPath: string}} subtitleFile
   */
  async attachSubtitleFileToLibraryItem(libraryItem, subtitleFile) {
    const subtitleLibraryFile = new LibraryFile()
    await subtitleLibraryFile.setDataFromPath(subtitleFile.path, subtitleFile.relPath)

    const subtitleLibraryFileJson = subtitleLibraryFile.toJSON()
    const subtitlePath = filePathToPOSIX(subtitleFile.path)

    let hasReplacedExisting = false
    libraryItem.libraryFiles = (libraryItem.libraryFiles || []).map((libraryFile) => {
      if (libraryFile?.metadata?.path === subtitlePath || libraryFile?.metadata?.relPath === subtitleFile.relPath) {
        hasReplacedExisting = true
        return subtitleLibraryFileJson
      }
      return libraryFile
    })

    if (!hasReplacedExisting) {
      libraryItem.libraryFiles.push(subtitleLibraryFileJson)
    }

    libraryItem.changed('libraryFiles', true)
    await libraryItem.save()

    SocketAuthority.libraryItemEmitter('item_updated', libraryItem)
  }

  /**
   * @param {{modelId: string, languageCode: string|null, diarize: boolean, tagAudioEvents: boolean}} options
   */
  getCacheKey(options) {
    return this.createStableHash(JSON.stringify(options))
  }

  /**
   * @param {string} trackHash
   * @param {number} startInTrack
   * @param {number} duration
   */
  getChunkHash(trackHash, startInTrack, duration) {
    return this.createStableHash(`${trackHash}:${startInTrack.toFixed(3)}:${duration.toFixed(3)}`)
  }

  /**
   * @param {string} value
   */
  createStableHash(value) {
    return crypto.createHash('sha256').update(value).digest('hex')
  }

  /**
   * @param {string} cacheFilePath
   * @param {any} defaultValue
   */
  async loadCache(cacheFilePath, defaultValue) {
    if (!(await fs.pathExists(cacheFilePath))) {
      return {
        ...defaultValue,
        files: { ...defaultValue.files },
        chunks: { ...defaultValue.chunks }
      }
    }

    try {
      const raw = await fs.readFile(cacheFilePath, 'utf8')
      const parsed = JSON.parse(raw)
      return {
        ...defaultValue,
        ...parsed,
        files: parsed.files || {},
        chunks: parsed.chunks || {}
      }
    } catch (error) {
      Logger.error(`[ItemTranscriptionManager] Failed to parse transcription cache "${cacheFilePath}". Rebuilding cache.`, error)
      return {
        ...defaultValue,
        files: { ...defaultValue.files },
        chunks: { ...defaultValue.chunks }
      }
    }
  }

  /**
   * @param {string} cacheFilePath
   * @param {any} cacheData
   */
  async saveCache(cacheFilePath, cacheData) {
    await fs.writeFile(cacheFilePath, JSON.stringify(cacheData, null, 2), 'utf8')
  }

  /**
   * @param {{apiKey: string, languageCode?: string|null, diarize?: boolean, tagAudioEvents?: boolean}} options
   */
  normalizeOptions(options) {
    return {
      apiKey: String(options.apiKey || '').trim(),
      languageCode: options.languageCode ? String(options.languageCode).trim().toLowerCase() : null,
      diarize: !!options.diarize,
      tagAudioEvents: !!options.tagAudioEvents
    }
  }

  /**
   * @param {Task} task
   */
  async handleTaskFinished(task) {
    this.taskSecrets.delete(task.id)
    this.tasksRunning = this.tasksRunning.filter((runningTask) => runningTask.id !== task.id)

    TaskManager.taskFinished(task)

    if (this.tasksRunning.length < this.MAX_CONCURRENT_TASKS && this.tasksQueued.length) {
      const queuedTask = this.tasksQueued.shift()
      this.runTask(queuedTask)
    }
  }

  /**
   * @param {unknown} error
   */
  getErrorMessage(error) {
    if (error && typeof error === 'object' && 'message' in error) {
      return String(error.message)
    }
    return 'Transcription failed'
  }
}

module.exports = ItemTranscriptionManager
