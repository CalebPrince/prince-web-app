(function () {
  var info = window.TRIPLEP_CHAT_INFO;
  if (!info) return;

  var STORAGE_KEY = 'triplep_chat_transcript';
  var fab = document.getElementById('chat-fab');
  var panel = document.getElementById('chat-panel');
  var closeBtn = document.getElementById('chat-close');
  var messagesEl = document.getElementById('chat-messages');
  var quickRepliesEl = document.getElementById('chat-quick-replies');
  var form = document.getElementById('chat-form');
  var input = document.getElementById('chat-input');

  if (!fab || !panel) return;

  var MAIN_MENU = [
    { label: 'Book an appointment', action: 'appointment' },
    { label: 'Ask about a service', action: 'services' },
    { label: 'Hours & location', action: 'hours' },
    { label: 'Chat on WhatsApp', action: 'whatsapp' }
  ];

  function loadTranscript() {
    try {
      return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '[]');
    } catch (e) {
      return [];
    }
  }

  function saveTranscript(transcript) {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(transcript.slice(-24)));
    } catch (e) { /* storage unavailable, ignore */ }
  }

  var transcript = loadTranscript();

  function renderBubble(sender, html) {
    var bubble = document.createElement('div');
    bubble.className = 'chat-bubble ' + sender;
    bubble.innerHTML = html;
    messagesEl.appendChild(bubble);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function addMessage(sender, html, persist) {
    renderBubble(sender, html);
    if (persist !== false) {
      transcript.push({ sender: sender, html: html });
      saveTranscript(transcript);
    }
  }

  function botSay(html, delay) {
    setTimeout(function () { addMessage('bot', html); }, delay || 450);
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function renderQuickReplies(items) {
    quickRepliesEl.innerHTML = '';
    items.forEach(function (item) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chat-quick-reply';
      btn.textContent = item.label;
      btn.addEventListener('click', function () { handleAction(item.action, item.label); });
      quickRepliesEl.appendChild(btn);
    });
  }

  function linkBtn(text, href, external) {
    var target = external ? ' target="_blank" rel="noopener"' : '';
    return '<a href="' + href + '"' + target + '>' + text + ' &rarr;</a>';
  }

  function handleAction(action, label) {
    if (label) {
      addMessage('user', escapeHtml(label));
    }
    quickRepliesEl.innerHTML = '';

    if (action === 'appointment') {
      botSay('You can request an in-person or virtual appointment here: ' + linkBtn('Book an appointment', info.appointmentUrl));
      setTimeout(function () { renderQuickReplies(MAIN_MENU); }, 500);
      return;
    }

    if (action === 'services') {
      botSay('Here are a few of our services, tap one to learn more:');
      setTimeout(function () {
        var list = info.services.slice(0, 6).map(function (s) {
          return { label: s.name, action: 'service:' + s.slug };
        });
        list.push({ label: 'See all services', action: 'services-all' });
        renderQuickReplies(list);
      }, 500);
      return;
    }

    if (action === 'services-all') {
      botSay('Here is our full list of services: ' + linkBtn('View all services', info.servicesUrl));
      setTimeout(function () { renderQuickReplies(MAIN_MENU); }, 500);
      return;
    }

    if (action.indexOf('service:') === 0) {
      var slug = action.slice(8);
      var service = info.services.find(function (s) { return s.slug === slug; });
      if (service) {
        botSay(escapeHtml(service.blurb) + ' ' + linkBtn('Learn more', info.servicesUrl + '/' + service.slug));
      }
      setTimeout(function () { renderQuickReplies(MAIN_MENU); }, 500);
      return;
    }

    if (action === 'hours') {
      var hours = 'Mon&ndash;Fri: ' + escapeHtml(info.hoursWeekday) + '<br>Sat: ' + escapeHtml(info.hoursSaturday) + '<br>Sun: ' + escapeHtml(info.hoursSunday) + '<br><br>' + escapeHtml(info.address);
      botSay(hours);
      setTimeout(function () { renderQuickReplies(MAIN_MENU); }, 600);
      return;
    }

    if (action === 'whatsapp') {
      botSay('Opening WhatsApp for you now...');
      window.open(info.whatsappUrl, '_blank', 'noopener');
      setTimeout(function () { renderQuickReplies(MAIN_MENU); }, 500);
      return;
    }

    if (action === 'virtual') {
      botSay('Our virtual clinic lets you see a physician by secure video call: ' + linkBtn('Visit the Virtual Clinic', info.virtualClinicUrl));
      setTimeout(function () { renderQuickReplies(MAIN_MENU); }, 500);
      return;
    }

    if (action === 'human') {
      botSay('Our team can help directly: ' + linkBtn('WhatsApp us', info.whatsappUrl, true) + ' or call ' + escapeHtml(info.phone) + '.');
      setTimeout(function () { renderQuickReplies(MAIN_MENU); }, 500);
      return;
    }
  }

  function matchFreeText(text) {
    var q = text.toLowerCase();

    if (/hour|open|close|time/.test(q)) return handleAction('hours');
    if (/where|address|location|direction/.test(q)) return handleAction('hours');
    if (/whatsapp/.test(q)) return handleAction('whatsapp');
    if (/virtual|telehealth|video|online consult/.test(q)) return handleAction('virtual');
    if (/book|appointment|schedule|reserve/.test(q)) return handleAction('appointment');
    if (/phone|call|number/.test(q)) {
      botSay('You can reach us at ' + escapeHtml(info.phone) + ' (telehealth: ' + escapeHtml(info.telehealthPhone) + ').');
      setTimeout(function () { renderQuickReplies(MAIN_MENU); }, 500);
      return;
    }
    if (/email/.test(q)) {
      botSay('You can email us at ' + escapeHtml(info.email) + '.');
      setTimeout(function () { renderQuickReplies(MAIN_MENU); }, 500);
      return;
    }
    if (/price|cost|fee|how much/.test(q)) {
      botSay('Pricing depends on the service. Our team can confirm exact costs when you book: ' + linkBtn('Book an appointment', info.appointmentUrl));
      setTimeout(function () { renderQuickReplies(MAIN_MENU); }, 500);
      return;
    }

    var matchedService = info.services.find(function (s) {
      var words = s.name.toLowerCase().split(/[^a-z0-9]+/).filter(function (w) { return w.length > 3; });
      return words.some(function (w) { return q.indexOf(w) !== -1; });
    });
    if (matchedService) {
      botSay(escapeHtml(matchedService.blurb) + ' ' + linkBtn('Learn more', info.servicesUrl + '/' + matchedService.slug));
      setTimeout(function () { renderQuickReplies(MAIN_MENU); }, 500);
      return;
    }

    botSay("I'm not totally sure about that one. Here's how to reach a real person, or pick an option below:");
    setTimeout(function () { renderQuickReplies(MAIN_MENU.concat([{ label: 'Talk to a person', action: 'human' }])); }, 500);
  }

  function openPanel() {
    panel.classList.add('open');
    panel.setAttribute('aria-hidden', 'false');
    fab.classList.add('open');
    fab.setAttribute('aria-expanded', 'true');

    if (transcript.length === 0) {
      botSay("Hi! I'm the " + escapeHtml(info.siteName) + " virtual assistant. How can I help today?", 300);
      setTimeout(function () { renderQuickReplies(MAIN_MENU); }, 700);
    } else {
      renderQuickReplies(MAIN_MENU);
    }
    input.focus();
  }

  function closePanel() {
    panel.classList.remove('open');
    panel.setAttribute('aria-hidden', 'true');
    fab.classList.remove('open');
    fab.setAttribute('aria-expanded', 'false');
  }

  // Replay any saved transcript from earlier on this visit (no page-to-page reset)
  transcript.forEach(function (m) { renderBubble(m.sender, m.html); });

  fab.addEventListener('click', function () {
    panel.classList.contains('open') ? closePanel() : openPanel();
  });
  closeBtn.addEventListener('click', closePanel);

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var text = input.value.trim();
    if (!text) return;
    addMessage('user', escapeHtml(text));
    input.value = '';
    quickRepliesEl.innerHTML = '';
    setTimeout(function () { matchFreeText(text); }, 400);
  });
})();
