<script>
  import { onMount, onDestroy } from "svelte";

  let status = "idle"; // idle | loading | ready | error
  let progressText = "";
  let summary = "";
  let errorText = "";
  let blockedPage = false;
  const extensionName = chrome.runtime.getManifest().name;

  function handleMessage(message) {
    if (message.type === "MODEL_PROGRESS") {
      status = "loading";
      progressText = message.text;
    }
  }

  onMount(() => {
    chrome.runtime.onMessage.addListener(handleMessage);
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (!tab?.url || !/^https?:\/\//.test(tab.url)) {
        blockedPage = true;
      }
    });
  });
  onDestroy(() => {
    chrome.runtime.onMessage.removeListener(handleMessage);
  });

  async function summarize() {
    status = "loading";
    errorText = "";
    summary = "";
    const response = await chrome.runtime.sendMessage({ type: "START_SUMMARIZE" });
    if (response?.ok) {
      status = "ready";
      summary = response.summary;
    } else {
      status = "error";
      errorText = response?.error || "Unknown error";
    }
  }
</script>

<main>
  <h1>Job Sorter — AI test</h1>

  {#if blockedPage}
    <p class="error">
      {extensionName} is blocked on this page — open a real
      website (not chrome://, a new tab, or an extension page) and try again.
    </p>
  {:else}
    <button on:click={summarize} disabled={status === "loading"}>
      {status === "loading" ? "Working…" : "Summarize this page"}
    </button>
  {/if}

  {#if status === "loading"}
    <p class="progress">{progressText || "Starting…"}</p>
  {/if}

  {#if status === "ready"}
    <p class="summary">{summary}</p>
  {/if}

  {#if status === "error"}
    <p class="error">{errorText}</p>
  {/if}
</main>

<style>
  main {
    width: 320px;
    padding: 12px;
    font-family: system-ui, sans-serif;
  }
  h1 {
    font-size: 14px;
    margin: 0 0 8px;
  }
  button {
    width: 100%;
    padding: 6px;
  }
  .progress {
    font-size: 12px;
    color: #555;
  }
  .summary {
    font-size: 13px;
    white-space: pre-wrap;
  }
  .error {
    font-size: 12px;
    color: #b00020;
  }
</style>