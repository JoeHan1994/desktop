<script setup lang="ts">
import { Bot, LogIn, Send, Sparkles, Square, Trash2, X } from '@lucide/vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, withBase } from 'vitepress'
import { data as docsChunks } from '../../../docs.data'
import { renderDocsAnswer } from '../../services/docs-markdown'
import {
  askDocsQuestion,
  DocsQaRequestError,
  type DocsQaMessage,
  type DocsQaRole,
} from '../../services/docs-qa'
import {
  createDocsSearch,
  getDocsSources,
  retrieveDocsContexts,
  type DocsSource,
} from '../../services/docs-search'

interface ChatMessage extends DocsQaMessage {
  id: number
  sources: DocsSource[]
  isComplete: boolean
}

const MaxHistoryMessages = 6
const MaxHistoryMessageCharacters = 3000
const AskAiQueryParameter = 'ask-ai'

const route = useRoute()
const docsSearch = createDocsSearch(docsChunks)
const isAvailable = ref(false)
const isOpen = ref(false)
const isStreaming = ref(false)
const isStopped = ref(false)
const token = ref('')
const question = ref('')
const errorMessage = ref('')
const messages = ref<ChatMessage[]>([])
const launcher = ref<HTMLButtonElement | null>(null)
const closeButton = ref<HTMLButtonElement | null>(null)
const transcript = ref<HTMLElement | null>(null)
const composer = ref<HTMLTextAreaElement | null>(null)
let abortController: AbortController | null = null
let availabilityObserver: MutationObserver | null = null
let nextMessageId = 1

const isSignedIn = computed(() => token.value.length > 0)
const canSubmit = computed(
  () => isSignedIn.value && !isStreaming.value && question.value.trim().length > 0,
)
const canClearHistory = computed(
  () => !isStreaming.value && (messages.value.length > 0 || errorMessage.value.length > 0),
)

onMounted(async () => {
  document.addEventListener('keydown', handleDocumentKeydown)
  refreshToken()
  await refreshAvailability()
  await openRequestedPanel()
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleDocumentKeydown)
  availabilityObserver?.disconnect()
  abortController?.abort()
})

watch(
  () => route.path,
  async () => {
    abortController?.abort()
    abortController = null
    isOpen.value = false
    isStreaming.value = false
    question.value = ''
    errorMessage.value = ''
    messages.value = []
    nextMessageId = 1
    await refreshAvailability()
    await openRequestedPanel()
  },
)

async function refreshAvailability() {
  availabilityObserver?.disconnect()
  await nextTick()
  isAvailable.value = document.querySelector('.vp-doc') !== null || isAskAiRequested()
  if (isAvailable.value) return

  availabilityObserver = new MutationObserver(() => {
    if (document.querySelector('.vp-doc') === null) return

    isAvailable.value = true
    availabilityObserver?.disconnect()
    availabilityObserver = null
    void openRequestedPanel()
  })
  availabilityObserver.observe(document.body, { childList: true, subtree: true })
}

function isAskAiRequested() {
  return new URL(window.location.href).searchParams.get(AskAiQueryParameter) === '1'
}

async function openRequestedPanel() {
  if (!isAvailable.value) return

  const url = new URL(window.location.href)
  if (!isAskAiRequested()) return

  await openPanel()
  if (!isSignedIn.value) return

  url.searchParams.delete(AskAiQueryParameter)
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
}

async function openPanel() {
  refreshToken()
  isOpen.value = true
  await nextTick()
  if (isSignedIn.value) composer.value?.focus()
  else closeButton.value?.focus()
}

function closePanel() {
  if (isStreaming.value) abortController?.abort()
  isOpen.value = false
  nextTick(() => launcher.value?.focus())
}

function handleDocumentKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && isOpen.value) closePanel()
}

function refreshToken() {
  token.value = localStorage.getItem('auth_token') || ''
}

function signIn() {
  const redirect = `${window.location.pathname}${window.location.search}${window.location.hash}`
  window.location.assign(`/login?redirect=${encodeURIComponent(redirect)}`)
}

function stopAnswer() {
  isStopped.value = true
  abortController?.abort()
}

async function clearHistory() {
  if (!canClearHistory.value) return

  messages.value = []
  errorMessage.value = ''
  isStopped.value = false
  nextMessageId = 1
  await nextTick()
  composer.value?.focus()
}

async function submitQuestion() {
  const currentQuestion = question.value.trim()
  if (!canSubmit.value || !currentQuestion) return

  const recentUserQuestions = messages.value
    .filter(({ role }) => role === 'user')
    .slice(-2)
    .map(({ content }) => content)
  const contexts = retrieveDocsContexts(docsSearch, docsChunks, currentQuestion, route.path, recentUserQuestions, {
    base: withBase('/'),
  })
  if (contexts.length === 0) {
    errorMessage.value = 'The documentation content is unavailable.'
    return
  }

  const history = messages.value.slice(-MaxHistoryMessages).map(({ role, content }) => ({
    role,
    content: content.slice(0, MaxHistoryMessageCharacters),
  }))
  const userMessage = addMessage('user', currentQuestion)
  const assistantMessage = addMessage('assistant', '', getDocsSources(contexts), false)
  question.value = ''
  errorMessage.value = ''
  isStreaming.value = true
  isStopped.value = false
  abortController = new AbortController()
  await scrollToLatestMessage()

  try {
    await askDocsQuestion(
      {
        question: userMessage.content,
        contexts,
        history,
      },
      async (delta) => {
        assistantMessage.content += delta
        await scrollToLatestMessage()
      },
      abortController.signal,
    )
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      if (isStopped.value && !assistantMessage.content) assistantMessage.content = 'Response stopped.'
    } else {
      errorMessage.value = error instanceof Error ? error.message : 'AI Q&A could not complete the request.'
      if (error instanceof DocsQaRequestError && error.status === 401) refreshToken()
      if (!assistantMessage.content) removeMessage(assistantMessage.id)
    }
  } finally {
    assistantMessage.isComplete = true
    isStreaming.value = false
    abortController = null
    await scrollToLatestMessage()
    composer.value?.focus()
  }
}

function addMessage(role: DocsQaRole, content: string, sources: DocsSource[] = [], isComplete = true) {
  const message = { id: nextMessageId++, role, content, sources, isComplete }
  messages.value.push(message)
  return message
}

function removeMessage(id: number) {
  messages.value = messages.value.filter((message) => message.id !== id)
}

async function scrollToLatestMessage() {
  await nextTick()
  if (transcript.value) transcript.value.scrollTop = transcript.value.scrollHeight
}
</script>

<template>
  <button
    v-if="isAvailable && !isOpen"
    ref="launcher"
    class="docs-qa-launcher"
    type="button"
    aria-label="Ask AI about Terraforge Docs"
    title="Ask AI about Terraforge Docs"
    @click="openPanel"
  >
    <Sparkles :size="18" aria-hidden="true" />
    <span>Ask AI</span>
  </button>

  <div v-if="isOpen" class="docs-qa-backdrop" aria-hidden="true" @click="closePanel" />
  <aside
    v-if="isOpen"
    class="docs-qa-panel"
    role="dialog"
    aria-modal="true"
    aria-labelledby="docs-qa-title"
  >
    <header class="docs-qa-header">
      <div class="docs-qa-heading">
        <Sparkles :size="18" aria-hidden="true" />
        <h2 id="docs-qa-title">Ask Terraforge Docs</h2>
      </div>
      <div class="docs-qa-header-actions">
        <button
          class="docs-qa-icon-button"
          type="button"
          :disabled="!canClearHistory"
          aria-label="Clear conversation history"
          title="Clear history"
          @click="clearHistory"
        >
          <Trash2 :size="18" aria-hidden="true" />
        </button>
        <button
          ref="closeButton"
          class="docs-qa-icon-button"
          type="button"
          aria-label="Close Ask AI"
          title="Close"
          @click="closePanel"
        >
          <X :size="19" aria-hidden="true" />
        </button>
      </div>
    </header>

    <div v-if="!isSignedIn" class="docs-qa-signed-out">
      <Bot :size="30" aria-hidden="true" />
      <p>Sign in to use Ask AI.</p>
      <button class="docs-qa-sign-in" type="button" @click="signIn">
        <LogIn :size="17" aria-hidden="true" />
        Sign in
      </button>
    </div>

    <template v-else>
      <div ref="transcript" class="docs-qa-transcript" aria-live="polite">
        <div v-if="messages.length === 0" class="docs-qa-empty">
          <Bot :size="30" aria-hidden="true" />
          <p>Ask a question about Terraforge.</p>
        </div>

        <div v-for="message in messages" :key="message.id" class="docs-qa-message" :data-role="message.role">
          <span class="docs-qa-role">{{ message.role === 'user' ? 'You' : 'AI' }}</span>
          <div
            v-if="message.role === 'assistant' && message.content"
            class="docs-qa-answer"
            v-html="renderDocsAnswer(message.content)"
          />
          <p v-else>{{ message.content || 'Thinking...' }}</p>
          <div
            v-if="message.role === 'assistant' && message.isComplete && message.sources.length > 0"
            class="docs-qa-sources"
          >
            <span>Sources</span>
            <a v-for="source in message.sources" :key="source.path" :href="withBase(source.path)">
              {{ source.title }}
            </a>
          </div>
        </div>
      </div>

      <div v-if="errorMessage" class="docs-qa-error" role="alert">
        {{ errorMessage }}
      </div>

      <form class="docs-qa-composer" @submit.prevent="submitQuestion">
        <label class="visually-hidden" for="docs-qa-question">Ask a question about Terraforge Docs</label>
        <textarea
          id="docs-qa-question"
          ref="composer"
          v-model="question"
          maxlength="2000"
          rows="3"
          placeholder="Ask Terraforge Docs"
          :disabled="isStreaming"
          @keydown.enter.exact.prevent="submitQuestion"
        />
        <button
          v-if="isStreaming"
          class="docs-qa-submit"
          type="button"
          aria-label="Stop response"
          title="Stop response"
          @click="stopAnswer"
        >
          <Square :size="16" aria-hidden="true" />
        </button>
        <button
          v-else
          class="docs-qa-submit"
          type="submit"
          :disabled="!canSubmit"
          aria-label="Send question"
          title="Send question"
        >
          <Send :size="17" aria-hidden="true" />
        </button>
      </form>
    </template>
  </aside>
</template>
