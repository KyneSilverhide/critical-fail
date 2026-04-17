<script setup>
import { computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { applyStoredTheme } from './utils/themePreferences.js'

const route = useRoute()

const themeScope = computed(() => {
  const path = route.path || '/'
  if (path.startsWith('/admin') || path.startsWith('/login')) return 'admin'
  if (path.startsWith('/tv/')) return 'tv'
  if (path.startsWith('/join') || path.startsWith('/view/') || path.startsWith('/player')) return 'player'
  return 'player'
})

watch(themeScope, (scope) => {
  applyStoredTheme(scope, 'dark')
}, { immediate: true })
</script>

<template>
  <RouterView />
</template>
