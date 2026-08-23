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

    <button class="stamp-btn" onclick={viewPostings}>View Postings</button>

  </div>
</div>