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

      // If the previously selected model no longer exists, reset to None
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

  onMount(async () => {
    await loadSelectedModel();
    await fetchModels();
  });
</script>

<div class="container">
  <h1>Job Sorter</h1>

  <div class="model-row">
    <select value={selectedModel ?? ''} onchange={handleChange}>
      <option value="">None</option>
      {#each models as model}
        <option value={model.name}>{model.name}</option>
      {/each}
    </select>
    <button onclick={fetchModels} disabled={fetchingModels}>
      {fetchingModels ? '...' : 'Refresh'}
    </button>
  </div>

  {#if error}
    <p class="error">{error}</p>
  {/if}
</div>

<style>
  :global(html, body) {
    margin: 0;
    padding: 0;
    width: 660px;
    min-height: 480px;
  }

  .container {
    padding: 16px;
  }

  .model-row {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .error {
    color: #c0392b;
    font-size: 0.9em;
  }
</style>