// Flow Chat for Holodex - Main Content Script
// Manages flow display on Holodex multiview page

(function() {
  'use strict';

  // Default settings
  const defaultSettings = {
    enabled: true,
    displayTime: 8,  // seconds to display on screen
    fontSize: 28,    // pixels
    opacity: 1.0,
    maxMessages: 100, // max simultaneous messages (increased from 50)
    displayArea: 1.0, // percentage of screen height to use (0.0-1.0)
    minVerticalGap: 4, // minimum pixels between messages vertically
    // Show/hide comments per user type
    showOwner: true,
    showModerator: true,
    showMember: true,
    showNormal: true,
    // Avatar settings per user type
    avatarOwner: true,
    avatarModerator: false,
    avatarMember: false,
    avatarNormal: false,
    // Color settings per user type (RGB)
    colorOwner: { r: 255, g: 215, b: 0 },      // Gold
    colorModerator: { r: 94, g: 132, b: 241 },  // Blue
    colorMember: { r: 46, g: 204, b: 113 },     // Green
    colorNormal: { r: 255, g: 255, b: 255 }     // White
  };

  let settings = { ...defaultSettings };
  let flowContainers = new Map(); // videoId -> container element
  let activeMessages = new Map(); // videoId -> array of active message info
  let messageCount = 0;
  let controlsVisible = false;
  let backgroundChatIframes = new Map(); // videoId -> iframe element
  let detectedVideos = new Set(); // Track detected video IDs to avoid duplicates
  let chatOverlays = new Map(); // videoId -> chat overlay element
  let videoCells = new Map(); // videoId -> video cell element

  // Load settings from storage
  function loadSettings() {
    chrome.storage.sync.get('flowChatSettings', (result) => {
      if (result.flowChatSettings) {
        settings = { ...defaultSettings, ...result.flowChatSettings };
        updateStyles();
        updateControlPanelUI();
      }
    });
  }

  // Listen for storage changes (for immediate settings application)
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'sync' && changes.flowChatSettings) {
      settings = { ...defaultSettings, ...changes.flowChatSettings.newValue };
      updateControlPanelUI();
      console.log('[FlowChat] Settings updated:', settings);
    }
  });

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
    console.log(`[FlowChat] createFlowContainer called for videoId: ${videoId}`, videoCell);

    if (flowContainers.has(videoId)) {
      console.log(`[FlowChat] Flow container already exists for ${videoId}`);
      return flowContainers.get(videoId);
    }

    console.log(`[FlowChat] Creating new flow container for ${videoId}`);

    const container = document.createElement('div');
    container.className = 'flow-chat-container';
    container.dataset.videoId = videoId;

    // Ensure video cell has relative positioning
    const computedStyle = window.getComputedStyle(videoCell);
    console.log(`[FlowChat] Video cell position: ${computedStyle.position}`);
    if (computedStyle.position === 'static') {
      videoCell.style.position = 'relative';
      console.log(`[FlowChat] Changed video cell position to relative`);
    }

    videoCell.appendChild(container);
    flowContainers.set(videoId, container);
    activeMessages.set(videoId, []);
    videoCells.set(videoId, videoCell);

    console.log(`[FlowChat] ✓ Flow container created successfully for ${videoId}`);

    return container;
  }

  // Create chat overlay for video hover
  function createChatOverlay(videoId, videoCell) {
    console.log(`[FlowChat] createChatOverlay called for videoId: ${videoId}`, videoCell);

    if (chatOverlays.has(videoId)) {
      console.log(`[FlowChat] Chat overlay already exists for ${videoId}`);
      return chatOverlays.get(videoId);
    }

    console.log(`[FlowChat] Creating new chat overlay for ${videoId}`);

    const overlay = document.createElement('div');
    overlay.className = 'flow-chat-overlay';
    overlay.dataset.videoId = videoId;
    overlay.style.display = 'none'; // Initially hidden

    // Create iframe for chat (this will be used for both reading and writing comments)
    const baseUrl = window.location.hostname;
    const isLive = checkIfVideoIsLive(videoId);
    // Add flow_chat_bg=true parameter so chat-observer.js can detect and monitor this iframe
    const replayUrl = `https://www.youtube.com/live_chat_replay?v=${videoId}&embed_domain=${baseUrl}&flow_chat_bg=true`;
    const liveUrl = `https://www.youtube.com/live_chat?v=${videoId}&embed_domain=${baseUrl}&flow_chat_bg=true`;

    console.log(`[FlowChat] Video ${videoId} is ${isLive ? 'LIVE' : 'REPLAY'}`);
    console.log(`[FlowChat] Chat URL: ${isLive ? liveUrl : replayUrl}`);

    const iframe = document.createElement('iframe');
    iframe.src = isLive ? liveUrl : replayUrl;
    iframe.className = 'flow-chat-overlay-iframe';
    iframe.allow = 'autoplay; encrypted-media';
    iframe.setAttribute('data-video-id', videoId);

    // Store iframe reference for message handling
    backgroundChatIframes.set(videoId, iframe);

    overlay.appendChild(iframe);

    console.log(`[FlowChat] Appending overlay to video cell:`, videoCell);
    videoCell.appendChild(overlay);
    chatOverlays.set(videoId, overlay);

    console.log(`[FlowChat] Overlay element:`, overlay);
    console.log(`[FlowChat] Overlay dimensions: ${overlay.offsetWidth}x${overlay.offsetHeight}`);
    console.log(`[FlowChat] Overlay position:`, window.getComputedStyle(overlay).position);

    // Add hover listeners to video cell
    // Show overlay when cursor enters video cell, hide when cursor leaves video cell
    // This ensures the overlay stays visible while cursor is anywhere on the video
    let hideTimeout = null;

    videoCell.addEventListener('mouseenter', () => {
      console.log(`[FlowChat] Mouse entered video cell for ${videoId}`);
      if (hideTimeout) {
        clearTimeout(hideTimeout);
        hideTimeout = null;
      }
      overlay.style.display = 'block';
      console.log(`[FlowChat] Overlay display set to block for ${videoId}`);
    });

    videoCell.addEventListener('mouseleave', () => {
      console.log(`[FlowChat] Mouse left video cell for ${videoId}`);
      // Add small delay before hiding
      hideTimeout = setTimeout(() => {
        overlay.style.display = 'none';
        console.log(`[FlowChat] Overlay hidden for ${videoId}`);
      }, 300);
    });

    // If not live, try switching to live URL after 5 seconds
    if (!isLive) {
      setTimeout(() => {
        if (checkIfVideoIsLive(videoId)) {
          console.log(`[FlowChat] Switching ${videoId} to live chat`);
          iframe.src = liveUrl;
        }
      }, 5000);
    }

    console.log(`[FlowChat] ✓ Chat overlay created successfully for ${videoId} (${isLive ? 'live' : 'replay'})`);
    console.log(`[FlowChat] This iframe will handle both message reading and comment input`);

    return overlay;
  }

  // Check if two messages would collide
  function wouldCollide(msg1, msg2, containerWidth) {
    // Vertical overlap check
    if (msg1.top + msg1.height + settings.minVerticalGap <= msg2.top ||
        msg2.top + msg2.height + settings.minVerticalGap <= msg1.top) {
      return false; // No vertical overlap
    }

    // Horizontal collision check
    // Each message has its own speed based on its width and displayTime
    const now = Date.now();

    // Calculate speed for each message (pixels per second)
    const msg1Speed = (containerWidth + msg1.width) / settings.displayTime;
    const msg2Speed = (containerWidth + msg2.width) / settings.displayTime;

    // Calculate current positions
    const msg1Left = containerWidth - msg1Speed * (now - msg1.startTime) / 1000;
    const msg1Right = msg1Left + msg1.width;

    const msg2Left = containerWidth - msg2Speed * (now - msg2.startTime) / 1000;
    const msg2Right = msg2Left + msg2.width;

    // If they overlap now, they collide
    if (msg1Right > msg2Left && msg1Left < msg2Right) {
      return true;
    }

    // Check if they will collide in the future (faster message catches up)
    // If msg2 is faster and behind msg1, check if it will catch up
    if (msg2Speed > msg1Speed && msg2Left > msg1Left) {
      // Time for msg2's head to reach msg1's tail
      const relativeSpeed = msg2Speed - msg1Speed;
      const distance = msg2Left - msg1Right;
      const timeToCollide = (distance / relativeSpeed) * 1000; // ms

      // Check if collision happens before msg1 exits screen
      const msg1ExitTime = (msg1Right / msg1Speed) * 1000;
      if (timeToCollide < msg1ExitTime) {
        return true;
      }
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

    // Check if this user type should be shown
    let shouldShow = true;
    switch (chatData.type) {
      case 'owner':
        shouldShow = settings.showOwner;
        break;
      case 'moderator':
        shouldShow = settings.showModerator;
        break;
      case 'member':
        shouldShow = settings.showMember;
        break;
      default:
        shouldShow = settings.showNormal;
    }

    if (!shouldShow) return;

    // Limit simultaneous messages
    if (container.children.length >= settings.maxMessages) {
      // Skip this message if at capacity
      return;
    }

    const messageEl = document.createElement('div');
    messageEl.className = `flow-chat-message ${chatData.type}`;
    messageEl.style.fontSize = `${settings.fontSize}px`;
    messageEl.style.opacity = settings.opacity;

    // Get color for this user type
    let messageColor = settings.colorNormal;
    switch (chatData.type) {
      case 'owner':
        messageColor = settings.colorOwner;
        break;
      case 'moderator':
        messageColor = settings.colorModerator;
        break;
      case 'member':
        messageColor = settings.colorMember;
        break;
      default:
        messageColor = settings.colorNormal;
    }
    messageEl.style.color = `rgb(${messageColor.r}, ${messageColor.g}, ${messageColor.b})`;

    // Add avatar based on user type settings
    let showAvatar = false;
    if (chatData.avatar) {
      switch (chatData.type) {
        case 'owner':
          showAvatar = settings.avatarOwner;
          break;
        case 'moderator':
          showAvatar = settings.avatarModerator;
          break;
        case 'member':
          showAvatar = settings.avatarMember;
          break;
        default:
          showAvatar = settings.avatarNormal;
      }
    }

    if (showAvatar) {
      const avatar = document.createElement('img');
      avatar.className = 'flow-chat-avatar';
      avatar.src = chatData.avatar;
      avatar.alt = '';
      messageEl.appendChild(avatar);
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

    // Animation duration is fixed to displayTime (seconds)
    const totalDistance = containerWidth + messageWidth;
    const animationDuration = settings.displayTime; // seconds

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

    console.log('[FlowChat] Received message from YouTube:', event.data);

    const { type, data } = event.data;

    if (type === 'FLOW_CHAT_MESSAGE' && data) {
      console.log('[FlowChat] Processing chat message:', data);
      createFlowMessage(data);
    } else if (type === 'FLOW_CHAT_READY') {
      if (data && data.videoId) {
        console.log('[FlowChat] Chat observer ready for video:', data.videoId);
        setupVideoCell(data.videoId);
      } else {
        console.warn('[FlowChat] FLOW_CHAT_READY received but data or videoId is missing:', data);
      }
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

  // Extract video ID from URL
  function extractVideoId(url) {
    if (!url) return null;

    let match = url.match(/[?&]v=([^&]+)/);
    if (match) return match[1];

    match = url.match(/\/embed\/([^?&]+)/);
    if (match) return match[1];

    match = url.match(/\/watch\/([^?&]+)/);
    if (match) return match[1];

    return null;
  }

  // Check if video is live or archived
  function checkIfVideoIsLive(videoId) {
    // Check iframe URLs for live indicators
    const iframes = document.querySelectorAll('iframe[src*="youtube.com"]');
    for (const iframe of iframes) {
      const src = iframe.src;
      if (src.includes(videoId) && src.includes('/live/')) {
        return true;
      }
    }

    // Check data attributes
    const videoElements = document.querySelectorAll(`[data-video-id="${videoId}"]`);
    for (const element of videoElements) {
      const dataStatus = element.getAttribute('data-status');
      if (dataStatus === 'live' || element.classList.contains('live')) {
        return true;
      }
    }

    // Check for live badges
    const liveBadges = document.querySelectorAll('.badge-live, .live-badge, [class*="LiveBadge"]');
    if (liveBadges.length > 0) {
      return true;
    }

    return false;
  }

  // Detect and register videos on the page
  function detectAndRegisterVideos() {
    console.log('[FlowChat] === detectAndRegisterVideos called ===');

    // Pattern 1: YouTube embed iframes
    const iframes = document.querySelectorAll('iframe[src*="youtube.com/embed"]');
    console.log(`[FlowChat] Found ${iframes.length} YouTube embed iframes`);

    iframes.forEach((iframe, index) => {
      console.log(`[FlowChat] Processing iframe ${index + 1}/${iframes.length}:`, iframe.src);
      const videoId = extractVideoId(iframe.src);
      console.log(`[FlowChat] Extracted videoId: ${videoId}`);

      if (videoId && !detectedVideos.has(videoId)) {
        detectedVideos.add(videoId);
        console.log(`[FlowChat] ✓ Detected NEW video from iframe: ${videoId}`);

        // Create flow container
        const cell = iframe.closest('.video-cell, [class*="cell"]') || iframe.parentElement;
        console.log(`[FlowChat] Found video cell:`, cell);

        if (cell) {
          console.log(`[FlowChat] Creating flow container for ${videoId}...`);
          createFlowContainer(cell, videoId);

          console.log(`[FlowChat] Creating chat overlay for ${videoId}...`);
          // Create chat overlay (this single iframe handles both reading and writing)
          createChatOverlay(videoId, cell);
        } else {
          console.warn(`[FlowChat] ✗ No video cell found for iframe with videoId ${videoId}`);
        }
      } else if (videoId) {
        console.log(`[FlowChat] Video ${videoId} already detected, skipping`);
      } else {
        console.warn(`[FlowChat] Could not extract videoId from iframe src: ${iframe.src}`);
      }
    });

    // Pattern 2: Elements with data-video-id attribute
    const videoElements = document.querySelectorAll('[data-video-id]');
    console.log(`[FlowChat] Found ${videoElements.length} elements with data-video-id`);

    videoElements.forEach((element, index) => {
      const videoId = element.getAttribute('data-video-id');
      console.log(`[FlowChat] Processing element ${index + 1}/${videoElements.length} with data-video-id: ${videoId}`);

      if (videoId && !detectedVideos.has(videoId)) {
        detectedVideos.add(videoId);
        console.log(`[FlowChat] ✓ Detected NEW video from data-video-id: ${videoId}`);

        // Create flow container
        const cell = element.closest('.video-cell, [class*="cell"]') || element;
        console.log(`[FlowChat] Found video cell:`, cell);

        if (cell) {
          console.log(`[FlowChat] Creating flow container for ${videoId}...`);
          createFlowContainer(cell, videoId);

          console.log(`[FlowChat] Creating chat overlay for ${videoId}...`);
          // Create chat overlay (this single iframe handles both reading and writing)
          createChatOverlay(videoId, cell);
        } else {
          console.warn(`[FlowChat] ✗ No video cell found for element with videoId ${videoId}`);
        }
      } else if (videoId) {
        console.log(`[FlowChat] Video ${videoId} already detected, skipping`);
      }
    });

    console.log('[FlowChat] === detectAndRegisterVideos completed ===');
    console.log(`[FlowChat] Total detected videos: ${detectedVideos.size}`);
    console.log(`[FlowChat] Detected video IDs:`, Array.from(detectedVideos));
  }

  // Initialize flow containers for all visible videos
  function initializeContainers() {
    detectAndRegisterVideos();
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
        <span>Display Time (${settings.displayTime}s)</span>
        <input type="range" id="flow-display-time" min="4" max="15" step="1" value="${settings.displayTime}">
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
        <span>Max Messages (${settings.maxMessages})</span>
        <input type="range" id="flow-max-messages" min="20" max="200" step="10" value="${settings.maxMessages}">
      </label>

      <label>
        <span>Display Area (${Math.round(settings.displayArea * 100)}%)</span>
        <input type="range" id="flow-display-area" min="0.3" max="1" step="0.1" value="${settings.displayArea}">
      </label>

      <div style="margin: 8px 0; font-size: 12px; opacity: 0.8;">Show Comments:</div>

      <label>
        <span>Owner</span>
        <input type="checkbox" id="flow-show-owner" ${settings.showOwner ? 'checked' : ''}>
      </label>

      <label>
        <span>Moderator</span>
        <input type="checkbox" id="flow-show-moderator" ${settings.showModerator ? 'checked' : ''}>
      </label>

      <label>
        <span>Member</span>
        <input type="checkbox" id="flow-show-member" ${settings.showMember ? 'checked' : ''}>
      </label>

      <label>
        <span>Normal</span>
        <input type="checkbox" id="flow-show-normal" ${settings.showNormal ? 'checked' : ''}>
      </label>

      <div style="margin: 8px 0; font-size: 12px; opacity: 0.8;">Show Avatar:</div>

      <label>
        <span>Owner</span>
        <input type="checkbox" id="flow-avatar-owner" ${settings.avatarOwner ? 'checked' : ''}>
      </label>

      <label>
        <span>Moderator</span>
        <input type="checkbox" id="flow-avatar-moderator" ${settings.avatarModerator ? 'checked' : ''}>
      </label>

      <label>
        <span>Member</span>
        <input type="checkbox" id="flow-avatar-member" ${settings.avatarMember ? 'checked' : ''}>
      </label>

      <label>
        <span>Normal</span>
        <input type="checkbox" id="flow-avatar-normal" ${settings.avatarNormal ? 'checked' : ''}>
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

    panel.querySelector('#flow-display-time').addEventListener('input', (e) => {
      settings.displayTime = parseInt(e.target.value);
      e.target.previousElementSibling.textContent = `Display Time (${settings.displayTime}s)`;
    });

    panel.querySelector('#flow-font-size').addEventListener('input', (e) => {
      settings.fontSize = parseInt(e.target.value);
      e.target.previousElementSibling.textContent = `Size (${settings.fontSize}px)`;
    });

    panel.querySelector('#flow-opacity').addEventListener('input', (e) => {
      settings.opacity = parseFloat(e.target.value);
    });

    panel.querySelector('#flow-max-messages').addEventListener('input', (e) => {
      settings.maxMessages = parseInt(e.target.value);
      e.target.previousElementSibling.textContent = `Max Messages (${settings.maxMessages})`;
    });

    panel.querySelector('#flow-display-area').addEventListener('input', (e) => {
      settings.displayArea = parseFloat(e.target.value);
      e.target.previousElementSibling.textContent = `Display Area (${Math.round(settings.displayArea * 100)}%)`;
    });

    panel.querySelector('#flow-show-owner').addEventListener('change', (e) => {
      settings.showOwner = e.target.checked;
    });

    panel.querySelector('#flow-show-moderator').addEventListener('change', (e) => {
      settings.showModerator = e.target.checked;
    });

    panel.querySelector('#flow-show-member').addEventListener('change', (e) => {
      settings.showMember = e.target.checked;
    });

    panel.querySelector('#flow-show-normal').addEventListener('change', (e) => {
      settings.showNormal = e.target.checked;
    });

    panel.querySelector('#flow-avatar-owner').addEventListener('change', (e) => {
      settings.avatarOwner = e.target.checked;
    });

    panel.querySelector('#flow-avatar-moderator').addEventListener('change', (e) => {
      settings.avatarModerator = e.target.checked;
    });

    panel.querySelector('#flow-avatar-member').addEventListener('change', (e) => {
      settings.avatarMember = e.target.checked;
    });

    panel.querySelector('#flow-avatar-normal').addEventListener('change', (e) => {
      settings.avatarNormal = e.target.checked;
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

  // Update control panel UI with current settings (for immediate sync)
  function updateControlPanelUI() {
    const panel = document.getElementById('flow-chat-controls');
    if (!panel) return;

    const enabledEl = panel.querySelector('#flow-enabled');
    const displayTimeEl = panel.querySelector('#flow-display-time');
    const fontSizeEl = panel.querySelector('#flow-font-size');
    const opacityEl = panel.querySelector('#flow-opacity');
    const maxMessagesEl = panel.querySelector('#flow-max-messages');
    const displayAreaEl = panel.querySelector('#flow-display-area');
    const showOwnerEl = panel.querySelector('#flow-show-owner');
    const showModeratorEl = panel.querySelector('#flow-show-moderator');
    const showMemberEl = panel.querySelector('#flow-show-member');
    const showNormalEl = panel.querySelector('#flow-show-normal');
    const avatarOwnerEl = panel.querySelector('#flow-avatar-owner');
    const avatarModeratorEl = panel.querySelector('#flow-avatar-moderator');
    const avatarMemberEl = panel.querySelector('#flow-avatar-member');
    const avatarNormalEl = panel.querySelector('#flow-avatar-normal');

    if (enabledEl) enabledEl.checked = settings.enabled;
    if (displayTimeEl) {
      displayTimeEl.value = settings.displayTime;
      displayTimeEl.previousElementSibling.textContent = `Display Time (${settings.displayTime}s)`;
    }
    if (fontSizeEl) {
      fontSizeEl.value = settings.fontSize;
      fontSizeEl.previousElementSibling.textContent = `Size (${settings.fontSize}px)`;
    }
    if (opacityEl) opacityEl.value = settings.opacity;
    if (maxMessagesEl) {
      maxMessagesEl.value = settings.maxMessages;
      maxMessagesEl.previousElementSibling.textContent = `Max Messages (${settings.maxMessages})`;
    }
    if (displayAreaEl) {
      displayAreaEl.value = settings.displayArea;
      displayAreaEl.previousElementSibling.textContent = `Display Area (${Math.round(settings.displayArea * 100)}%)`;
    }
    if (showOwnerEl) showOwnerEl.checked = settings.showOwner;
    if (showModeratorEl) showModeratorEl.checked = settings.showModerator;
    if (showMemberEl) showMemberEl.checked = settings.showMember;
    if (showNormalEl) showNormalEl.checked = settings.showNormal;
    if (avatarOwnerEl) avatarOwnerEl.checked = settings.avatarOwner;
    if (avatarModeratorEl) avatarModeratorEl.checked = settings.avatarModerator;
    if (avatarMemberEl) avatarMemberEl.checked = settings.avatarMember;
    if (avatarNormalEl) avatarNormalEl.checked = settings.avatarNormal;
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

  // Close panel when clicking outside
  function handleOutsideClick(event) {
    const panel = document.getElementById('flow-chat-controls');
    const toggle = document.querySelector('.flow-chat-toggle');

    if (controlsVisible && panel && toggle) {
      // Check if click is outside both panel and toggle button
      if (!panel.contains(event.target) && !toggle.contains(event.target)) {
        hideControls();
      }
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
              // Check for YouTube iframes
              if (node.querySelector('iframe[src*="youtube.com"]') ||
                  node.tagName === 'IFRAME' && node.src?.includes('youtube.com')) {
                shouldReinitialize = true;
              }
              // Check for video ID attributes
              if (node.hasAttribute && node.hasAttribute('data-video-id')) {
                shouldReinitialize = true;
              }
              if (node.querySelector && node.querySelector('[data-video-id]')) {
                shouldReinitialize = true;
              }
            }
          });
        }
      });

      if (shouldReinitialize) {
        setTimeout(detectAndRegisterVideos, 1000);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    // Also periodically check for new videos
    setInterval(() => {
      detectAndRegisterVideos();
    }, 10000); // Check every 10 seconds
  }

  // Initialize extension
  function init() {
    console.log('[FlowChat] Initializing Flow Chat for Holodex');

    loadSettings();
    createToggleButton();
    createControlPanel();

    // Listen for messages from chat iframes
    window.addEventListener('message', handleChatMessage);

    // Listen for clicks outside the control panel to close it
    document.addEventListener('click', handleOutsideClick);

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
