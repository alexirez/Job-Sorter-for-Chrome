<script>
  import { onMount } from 'svelte';

  const STORAGE_KEY = 'selectedModel';
  const PORT_STORAGE_KEY = 'ollamaPort';
  const REFRESH_LOCK_MS = 1800;

  let models = $state([]);
  let selectedModel = $state(null); // null = "None"
  let fetchingModels = $state(false);
  let error = $state('');
  let ollamaPort = $state(11434);

  async function loadSelectedModel() {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    selectedModel = result[STORAGE_KEY] ?? null;
  }

  async function saveSelectedModel(name) {
    selectedModel = name;
    await chrome.storage.local.set({ [STORAGE_KEY]: name });
  }

  async function fetchModels() {
    error = '';
    try {
      const res = await fetch(`http://localhost:${ollamaPort}/api/tags`);
      if (!res.ok) throw new Error(`Ollama returned ${res.status}`);
      const data = await res.json();
      models = data.models ?? [];

      if (selectedModel && !models.some((m) => m.name === selectedModel)) {
        await saveSelectedModel(null);
      }
    } catch (e) {
      error = `Failed to connect to Ollama on localhost:${ollamaPort}`;
      models = [];
    }
  }

  async function loadModels() {
    fetchingModels = true;
    await fetchModels();
    fetchingModels = false;
  }

  async function refreshModels() {
    if (fetchingModels) return;
    fetchingModels = true;
    const start = Date.now();
    await fetchModels();
    const remaining = REFRESH_LOCK_MS - (Date.now() - start);
    if (remaining > 0) {
      await new Promise((resolve) => setTimeout(resolve, remaining));
    }
    fetchingModels = false;
  }

  function handleChange(event) {
    const value = event.target.value;
    saveSelectedModel(value === '' ? null : value);
  }

  function openSettings() {
    // TODO: wire up settings view
    console.log('Settings clicked');
  }

  function viewPostings() {
    // TODO: read scored postings from storage and render them
    console.log('View Postings clicked');
  }

  onMount(async () => {
    await loadSelectedModel();
    const portResult = await chrome.storage.local.get(PORT_STORAGE_KEY);
    ollamaPort = portResult[PORT_STORAGE_KEY] ?? 11434;
    await loadModels();
  });
</script>

<div class="popup">
  <header class="topbar">
    <div class="brand">
      <h1>Job Sorter</h1>
    </div>
    <button class="icon-btn settings-btn" onclick={openSettings} aria-label="Settings" title="Settings">
      <svg
        class="gear-icon"
        viewBox="0 0 24 24"
        width="48"
        height="48"
        fill="currentColor"
      >
        <path fill-rule="evenodd" d="M12 5.6 A6.4 6.4 0 1 0 12 18.4 A6.4 6.4 0 1 0 12 5.6 Z M12 8.6 A3.4 3.4 0 1 0 12 15.4 A3.4 3.4 0 1 0 12 8.6 Z" />
        <path d="M9.58,6.0 L10.85,2.85 Q10.7,2.6 11.05,2.6 L12.95,2.6 Q13.3,2.6 13.45,2.85 L14.42,6.0 Z" />
        <path d="M9.58,6.0 L10.85,2.85 Q10.7,2.6 11.05,2.6 L12.95,2.6 Q13.3,2.6 13.45,2.85 L14.42,6.0 Z" transform="rotate(51.43 12 12)" />
        <path d="M9.58,6.0 L10.85,2.85 Q10.7,2.6 11.05,2.6 L12.95,2.6 Q13.3,2.6 13.45,2.85 L14.42,6.0 Z" transform="rotate(102.86 12 12)" />
        <path d="M9.58,6.0 L10.85,2.85 Q10.7,2.6 11.05,2.6 L12.95,2.6 Q13.3,2.6 13.45,2.85 L14.42,6.0 Z" transform="rotate(154.29 12 12)" />
        <path d="M9.58,6.0 L10.85,2.85 Q10.7,2.6 11.05,2.6 L12.95,2.6 Q13.3,2.6 13.45,2.85 L14.42,6.0 Z" transform="rotate(205.71 12 12)" />
        <path d="M9.58,6.0 L10.85,2.85 Q10.7,2.6 11.05,2.6 L12.95,2.6 Q13.3,2.6 13.45,2.85 L14.42,6.0 Z" transform="rotate(257.14 12 12)" />
        <path d="M9.58,6.0 L10.85,2.85 Q10.7,2.6 11.05,2.6 L12.95,2.6 Q13.3,2.6 13.45,2.85 L14.42,6.0 Z" transform="rotate(308.57 12 12)" />
      </svg>
    </button>
  </header>

  <div class="folder">
    <div class="field">
      <label for="model-select">Selected model</label>
      <div class="field-row">
        <select id="model-select" value={selectedModel ?? ''} onchange={handleChange}>
          <option value="">None</option>
          {#each models as model}
            <option value={model.name}>{model.name}</option>
          {/each}
        </select>
        <button
          class="icon-btn refresh-btn"
          onclick={refreshModels}
          disabled={fetchingModels}
          aria-label="Refresh model list"
          title="Refresh model list"
        >
          <svg
            class="refresh-icon"
            class:spinning={fetchingModels}
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M21 12a9 9 0 1 1-3-6.7" />
            <polyline points="21 3 21 9 15 9" />
          </svg>
        </button>
      </div>
    </div>

    {#if error}
      <p class="note error">⚠ Failed to connect to Ollama on localhost:{ollamaPort}</p>
    {:else}
      <p class="note">Using Ollama on localhost:{ollamaPort}</p>
    {/if}
  </div>

  <button class="stamp-btn" onclick={viewPostings}>View Postings</button>
</div>

<style>
  :global(html, body) {
    margin: 0;
    padding: 0;
    width: 660px;
    min-height: 520px;
  }

  :global(:root) {
    --ink: #1b1e24;
    --paper: #ece6d8;
    --paper-line: #dcd3be;
    --stamp-red: #b23a2f;
    --ink-text: #262220;
    --muted: #6b6255;
    --font-mono: ui-monospace, 'SFMono-Regular', Menlo, Consolas, 'Liberation Mono', monospace;
    --font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  }

  .popup {
    background: var(--ink);
    padding: 20px;
    box-sizing: border-box;
    min-height: 520px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    font-family: var(--font-sans);
  }

  .topbar {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }

  .brand {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .brand h1 {
    margin: 0;
    font-family: var(--font-mono);
    font-size: 1.6rem;
    font-weight: 700;
    letter-spacing: 0.02em;
    color: var(--paper);
  }

  .icon-btn {
    font-size: 1.1rem;
    line-height: 1;
    background: var(--paper);
    color: var(--ink);
    border: none;
    border-radius: 50%;
    width: 34px;
    height: 34px;
    cursor: pointer;
    transition: transform 0.15s ease;
  }

  .icon-btn:hover {
    transform: rotate(8deg);
  }

  .icon-btn:disabled {
    opacity: 0.5;
    cursor: default;
    transform: none;
  }

  .settings-btn {
    background: transparent;
    color: var(--paper);
    width: 42px;
    height: 42px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .settings-btn:hover {
    transform: none;
  }

  .gear-icon {
    display: block;
    transition: transform 0.15s ease;
  }

  .settings-btn:hover .gear-icon {
    transform: scale(1.15);
  }

  .folder {
    background: var(--paper);
    border-radius: 6px;
    padding: 18px;
    box-shadow: 0 6px 0 rgba(0, 0, 0, 0.25);
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .field label {
    font-family: var(--font-mono);
    font-size: 0.72rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--muted);
  }

  .field-row {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  select {
    flex: 1;
    font-family: var(--font-sans);
    font-size: 0.95rem;
    color: var(--ink-text);
    background: #fff;
    border: 2px solid var(--ink-text);
    border-radius: 4px;
    padding: 8px 10px;
  }

  .refresh-btn {
    background: var(--ink-text);
    color: var(--paper);
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.15s ease;
  }

  .refresh-btn:hover {
    transform: scale(1.15);
  }

  .refresh-icon {
    display: block;
  }

  .refresh-icon.spinning {
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  .note {
    margin: 0;
    font-family: var(--font-mono);
    font-size: 0.75rem;
    color: var(--muted);
  }

  .note.error {
    color: var(--stamp-red);
  }

  .stamp-btn {
    align-self: center;
    margin-top: auto;
    font-family: var(--font-mono);
    font-size: 1rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--stamp-red);
    background: transparent;
    border: 3px double var(--stamp-red);
    border-radius: 6px;
    padding: 12px 32px;
    cursor: pointer;
    transform: rotate(-1deg);
    transition: transform 0.15s ease, background 0.15s ease, color 0.15s ease;
  }

  .stamp-btn:hover {
    transform: rotate(0deg);
    background: var(--stamp-red);
    color: var(--paper);
  }

  .stamp-btn:active {
    transform: rotate(0deg) scale(0.96);
  }

  @media (prefers-reduced-motion: reduce) {
    .icon-btn,
    .stamp-btn,
    .refresh-icon.spinning {
      transition: none;
      animation: none;
    }

    .gear-icon {
      transition: none;
    }

    .icon-btn:hover,
    .stamp-btn:hover,
    .stamp-btn:active {
      transform: none;
    }
    .settings-btn:hover .gear-icon {
      transform: none;
    }
    .refresh-btn:hover {
      transform: none;
    }
  }
</style>