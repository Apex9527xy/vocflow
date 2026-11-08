<script setup lang="ts">
import AppLayout from './components/layout/AppLayout.vue'
import GlobalWordLookup from './components/GlobalWordLookup.vue'
import GlobalSentenceLookup from './components/GlobalSentenceLookup.vue'
import AppNotifications from './components/AppNotifications.vue'
</script>

<template>
  <AppLayout>
    <router-view />
  </AppLayout>
  <GlobalWordLookup />
  <GlobalSentenceLookup />
  <AppNotifications />
</template>
