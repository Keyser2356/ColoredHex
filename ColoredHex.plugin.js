/**
 * @name ColoredHex
 * @author keyser
 * @description Окрашивает HEX кода / Colorful HEX codes
 * @version 1.0.0
 * @updateUrl https://raw.githubusercontent.com/Keyser2356/ColoredHex/refs/heads/main/ColoredHex.plugin.js
 * @downloadUrl https://raw.githubusercontent.com/Keyser2356/ColoredHex/refs/heads/main/ColoredHex.plugin.js
 * @source https://github.com/Keyser2356/ColoredHex
 */

const CLASS_SCROLLER_INNER = BdApi.Webpack.getByKeys("navigationDescription", "scrollerInner")["scrollerInner"];
const CLASS_MESSAGE_LIST_ITEM = BdApi.Webpack.getByKeys("messageListItem")["messageListItem"];
const CLASS_MESSAGE_CONTENT = BdApi.Webpack.getByKeys('threadMessageAccessoryContentLeadingIcon')["messageContent"];
const CLASS_SLATENODE = "slateTextArea";

module.exports = class ColorIndicatorEverywhere {
  observer = null;
  editorObserver = null;
  processingQueue = new Set();
  rafId = null;
  editorRafId = null;
  settings = {
    mode: "square", // "square" and "fill"
    scope: "code-only" // "everywhere" and "code-only"
  };

  start() {
    this.loadSettings();
    
    this.observer = new MutationObserver(this.handleMutations);
    const channels = document.querySelector("." + CLASS_SCROLLER_INNER);
    if (channels) {
      channels.querySelectorAll("." + CLASS_MESSAGE_CONTENT).forEach(el => {
        this.parseMessage(el);
      });
      this.observer.observe(channels, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    }
  }

  stop() {
    if (this.observer) this.observer.disconnect();
    if (this.editorObserver) this.editorObserver.disconnect();
    if (this.rafId) cancelAnimationFrame(this.rafId);
    if (this.editorRafId) cancelAnimationFrame(this.editorRafId);
    this.processingQueue.clear();
  }

  loadSettings() {
    const saved = BdApi.Data.load("ColorIndicatorEverywhere", "settings");
    if (saved) this.settings = { ...this.settings, ...saved };
  }

  saveSettings() {
    BdApi.Data.save("ColorIndicatorEverywhere", "settings", this.settings);
  }

  getSettingsPanel() {
    return BdApi.React.createElement(BdApi.Components.SettingGroup, {
      title: "Режим отображения цветов",
      settings: [
        {
          type: "radio",
          name: "Mode",
          note: "Choose the way to display the color codes",
          value: this.settings.mode,
          options: [
            { name: "Square", value: "square" },
            { name: "Full", value: "fill" }
          ],
          onChange: (value) => {
            this.settings.mode = value;
            this.saveSettings();
            this.onSwitch();
          }
        },
        {
          type: "radio",
          name: "Area",
          note: "Where to display color indicators",
          value: this.settings.scope,
          options: [
            { name: "Everywhere", value: "everywhere" },
            { name: "Code-only", value: "code-only" }
          ],
          onChange: (value) => {
            this.settings.scope = value;
            this.saveSettings();
            this.onSwitch();
          }
        }
      ]
    });
  }

  onSwitch() {
    if (this.observer) this.observer.disconnect();
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.processingQueue.clear();
    
    document.querySelectorAll(".color-indicator").forEach(el => {
      const parent = el.parentNode;
      if (parent) {
        const text = el.textContent;
        const textNode = document.createTextNode(text);
        parent.replaceChild(textNode, el);
      }
    });
    
    document.querySelectorAll('[data-color-processed]').forEach(el => {
      el.removeAttribute('data-color-processed');
    });
    
    this.observer = new MutationObserver(this.handleMutations);

    const channels = document.querySelector("." + CLASS_SCROLLER_INNER);
    if (channels) {
      channels.querySelectorAll("." + CLASS_MESSAGE_CONTENT).forEach(el => {
        this.parseMessage(el);
      });
      this.observer.observe(channels, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    }
  }

  setupEditorObserver() {
  }

  handleMutations = (mutationsList) => {
    for (const mutation of mutationsList) {
      if (mutation.type === "childList") {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== 1) continue;

          if (node.classList?.contains(CLASS_MESSAGE_CONTENT)) {
            this.processingQueue.add(node);
          } 
          else if (node.classList?.contains(CLASS_MESSAGE_LIST_ITEM)) {
            const content = node.querySelector("." + CLASS_MESSAGE_CONTENT);
            if (content) this.processingQueue.add(content);
          }
          else if (node.querySelector) {
            node.querySelectorAll("." + CLASS_MESSAGE_CONTENT).forEach(el => {
              this.processingQueue.add(el);
            });
          }
        }
      } 
      else if (mutation.type === "characterData") {
        const messageContent = mutation.target.parentElement?.closest("." + CLASS_MESSAGE_CONTENT);
        if (messageContent) {
          this.processingQueue.add(messageContent);
        }
      }
    }
    
    this.scheduleProcessing();
  };

  scheduleProcessing() {
    if (this.rafId) return;
    
    this.rafId = requestAnimationFrame(() => {
      const batch = Array.from(this.processingQueue).slice(0, 10);
      batch.forEach(el => {
        this.parseMessage(el);
        this.processingQueue.delete(el);
      });
      
      this.rafId = null;
      
      if (this.processingQueue.size > 0) {
        this.scheduleProcessing();
      }
    });
  }

  parseMessage = (messageContent) => {
    if (!messageContent || messageContent.hasAttribute('data-color-processed')) return;
    
    const oldIndicators = messageContent.querySelectorAll(".color-indicator");
    if (oldIndicators.length > 0) {
      oldIndicators.forEach(el => {
        const parent = el.parentNode;
        if (parent) {
          const text = el.textContent;
          const textNode = document.createTextNode(text);
          parent.replaceChild(textNode, el);
        }
      });
    }

    const colorRegex = /#(?:[0-9a-fA-F]{3,6})\b|\b(?:rgb|rgba|hsl|hsla)\([^)]*\)|(?<=color:\s*)(\w+)(?=\s*(?:!important)?\s*;)/gi;
    
    if (!colorRegex.test(messageContent.textContent)) {
      messageContent.setAttribute('data-color-processed', 'true');
      return;
    }
    colorRegex.lastIndex = 0;

    const walker = document.createTreeWalker(
      messageContent,
      NodeFilter.SHOW_TEXT,
      node => {
        if (node.parentElement?.closest("a, .spoiler-text, .inlineMediaEmbed, .color-indicator")) {
          return NodeFilter.FILTER_REJECT;
        }
        if (this.settings.scope === "code-only" && !node.parentElement?.closest("code")) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    );

    const nodes = [];
    let node;
    while (node = walker.nextNode()) {
      if (colorRegex.test(node.textContent)) nodes.push(node);
    }

    nodes.forEach(textNode => {
      colorRegex.lastIndex = 0;
      const fragment = document.createDocumentFragment();
      let lastIndex = 0;
      let match;

      while (match = colorRegex.exec(textNode.textContent)) {
        if (match.index > lastIndex) {
          fragment.appendChild(document.createTextNode(textNode.textContent.slice(lastIndex, match.index)));
        }

        const color = match[0];
        const luminance = this.getLuminance(color);
        const borderColor = luminance > 0.7 ? "#000000" : "#ffffff";

        if (this.settings.mode === "square") {
          const container = document.createElement("span");
          container.className = "color-indicator";
          container.style.display = "inline";
          container.style.whiteSpace = "nowrap";

          const square = document.createElement("span");
          square.style.display = "inline-block";
          square.style.width = "1em";
          square.style.height = "1em";
          square.style.backgroundColor = color;
          square.style.border = `1.5px solid ${borderColor}`;
          square.style.borderRadius = "3px";
          square.style.boxSizing = "border-box";
          square.style.verticalAlign = "-2px";
          square.style.marginRight = "0.35em";

          const textSpan = document.createElement("span");
          textSpan.style.color = "var(--text-normal)";
          textSpan.style.fontFamily = "inherit";
          textSpan.style.fontSize = "inherit";
          textSpan.style.fontWeight = "inherit";
          textSpan.textContent = color;

          container.appendChild(square);
          container.appendChild(textSpan);
          fragment.appendChild(container);
        } else {
          const textColor = this.getLuminance(color) > 0.5 ? "#000000" : "#ffffff";
          const textSpan = document.createElement("span");
          textSpan.className = "color-indicator";
          textSpan.style.backgroundColor = color;
          textSpan.style.color = textColor;
          textSpan.style.padding = "2px 4px";
          textSpan.style.borderRadius = "2px";
          textSpan.style.fontFamily = "inherit";
          textSpan.style.fontSize = "inherit";
          textSpan.style.fontWeight = "inherit";
          textSpan.textContent = color;

          fragment.appendChild(textSpan);
        }

        lastIndex = colorRegex.lastIndex;
      }

      if (lastIndex < textNode.textContent.length) {
        fragment.appendChild(document.createTextNode(textNode.textContent.slice(lastIndex)));
      }

      textNode.parentNode.replaceChild(fragment, textNode);
    });
  };

  getLuminance(color) {
    const div = document.createElement("div");
    div.style.color = color;
    document.body.appendChild(div);
    const computed = window.getComputedStyle(div).color;
    document.body.removeChild(div);

    const [r, g, b] = computed.match(/[\d.]+/g)?.map(Number) || [0, 0, 0];
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  }
};
