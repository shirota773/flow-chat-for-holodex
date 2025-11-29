// Chat Observer - Runs in YouTube Live Chat iframe
// Monitors chat messages and sends them to parent Holodex page

(function() {
  'use strict';

  // Check if this is a background chat iframe created by Flow Chat
  const urlParams = new URLSearchParams(window.location.search);
  const isBackgroundChat = urlParams.get('flow_chat_bg') === 'true';

  // Only run in background chat iframes to avoid duplication
  if (!isBackgroundChat) {
    return;
  }

  let observer = null;
  let isEnabled = true;
  let processedMessages = new Set();

  // Configuration
  const config = {
    maxProcessedCache: 1000,
    debounceTime: 50
  };

  // Extract video ID from URL
  function getVideoId() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('v') || '';
  }

  // Parse chat message element
  function parseChatMessage(element) {
    const messageId = element.getAttribute('id') || Date.now().toString();

    // Skip if already processed
    if (processedMessages.has(messageId)) {
      return null;
    }
    processedMessages.add(messageId);

    // Clean up old entries to prevent memory leak
    if (processedMessages.size > config.maxProcessedCache) {
      const entries = Array.from(processedMessages);
      entries.slice(0, 100).forEach(id => processedMessages.delete(id));
    }

    // Get author info
    const authorElement = element.querySelector('#author-name');
    const authorName = authorElement ? authorElement.textContent.trim() : '';

    // Get avatar
    const avatarElement = element.querySelector('#img');
    const avatarUrl = avatarElement ? avatarElement.src : '';

    // Get message content
    const messageElement = element.querySelector('#message');
    let messageFragments = []; // Array of {type: 'text'|'emoji', content: string}
    let hasEmoji = false;

    if (messageElement) {
      // Handle both text and emoji/sticker images
      messageElement.childNodes.forEach(node => {
        if (node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent.trim();
          if (text) {
            messageFragments.push({ type: 'text', content: text });
          }
        } else if (node.nodeName === 'IMG') {
          // Emoji or sticker - preserve image source
          const imgSrc = node.src || '';
          const imgAlt = node.alt || '';
          if (imgSrc) {
            messageFragments.push({
              type: 'emoji',
              src: imgSrc,
              alt: imgAlt
            });
            hasEmoji = true;
          }
        }
      });
    }

    // Determine message type
    let type = 'normal';

    // Check for Super Chat
    if (element.tagName === 'YT-LIVE-CHAT-PAID-MESSAGE-RENDERER' ||
        element.tagName === 'YT-LIVE-CHAT-PAID-STICKER-RENDERER') {
      type = 'superchat';
    }
    // Check for membership
    else if (element.querySelector('[type="member"]') ||
             element.classList.contains('member')) {
      type = 'member';
    }
    // Check for moderator
    else if (element.querySelector('[type="moderator"]') ||
             authorElement?.classList.contains('moderator')) {
      type = 'moderator';
    }
    // Check for owner
    else if (element.querySelector('[type="owner"]') ||
             authorElement?.classList.contains('owner')) {
      type = 'owner';
    }

    return {
      id: messageId,
      videoId: getVideoId(),
      author: authorName,
      avatar: avatarUrl,
      fragments: messageFragments, // Array of text/emoji fragments
      type: type,
      timestamp: Date.now(),
      hasEmoji: hasEmoji
    };
  }

  // Send message to parent window (Holodex)
  function sendToParent(chatData) {
    if (!isEnabled || !chatData || !chatData.fragments || chatData.fragments.length === 0) return;

    try {
      window.parent.postMessage({
        type: 'FLOW_CHAT_MESSAGE',
        data: chatData
      }, 'https://holodex.net');
    } catch (e) {
      // Silently fail
    }
  }

  // Apply custom classes to chat message elements
  function applyCustomClassesToElement(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return;

    // Add custom class to the message element itself
    element.classList.add('flow-chat-message');

    // Add custom classes to child elements
    const authorName = element.querySelector('#author-name');
    if (authorName) {
      authorName.classList.add('flow-chat-author-name');
    }

    const authorPhoto = element.querySelector('#author-photo');
    if (authorPhoto) {
      authorPhoto.classList.add('flow-chat-author-photo');
    }

    const chatBadges = element.querySelector('#chat-badges');
    if (chatBadges) {
      chatBadges.classList.add('flow-chat-badges');
    }

    const content = element.querySelector('#content');
    if (content) {
      content.classList.add('flow-chat-content');
    }

    const message = element.querySelector('#message');
    if (message) {
      message.classList.add('flow-chat-message-text');
    }
  }

  // Inject custom CSS styles into iframe
  function injectCustomStyles() {
    // Check if style already exists
    if (document.querySelector('#flow-chat-custom-styles')) {
      return;
    }

    const style = document.createElement('style');
    style.id = 'flow-chat-custom-styles';
    style.textContent = `
      /* Flow Chat Custom Styles */
      /* You can customize these styles as needed */

      /* Hide */
      yt-live-chat-header-renderer[role="heading"],
      #contents > #chat,
      #contents > #ticker,
      #category-buttons,
      dom-if,
      tp-yt-iron-dropdown,
yt-reaction-control-panel-overlay-view-model,
yt-formatted-string#title,
#search-panel,
yt-img-shadow#avatar {
        display:none !important;
      }

#content-pages img {
    height: 18px;
    width:  18px;
}

panel-pages {
height: fit-contents !important;
}

* {
--yt-live-chat-background-color: black;
--yt-live-chat-primary-text-color: white;
}

yt-emoji-picker-renderer#emoji {
margin-top: 0;
}

#categories-wrapper yt-emoji-picker-category-renderer {
  margin-left:12px;
}

yt-live-chat-message-input-renderer {
padding-left: 10px;
}

      /* Hide author names/IDs */
      .flow-chat-author-name {
        display: none !important;
      }

      /* Hide author photos/avatars */
      .flow-chat-author-photo {
        display: none !important;
      }

      /* Hide chat badges */
      .flow-chat-badges {
        display: none !important;
      }

      /* Adjust content padding */
      .flow-chat-content {
        padding-left: 8px !important;
      }

      /* Additional styling for message containers */
      .flow-chat-message {
        /* Add custom styles here if needed */
      }

      /* Additional styling for message text */
      .flow-chat-message-text {
        /* Add custom styles here if needed */
      }
    `;

    document.head.appendChild(style);
  }

  // Process new chat messages
  function processChatMessages(elements) {
    elements.forEach(element => {
      // Apply custom classes to the element
      applyCustomClassesToElement(element);

      const chatData = parseChatMessage(element);
      if (chatData) {
        sendToParent(chatData);
      }
    });
  }

  // Initialize MutationObserver
  function initObserver() {
    const chatContainer = document.querySelector('#items.yt-live-chat-item-list-renderer') ||
                          document.querySelector('yt-live-chat-item-list-renderer #items');

    if (!chatContainer) {
      // Retry if container not found
      setTimeout(initObserver, 1000);
      return;
    }

    observer = new MutationObserver((mutations) => {
      const newMessages = [];

      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Check if it's a chat message element
            if (node.tagName.includes('YT-LIVE-CHAT') &&
                node.tagName.includes('RENDERER')) {
              newMessages.push(node);
            }
          }
        });
      });

      if (newMessages.length > 0) {
        processChatMessages(newMessages);
      }
    });

    observer.observe(chatContainer, {
      childList: true,
      subtree: false
    });

    // Process existing messages
    const existingMessages = chatContainer.querySelectorAll(
      'yt-live-chat-text-message-renderer, ' +
      'yt-live-chat-paid-message-renderer, ' +
      'yt-live-chat-paid-sticker-renderer'
    );

    // Only process last few messages to avoid spam
    const recentMessages = Array.from(existingMessages).slice(-5);
    processChatMessages(recentMessages);
  }

  // Listen for control messages from parent
  window.addEventListener('message', (event) => {
    if (event.origin !== 'https://holodex.net') return;

    if (event.data.type === 'FLOW_CHAT_CONTROL') {
      switch (event.data.action) {
        case 'enable':
          isEnabled = true;
          break;
        case 'disable':
          isEnabled = false;
          break;
        case 'ping':
          window.parent.postMessage({
            type: 'FLOW_CHAT_PONG',
            data: {
              videoId: getVideoId()
            }
          }, 'https://holodex.net');
          break;
      }
    }
  });

  // Notify parent that chat observer is ready
  function notifyReady() {
    window.parent.postMessage({
      type: 'FLOW_CHAT_READY',
      data: {
        videoId: getVideoId()
      }
    }, 'https://holodex.net');
  }

  // Initialize
  function init() {
    // Inject custom styles
    injectCustomStyles();

    notifyReady();
    initObserver();
  }

  // Wait for page to be ready
  if (document.readyState === 'complete') {
    init();
  } else {
    window.addEventListener('load', init);
  }
})();
