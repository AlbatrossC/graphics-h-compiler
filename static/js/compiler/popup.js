(function () {
  const STORAGE_KEY = "compilerAiAssistantPopupDismissed_v2";
  const MODAL_ID = "compiler-ai-assistant-popup";
  const STYLE_ID = "compiler-ai-assistant-popup-styles";
  const DEMO_URL =
    "https://graphics-h-online-compiler-git-test-albatrosscs-projects.vercel.app/compiler";

  if (window.localStorage.getItem(STORAGE_KEY) === "true") {
    return;
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${MODAL_ID} {
        position: fixed;
        right: 20px;
        bottom: 20px;
        z-index: 9999;
        width: min(430px, calc(100vw - 32px));
      }

      #${MODAL_ID}[hidden] {
        display: none;
      }

      #${MODAL_ID} .ai-popup-modal {
        width: 100%;
        border-radius: 16px;
        padding: 18px;
        color: #1f2937;
        background: #ffffff;
        box-shadow: 0 18px 36px rgba(15, 23, 42, 0.14);
        border: 1px solid #dde5ee;
        font-family: inherit;
      }

      #${MODAL_ID} .ai-popup-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 14px;
      }

      #${MODAL_ID} .ai-popup-label {
        display: inline-block;
        margin-bottom: 8px;
        padding: 4px 9px;
        border-radius: 999px;
        background: #eef4ff;
        color: #0f62fe;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }

      #${MODAL_ID} .ai-popup-title {
        margin: 0;
        font-size: 19px;
        line-height: 1.3;
        color: #111827;
      }

      #${MODAL_ID} .ai-popup-body {
        padding: 14px;
        border: 1px solid #e5e7eb;
        border-radius: 12px;
        background: #f8fafc;
      }

      #${MODAL_ID} .ai-popup-text {
        margin: 0 0 10px;
        font-size: 14px;
        line-height: 1.6;
        color: #4b5563;
      }

      #${MODAL_ID} .ai-popup-link {
        display: inline-block;
        margin-top: 4px;
        color: #0f62fe;
        font-weight: 700;
        text-decoration: underline;
        text-underline-offset: 2px;
        word-break: break-word;
      }

      #${MODAL_ID} .ai-popup-actions {
        display: flex;
        gap: 12px;
        margin-top: 14px;
      }

      #${MODAL_ID} .ai-popup-button {
        appearance: none;
        border: 1px solid transparent;
        border-radius: 10px;
        padding: 10px 14px;
        font: inherit;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease;
      }

      #${MODAL_ID} .ai-popup-button:hover {
        transform: none;
      }

      #${MODAL_ID} .ai-popup-button-primary {
        color: #ffffff;
        background: #0f62fe;
      }

      #${MODAL_ID} .ai-popup-button-secondary {
        color: #374151;
        background: #ffffff;
        border-color: #d1d5db;
      }

      #${MODAL_ID} .ai-popup-close-icon {
        width: 32px;
        height: 32px;
        padding: 0;
        flex: 0 0 auto;
        font-size: 18px;
        line-height: 1;
      }

      @media (max-width: 640px) {
        #${MODAL_ID} {
          left: 16px;
          right: 16px;
          bottom: 16px;
          width: auto;
        }

        #${MODAL_ID} .ai-popup-modal {
          padding: 16px;
        }

        #${MODAL_ID} .ai-popup-button {
          flex: 1 1 auto;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function closePermanently(modal) {
    window.localStorage.setItem(STORAGE_KEY, "true");
    modal.hidden = true;
    modal.remove();
  }

  function buildModal() {
    if (document.getElementById(MODAL_ID)) {
      return;
    }

    const modal = document.createElement("div");
    modal.id = MODAL_ID;
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", `${MODAL_ID}-title`);

    modal.innerHTML = `
      <div class="ai-popup-modal">
        <div class="ai-popup-header">
          <div>
            <div class="ai-popup-label">Beta Demo</div>
            <h2 id="${MODAL_ID}-title" class="ai-popup-title">AI assistant preview</h2>
          </div>
          <button type="button" class="ai-popup-button ai-popup-button-secondary ai-popup-close-icon" aria-label="Close popup">
            &times;
          </button>
        </div>
        <div class="ai-popup-body">
          <p class="ai-popup-text">
            Ai assistant is being implemented at
            <a class="ai-popup-link" href="${DEMO_URL}" target="_blank" rel="noopener noreferrer">${DEMO_URL}</a>
          </p>
          <p class="ai-popup-text">
            You can check it out. It is just for demo and in beta currently. Please try it out and provide any feedback if any.
          </p>
        </div>
        <div class="ai-popup-actions">
          <a class="ai-popup-button ai-popup-button-primary" href="${DEMO_URL}" target="_blank" rel="noopener noreferrer">Open demo</a>
          <button type="button" class="ai-popup-button ai-popup-button-secondary">Close</button>
        </div>
      </div>
    `;

    const closeButtons = modal.querySelectorAll(".ai-popup-close-icon, .ai-popup-button-secondary");
    closeButtons.forEach((button) => {
      button.addEventListener("click", function () {
        closePermanently(modal);
      });
    });

    document.body.appendChild(modal);
  }

  function init() {
    if (!document.body) {
      return;
    }

    injectStyles();
    buildModal();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
