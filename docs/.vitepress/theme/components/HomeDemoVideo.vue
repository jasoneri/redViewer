<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'

const props = withDefaults(defineProps<{
  src: string
  poster?: string
  title?: string
  triggerMargin?: string
  autoplay?: boolean
  muted?: boolean
  loop?: boolean
  controls?: boolean
}>(), {
  poster: '{{URL_IMG}}/file/rv/1783000491990_app_cover.png',
  triggerMargin: '200px',
  autoplay: true,
  muted: true,
  loop: true,
  controls: false,
})

const videoRef = ref<HTMLVideoElement | null>(null)
const hydrated = ref(false)
const hasResolvedSrc = computed(() => !props.src.includes('__TODO_'))
let observer: IntersectionObserver | null = null

function handleError() {
  console.error('HomeDemoVideo load failed:', props.src)
}

onMounted(() => {
  if (!hasResolvedSrc.value) {
    return
  }

  observer = new IntersectionObserver(
    ([entry]) => {
      if (!entry?.isIntersecting || hydrated.value || !videoRef.value) return
      videoRef.value.src = props.src
      videoRef.value.load()
      hydrated.value = true
      observer?.disconnect()
    },
    { rootMargin: props.triggerMargin }
  )

  if (videoRef.value) {
    observer.observe(videoRef.value)
  }
})

onUnmounted(() => {
  observer?.disconnect()
})
</script>

<template>
  <div
    v-if="!hasResolvedSrc"
    class="home-demo-video home-demo-video--placeholder"
    :aria-label="title"
  >
    {{ title || 'Demo video pending' }}
  </div>
  <video
    v-else
    ref="videoRef"
    class="home-demo-video"
    :poster="poster"
    :aria-label="title"
    preload="none"
    playsinline
    :autoplay="autoplay"
    :muted="muted"
    :loop="loop"
    :controls="controls"
    @error="handleError"
  />
</template>

<style scoped>
.home-demo-video {
  width: min(100%, 400px);
  aspect-ratio: 960 / 1850;
  height: auto;
  display: block;
  margin: 0 auto;
  border-radius: 8px;
  object-fit: cover;
}

.home-demo-video--placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--vp-c-text-2);
  font-size: 0.875rem;
}
</style>
