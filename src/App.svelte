<script>
  import { onMount } from 'svelte';
  import questionMarkIcon from './assets/icons/question-mark.svg?raw';
  import gearIcon from './assets/icons/gear-icon.svg?raw';
  import refreshIcon from './assets/icons/refresh-icon.svg?raw';

  const STORAGE_KEY = 'selectedModel';
  const PORT_STORAGE_KEY = 'ollamaPort';
  const REFRESH_LOCK_MS = 1800;

  let models = $state([]);
  let selectedModel = $state(null); // null = "None"
  let fetchingModels = $state(false);
  let loadingModel = $state(false);
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

  async function loadModel() {
    if (!selectedModel || loadingModel) return;
    loadingModel = true;
    try {
      const res = await fetch(`http://localhost:${ollamaPort}/api/chat`, {
        method: 'POST',
        body: JSON.stringify({ model: selectedModel, messages: [] })
      });
      if (!res.ok) throw new Error(`Ollama returned ${res.status}`);
      console.log(`[Job Sorter] Loaded ${selectedModel} into memory`);
    } catch (e) {
      console.error(`[Job Sorter] Failed to load ${selectedModel}`, e);
    } finally {
      loadingModel = false;
    }
  }

  async function fetchModels() {
    error = '';
    try {
      const res = await fetch(`http://localhost:${ollamaPort}/api/tags`);
      if (!res.ok) throw new Error(`Ollama returned ${res.status}`);
      const data = await res.json();
      models = data.models ?? [];

      console.log(`[Job Sorter] Connected to Ollama on port ${ollamaPort}`);

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
  <div class="folder">
    <header class="topbar">
      <h1>Job Sorter</h1>
      <button class="icon-btn settings-btn" onclick={openSettings} aria-label="Settings" title="Settings">
        {@html gearIcon}
      </button>
    </header>

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
          class:spinning={fetchingModels}
          onclick={refreshModels}
          disabled={fetchingModels}
          aria-label="Refresh model list"
          title="Refresh model list"
        >
          {@html refreshIcon}
        </button>
      </div>
    </div>

    {#if error}
      <p class="note error">⚠ Failed to connect to Ollama on localhost:{ollamaPort}</p>
    {:else}
      <p class="note">Using Ollama on <span style="text-decoration: underline;">localhost:{ollamaPort}</span></p>
    {/if}

    <div class="load-row">
      <button class="load-btn" onclick={loadModel} disabled={!selectedModel || loadingModel}>
        {loadingModel ? 'Loading…' : 'Load Selected'}
      </button>
      <button
        class="icon-btn help-btn"
        title="AI features require loading the model into memory first.
        Depending on model size, this can take 5-10 minutes (~5GB model)
        or more for larger models. Larger models are more accurate."
        aria-label="Why load the model?"
      >
        {@html questionMarkIcon}
      </button>
   </div>

    <button class="stamp-btn" onclick={viewPostings}>View Postings</button>

  </div>
</div>