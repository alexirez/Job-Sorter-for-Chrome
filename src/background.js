const OFFSCREEN_URL = "offscreen.html";

async function ensureOffscreenDocument() {
  const existing = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
  });
  if (existing.length > 0) return;

  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: ["WORKERS"], // closest available reason; we're really using WebGPU/DOM
    justification: "Run local DeepSeek model via WebGPU for page summarization.",
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "MODEL_PROGRESS") {
    // Just a relay point for logging; the popup listens for this directly too.
    console.log("[job-sorter] model progress:", message.text);
    return false;
  }

  if (message.type !== "START_SUMMARIZE") return false;

  (async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      sendResponse({ ok: false, error: "No active tab found." });
      return;
    }

    console.log("[job-sorter] grabbing page text...");
    const [{ result: pageText }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => document.body.innerText,
    });

    console.log("[job-sorter] ensuring offscreen document...");
    await ensureOffscreenDocument();

    console.log("[job-sorter] sending to DeepSeek (first run downloads the model, be patient)...");
    const response = await chrome.runtime.sendMessage({
      type: "SUMMARIZE_PAGE",
      pageText,
    });

    sendResponse(response);
  })();

  return true; // keep the channel open for the async response
});