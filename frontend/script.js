/* ===== CONFIG ===== */
const API = 'http://localhost:8000';

/* ===== STATE ===== */
let currentChatId = null;
let isLoading = false;
let currentTestData = null;
let userAnswers = {};

/* ===== DOM ===== */
const welcome      = document.getElementById('welcome');
const chatView     = document.getElementById('chatView');
const chatList     = document.getElementById('chatList');
const messages     = document.getElementById('messages');
const msgInput     = document.getElementById('msgInput');
const sendBtn      = document.getElementById('sendBtn');
const newChatBtn   = document.getElementById('newChatBtn');
const chatTitleH   = document.getElementById('chatTitleHeader');
const deleteChatBtn= document.getElementById('deleteChatBtn');
const testModal    = document.getElementById('testModal');
const closeModal   = document.getElementById('closeModal');
const questionsWrap= document.getElementById('questionsWrap');
const testTopic    = document.getElementById('testTopic');
const submitTest   = document.getElementById('submitTest');
const sidebar      = document.getElementById('sidebar');
const sidebarToggle= document.getElementById('sidebarToggle');

/* ===== INIT ===== */
loadChatList();
bindEvents();

function bindEvents() {
  newChatBtn.addEventListener('click', startNewChat);
  sendBtn.addEventListener('click', handleSend);
  msgInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  });
  msgInput.addEventListener('input', autoResize);
  deleteChatBtn.addEventListener('click', deleteCurrentChat);
  closeModal.addEventListener('click', hideTestModal);
  testModal.addEventListener('click', e => { if (e.target === testModal) hideTestModal(); });
  submitTest.addEventListener('click', gradeTest);
  sidebarToggle.addEventListener('click', () => sidebar.classList.toggle('open'));

  // Welcome send button
  const welcomeInput = document.getElementById('welcomeInput');
  const welcomeSendBtn = document.getElementById('welcomeSendBtn');

  welcomeSendBtn.addEventListener('click', () => {
    const val = welcomeInput.value.trim();
    if (!val) return;
    msgInput.value = val;
    welcomeInput.value = '';
    handleSend();
  });

  welcomeInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      welcomeSendBtn.click();
    }
  });

  welcomeInput.addEventListener('input', () => {
    welcomeInput.style.height = 'auto';
    welcomeInput.style.height = Math.min(welcomeInput.scrollHeight, 120) + 'px';
  });

  // Suggestion cards
  document.querySelectorAll('.suggestion-card').forEach(btn => {
    btn.addEventListener('click', () => {
      const topic = btn.dataset.topic;
      msgInput.value = topic;
      handleSend();
    });
  });
}

/* ===== CHAT LIST ===== */
async function loadChatList() {
  try {
    const res = await fetch(`${API}/chat/list`);
    const chats = await res.json();
    renderChatList(chats);
  } catch (e) {
    console.error('Chat list error:', e);
  }
}

function renderChatList(chats) {
  if (!chats.length) {
    chatList.innerHTML = '<div class="empty-list">Hali suhbat yo\'q</div>';
    return;
  }
  chatList.innerHTML = chats.map(c => `
    <div class="chat-item ${c.id === currentChatId ? 'active' : ''}" data-id="${c.id}">
      <span class="chat-item-title">${escapeHtml(c.title)}</span>
      <span class="chat-item-date">${formatDate(c.created_at)}</span>
    </div>
  `).join('');

  chatList.querySelectorAll('.chat-item').forEach(el => {
    el.addEventListener('click', () => openChat(el.dataset.id));
  });
}

/* ===== OPEN CHAT ===== */
async function openChat(chatId) {
  currentChatId = chatId;
  showChatView();
  messages.innerHTML = '';
  setLoading(true);

  try {
    const res = await fetch(`${API}/chat/${chatId}`);
    const msgs = await res.json();
    msgs.forEach(m => appendMessage(m.role, m.content));
    scrollBottom();

    // Update title
    const listRes = await fetch(`${API}/chat/list`);
    const chats = await listRes.json();
    const chat = chats.find(c => c.id === chatId);
    if (chat) chatTitleH.textContent = chat.title;
    renderChatList(chats);
  } catch (e) {
    console.error('Open chat error:', e);
  } finally {
    setLoading(false);
  }

  sidebar.classList.remove('open');
}

/* ===== SEND MESSAGE ===== */
async function handleSend() {
  const text = msgInput.value.trim();
  if (!text || isLoading) return;

  msgInput.value = '';
  autoResize();
  setLoading(true);

  // Show chat view & typing indicator IMMEDIATELY — don't wait for API
  showChatView();
  appendMessage('user', text);
  const typingId = showTyping();
  scrollBottom();

  try {
    let data;
    if (!currentChatId) {
      const res = await fetch(`${API}/chat/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text })
      });
      data = await res.json();
      currentChatId = data.chat_id;
      chatTitleH.textContent = data.title;
      removeTyping(typingId);
      handleAIResponse(data.ai_response);
    } else {
      const res = await fetch(`${API}/chat/${currentChatId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text })
      });
      data = await res.json();
      removeTyping(typingId);
      handleAIResponse(data.ai_response);
    }

    await loadChatList();
    scrollBottom();
  } catch (e) {
    removeTyping(typingId);
    appendMessage('assistant', '❌ Xatolik yuz berdi. Server ishlamoqdami? Qayta urinib ko\'ring.');
    console.error(e);
  } finally {
    setLoading(false);
  }
}

function handleAIResponse(text) {
  // Try to parse as test JSON
  const testData = tryParseTest(text);
  if (testData) {
    appendMessage('assistant', '✅ Test tayyor! Quyidagi tugmani bosing:');
    appendTestCard(testData);
    return;
  }
  appendMessage('assistant', text);
}

function tryParseTest(text) {
  // 1. Direct parse
  try {
    const p = JSON.parse(text);
    if (p && p.questions && Array.isArray(p.questions) && p.questions.length > 0) return p;
  } catch (_) {}

  // 2. Strip ```json ... ``` fences
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    try {
      const p = JSON.parse(fenceMatch[1].trim());
      if (p && p.questions && Array.isArray(p.questions) && p.questions.length > 0) return p;
    } catch (_) {}
  }

  // 3. Extract first { ... } block
  const braceMatch = text.match(/\{[\s\S]*\}/);
  if (braceMatch) {
    try {
      const p = JSON.parse(braceMatch[0]);
      if (p && p.questions && Array.isArray(p.questions) && p.questions.length > 0) return p;
    } catch (_) {}
    // 4. Fix trailing commas and retry
    try {
      const cleaned = braceMatch[0].replace(/,\s*([}\]])/g, '$1');
      const p = JSON.parse(cleaned);
      if (p && p.questions && Array.isArray(p.questions) && p.questions.length > 0) return p;
    } catch (_) {}
  }

  return null;
}

/* ===== MESSAGE RENDERING ===== */
function renderMarkdown(text) {
  let html = text;

  // 1. Code blocks ```lang\ncode\n``` (must be first)
  html = html.replace(/```[\w]*\n?([\s\S]*?)```/g, (_, code) => {
    return `<pre class="md-code-block"><code>${escapeHtml(code.trim())}</code></pre>`;
  });

  // 2. Inline code `code`
  html = html.replace(/`([^`\n]+)`/g, (_, c) => `<code class="md-inline-code">${escapeHtml(c)}</code>`);

  // 3. Tables — process line by line
  html = processMarkdownTables(html);

  // 4. Headings
  html = html.replace(/^### (.+)$/gm, '<h4 class="md-h3">$1</h4>');
  html = html.replace(/^## (.+)$/gm,  '<h3 class="md-h2">$1</h3>');
  html = html.replace(/^# (.+)$/gm,   '<h2 class="md-h1">$1</h2>');

  // 5. Horizontal rule
  html = html.replace(/^(?:---|\*\*\*|___)\s*$/gm, '<hr class="md-hr">');

  // 6. Blockquote > text
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote class="md-blockquote">$1</blockquote>');
  html = html.replace(/^> (.+)$/gm,    '<blockquote class="md-blockquote">$1</blockquote>');

  // 7. Numbered lists — group consecutive lines
  html = processLists(html);

  // 8. Bold + italic (order matters)
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g,     '<strong>$1</strong>');
  html = html.replace(/__(.+?)__/g,          '<strong>$1</strong>');
  html = html.replace(/\*([^*\n]+)\*/g,      '<em>$1</em>');
  html = html.replace(/_([^_\n]+)_/g,        '<em>$1</em>');

  // 9. Strikethrough
  html = html.replace(/~~(.+?)~~/g, '<s>$1</s>');

  // 10. Newlines to <br> (skip lines that are block elements)
  html = html.replace(/\n/g, '<br>');

  // 11. Clean up double <br> around block elements
  html = html.replace(/(<br>)(<(?:pre|table|blockquote|h[1-6]|hr|ul|ol))/g, '$2');
  html = html.replace(/(\/(?:pre|table|blockquote|h[1-6]|hr|ul|ol)>)(<br>)/g, '$1');

  return html;
}

function processMarkdownTables(text) {
  // Match full table blocks: header row | separator row | data rows
  return text.replace(
    /((?:^|\n)\|.+\|[ \t]*\n\|[-| :]+\|\n(?:\|.+\|[ \t]*\n?)*)/g,
    (block) => {
      const lines = block.trim().split('\n').filter(l => l.trim());
      if (lines.length < 2) return block;

      const headerCells = parseTableRow(lines[0]);
      // lines[1] is separator — skip
      const bodyLines = lines.slice(2);

      // Alignment from separator
      const sepCells = lines[1].split('|').filter((_, i, a) => i > 0 && i < a.length - 1);
      const aligns = sepCells.map(s => {
        s = s.trim();
        if (s.startsWith(':') && s.endsWith(':')) return 'center';
        if (s.endsWith(':')) return 'right';
        return 'left';
      });

      let tableHtml = '<div class="md-table-wrap"><table class="md-table"><thead><tr>';
      headerCells.forEach((cell, i) => {
        const align = aligns[i] || 'left';
        tableHtml += `<th style="text-align:${align}">${cell}</th>`;
      });
      tableHtml += '</tr></thead><tbody>';

      bodyLines.forEach(line => {
        if (!line.trim()) return;
        const cells = parseTableRow(line);
        tableHtml += '<tr>';
        cells.forEach((cell, i) => {
          const align = aligns[i] || 'left';
          tableHtml += `<td style="text-align:${align}">${cell}</td>`;
        });
        tableHtml += '</tr>';
      });

      tableHtml += '</tbody></table></div>';
      return '\n' + tableHtml + '\n';
    }
  );
}

function parseTableRow(line) {
  // Split by | and remove first/last empty
  return line.split('|')
    .slice(1, -1)
    .map(c => c.trim()
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code class="md-inline-code">$1</code>')
    );
}

function processLists(text) {
  // Unordered lists: lines starting with - * •
  text = text.replace(
    /((?:^|\n)[ \t]*[-*•] .+(?:\n[ \t]*[-*•] .+)*)/g,
    (block) => {
      const items = block.trim().split('\n').map(l => l.replace(/^[ \t]*[-*•] /, '').trim());
      return '\n<ul class="md-ul">' + items.map(i => `<li>${i}</li>`).join('') + '</ul>\n';
    }
  );

  // Ordered lists: lines starting with 1. 2. etc.
  text = text.replace(
    /((?:^|\n)[ \t]*\d+\. .+(?:\n[ \t]*\d+\. .+)*)/g,
    (block) => {
      const items = block.trim().split('\n').map(l => l.replace(/^[ \t]*\d+\. /, '').trim());
      return '\n<ol class="md-ol">' + items.map(i => `<li>${i}</li>`).join('') + '</ol>\n';
    }
  );

  return text;
}


function appendMessage(role, content) {
  const row = document.createElement('div');
  row.className = `msg-row ${role}`;
  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.innerHTML = renderMarkdown(content);
  row.appendChild(bubble);
  messages.appendChild(row);
  return row;
}

function appendTestCard(testData) {
  const row = document.createElement('div');
  row.className = 'msg-row assistant';
  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';

  const card = document.createElement('div');
  card.className = 'test-card';
  const btn = document.createElement('button');
  btn.className = 'test-card-btn';
  btn.innerHTML = `🎯 ${escapeHtml(testData.topic || 'Testni boshlash')} — Bosish`;
  btn.addEventListener('click', () => showTestModal(testData));
  card.appendChild(btn);
  bubble.appendChild(card);
  row.appendChild(bubble);
  messages.appendChild(row);
}

function showTyping() {
  const id = 'typing-' + Date.now();
  const row = document.createElement('div');
  row.className = 'msg-row assistant';
  row.id = id;
  row.innerHTML = `<div class="msg-bubble typing-bubble">
    <span class="typing-dot"></span>
    <span class="typing-dot"></span>
    <span class="typing-dot"></span>
  </div>`;
  messages.appendChild(row);
  scrollBottom();
  return id;
}

function removeTyping(id) {
  document.getElementById(id)?.remove();
}

/* ===== TEST MODAL ===== */
function showTestModal(testData) {
  currentTestData = testData;
  userAnswers = {};

  testTopic.textContent = testData.topic || 'Test';
  submitTest.textContent = "Natijani ko'rish";
  submitTest.onclick = gradeTest;
  submitTest.disabled = false;

  questionsWrap.innerHTML = '';

  testData.questions.forEach((q, i) => {
    const block = document.createElement('div');
    block.className = 'question-block';
    block.dataset.index = i;

    const typeKey = q.type === 'single_choice' ? 'single'
      : q.type === 'multi_choice' ? 'multi' : 'short';
    const typeText = q.type === 'single_choice' ? 'Bitta javob'
      : q.type === 'multi_choice' ? "Ko'p javob" : 'Qisqa javob';

    const header = document.createElement('div');
    header.className = 'q-header';
    header.innerHTML = `
      <div class="q-num">${i + 1}</div>
      <span class="q-type ${typeKey}">${typeText}</span>
      <span class="q-text">${escapeHtml(q.question)}</span>
    `;
    block.appendChild(header);

    if (q.type === 'short_answer') {
      const ta = document.createElement('textarea');
      ta.className = 'short-answer-input';
      ta.placeholder = "Javobingizni yozing...";
      ta.rows = 2;
      ta.addEventListener('input', () => { userAnswers[i] = ta.value.trim(); });
      block.appendChild(ta);
    } else {
      const optDiv = document.createElement('div');
      optDiv.className = 'q-options';
      (q.options || []).forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'q-option';
        btn.innerHTML = `<span class="q-option-dot"></span><span>${escapeHtml(opt)}</span>`;
        btn.addEventListener('click', () => selectOption(btn, opt, i, q.type, optDiv));
        optDiv.appendChild(btn);
      });
      block.appendChild(optDiv);
    }

    questionsWrap.appendChild(block);
  });

  testModal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function hideTestModal() {
  testModal.classList.add('hidden');
  document.body.style.overflow = '';
}

function gradeTest() {
  if (!currentTestData) return;
  const questions = currentTestData.questions;

  // Get all question blocks by data-index — immune to DOM order changes
  let score = 0;

  questions.forEach((q, i) => {
    const block = questionsWrap.querySelector(`.question-block[data-index="${i}"]`);
    if (!block) return;

    const userAns = userAnswers[i];
    let correct = false;

    if (q.type === 'short_answer') {
      const ua = String(userAns || '').toLowerCase().trim();
      const ca = String(q.correct_answer || '').toLowerCase().trim();
      correct = ua.length > 0 && (ua === ca || ua.includes(ca) || ca.includes(ua));
    } else if (q.type === 'single_choice') {
      correct = userAns !== undefined && userAns === q.correct_answer;
    } else {
      // multi_choice
      const ua = Array.isArray(userAns) ? [...userAns].sort() : [];
      const ca = Array.isArray(q.correct_answer)
        ? [...q.correct_answer].sort()
        : [q.correct_answer];
      correct = ua.length > 0 && JSON.stringify(ua) === JSON.stringify(ca);
    }

    if (correct) score++;

    // Highlight answers
    if (q.type === 'short_answer') {
      const input = block.querySelector('.short-answer-input');
      if (input) {
        input.disabled = true;
        input.style.borderColor = correct ? 'var(--green)' : 'var(--red)';
        block.querySelector('.answer-hint')?.remove();
        const hint = document.createElement('div');
        hint.className = 'answer-hint';
        hint.style.cssText = 'margin-top:8px;font-size:13px;color:var(--text2)';
        hint.textContent = correct ? "✓ To'g'ri!" : `✗ To'g'ri javob: ${q.correct_answer}`;
        input.after(hint);
      }
    } else {
      const opts = block.querySelectorAll('.q-option');
      const correctList = Array.isArray(q.correct_answer)
        ? q.correct_answer
        : [q.correct_answer];

      opts.forEach(btn => {
        const optText = btn.querySelector('span:last-child')?.textContent?.trim() || '';
        const letter = optText.match(/^([A-D])/)?.[1];
        btn.style.pointerEvents = 'none';
        if (letter && correctList.includes(letter)) {
          btn.classList.remove('selected', 'wrong');
          btn.classList.add('correct');
        } else if (btn.classList.contains('selected')) {
          btn.classList.add('wrong');
        }
      });
    }
  });

  // Show result banner at top
  const pct = Math.round((score / questions.length) * 100);
  const cls   = pct >= 80 ? 'good' : pct >= 50 ? 'avg' : 'bad';
  const emoji = pct >= 80 ? '🎉' : pct >= 50 ? '👍' : '📚';

  questionsWrap.querySelector('.result-banner')?.remove();
  const banner = document.createElement('div');
  banner.className = `result-banner ${cls}`;
  banner.textContent = `${emoji} Natija: ${score}/${questions.length} (${pct}%)`;
  questionsWrap.insertBefore(banner, questionsWrap.firstChild);
  questionsWrap.scrollTop = 0;

  submitTest.textContent = 'Yopish';
  submitTest.onclick = hideTestModal;
}

/* ===== UI HELPERS ===== */
function showChatView() {
  welcome.classList.add('hidden');
  chatView.classList.remove('hidden');
}

function startNewChat() {
  currentChatId = null;
  welcome.classList.remove('hidden');
  chatView.classList.add('hidden');
  messages.innerHTML = '';
  chatTitleH.textContent = 'Suhbat';
  document.querySelectorAll('.chat-item').forEach(el => el.classList.remove('active'));
  sidebar.classList.remove('open');
  setTimeout(() => {
    const wi = document.getElementById('welcomeInput');
    if (wi) wi.focus();
  }, 100);
}

async function deleteCurrentChat() {
  if (!currentChatId) return;
  if (!confirm('Suhbatni o\'chirishni tasdiqlaysizmi?')) return;
  await fetch(`${API}/chat/${currentChatId}`, { method: 'DELETE' });
  startNewChat();
  await loadChatList();
}

function setLoading(val) {
  isLoading = val;
  sendBtn.disabled = val;
  msgInput.disabled = val;
}

function scrollBottom() {
  messages.scrollTop = messages.scrollHeight;
}

function autoResize() {
  msgInput.style.height = 'auto';
  msgInput.style.height = Math.min(msgInput.scrollHeight, 180) + 'px';
}

function formatDate(iso) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('uz-UZ', { month: 'short', day: 'numeric' });
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}