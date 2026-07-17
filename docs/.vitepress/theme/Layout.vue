<script setup lang="ts">
import DefaultTheme from 'vitepress/theme'
import DocsQaPanel from './components/DocsQaPanel.vue'

const { Layout } = DefaultTheme
</script>

<template>
  <Layout />
  <ClientOnly>
    <DocsQaPanel />
  </ClientOnly>
</template>
