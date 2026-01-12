<script setup>
import DefaultTheme from 'vitepress/theme'
const { Layout } = DefaultTheme
</script>

<template>
  <Layout>
    <template #home-hero-info-after>
      <div class="home-demo">
        <a class="home-demo__btn" href="https://demo.redviewer.nyc.mn" target="_blank" rel="noreferrer">
          🎮 在线体验 Demo
        </a>
      </div>
    </template>
  </Layout>
</template>