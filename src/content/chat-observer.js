// Chat Observer - Runs in YouTube Live Chat iframe
// Monitors chat messages and sends them to parent Holodex page

(function() {
  'use strict';

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
    let messageText = '';
    let hasEmoji = false;

    if (messageElement) {
      // Handle both text and emoji
      messageElement.childNodes.forEach(node => {
        if (node.nodeType === Node.TEXT_NODE) {
          messageText += node.textContent;
        } else if (node.nodeName === 'IMG') {
          // Emoji
          messageText += node.alt || '😊';
          hasEmoji = true;
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
      message: messageText.trim(),
      type: type,
      timestamp: Date.now(),
      hasEmoji: hasEmoji
    };
  }

  // Send message to parent window (Holodex)
  function sendToParent(chatData) {
    if (!isEnabled || !chatData || !chatData.message) return;

    try {
      window.parent.postMessage({
        type: 'FLOW_CHAT_MESSAGE',
        data: chatData
      }, 'https://holodex.net');
    } catch (e) {
      console.error('[FlowChat] Failed to send message:', e);
    }
  }

  // Process new chat messages
  function processChatMessages(elements) {
    elements.forEach(element => {
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

    console.log('[FlowChat] Chat container found, starting observer');

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
          console.log('[FlowChat] Chat observer enabled');
          break;
        case 'disable':
          isEnabled = false;
          console.log('[FlowChat] Chat observer disabled');
          break;
        case 'ping':
          window.parent.postMessage({
            type: 'FLOW_CHAT_PONG',
            videoId: getVideoId()
          }, 'https://holodex.net');
          break;
      }
    }
  });

  // Notify parent that chat observer is ready
  function notifyReady() {
    window.parent.postMessage({
      type: 'FLOW_CHAT_READY',
      videoId: getVideoId()
    }, 'https://holodex.net');
  }

  // Initialize
  function init() {
    console.log('[FlowChat] Chat observer initializing...');
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
