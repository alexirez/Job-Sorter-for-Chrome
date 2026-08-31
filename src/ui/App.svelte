<script>
  import { onMount } from 'svelte';
  import { fly } from 'svelte/transition';
  import questionMarkIcon from './assets/icons/question-mark.svg?raw';
  import gearIcon from './assets/icons/gear-icon.svg?raw';
  import refreshIcon from './assets/icons/refresh-icon.svg?raw';

  const STORAGE_KEY = 'selectedModel';
  const PORT_STORAGE_KEY = 'ollamaPort';
  const REFRESH_LOCK_MS = 1800;

  let models = $state([]);
  let selectedModel = $state(null); // null = "None"
  let fetchingModels = $state(false);
  let loadingStatus = $state(null); // null | 'loaded' | 'loading' | 'unloading'
  let loadError = $state('');
  let loadErrorTimeout;
  let error = $state('');
  let ollamaPort = $state(11434);
  let showHelp = $state(false);

  async function loadSelectedModel() {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    selectedModel = result[STORAGE_KEY] ?? null;
  }

  async function saveSelectedModel(name) {
    selectedModel = name;
    await chrome.storage.local.set({ [STORAGE_KEY]: name });
  }

  async function loadModel() {
    if (!selectedModel || loadingStatus === 'loading' || loadingStatus === 'unloading') return;
    loadingStatus = 'loading';
    loadError = '';
    clearTimeout(loadErrorTimeout);
    try {
      const res = await fetch(`http://localhost:${ollamaPort}/api/chat`, {
        method: 'POST',
        body: JSON.stringify({ model: selectedModel, messages: [] })
      });
      if (!res.ok) throw new Error(`Ollama returned ${res.status}`);
      console.log(`[Job Sorter] Loaded ${selectedModel} into memory`);
      loadingStatus = 'loaded';
    } catch (e) {
      console.error(`[Job Sorter] Failed to load ${selectedModel}`, e);
      loadError = e.status === undefined
          ? `Couldn't load ${selectedModel}.\nMake sure Ollama is running and OLLAMA_ORIGINS allows this extension.`
          : 'An error occurred.';
      loadErrorTimeout = setTimeout(() => (loadError = ''), 4000);
      
    }
  }

  async function unloadModel() {
    if (!selectedModel || loadingStatus === 'loading' || loadingStatus === 'unloading') return;
    loadingStatus = 'unloading';
    loadError = '';
    clearTimeout(loadErrorTimeout);
    try {
      const res = await fetch(`http://localhost:${ollamaPort}/api/chat`, {
        method: 'POST',
        body: JSON.stringify({ model: selectedModel, messages: [], keep_alive: 0 })
      });
      if (!res.ok) throw new Error(`Ollama returned ${res.status}`);
      console.log(`[Job Sorter] Unloaded ${selectedModel} from memory`);
      loadingStatus = null;
    } catch (e) {
      console.error(`[Job Sorter] Failed to unload ${selectedModel}`, e);
      loadError = 'An error occurred.';
      loadErrorTimeout = setTimeout(() => (loadError = ''), 4000);
      loadingStatus = 'loaded';
    }
  }

  function handleLoadClick() {
    loadingStatus === 'loaded' ? unloadModel() : loadModel();
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
    saveSelectedModel(value === '' ? null : value).then(checkModelLoaded);
  }

  async function checkModelLoaded() {
    if (!selectedModel) {
      loadingStatus = null;
      return;
    }
    try {
      const res = await fetch(`http://localhost:${ollamaPort}/api/ps`);
      if (!res.ok) throw new Error(`Ollama returned ${res.status}`);
      const data = await res.json();
      loadingStatus = (data.models ?? []).some((m) => m.name === selectedModel) ? 'loaded' : null;
    } catch (e) {
      loadingStatus = null;
    }
  }

  function openSettings() {
    // TODO: wire up settings view
    console.log('Settings clicked');
  }

  function openPostingsTab() {
  chrome.tabs.create({ url: chrome.runtime.getURL('postings.html') });
}

  onMount(async () => {
    await loadSelectedModel();
    const portResult = await chrome.storage.local.get(PORT_STORAGE_KEY);
    ollamaPort = portResult[PORT_STORAGE_KEY] ?? 11434;
    await loadModels();
    await checkModelLoaded();
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
      <div class="load-wrap">
        <button class="load-btn" onclick={handleLoadClick} disabled={!selectedModel || loadingStatus === 'loading' || loadingStatus === 'unloading'}>
        {#if loadingStatus === 'loading'}
          Loading<span class="dots"><span>.</span><span>.</span><span>.</span></span>
        {:else if loadingStatus === 'unloading'}
          Unloading<span class="dots"><span>.</span><span>.</span><span>.</span></span>
        {:else if loadingStatus === 'loaded'}
          Unload Selected
        {:else}
          Load Selected
        {/if}
        </button>
        {#if loadError}
          <div class="error-bubble" transition:fly={{ y: 8, duration: 150 }}>
            {loadError}
          </div>
        {/if}
      </div>
        <div class="help-wrap">
          <button
            class="icon-btn help-btn"
            onmouseenter={() => (showHelp = true)}
            onmouseleave={() => (showHelp = false)}
            onfocus={() => (showHelp = true)}
            onblur={() => (showHelp = false)}
            aria-label="Why load the model?"
            aria-describedby="help-tooltip"
          >
            {@html questionMarkIcon}
          </button>
          {#if showHelp}
            <div class="help-tooltip" id="help-tooltip" role="tooltip" transition:fly={{ y: 8, duration: 150 }}>
              <p>AI features require loading the model into memory first.</p>
              <ul>
                <li>Depending on model size, this can take several minutes.</li>
                <li>The first load will take much longer than usual (5-10 minutes for ~5GB models).</li>
              </ul>
            </div>
          {/if}
        </div>
    </div>

    <button class="stamp-btn" onclick={openPostingsTab}>View Postings</button>

  </div>
</div>