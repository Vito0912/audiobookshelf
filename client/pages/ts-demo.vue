<template>
  <div class="page" :class="streamLibraryItem ? 'streaming' : ''">
    <div class="w-full max-w-4xl mx-auto px-4 py-8">
      <div class="bg-primary border border-gray-600 rounded-lg p-6">
        <h1 class="text-2xl font-bold mb-4 text-white">
          🚀 TypeScript Demo - Server Health Check
        </h1>

        <p class="text-gray-300 mb-6">
          This page demonstrates the TypeScript integration by calling a simple API endpoint
          that uses TypeScript-compiled utilities.
        </p>

        <!-- Loading State -->
        <div v-if="loading" class="text-center py-8">
          <div class="animate-pulse text-gray-400">Loading server info...</div>
        </div>

        <!-- Error State -->
        <div v-else-if="error" class="bg-error bg-opacity-20 border border-error rounded p-4">
          <p class="text-error font-semibold">❌ Error:</p>
          <p class="text-error">{{ error }}</p>
        </div>

        <!-- Success State -->
        <div v-else-if="serverInfo" class="space-y-4">
          <div class="bg-success bg-opacity-20 border border-success rounded p-4 mb-6">
            <p class="text-success font-semibold text-lg">
              {{ message }}
            </p>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <!-- Version Info -->
            <div class="bg-bg border border-gray-600 rounded p-4">
              <div class="text-gray-400 text-sm mb-1">Version</div>
              <div class="text-white text-xl font-bold">{{ serverInfo.version }}</div>
              <div class="text-gray-400 text-sm">Build {{ serverInfo.buildNumber }}</div>
            </div>

            <!-- TypeScript Status -->
            <div class="bg-bg border border-gray-600 rounded p-4">
              <div class="text-gray-400 text-sm mb-1">TypeScript</div>
              <div class="text-xl font-bold" :class="serverInfo.typescriptEnabled ? 'text-success' : 'text-error'">
                {{ serverInfo.typescriptEnabled ? '✅ Enabled' : '❌ Disabled' }}
              </div>
              <div class="text-gray-400 text-sm">Compiled & Working</div>
            </div>

            <!-- Uptime -->
            <div class="bg-bg border border-gray-600 rounded p-4">
              <div class="text-gray-400 text-sm mb-1">Server Uptime</div>
              <div class="text-white text-xl font-bold">{{ serverInfo.uptimeFormatted }}</div>
              <div class="text-gray-400 text-sm">{{ serverInfo.uptimeSeconds }} seconds</div>
            </div>

            <!-- Node.js Version -->
            <div class="bg-bg border border-gray-600 rounded p-4">
              <div class="text-gray-400 text-sm mb-1">Node.js</div>
              <div class="text-white text-xl font-bold">{{ serverInfo.nodeVersion }}</div>
              <div class="text-gray-400 text-sm">{{ serverInfo.platform }}</div>
            </div>

            <!-- Environment -->
            <div class="bg-bg border border-gray-600 rounded p-4 md:col-span-2">
              <div class="text-gray-400 text-sm mb-1">Environment</div>
              <div class="text-white text-xl font-bold capitalize">{{ serverInfo.environment }}</div>
            </div>
          </div>

          <!-- API Endpoint Info -->
          <div class="mt-6 bg-bg border border-gray-600 rounded p-4">
            <h3 class="text-white font-semibold mb-2">📡 API Endpoint</h3>
            <code class="text-sm text-gray-300 bg-black bg-opacity-50 px-2 py-1 rounded">
              GET {{ apiUrl }}
            </code>
            <p class="text-gray-400 text-sm mt-2">
              This endpoint is powered by TypeScript! Check
              <code class="text-xs bg-black bg-opacity-50 px-1 py-0.5 rounded">server/utils/serverInfo.ts</code>
            </p>
          </div>

          <!-- Refresh Button -->
          <div class="mt-6 text-center">
            <button
              @click="fetchServerInfo"
              class="bg-primary hover:bg-primary-hover text-white font-semibold py-2 px-6 rounded transition-colors"
            >
              🔄 Refresh
            </button>
          </div>
        </div>

        <!-- Back to Home -->
        <div class="mt-8 text-center">
          <nuxt-link
            to="/"
            class="text-gray-400 hover:text-white transition-colors"
          >
            ← Back to Home
          </nuxt-link>
        </div>
      </div>

      <!-- TypeScript Benefits Section -->
      <div class="mt-8 bg-primary border border-gray-600 rounded-lg p-6">
        <h2 class="text-xl font-bold mb-4 text-white">
          💡 Why TypeScript?
        </h2>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div>
            <div class="text-success font-semibold mb-1">✓ Type Safety</div>
            <div class="text-gray-400">
              Catch errors at compile time, not runtime
            </div>
          </div>

          <div>
            <div class="text-success font-semibold mb-1">✓ Better IDE Support</div>
            <div class="text-gray-400">
              Autocomplete, refactoring, inline docs
            </div>
          </div>

          <div>
            <div class="text-success font-semibold mb-1">✓ Self-Documenting</div>
            <div class="text-gray-400">
              Types serve as inline documentation
            </div>
          </div>
        </div>

        <div class="mt-4 text-gray-400 text-sm">
          <p>
            This page demonstrates a simple TypeScript utility
            (<code class="text-xs bg-black bg-opacity-50 px-1 py-0.5 rounded">server/utils/serverInfo.ts</code>)
            being used in an API endpoint and displayed on the frontend.
          </p>
          <p class="mt-2">
            The OIDC authentication system (<code class="text-xs bg-black bg-opacity-50 px-1 py-0.5 rounded">server/auth/OidcAuthStrategy.ts</code>)
            is a more complex example of TypeScript in action.
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  data() {
    return {
      loading: true,
      error: null,
      serverInfo: null,
      message: '',
      apiUrl: ''
    }
  },
  computed: {
    streamLibraryItem() {
      return this.$store.state.streamLibraryItem
    }
  },
  mounted() {
    this.fetchServerInfo()
  },
  methods: {
    async fetchServerInfo() {
      this.loading = true
      this.error = null

      try {
        // Construct the API URL
        this.apiUrl = `${window.location.origin}${this.$config.routerBasePath}/public/healthcheck`

        const response = await this.$axios.$get('/public/healthcheck')

        if (response.success) {
          this.serverInfo = response.serverInfo
          this.message = response.message
        } else {
          this.error = 'Failed to fetch server info'
        }
      } catch (err) {
        console.error('Error fetching server info:', err)
        this.error = err.message || 'Failed to connect to server'
      } finally {
        this.loading = false
      }
    }
  }
}
</script>

<style scoped>
.animate-pulse {
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}
</style>
