(function () {
  'use strict';

  // Splash screen sequence
  (function runSplash() {
    const splash = document.getElementById('splash');
    const app = document.getElementById('app');
    const status = document.getElementById('splash-status');
    if (!splash || !app) return;

    const steps = [
      { t: 400, msg: 'Loading modules...' },
      { t: 900, msg: 'Connecting database...' },
      { t: 1400, msg: 'Syncing threat intel...' },
      { t: 1900, msg: 'Ready' }
    ];
    steps.forEach(({ t, msg }) => {
      setTimeout(() => { if (status) status.textContent = msg; }, t);
    });

    setTimeout(() => {
      splash.classList.add('hide');
      app.classList.remove('app-hidden');
      app.classList.add('app-visible');
      setTimeout(() => {
        try { splash.remove(); } catch (_) {}
        const inp = document.getElementById('username-input');
        if (inp) inp.focus();
      }, 550);
    }, 2100);
  })();


  const tg = window.Telegram?.WebApp;
  if (tg) {
    tg.ready();
    tg.expand();
    try {
      tg.setHeaderColor('#05080f');
      tg.setBackgroundColor('#05080f');
    } catch (_) {}
  }

  const input = document.getElementById('username-input');
  const clearBtn = document.getElementById('clear-btn');
  const checkBtn = document.getElementById('check-btn');
  const btnText = checkBtn.querySelector('.btn-text');
  const btnLoader = checkBtn.querySelector('.btn-loader');
  const resultSection = document.getElementById('result');
  const resultCard = document.getElementById('result-card');
  const resultUsername = document.getElementById('result-username');
  const resultReputation = document.getElementById('result-reputation');
  const avatar = document.getElementById('avatar');
  const scoreCircle = document.getElementById('score-circle');
  const scoreValue = document.getElementById('score-value');
  const scoreLabelText = document.getElementById('score-label-text');
  const statReports = document.getElementById('stat-reports');
  const statWarnings = document.getElementById('stat-warnings');
  const statComments = document.getElementById('stat-comments');
  const statSource = document.getElementById('stat-source');
  const tagsEl = document.getElementById('tags');
  const descriptionEl = document.getElementById('description');
  const lastReportEl = document.getElementById('last-report');
  const reportBtn = document.getElementById('report-btn');
  const newCheckBtn = document.getElementById('new-check-btn');
  const historySection = document.getElementById('history');
  const historyList = document.getElementById('history-list');
  const scamOverlay = document.getElementById('scam-overlay');
  const scamOverlayUser = document.getElementById('scam-overlay-user');
  const scamDismiss = document.getElementById('scam-dismiss');
  const commentsList = document.getElementById('comments-list');
  const commentsCount = document.getElementById('comments-count');
  const commentForm = document.getElementById('comment-form');
  const commentText = document.getElementById('comment-text');
  const commentAuthor = document.getElementById('comment-author');

  const CIRCUMFERENCE = 2 * Math.PI * 52;
  scoreCircle.style.strokeDasharray = CIRCUMFERENCE;

  function tgAvatarUrl(username) {
    const u = (username || '').replace(/^@/, '').trim();
    if (!u) return null;
    return 'https://t.me/i/userpic/320/' + encodeURIComponent(u) + '.jpg';
  }

  function setAvatar(imgEl, letterEl, username) {
    const u = (username || '').replace(/^@/, '');
    if (letterEl) letterEl.textContent = (u.charAt(0) || '?').toUpperCase();
    if (!imgEl) return;
    imgEl.hidden = true;
    const url = tgAvatarUrl(u);
    if (!url) return;
    const test = new Image();
    test.onload = function () {
      // Telegram returns a tiny placeholder for missing avatars sometimes
      if (test.naturalWidth > 10 && test.naturalHeight > 10) {
        imgEl.src = url + '?t=' + Date.now();
        imgEl.hidden = false;
      }
    };
    test.onerror = function () { imgEl.hidden = true; };
    test.src = url;
  }

  function statusIconSVG(status) {
    if (status === 'scam') {
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
    }
    if (status === 'suspicious') {
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
    }
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
  }

  function stripEmoji(str) {
    return String(str || '').replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '').trim();
  }



  const HISTORY_KEY = 'detected_scams_history';
  let history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
  let currentUsername = '';

  function saveHistory(entry) {
    history = history.filter(h => h.username !== entry.username);
    history.unshift(entry);
    if (history.length > 8) history = history.slice(0, 8);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    renderHistory();
  }

  function renderHistory() {
    if (!history.length) {
      historySection.hidden = true;
      return;
    }
    historySection.hidden = false;
    historyList.innerHTML = history.map(h => `
      <div class="history-item" data-user="${h.username.replace('@', '')}">
        <span class="history-user">${h.username}</span>
        <span class="history-status ${h.status}">${statusLabel(h.status)}</span>
      </div>
    `).join('');
    historyList.querySelectorAll('.history-item').forEach(el => {
      el.addEventListener('click', () => {
        input.value = el.dataset.user;
        clearBtn.hidden = false;
        doCheck();
      });
    });
  }

  function statusLabel(s) {
    if (s === 'scam') return 'SCAM';
    if (s === 'suspicious') return 'SUS';
    return 'CLEAN';
  }

  function scoreColor(score) {
    if (score <= 25) return '#ff2255';
    if (score <= 55) return '#ffcc00';
    return '#00ff88';
  }

  function scoreText(score) {
    if (score <= 15) return 'КРИТИЧЕСКИЙ УРОВЕНЬ';
    if (score <= 25) return 'ВЫСОКАЯ УГРОЗА';
    if (score <= 40) return 'ПОВЫШЕННЫЙ РИСК';
    if (score <= 55) return 'СРЕДНИЙ РИСК';
    if (score <= 75) return 'УМЕРЕННЫЙ РИСК';
    return 'НИЗКИЙ РИСК';
  }

  function setLoading(on) {
    checkBtn.disabled = on;
    btnText.hidden = on;
    btnLoader.hidden = !on;
  }

  function haptic(type) {
    try {
      if (tg?.HapticFeedback) {
        if (type === 'error') tg.HapticFeedback.notificationOccurred('error');
        else if (type === 'success') tg.HapticFeedback.notificationOccurred('success');
        else tg.HapticFeedback.impactOccurred('medium');
      }
    } catch (_) {}
  }

  function showScamOverlay(username) {
    scamOverlayUser.textContent = username;
    scamOverlay.hidden = false;
    haptic('error');
    document.body.style.overflow = 'hidden';
  }

  function hideScamOverlay() {
    scamOverlay.hidden = true;
    document.body.style.overflow = '';
  }

  function formatDate(iso) {
    try {
      const d = new Date(iso);
      return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch {
      return iso;
    }
  }

  function renderComments(comments) {
    const list = comments || [];
    commentsCount.textContent = list.length;
    if (statComments) statComments.textContent = list.length;

    if (!list.length) {
      commentsList.innerHTML = '<p class="comments-empty">Пока нет отчётов. Будь первым.</p>';
      return;
    }
    commentsList.innerHTML = list.map(c => `
      <div class="comment-item">
        <div class="comment-meta">
          <span class="comment-author">${esc(c.author || 'Anonymous')}</span>
          <span class="comment-date">${formatDate(c.created_at)}</span>
        </div>
        <div class="comment-body">${esc(c.text)}</div>
      </div>
    `).join('');
  }

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  async function loadComments(username) {
    try {
      const res = await fetch('/api/comments?username=' + encodeURIComponent(username));
      const data = await res.json();
      if (data.success) renderComments(data.comments);
      else renderComments([]);
    } catch {
      renderComments([]);
    }
  }

  function renderResult(data) {
    resultSection.hidden = false;
    resultCard.className = 'result-card status-' + data.status;
    currentUsername = data.username.replace('@', '');

    resultUsername.textContent = data.username;
    const repText = document.getElementById('rep-text');
    const repIcon = document.getElementById('rep-icon');
    if (repText) repText.textContent = stripEmoji(data.reputation);
    if (repIcon) {
      repIcon.className = 'rep-icon ' + data.status;
      repIcon.innerHTML = statusIconSVG(data.status);
    }
    const avatarLetter = document.getElementById('avatar-letter');
    const avatarImg = document.getElementById('avatar-img');
    setAvatar(avatarImg, avatarLetter, data.username);

    const score = data.score;
    const offset = CIRCUMFERENCE - (score / 100) * CIRCUMFERENCE;
    scoreCircle.style.stroke = scoreColor(score);
    scoreCircle.style.strokeDashoffset = offset;
    scoreValue.textContent = score;
    scoreValue.style.color = scoreColor(score);
    scoreLabelText.textContent = scoreText(score);
    scoreLabelText.style.color = scoreColor(score);

    statReports.textContent = data.reports;
    statWarnings.textContent = data.warnings;
    statSource.textContent = data.source === 'local_db' ? 'DB' :
      data.source === 'safebase' ? 'SafeBase' :
      data.source === 'heuristic' ? 'AI' : data.source || '—';

    tagsEl.innerHTML = (data.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('');
    descriptionEl.textContent = data.description;

    if (data.last_report) {
      lastReportEl.hidden = false;
      lastReportEl.textContent = 'LAST FLAG: ' + data.last_report;
    } else {
      lastReportEl.hidden = true;
    }

    renderComments(data.comments || []);
    if (!data.comments) loadComments(currentUsername);

    saveHistory({
      username: data.username,
      status: data.status,
      score: data.score
    });

    if (data.status === 'scam') {
      setTimeout(() => showScamOverlay(data.username), 400);
    } else {
      haptic(data.status === 'clean' ? 'success' : 'medium');
    }

    resultSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  async function doCheck() {
    const raw = input.value.trim().replace(/^@+/, '');
    if (!raw || raw.length < 3) {
      input.focus();
      haptic('error');
      return;
    }

    setLoading(true);
    resultSection.hidden = true;
    hideScamOverlay();

    try {
      const res = await fetch('/api/check?username=' + encodeURIComponent(raw));
      const data = await res.json();
      if (!data.success) {
        alert(data.error || 'Ошибка скана');
        haptic('error');
        return;
      }
      renderResult(data);
    } catch (err) {
      console.error(err);
      alert('Скан недоступен. Проверь соединение.');
      haptic('error');
    } finally {
      setLoading(false);
    }
  }

  // Events

  // Live Telegram avatar preview while typing
  const livePreview = document.getElementById('live-preview');
  const liveImg = document.getElementById('live-img');
  const liveLetter = document.getElementById('live-letter');
  const liveName = document.getElementById('live-name');
  let previewTimer = null;

  function updateLivePreview() {
    const raw = input.value.trim().replace(/^@+/, '');
    if (!raw || raw.length < 3) {
      if (livePreview) livePreview.hidden = true;
      return;
    }
    if (livePreview) livePreview.hidden = false;
    if (liveName) liveName.textContent = '@' + raw;
    setAvatar(liveImg, liveLetter, raw);
  }

  input.addEventListener('input', () => {
    clearBtn.hidden = !input.value;
    clearTimeout(previewTimer);
    previewTimer = setTimeout(updateLivePreview, 350);
  });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    clearBtn.hidden = true;
    if (livePreview) livePreview.hidden = true;
    input.focus();
  });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doCheck(); });
  checkBtn.addEventListener('click', doCheck);

  newCheckBtn.addEventListener('click', () => {
    resultSection.hidden = true;
    hideScamOverlay();
    input.value = '';
    clearBtn.hidden = true;
    currentUsername = '';
    input.focus();
  });

  reportBtn.addEventListener('click', async () => {
    const u = resultUsername.textContent;
    const reason = prompt('Кратко: почему жалоба?') || '';
    try {
      const res = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u, reason })
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message);
        haptic('success');
      }
    } catch {
      alert('Не удалось отправить');
    }
  });

  commentForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentUsername) return;
    const text = commentText.value.trim();
    if (!text || text.length < 3) {
      commentText.focus();
      return;
    }
    const btn = commentForm.querySelector('.comment-submit');
    btn.disabled = true;
    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: currentUsername,
          text,
          author: commentAuthor.value.trim() || undefined
        })
      });
      const data = await res.json();
      if (data.success) {
        commentText.value = '';
        renderComments(data.comments);
        haptic('success');
      } else {
        alert(data.error || 'Ошибка');
      }
    } catch {
      alert('Не удалось отправить отчёт');
    } finally {
      btn.disabled = false;
    }
  });

  scamDismiss.addEventListener('click', hideScamOverlay);

  renderHistory();
  setTimeout(() => input.focus(), 300);

  console.log('%c Detected Scams v2.1 ', 'background:#00ff88;color:#000;font-weight:bold;font-size:12px');
  console.log('Demo: scammer_king, crypto_garant_fake, support_tg_official, trusted_trader');
})();
