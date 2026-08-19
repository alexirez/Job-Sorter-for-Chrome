// Runs inside the offscreen document (has DOM + WebGPU access; the
// background service worker does not, which is why this lives here).
import * as webllm from "@mlc-ai/web-llm";

const MODEL_ID = "DeepSeek-R1-Distill-Qwen-7B-q4f16_1-MLC";

let enginePromise = null;

function getEngine() {
  if (!enginePromise) {
    enginePromise = webllm.CreateMLCEngine(MODEL_ID, {
      initProgressCallback: (report) => {
        // Forward download/load progress to background so we can see it
        // in the console while testing.
        chrome.runtime.sendMessage({
          type: "MODEL_PROGRESS",
          text: report.text,
        });
      },
    });
  }
  return enginePromise;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== "SUMMARIZE_PAGE") return false;

  (async () => {
    try {
      const engine = await getEngine();

      // Trim input so the first test run is fast.
      const pageText = String(message.pageText || "").slice(0, 4000);

      const reply = await engine.chat.completions.create({
        messages: [
          {
            role: "system",
            content:
              "Summarize the given webpage content in 2-3 sentences. Be concise.",
          },
          { role: "user", content: pageText },
        ],
      });

      const summary = reply.choices[0].message.content;
      sendResponse({ ok: true, summary });
    } catch (err) {
      sendResponse({ ok: false, error: String(err) });
    }
  })();

  return true; // keep the message channel open for the async response
});