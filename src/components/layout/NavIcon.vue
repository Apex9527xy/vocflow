<script setup lang="ts">
/**
 * Vector nav icons.
 *
 * The old sidebar used Unicode geometric glyphs (◈ ◎ ↻ ▤ …). Several of them
 * are missing from the CJK system fonts shipped on Android/iOS, so the phone
 * renders them as tofu boxes. Everything here is a 24x24 stroke SVG, which no
 * font can break.
 */
const props = defineProps<{ name: string }>()

const icons: Record<string, string[]> = {
  today: [
    'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8',
    'M12 2v2', 'M12 20v2', 'M4.93 4.93l1.41 1.41', 'M17.66 17.66l1.41 1.41',
    'M2 12h2', 'M20 12h2', 'M6.34 17.66l-1.41 1.41', 'M19.07 4.93l-1.41 1.41'
  ],
  study: [
    'M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z',
    'M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z'
  ],
  review: [
    'M3 12a9 9 0 1 0 3.5-7.1',
    'M3 4v5h5'
  ],
  wrong: [
    'M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z'
  ],
  search: [
    'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14',
    'M21 21l-4.35-4.35'
  ],
  stats: [
    'M4 20V10', 'M10 20V4', 'M16 20v-7', 'M22 20H2'
  ],
  plan: [
    'M5 4h14a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z',
    'M8 2v4', 'M16 2v4', 'M4 9h16',
    'M8 13h2', 'M14 13h2', 'M8 17h2', 'M14 17h2'
  ],
  exam: [
    'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z',
    'M14 2v6h6', 'M9 13h6', 'M9 17h4'
  ],
  literature: [
    'M12 2l10 5-10 5-10-5z',
    'M2 12l10 5 10-5',
    'M2 17l10 5 10-5'
  ],
  focus: [
    'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20',
    'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10',
    'M12 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2'
  ],
  settings: [
    'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
    'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z'
  ]
}

const paths = icons[props.name] || icons.today
</script>

<template>
  <svg
    class="nav-icon-svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.7"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path v-for="(d, index) in paths" :key="index" :d="d" />
  </svg>
</template>

<style scoped>
.nav-icon-svg {
  display: block;
  width: 1em;
  height: 1em;
}
</style>
