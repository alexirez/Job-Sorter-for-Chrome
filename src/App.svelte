<script>
  import { onMount } from 'svelte';

  const STORAGE_KEY = 'selectedModel';

  let models = $state([]);
  let selectedModel = $state(null); // null = "None"
  let fetchingModels = $state(false);
  let error = $state('');

  async function loadSelectedModel() {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    selectedModel = result[STORAGE_KEY] ?? null;
  }

  async function saveSelectedModel(name) {
    selectedModel = name;
    await chrome.storage.local.set({ [STORAGE_KEY]: name });
  }

  async function fetchModels() {
    fetchingModels = true;
    error = '';
    try {
      const res = await fetch('http://localhost:11434/api/tags');
      if (!res.ok) throw new Error(`Ollama returned ${res.status}`);
      const data = await res.json();
      models = data.models ?? [];

      if (selectedModel && !models.some((m) => m.name === selectedModel)) {
        await saveSelectedModel(null);
      }
    } catch (e) {
      error = 'Could not reach Ollama. Is it running?';
      models = [];
    } finally {
      fetchingModels = false;
    }
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
    await fetchModels();
  });
</script>

<div class="popup">
  <header class="topbar">
    <div class="brand">
      <h1>Job Sorter</h1>
    </div>
    <button class="icon-btn" onclick={openSettings} aria-label="Settings" title="Settings">
      ⚙
    </button>
  </header>

  <div class="folder">
    <div class="field">
      <label for="model-select">Analyst model</label>
      <div class="field-row">
        <select id="model-select" value={selectedModel ?? ''} onchange={handleChange}>
          <option value="">None</option>
          {#each models as model}
            <option value={model.name}>{model.name}</option>
          {/each}
        </select>
        <button
          class="icon-btn refresh-btn"
          onclick={fetchModels}
          disabled={fetchingModels}
          aria-label="Refresh model list"
          title="Refresh model list"
        >
          {fetchingModels ? '···' : '↻'}
        </button>
      </div>
    </div>

    {#if error}
      <p class="note error">⚠ {error}</p>
    {:else}
      <p class="note">Local inference via Ollama · localhost:11434</p>
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
    .stamp-btn {
      transition: none;
    }
    .icon-btn:hover,
    .stamp-btn:hover,
    .stamp-btn:active {
      transform: none;
    }
  }
</style>