import { ref } from 'vue'

// Module-level singleton state for the in-progress update. The settings view is
// mounted/unmounted on route switch; keeping the "installing" flag inside the
// component would be lost the moment the user navigates away, and returning to
// the settings page would reset the button back to "更新到 vX". Persist it in
// this module so the flag survives component recreation, and skip the update
// poller while an install is in flight.
const installingUpdate = ref(false)
const updateMessage = ref('')

export function useUpdateState() {
  function setInstalling(value: boolean, message?: string) {
    installingUpdate.value = value
    if (typeof message === 'string') updateMessage.value = message
  }

  return {
    installingUpdate,
    updateMessage,
    setInstalling
  }
}
