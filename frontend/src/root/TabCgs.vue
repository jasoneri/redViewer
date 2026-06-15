<template>
  <div class="cgs-tab">
    <div class="cgs-toolbar">
      <div>
        <el-text tag="b">CGS BookInfo 搜索</el-text>
        <div class="cgs-subtitle">
          <el-tag :type="statusMeta.type" size="small" effect="plain">
            {{ statusMeta.label }}
          </el-tag>
          <el-text v-if="statusData.reason" type="info" size="small">
            {{ statusData.reason }}
          </el-text>
          <el-text v-if="sessionId" type="info" size="small">
            会话 {{ sessionId }}
          </el-text>
        </div>
      </div>
      <el-button :icon="Refresh" :loading="loading" @click="refreshAll">
        刷新
      </el-button>
    </div>

    <el-alert
      v-if="panelMessage"
      class="cgs-alert"
      :title="panelMessage"
      :type="panelMessageType"
      :closable="false"
      show-icon
    />

    <section class="cgs-search-panel">
      <el-form class="cgs-search-form" label-position="top" @submit.prevent>
        <el-form-item label="站点">
          <el-select
            v-model="searchForm.site"
            :loading="sitesLoading"
            placeholder="选择站点"
            filterable
            style="width: 100%"
          >
            <el-option
              v-for="site in siteOptions"
              :key="site.value"
              :label="site.label"
              :value="site.value"
            >
              <span>{{ site.label }}</span>
              <el-text v-if="site.detail" class="cgs-option-detail" type="info" size="small">
                {{ site.detail }}
              </el-text>
            </el-option>
          </el-select>
        </el-form-item>

        <el-form-item label="搜索词">
          <el-input
            v-model="searchForm.keyword"
            placeholder="输入关键词"
            clearable
            @keyup.enter="runSearch(1)"
          />
        </el-form-item>

        <el-form-item label="页码">
          <el-input-number v-model="targetPage" :min="1" :controls="false" />
        </el-form-item>

        <el-form-item class="cgs-search-actions">
          <el-button
            type="primary"
            :icon="Search"
            :loading="searching"
            :disabled="!canSearch"
            @click="runSearch(targetPage)"
          >
            搜索
          </el-button>
          <el-button :loading="sitesLoading" @click="fetchSites">
            刷新站点
          </el-button>
        </el-form-item>
      </el-form>
    </section>

    <section class="cgs-results">
      <div class="cgs-results-head">
        <div>
          <el-text tag="b">搜索结果</el-text>
          <el-text class="cgs-results-meta" type="info" size="small">
            第 {{ currentPage }} 页，{{ books.length }} 项，已选 {{ selectedKeys.length }} 项
          </el-text>
        </div>
        <div class="cgs-result-actions">
          <el-button
            :icon="ArrowLeft"
            :disabled="!canPagePrev"
            :loading="paging"
            @click="goPage(currentPage - 1)"
          >
            上一页
          </el-button>
          <el-button
            :icon="ArrowRight"
            :disabled="!canPageNext"
            :loading="paging"
            @click="goPage(currentPage + 1)"
          >
            下一页
          </el-button>
          <el-button
            type="primary"
            :icon="Download"
            :loading="submitting"
            :disabled="!canSubmit"
            @click="submitSelected"
          >
            提交已选
          </el-button>
        </div>
      </div>

      <el-empty
        v-if="!searching && hasSearched && !books.length"
        description="没有搜索结果"
        :image-size="64"
      />

      <el-table
        v-else
        ref="bookTableRef"
        v-loading="searching"
        :data="books"
        row-key="__rowKey"
        size="small"
        empty-text="请输入站点和搜索词后搜索"
        @selection-change="onSelectionChange"
      >
        <el-table-column type="selection" width="44" :selectable="isSelectableBook" />
        <el-table-column label="BookInfo" min-width="320">
          <template #default="{ row }">
            <div class="cgs-book">
              <img
                v-if="coverUrl(row)"
                class="cgs-cover"
                :src="coverUrl(row)"
                :alt="bookTitle(row)"
                loading="lazy"
              >
              <div class="cgs-book-main">
                <div class="cgs-book-title">
                  {{ bookTitle(row) }}
                  <el-tag v-if="row.supported === false" size="small" type="info" effect="plain">
                    不支持
                  </el-tag>
                </div>
                <div v-if="row.unsupported_reason" class="cgs-book-reason">
                  {{ row.unsupported_reason }}
                </div>
                <div v-if="bookMetaItems(row).length" class="cgs-book-meta">
                  <span v-for="item in bookMetaItems(row)" :key="item.label" class="cgs-book-meta-item">
                    <b>{{ item.label }}</b>
                    {{ item.value }}
                  </span>
                </div>
                <div class="cgs-book-tags">
                  <el-tag v-for="tag in bookTags(row)" :key="tag" size="small" effect="plain">
                    {{ tag }}
                  </el-tag>
                </div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="来源" width="170" show-overflow-tooltip>
          <template #default="{ row }">
            {{ sourceValue(row) || '-' }}
          </template>
        </el-table-column>
        <el-table-column label="idx" width="90" show-overflow-tooltip>
          <template #default="{ row }">
            {{ row.idx ?? '-' }}
          </template>
        </el-table-column>
        <el-table-column label="页数" width="90">
          <template #default="{ row }">
            {{ pagesValue(row) || '-' }}
          </template>
        </el-table-column>
        <el-table-column label="作者" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">
            <div class="cgs-author-cell">
              <img
                v-if="authorAvatarSrc(row)"
                class="cgs-author-avatar"
                :src="authorAvatarSrc(row)"
                :alt="`${artistValue(row) || '作者'} 头像`"
                loading="lazy"
              >
              <span v-else class="cgs-author-avatar cgs-author-avatar--fallback">
                {{ authorAvatarInitial(row) }}
              </span>
              <span class="cgs-author-name">{{ artistValue(row) || '-' }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="预览" width="90">
          <template #default="{ row }">
            <el-link
              v-if="previewUrl(row)"
              :href="previewUrl(row)"
              target="_blank"
              type="primary"
              :underline="false"
            >
              打开
            </el-link>
            <span v-else>-</span>
          </template>
        </el-table-column>
      </el-table>
    </section>

    <template v-if="currentJob || events.length || logs.length">
      <el-divider content-position="left">
        <el-text type="info" size="small">下载状态</el-text>
      </el-divider>

      <div class="cgs-job-line">
        <div>
          <el-text type="primary" tag="b">{{ activeStage }}</el-text>
          <div>
            <el-text type="info" size="small">{{ activeJobLabel }}</el-text>
          </div>
        </div>
        <el-icon v-if="isRunning" class="is-loading" :size="20"><Loading /></el-icon>
        <el-icon v-else-if="currentStatus === 'completed'" color="#67C23A" :size="20"><CircleCheckFilled /></el-icon>
        <el-icon v-else-if="currentStatus === 'failed'" color="#F56C6C" :size="20"><CircleCloseFilled /></el-icon>
      </div>

      <el-progress
        v-if="progressPercent !== null"
        class="cgs-progress"
        :percentage="progressPercent"
        :status="progressStatus"
      />

      <el-alert
        v-for="message in errorMessages"
        :key="message"
        class="cgs-alert"
        :title="message"
        type="error"
        :closable="false"
        show-icon
      />

      <div class="cgs-output-grid">
        <section>
          <div class="cgs-section-title">日志</div>
          <pre class="cgs-output">{{ logText || '暂无日志' }}</pre>
        </section>
        <section>
          <div class="cgs-section-title">事件</div>
          <el-table :data="eventRows" size="small" max-height="220" empty-text="暂无事件">
            <el-table-column prop="time" label="时间" width="120" show-overflow-tooltip />
            <el-table-column prop="stage" label="阶段" width="140" show-overflow-tooltip />
            <el-table-column prop="message" label="内容" show-overflow-tooltip />
          </el-table>
        </section>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import axios from 'axios'
import { ElMessage } from 'element-plus'
import {
  ArrowLeft,
  ArrowRight,
  CircleCheckFilled,
  CircleCloseFilled,
  Download,
  Loading,
  Refresh,
  Search
} from '@element-plus/icons-vue'
import { backend } from '@/static/store.js'
import { passThroughEncrypt } from '@/utils/crypto.js'

const POLL_INTERVAL = 2000
const AUTHOR_AVATAR_CACHE_KEY = 'cgsGithubAvatarCache:v1'
const AUTHOR_AVATAR_LIMIT = 60
const GITHUB_USERNAME_RE = /^[A-Za-z0-9-]{1,39}$/

const props = defineProps({
  storedSecret: { type: String, default: '' },
  authRequired: { type: Boolean, default: false }
})

const loading = ref(false)
const sitesLoading = ref(false)
const searching = ref(false)
const paging = ref(false)
const submitting = ref(false)
const panelError = ref('')
const statusData = ref({})
const eventData = ref({})
const pollTimer = ref(null)
const pollBusy = ref(false)
const rawSites = ref([])
const books = ref([])
const selectedRows = ref([])
const sessionId = ref('')
const currentPage = ref(1)
const targetPage = ref(1)
const hasSearched = ref(false)
const bookTableRef = ref(null)
const authorAvatarCache = ref(readAuthorAvatarCache())
const authorAvatarRequests = new Map()

const searchForm = reactive({
  site: null,
  keyword: ''
})

const statusLabels = {
  unconfigured: { label: '未配置', type: 'warning' },
  unavailable: { label: '不可用', type: 'danger' },
  idle: { label: '空闲', type: 'success' },
  starting: { label: '启动中', type: 'warning' },
  running: { label: '运行中', type: 'warning' },
  completed: { label: '已完成', type: 'success' },
  failed: { label: '失败', type: 'danger' }
}

const currentJob = computed(() => statusData.value.job || null)
const currentStatus = computed(() => currentJob.value?.status || statusData.value.status || 'idle')
const statusMeta = computed(() => statusLabels[currentStatus.value] || { label: currentStatus.value, type: 'info' })
const isRunning = computed(() => ['starting', 'running'].includes(currentStatus.value))
const events = computed(() => Array.isArray(eventData.value.events) ? eventData.value.events : [])
const logs = computed(() => Array.isArray(eventData.value.logs) ? eventData.value.logs : [])

const siteOptions = computed(() => rawSites.value.map((site, index) => {
  if (site && typeof site === 'object') {
    const value = Number(site.site_index ?? site.value ?? site.id ?? site.site ?? site.index ?? index)
    const label = String(site.spider_name ?? site.label ?? site.name ?? site.title ?? site.source ?? value)
    const detail = site.domain || site.url || site.description || ''
    return { value, label, detail }
  }
  return { value: index, label: String(site), detail: '' }
}))

const selectedKeys = computed(() => selectedRows.value.map(bookKey).filter(Boolean))
const canSearch = computed(() => {
  return searchForm.site !== null && searchForm.site !== undefined && searchForm.keyword.trim().length > 0 && !searching.value
})
const canSubmit = computed(() => selectedKeys.value.length > 0 && !!sessionId.value && !submitting.value)
const canPagePrev = computed(() => canSearch.value && currentPage.value > 1 && !paging.value)
const canPageNext = computed(() => canSearch.value && hasSearched.value && !paging.value)

const panelMessage = computed(() => {
  if (panelError.value) return panelError.value
  if (currentStatus.value === 'unconfigured') return statusData.value.reason || 'CGS 未配置'
  if (currentStatus.value === 'unavailable') return statusData.value.reason || 'CGS 当前不可用'
  return ''
})

const panelMessageType = computed(() => {
  if (currentStatus.value === 'unconfigured') return 'warning'
  return 'error'
})

const activeStage = computed(() => {
  return currentJob.value?.stage || latestEventValue(['stage', 'name', 'type']) || statusMeta.value.label
})

const activeJobLabel = computed(() => {
  const id = currentJob.value?.id || currentJob.value?.job_id || eventData.value.job_id
  return id ? `任务 ${id}` : '当前任务'
})

const progressPercent = computed(() => normalizeProgress(
  progressValue(currentJob.value?.progress) ??
  progressValue(latestEventValue(['percent', 'percentage', 'progress']))
))

const progressStatus = computed(() => {
  if (currentStatus.value === 'completed') return 'success'
  if (currentStatus.value === 'failed') return 'exception'
  return undefined
})

const errorMessages = computed(() => {
  const messages = []
  if (currentJob.value?.error) messages.push(formatValue(currentJob.value.error))
  events.value.forEach(event => {
    const level = String(event.level || event.severity || event.type || '').toLowerCase()
    if (event.error || level === 'error' || level === 'failed') {
      messages.push(formatValue(event.error || event.message || event.detail || event))
    }
  })
  return [...new Set(messages)].filter(Boolean)
})

const logText = computed(() => logs.value.map(formatValue).join('\n'))

const eventRows = computed(() => events.value.map(event => ({
  time: formatTime(event.time || event.timestamp || event.created_at),
  stage: formatValue(event.stage || event.name || event.type || event.status || '-'),
  message: formatValue(event.message || event.detail || event.error || event.result || event)
})))

const shouldFetchEvents = computed(() => {
  return currentJob.value ||
    eventData.value.job_id ||
    ['starting', 'running', 'completed', 'failed'].includes(currentStatus.value)
})

onMounted(async () => {
  await Promise.all([refreshAll(), fetchSites()])
})

onBeforeUnmount(() => {
  stopPolling()
})

watch(() => [searchForm.site, searchForm.keyword], () => {
  resetSearchSession()
})

watch(books, (list) => {
  void prefetchAuthorAvatars(list)
})

const refreshAll = async () => {
  await fetchStatus(true)
  if (shouldFetchEvents.value) {
    await fetchEvents(false)
  }
  syncPolling()
}

const fetchSites = async () => {
  sitesLoading.value = true
  try {
    const res = await axios.get(backend() + '/root/cgs/sites')
    rawSites.value = Array.isArray(res.data?.sites) ? res.data.sites : []
    if (searchForm.site === null && siteOptions.value.length) {
      searchForm.site = siteOptions.value[0].value
    }
  } catch (e) {
    panelError.value = errorText(e, '获取 CGS 站点失败')
    ElMessage.error(panelError.value)
  } finally {
    sitesLoading.value = false
  }
}

const runSearch = async (page = 1, submitBookKeys = []) => {
  if (!canSearch.value) {
    ElMessage.warning('请选择站点并输入搜索词')
    return
  }
  searching.value = true
  panelError.value = ''
  try {
    const requestConfig = submitBookKeys.length ? secretHeaders() : undefined
    if (requestConfig === null) return
    const res = await axios.post(
      backend() + '/root/cgs/search',
      searchBody(page, submitBookKeys),
      requestConfig
    )
    await applySearchResult(res.data, page)
    if (submitBookKeys.length) {
      ElMessage.success(`已提交 ${submitBookKeys.length} 项并加载第 ${page} 页`)
      startPolling()
      await refreshAll()
    }
  } catch (e) {
    panelError.value = errorText(e, 'CGS 搜索失败')
    ElMessage.error(panelError.value)
  } finally {
    searching.value = false
  }
}

const goPage = async (page) => {
  if (page < 1) return
  paging.value = true
  try {
    await runSearch(page, selectedKeys.value)
  } finally {
    paging.value = false
  }
}

const submitSelected = async () => {
  if (!canSubmit.value) {
    ElMessage.warning(sessionId.value ? '请选择可提交的 BookInfo' : '请先搜索并建立会话')
    return
  }
  const requestConfig = secretHeaders()
  if (requestConfig === null) return
  submitting.value = true
  panelError.value = ''
  try {
    const res = await axios.post(
      backend() + '/root/cgs/submit-books',
      { session_id: sessionId.value, book_keys: selectedKeys.value },
      requestConfig
    )
    if (res.data?.job) {
      statusData.value = {
        ...statusData.value,
        status: res.data.job.status || 'running',
        job: res.data.job
      }
    }
    ElMessage.success(`已提交 ${selectedKeys.value.length} 项`)
    clearSelection()
    await refreshAll()
    startPolling()
  } catch (e) {
    panelError.value = errorText(e, '提交 BookInfo 失败')
    ElMessage.error(panelError.value)
  } finally {
    submitting.value = false
  }
}

const searchBody = (page, submitBookKeys) => {
  const body = {
    site: Number(searchForm.site),
    keyword: searchForm.keyword.trim(),
    page: Number(page)
  }
  if (sessionId.value) body.session_id = sessionId.value
  if (submitBookKeys.length) body.submit_book_keys = submitBookKeys
  return body
}

const applySearchResult = async (data, page) => {
  sessionId.value = data?.session_id || sessionId.value
  currentPage.value = Number(data?.page || page)
  targetPage.value = currentPage.value
  books.value = normalizeBooks(data?.books)
  hasSearched.value = true
  selectedRows.value = []
  await nextTick()
  clearSelection()
  if (!books.value.length) {
    ElMessage.info('没有搜索结果')
  }
}

const normalizeBooks = (value) => {
  if (!Array.isArray(value)) return []
  return value.map((book, index) => ({
    ...book,
    __rowKey: bookKey(book) || `${currentPage.value}:${index}`
  }))
}

const onSelectionChange = (selection) => {
  selectedRows.value = selection.filter(isSelectableBook)
}

const clearSelection = () => {
  bookTableRef.value?.clearSelection?.()
  selectedRows.value = []
}

const resetSearchSession = () => {
  sessionId.value = ''
  currentPage.value = 1
  targetPage.value = 1
  hasSearched.value = false
  books.value = []
  clearSelection()
}

const isSelectableBook = (book) => {
  return book?.supported !== false && !!bookKey(book)
}

const bookKey = (book) => {
  return book?.book_key || book?.key || ''
}

const bookTitle = (book) => {
  return textValue(book?.title, book?.name, book?.book, book?.display_title) || '(未命名)'
}

const previewUrl = (book) => {
  return textValue(book?.preview_url, book?.url, book?.web, book?.link)
}

const imagePreviewUrl = (book) => {
  return textValue(book?.cover_static_url)
}

const coverUrl = (book) => {
  const image = imagePreviewUrl(book)
  if (!image || image.startsWith('data:') || image.startsWith('blob:')) return image
  const params = new URLSearchParams({ url: image })
  return `${backend()}/root/cgs/cover?${params.toString()}`
}

const sourceValue = (book) => {
  return textValue(book?.source, book?.spider_name, book?.site)
}

const artistValue = (book) => {
  return textValue(book?.artist, book?.author, book?.circle)
}

const authorAvatarInitial = (book) => {
  const name = artistValue(book)
  if (!name) return 'A'
  return name.trim().charAt(0).toUpperCase() || 'A'
}

const authorAvatarSrc = (book) => {
  const identity = resolveAuthorAvatarIdentity(book)
  if (!identity) return ''
  return authorAvatarCache.value[identity.key]?.src || ''
}

const resolveAuthorAvatarIdentity = (book) => {
  const explicitAvatar = textValue(
    book?.github_avatar,
    book?.githubAvatar,
    book?.author_avatar,
    book?.artist_avatar,
    book?.avatar_url,
    book?.avatar
  )
  const explicitAvatarUrl = normalizeAvatarUrl(explicitAvatar)
  if (explicitAvatarUrl) {
    return { key: explicitAvatarUrl, url: explicitAvatarUrl }
  }

  const githubUser = textValue(
    book?.github_username,
    book?.githubUsername,
    book?.github_user,
    book?.githubUser,
    book?.username,
    book?.login
  )
  const githubUserUrl = normalizeGithubAvatarUrl(githubUser)
  if (githubUserUrl) {
    return { key: githubUser.toLowerCase(), url: githubUserUrl }
  }

  const author = artistValue(book)
  const authorUrl = normalizeGithubAvatarUrl(author)
  if (authorUrl) {
    return { key: author.toLowerCase(), url: authorUrl }
  }

  return null
}

const normalizeAvatarUrl = (value) => {
  const text = textValue(value)
  if (!text) return ''
  if (/^https?:\/\//i.test(text) || text.startsWith('data:')) return text
  return normalizeGithubAvatarUrl(text)
}

const normalizeGithubAvatarUrl = (value) => {
  const text = textValue(value)
  if (!text || !GITHUB_USERNAME_RE.test(text)) return ''
  return `https://github.com/${encodeURIComponent(text)}.png?size=64`
}

const prefetchAuthorAvatars = async (rows) => {
  const tasks = []
  for (const row of rows || []) {
    const identity = resolveAuthorAvatarIdentity(row)
    if (!identity || authorAvatarCache.value[identity.key]) continue
    tasks.push(ensureAuthorAvatar(identity))
  }
  if (tasks.length) {
    await Promise.allSettled(tasks)
  }
}

const ensureAuthorAvatar = async (identity) => {
  if (!identity?.key || !identity.url) return ''
  if (authorAvatarCache.value[identity.key]?.src) return authorAvatarCache.value[identity.key].src
  if (authorAvatarRequests.has(identity.key)) return authorAvatarRequests.get(identity.key)

  const task = (async () => {
    try {
      const response = await fetch(authorAvatarProxyUrl(identity), { cache: 'force-cache' })
      if (!response.ok) return ''
      const contentType = response.headers.get('content-type') || ''
      if (contentType && !contentType.startsWith('image/')) return ''
      const blob = await response.blob()
      const src = await blobToDataUrl(blob)
      cacheAuthorAvatar(identity.key, src)
      return src
    } catch {
      return ''
    } finally {
      authorAvatarRequests.delete(identity.key)
    }
  })()

  authorAvatarRequests.set(identity.key, task)
  return task
}

const authorAvatarProxyUrl = (identity) => {
  const params = new URLSearchParams({ url: identity.url })
  return `${backend()}/root/cgs/avatar?${params.toString()}`
}

const cacheAuthorAvatar = (key, src) => {
  if (!key || !src) return
  authorAvatarCache.value = {
    ...authorAvatarCache.value,
    [key]: { src, updatedAt: Date.now() }
  }
  pruneAuthorAvatarCache()
  persistAuthorAvatarCache()
}

const pruneAuthorAvatarCache = () => {
  const entries = Object.entries(authorAvatarCache.value)
  if (entries.length <= AUTHOR_AVATAR_LIMIT) return
  entries.sort((left, right) => (left[1]?.updatedAt || 0) - (right[1]?.updatedAt || 0))
  const nextCache = Object.fromEntries(entries.slice(entries.length - AUTHOR_AVATAR_LIMIT))
  authorAvatarCache.value = nextCache
}

const persistAuthorAvatarCache = () => {
  try {
    localStorage.setItem(AUTHOR_AVATAR_CACHE_KEY, JSON.stringify(authorAvatarCache.value))
  } catch {
    // Ignore storage quota and availability errors; avatars will refetch next time.
  }
}

function readAuthorAvatarCache () {
  try {
    const raw = localStorage.getItem(AUTHOR_AVATAR_CACHE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(
      Object.entries(parsed).filter(([, value]) => value && typeof value === 'object' && typeof value.src === 'string')
    )
  } catch {
    return {}
  }
}

const blobToDataUrl = (blob) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Failed to read avatar blob'))
    reader.readAsDataURL(blob)
  })
}

const pagesValue = (book) => {
  if (Array.isArray(book?.pics)) return String(book.pics.length)
  if (Array.isArray(book?.page_links)) return String(book.page_links.length)
  return textValue(book?.pages, book?.book_pages, book?.page_count)
}

const btypeValue = (book) => {
  return textValue(book?.btype, book?.type, book?.category)
}

const publicDateValue = (book) => {
  return textValue(book?.public_date, book?.date, book?.published_at, book?.datetime_updated)
}

const bookTags = (book) => {
  return normalizeTags(book?.tags)
}

const bookMetaItems = (book) => {
  return [
    ['来源', sourceValue(book)],
    ['作者', artistValue(book)],
    ['页数', pagesValue(book)],
    ['类型', btypeValue(book)],
    ['日期', publicDateValue(book)],
  ].filter(([, value]) => value).map(([label, value]) => ({ label, value }))
}

const textValue = (...values) => {
  for (const value of values) {
    if (value === undefined || value === null) continue
    if (Array.isArray(value)) {
      const joined = value.map(item => textValue(item)).filter(Boolean).join(', ')
      if (joined) return joined
      continue
    }
    const text = String(value).trim()
    if (text) return text
  }
  return ''
}

const normalizeTags = (tags) => {
  if (Array.isArray(tags)) return tags.map(String).filter(Boolean)
  if (typeof tags === 'string') return tags.split(/[,，]/).map(tag => tag.trim()).filter(Boolean)
  return []
}

const secretHeaders = () => {
  const secret = (props.storedSecret || localStorage.getItem('rootSecret') || '').trim()
  if (props.authRequired && !secret) {
    const message = '请先完成管理员鉴权后再提交 CGS 下载'
    panelError.value = message
    ElMessage.warning(message)
    return null
  }
  if (!secret) return undefined
  return { headers: { 'X-Secret': passThroughEncrypt(`${secret}:${Date.now()}`) } }
}

const fetchStatus = async (showLoading = false) => {
  if (showLoading) loading.value = true
  try {
    const res = await axios.get(backend() + '/root/cgs/status')
    statusData.value = res.data || {}
    panelError.value = ''
    if (!isRunning.value) stopPolling()
  } catch (e) {
    panelError.value = errorText(e, '获取 CGS 状态失败')
    if (showLoading) ElMessage.error(panelError.value)
  } finally {
    if (showLoading) loading.value = false
  }
}

const fetchEvents = async (notify = false) => {
  try {
    const res = await axios.get(backend() + '/root/cgs/events')
    eventData.value = res.data || {}
  } catch (e) {
    const message = errorText(e, '获取 CGS 事件失败')
    if (notify) ElMessage.error(message)
  }
}

const startPolling = () => {
  if (pollTimer.value) return
  pollTimer.value = window.setInterval(runPoll, POLL_INTERVAL)
}

const stopPolling = () => {
  if (!pollTimer.value) return
  window.clearInterval(pollTimer.value)
  pollTimer.value = null
}

const syncPolling = () => {
  if (isRunning.value) startPolling()
  else stopPolling()
}

const runPoll = async () => {
  if (pollBusy.value) return
  pollBusy.value = true
  try {
    await fetchStatus(false)
    if (shouldFetchEvents.value) {
      await fetchEvents(false)
    }
  } finally {
    pollBusy.value = false
    syncPolling()
  }
}

const latestEventValue = (keys) => {
  for (let index = events.value.length - 1; index >= 0; index -= 1) {
    const event = events.value[index]
    for (const key of keys) {
      if (event?.[key] !== undefined && event[key] !== null && event[key] !== '') {
        return event[key]
      }
    }
  }
  return undefined
}

const normalizeProgress = (value) => {
  if (value === undefined || value === null || value === '') return null
  const number = Number(value)
  if (!Number.isFinite(number)) return null
  return Math.max(0, Math.min(100, number <= 1 ? Math.round(number * 100) : Math.round(number)))
}

const progressValue = (value) => {
  if (value && typeof value === 'object') {
    return value.percent ?? value.percentage ?? value.progress ?? value.value
  }
  return value
}

const formatValue = (value) => {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value
  return JSON.stringify(value, null, 2)
}

const formatTime = (value) => {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleTimeString()
}

const errorText = (error, fallback) => {
  const detail = error.response?.data?.detail || error.response?.data?.error
  if (detail) return formatValue(detail)
  return error.message || fallback
}
</script>

<style scoped>
.cgs-tab {
  min-width: 0;
}

.cgs-toolbar,
.cgs-results-head,
.cgs-job-line {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.cgs-toolbar {
  margin-bottom: 12px;
}

.cgs-subtitle,
.cgs-result-actions,
.cgs-book-tags {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.cgs-subtitle {
  margin-top: 6px;
}

.cgs-alert,
.cgs-search-panel,
.cgs-results,
.cgs-progress {
  margin-bottom: 12px;
}

.cgs-search-panel {
  padding: 12px;
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  background: var(--el-fill-color-blank);
}

.cgs-search-form {
  display: grid;
  grid-template-columns: minmax(160px, 220px) minmax(220px, 1fr) 96px auto;
  gap: 12px;
  align-items: end;
}

.cgs-search-form :deep(.el-form-item) {
  margin-bottom: 0;
}

.cgs-search-actions :deep(.el-form-item__content) {
  flex-wrap: nowrap;
}

.cgs-option-detail {
  margin-left: 8px;
}

.cgs-results-head {
  margin-bottom: 10px;
}

.cgs-results-meta {
  display: block;
  margin-top: 4px;
}

.cgs-book {
  display: flex;
  min-width: 0;
  gap: 10px;
}

.cgs-cover {
  width: 48px;
  height: 68px;
  flex: 0 0 auto;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 3px;
  object-fit: cover;
  background: var(--el-fill-color-light);
}

.cgs-book-main {
  min-width: 0;
}

.cgs-book-title {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  color: var(--el-text-color-primary);
  font-weight: 600;
  line-height: 1.4;
  word-break: break-word;
}

.cgs-book-reason {
  margin-top: 3px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.4;
  word-break: break-word;
}

.cgs-book-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
  margin-top: 5px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.4;
}

.cgs-book-meta-item {
  min-width: 0;
  max-width: 100%;
  overflow-wrap: anywhere;
}

.cgs-book-meta-item b {
  margin-right: 3px;
  color: var(--el-text-color-regular);
  font-weight: 600;
}

.cgs-author-cell {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
}

.cgs-author-avatar {
  flex: 0 0 auto;
  inline-size: 24px;
  block-size: 24px;
  border-radius: 50%;
  object-fit: cover;
  background: var(--el-fill-color-light);
}

.cgs-author-avatar--fallback {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--el-border-color-lighter);
  color: var(--el-text-color-secondary);
  font-size: 12px;
  font-weight: 600;
}

.cgs-author-name {
  min-width: 0;
  overflow-wrap: anywhere;
  line-height: 1.4;
}

.cgs-book-tags {
  margin-top: 6px;
}

.cgs-job-line {
  align-items: center;
  margin-bottom: 10px;
}

.cgs-output-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px;
}

.cgs-section-title {
  margin-bottom: 6px;
  color: var(--el-text-color-regular);
  font-size: 13px;
  font-weight: 600;
}

.cgs-output {
  box-sizing: border-box;
  width: 100%;
  min-height: 120px;
  max-height: 240px;
  margin: 0;
  padding: 10px;
  overflow: auto;
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-primary);
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

@media (max-width: 900px) {
  .cgs-search-form {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }

  .cgs-search-actions {
    grid-column: 1 / -1;
  }
}

@media (max-width: 720px) {
  .cgs-toolbar,
  .cgs-results-head,
  .cgs-job-line {
    align-items: stretch;
    flex-direction: column;
  }

  .cgs-search-form,
  .cgs-output-grid {
    grid-template-columns: 1fr;
  }

  .cgs-result-actions {
    align-items: stretch;
  }
}
</style>
