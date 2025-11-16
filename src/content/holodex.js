// Flow Chat for Holodex - Main Content Script
// Manages flow display on Holodex multiview page

(function() {
  'use strict';

  // Default settings
  const defaultSettings = {
    enabled: true,
    speed: 160,      // pixels per second (fixed speed)
    fontSize: 28,    // pixels
    opacity: 1.0,
    maxMessages: 50, // max simultaneous messages
    showAuthor: true,
    showAvatar: false,
    displayArea: 1.0, // percentage of screen height to use (0.0-1.0)
    minVerticalGap: 4 // minimum pixels between messages vertically
  };

  let settings = { ...defaultSettings };
  let flowContainers = new Map(); // videoId -> container element
  let activeMessages = new Map(); // videoId -> array of active message info
  let messageCount = 0;
  let controlsVisible = false;

  // Load settings from storage
  function loadSettings() {
    chrome.storage.sync.get('flowChatSettings', (result) => {
      if (result.flowChatSettings) {
        settings = { ...defaultSettings, ...result.flowChatSettings };
        updateStyles();
      }
    });
  }

  // Save settings to storage
  function saveSettings() {
    chrome.storage.sync.set({ flowChatSettings: settings });
  }

  // Find all video cells in Holodex multiview
  function findVideoCells() {
    // Holodex uses a grid of video cells
    const cells = document.querySelectorAll('.video-cell, [class*="cell"], .v-responsive');
    return Array.from(cells).filter(cell => {
      // Filter to cells that contain video iframes
      return cell.querySelector('iframe[src*="youtube.com/embed"]') ||
             cell.querySelector('video') ||
             cell.querySelector('[class*="player"]');
    });
  }

  // Create flow container for a video cell
  function createFlowContainer(videoCell, videoId) {
    if (flowContainers.has(videoId)) {
      return flowContainers.get(videoId);
    }

    const container = document.createElement('div');
    container.className = 'flow-chat-container';
    container.dataset.videoId = videoId;

    // Ensure video cell has relative positioning
    const computedStyle = window.getComputedStyle(videoCell);
    if (computedStyle.position === 'static') {
      videoCell.style.position = 'relative';
    }

    videoCell.appendChild(container);
    flowContainers.set(videoId, container);
    activeMessages.set(videoId, []);

    return container;
  }

  // Check if two messages would collide
  function wouldCollide(msg1, msg2, containerWidth) {
    // Vertical overlap check
    if (msg1.top + msg1.height + settings.minVerticalGap <= msg2.top ||
        msg2.top + msg2.height + settings.minVerticalGap <= msg1.top) {
      return false; // No vertical overlap
    }

    // Horizontal collision check (do they overlap in time and space?)
    // Calculate positions at current time
    const now = Date.now();

    // Message position: starts at containerWidth, moves left at speed px/s
    // position = containerWidth - speed * (now - startTime) / 1000
    const msg1Left = containerWidth - settings.speed * (now - msg1.startTime) / 1000;
    const msg1Right = msg1Left + msg1.width;

    const msg2Left = containerWidth - settings.speed * (now - msg2.startTime) / 1000;
    const msg2Right = msg2Left + msg2.width;

    // Check if msg1's right edge has passed msg2's left edge
    // New message (msg2) should not overlap with existing message (msg1)
    // Check: will the new message catch up or collide with existing one?

    // If msg1 is ahead (started earlier), check if msg2 would hit it
    // Since both move at same speed, if msg1Right > msg2Left now, they collide
    // Also need to ensure new message tail doesn't get hit by existing message head

    // Simple overlap check: if horizontal ranges overlap now, they'll stay overlapped
    if (msg1Right > msg2Left && msg1Left < msg2Right) {
      return true; // Collision
    }

    return false;
  }

  // Find available Y position for new message
  function findAvailablePosition(videoId, messageWidth, messageHeight, containerWidth, containerHeight) {
    const messages = activeMessages.get(videoId) || [];
    const maxY = containerHeight * settings.displayArea - messageHeight;

    // Try to place message at each possible Y position
    // Start from top, find first non-colliding position
    const step = messageHeight + settings.minVerticalGap;

    for (let y = 0; y <= maxY; y += step) {
      const newMsg = {
        top: y,
        height: messageHeight,
        width: messageWidth,
        startTime: Date.now()
      };

      let hasCollision = false;

      for (const existingMsg of messages) {
        if (wouldCollide(existingMsg, newMsg, containerWidth)) {
          hasCollision = true;
          break;
        }
      }

      if (!hasCollision) {
        return y;
      }
    }

    // No available position found
    return -1;
  }

  // Create flow message element
  function createFlowMessage(chatData) {
    const container = flowContainers.get(chatData.videoId);
    if (!container || !settings.enabled) return;

    // Limit simultaneous messages
    if (container.children.length >= settings.maxMessages) {
      // Skip this message if at capacity
      return;
    }

    const messageEl = document.createElement('div');
    messageEl.className = `flow-chat-message ${chatData.type}`;
    messageEl.style.fontSize = `${settings.fontSize}px`;
    messageEl.style.opacity = settings.opacity;

    // Add avatar if enabled
    if (settings.showAvatar && chatData.avatar) {
      const avatar = document.createElement('img');
      avatar.className = 'flow-chat-avatar';
      avatar.src = chatData.avatar;
      avatar.alt = '';
      messageEl.appendChild(avatar);
    }

    // Add author if enabled
    if (settings.showAuthor && chatData.author) {
      const author = document.createElement('span');
      author.className = 'flow-chat-author';
      author.textContent = chatData.author + ':';
      messageEl.appendChild(author);
    }

    // Add message content (text and emoji/sticker images)
    const messageContent = document.createElement('span');
    messageContent.className = 'flow-chat-content';

    if (chatData.fragments && Array.isArray(chatData.fragments)) {
      chatData.fragments.forEach(fragment => {
        if (fragment.type === 'text') {
          const textNode = document.createTextNode(fragment.content);
          messageContent.appendChild(textNode);
        } else if (fragment.type === 'emoji') {
          const emojiImg = document.createElement('img');
          emojiImg.className = 'flow-chat-emoji';
          emojiImg.src = fragment.src;
          emojiImg.alt = fragment.alt || '';
          emojiImg.style.height = `${settings.fontSize}px`;
          emojiImg.style.width = 'auto';
          emojiImg.style.verticalAlign = 'middle';
          emojiImg.style.display = 'inline';
          messageContent.appendChild(emojiImg);
        }
      });
    } else if (chatData.message) {
      // Fallback for old format
      messageContent.textContent = chatData.message;
    }

    messageEl.appendChild(messageContent);

    // Temporarily add to DOM to measure width (hidden)
    messageEl.style.visibility = 'hidden';
    messageEl.style.position = 'absolute';
    messageEl.style.left = '-9999px';
    container.appendChild(messageEl);

    // Get actual message dimensions
    const messageWidth = messageEl.offsetWidth;
    const messageHeight = messageEl.offsetHeight;
    const containerWidth = container.offsetWidth;
    const containerHeight = container.offsetHeight;

    // Find available Y position (collision detection)
    const topPosition = findAvailablePosition(
      chatData.videoId,
      messageWidth,
      messageHeight,
      containerWidth,
      containerHeight
    );

    if (topPosition === -1) {
      // No available position, remove message and skip
      messageEl.remove();
      return;
    }

    // Calculate animation duration based on fixed speed (pixels per second)
    const totalDistance = containerWidth + messageWidth;
    const animationDuration = totalDistance / settings.speed; // seconds

    // Track this message for collision detection
    const messageInfo = {
      top: topPosition,
      height: messageHeight,
      width: messageWidth,
      startTime: Date.now(),
      element: messageEl
    };

    const messages = activeMessages.get(chatData.videoId);
    messages.push(messageInfo);

    // Reset positioning for animation
    messageEl.style.visibility = 'visible';
    messageEl.style.position = 'absolute';
    messageEl.style.left = '100%'; // Start from right edge
    messageEl.style.top = `${topPosition}px`;

    // Set custom animation with proper distance and fixed speed
    messageEl.style.setProperty('--flow-distance', `-${totalDistance}px`);
    messageEl.style.animationDuration = `${animationDuration}s`;

    // Remove after animation
    messageEl.addEventListener('animationend', () => {
      messageEl.remove();
      // Remove from active messages
      const idx = messages.indexOf(messageInfo);
      if (idx > -1) {
        messages.splice(idx, 1);
      }
      messageCount--;
    });

    messageCount++;
  }

  // Handle incoming chat messages
  function handleChatMessage(event) {
    if (event.origin !== 'https://www.youtube.com') return;

    const { type, data } = event.data;

    if (type === 'FLOW_CHAT_MESSAGE' && data) {
      createFlowMessage(data);
    } else if (type === 'FLOW_CHAT_READY') {
      console.log('[FlowChat] Chat observer ready for video:', data.videoId);
      setupVideoCell(data.videoId);
    }
  }

  // Setup video cell based on video ID
  function setupVideoCell(videoId) {
    // Find the iframe or cell containing this video
    const iframes = document.querySelectorAll('iframe[src*="youtube.com"]');

    iframes.forEach(iframe => {
      const src = iframe.src || '';
      if (src.includes(videoId) || src.includes('embed')) {
        const cell = iframe.closest('.video-cell, [class*="cell"]') ||
                     iframe.parentElement?.parentElement;
        if (cell) {
          createFlowContainer(cell, videoId);
        }
      }
    });
  }

  // Initialize flow containers for all visible videos
  function initializeContainers() {
    const cells = findVideoCells();

    cells.forEach((cell, index) => {
      const iframe = cell.querySelector('iframe[src*="youtube.com"]');
      if (iframe) {
        // Extract video ID from iframe src
        const match = iframe.src.match(/(?:embed\/|v=)([a-zA-Z0-9_-]{11})/);
        const videoId = match ? match[1] : `cell-${index}`;
        createFlowContainer(cell, videoId);
      }
    });
  }

  // Create toggle button
  function createToggleButton() {
    const toggle = document.createElement('button');
    toggle.className = 'flow-chat-toggle';
    toggle.innerHTML = '💬';
    toggle.title = 'Flow Chat Settings';

    toggle.addEventListener('click', () => {
      if (controlsVisible) {
        hideControls();
      } else {
        showControls();
      }
    });

    document.body.appendChild(toggle);
  }

  // Create control panel
  function createControlPanel() {
    const panel = document.createElement('div');
    panel.className = 'flow-chat-controls';
    panel.id = 'flow-chat-controls';
    panel.style.display = 'none';

    panel.innerHTML = `
      <h3>Flow Chat Settings</h3>

      <label>
        <span>Enable</span>
        <input type="checkbox" id="flow-enabled" ${settings.enabled ? 'checked' : ''}>
      </label>

      <label>
        <span>Speed (${settings.speed}px/s)</span>
        <input type="range" id="flow-speed" min="80" max="400" step="20" value="${settings.speed}">
      </label>

      <label>
        <span>Size (${settings.fontSize}px)</span>
        <input type="range" id="flow-font-size" min="16" max="48" value="${settings.fontSize}">
      </label>

      <label>
        <span>Opacity</span>
        <input type="range" id="flow-opacity" min="0.3" max="1" step="0.1" value="${settings.opacity}">
      </label>

      <label>
        <span>Display Area (${Math.round(settings.displayArea * 100)}%)</span>
        <input type="range" id="flow-display-area" min="0.3" max="1" step="0.1" value="${settings.displayArea}">
      </label>

      <label>
        <span>Show Author</span>
        <input type="checkbox" id="flow-show-author" ${settings.showAuthor ? 'checked' : ''}>
      </label>

      <label>
        <span>Show Avatar</span>
        <input type="checkbox" id="flow-show-avatar" ${settings.showAvatar ? 'checked' : ''}>
      </label>

      <button id="flow-clear" class="danger">Clear All Messages</button>
      <button id="flow-save">Save Settings</button>
    `;

    document.body.appendChild(panel);

    // Event listeners
    panel.querySelector('#flow-enabled').addEventListener('change', (e) => {
      settings.enabled = e.target.checked;
      saveSettings();
    });

    panel.querySelector('#flow-speed').addEventListener('input', (e) => {
      settings.speed = parseInt(e.target.value);
      e.target.previousElementSibling.textContent = `Speed (${settings.speed}px/s)`;
    });

    panel.querySelector('#flow-font-size').addEventListener('input', (e) => {
      settings.fontSize = parseInt(e.target.value);
      e.target.previousElementSibling.textContent = `Size (${settings.fontSize}px)`;
    });

    panel.querySelector('#flow-opacity').addEventListener('input', (e) => {
      settings.opacity = parseFloat(e.target.value);
    });

    panel.querySelector('#flow-display-area').addEventListener('input', (e) => {
      settings.displayArea = parseFloat(e.target.value);
      e.target.previousElementSibling.textContent = `Display Area (${Math.round(settings.displayArea * 100)}%)`;
    });

    panel.querySelector('#flow-show-author').addEventListener('change', (e) => {
      settings.showAuthor = e.target.checked;
    });

    panel.querySelector('#flow-show-avatar').addEventListener('change', (e) => {
      settings.showAvatar = e.target.checked;
    });

    panel.querySelector('#flow-clear').addEventListener('click', () => {
      flowContainers.forEach(container => {
        container.innerHTML = '';
      });
      messageCount = 0;
    });

    panel.querySelector('#flow-save').addEventListener('click', () => {
      saveSettings();
      alert('Settings saved!');
    });
  }

  function showControls() {
    const panel = document.getElementById('flow-chat-controls');
    if (panel) {
      panel.style.display = 'block';
      controlsVisible = true;
    }
  }

  function hideControls() {
    const panel = document.getElementById('flow-chat-controls');
    if (panel) {
      panel.style.display = 'none';
      controlsVisible = false;
    }
  }

  function updateStyles() {
    // Update any global styles based on settings
  }

  // Watch for DOM changes to detect new video cells
  function watchForNewCells() {
    const observer = new MutationObserver((mutations) => {
      let shouldReinitialize = false;

      mutations.forEach(mutation => {
        if (mutation.addedNodes.length > 0) {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              if (node.querySelector('iframe[src*="youtube.com"]') ||
                  node.tagName === 'IFRAME') {
                shouldReinitialize = true;
              }
            }
          });
        }
      });

      if (shouldReinitialize) {
        setTimeout(initializeContainers, 1000);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // Initialize extension
  function init() {
    console.log('[FlowChat] Initializing Flow Chat for Holodex');

    loadSettings();
    createToggleButton();
    createControlPanel();

    // Listen for messages from chat iframes
    window.addEventListener('message', handleChatMessage);

    // Initial setup
    setTimeout(() => {
      initializeContainers();
      watchForNewCells();
    }, 2000);

    console.log('[FlowChat] Flow Chat initialized');
  }

  // Start when page is ready
  if (document.readyState === 'complete') {
    init();
  } else {
    window.addEventListener('load', init);
  }
})();
