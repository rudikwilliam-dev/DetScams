(function () {
  'use strict';
  const TOKEN_KEY = 'scamguard_admin_token';
  let token = localStorage.getItem(TOKEN_KEY) || '';

  const loginScreen = document.getElementById('login-screen');
  const app = document.getElementById('app');
  const loginForm = document.getElementById('login-form');
  const loginError = document.getElementById('login-error');
  const logoutBtn = document.getElementById('logout-btn');
  const editModal = document.getElementById('edit-modal');
  const editForm = document.getElementById('edit-form');

  function headers() {
    return {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token,
      'X-Admin-Token': token
    };
  }

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      ...opts,
      headers: { ...headers(), ...(opts.headers || {}) }
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      logout();
      throw new Error('Unauthorized');
    }
    return { res, data };
  }

  function showApp() {
    loginScreen.hidden = true;
    app.hidden = false;
    loadStats();
    loadScammers();
  }

  function logout() {
    token = '';
    localStorage.removeItem(TOKEN_KEY);
    app.hidden = true;
    loginScreen.hidden = false;
  }

  // Login
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.hidden = true;
    const password = document.getElementById('password').value;
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      const data = await res.json();
      if (data.success && data.token) {
        token = data.token;
        localStorage.setItem(TOKEN_KEY, token);
        showApp();
      } else {
        loginError.textContent = data.error || 'Ошибка входа';
        loginError.hidden = false;
      }
    } catch {
      loginError.textContent = 'Ошибка сети';
      loginError.hidden = false;
    }
  });

  logoutBtn.addEventListener('click', logout);

  // Tabs
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
      if (btn.dataset.tab === 'scammers') loadScammers();
      if (btn.dataset.tab === 'reports') loadReports();
      if (btn.dataset.tab === 'dashboard') loadStats();
    });
  });

  // Stats
  async function loadStats() {
    try {
      const { data } = await api('/api/admin/stats');
      if (!data.success) return;
      document.getElementById('stat-total').textContent = data.total;
      document.getElementById('stat-scam').textContent = data.by_status.scam || 0;
      document.getElementById('stat-sus').textContent = data.by_status.suspicious || 0;
      document.getElementById('stat-clean').textContent = data.by_status.clean || 0;
      document.getElementById('stat-reports').textContent = data.reports_count || 0;
      document.getElementById('stat-safebase').textContent = data.safebase_enabled ? 'ON' : 'OFF';
    } catch (_) {}
  }

  // Scammers list
  async function loadScammers() {
    const q = document.getElementById('search-q').value.trim();
    const status = document.getElementById('filter-status').value;
    let url = '/api/admin/scammers?';
    if (q) url += 'q=' + encodeURIComponent(q) + '&';
    if (status) url += 'status=' + encodeURIComponent(status);
    try {
      const { data } = await api(url);
      const tbody = document.getElementById('scammers-tbody');
      if (!data.scammers || !data.scammers.length) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#8b95a8;padding:24px">Пусто</td></tr>';
        return;
      }
      tbody.innerHTML = data.scammers.map(s => `
        <tr>
          <td><strong>@${esc(s.username)}</strong></td>
          <td>${s.user_id ? esc(String(s.user_id)) : '—'}</td>
          <td><span class="badge ${s.status}">${statusLabel(s.status)}</span></td>
          <td>${s.score}</td>
          <td>${s.reports || 0}</td>
          <td>${(s.tags || []).map(t => '<span class="tag-mini">' + esc(t) + '</span>').join('') || '—'}</td>
          <td class="actions-cell">
            <button class="btn-sm" data-edit='${escAttr(JSON.stringify(s))}'>✏️</button>
            <button class="btn-sm danger" data-del="${s.id}">🗑</button>
          </td>
        </tr>
      `).join('');

      tbody.querySelectorAll('[data-edit]').forEach(btn => {
        btn.addEventListener('click', () => openEdit(JSON.parse(btn.getAttribute('data-edit'))));
      });
      tbody.querySelectorAll('[data-del]').forEach(btn => {
        btn.addEventListener('click', () => deleteScammer(btn.getAttribute('data-del')));
      });
    } catch (_) {}
  }

  document.getElementById('search-q').addEventListener('input', debounce(loadScammers, 300));
  document.getElementById('filter-status').addEventListener('change', loadScammers);

  function statusLabel(s) {
    if (s === 'scam') return 'Скамер';
    if (s === 'suspicious') return 'Подозрительно';
    return 'Чистый';
  }

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }
  function escAttr(s) {
    return String(s).replace(/'/g, '&#39;').replace(/"/g, '&quot;');
  }
  function debounce(fn, ms) {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  }

  // Add
  document.getElementById('add-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const msg = document.getElementById('add-msg');
    msg.hidden = true;
    const fd = new FormData(form);
    const body = {
      username: fd.get('username'),
      user_id: fd.get('user_id') || null,
      status: fd.get('status'),
      score: fd.get('score') ? Number(fd.get('score')) : undefined,
      reputation: fd.get('reputation') || undefined,
      description: fd.get('description') || '',
      tags: fd.get('tags') || '',
      reports: Number(fd.get('reports') || 0),
      warnings: Number(fd.get('warnings') || 0)
    };
    try {
      const { res, data } = await api('/api/admin/scammers', {
        method: 'POST',
        body: JSON.stringify(body)
      });
      if (data.success) {
        msg.textContent = '✅ Добавлено: @' + data.scammer.username;
        msg.className = 'msg ok';
        msg.hidden = false;
        form.reset();
        loadStats();
      } else {
        msg.textContent = data.error || 'Ошибка';
        msg.className = 'msg err';
        msg.hidden = false;
      }
    } catch (err) {
      msg.textContent = err.message;
      msg.className = 'msg err';
      msg.hidden = false;
    }
  });

  // Edit
  function openEdit(s) {
    editForm.id.value = s.id;
    editForm.username.value = s.username || '';
    editForm.user_id.value = s.user_id || '';
    editForm.status.value = s.status || 'scam';
    editForm.score.value = s.score ?? '';
    editForm.reputation.value = s.reputation || '';
    editForm.description.value = s.description || '';
    editForm.tags.value = (s.tags || []).join(', ');
    editForm.reports.value = s.reports || 0;
    editForm.warnings.value = s.warnings || 0;
    editModal.hidden = false;
  }

  document.getElementById('edit-cancel').addEventListener('click', () => {
    editModal.hidden = true;
  });

  editForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = editForm.id.value;
    const body = {
      username: editForm.username.value,
      user_id: editForm.user_id.value || null,
      status: editForm.status.value,
      score: Number(editForm.score.value),
      reputation: editForm.reputation.value,
      description: editForm.description.value,
      tags: editForm.tags.value,
      reports: Number(editForm.reports.value),
      warnings: Number(editForm.warnings.value)
    };
    try {
      const { data } = await api('/api/admin/scammers/' + id, {
        method: 'PUT',
        body: JSON.stringify(body)
      });
      if (data.success) {
        editModal.hidden = true;
        loadScammers();
        loadStats();
      } else {
        alert(data.error || 'Ошибка');
      }
    } catch (err) {
      alert(err.message);
    }
  });

  async function deleteScammer(id) {
    if (!confirm('Удалить запись?')) return;
    try {
      const { data } = await api('/api/admin/scammers/' + id, { method: 'DELETE' });
      if (data.success) {
        loadScammers();
        loadStats();
      }
    } catch (_) {}
  }

  // Reports
  async function loadReports() {
    try {
      const { data } = await api('/api/admin/reports');
      const el = document.getElementById('reports-list');
      if (!data.reports || !data.reports.length) {
        el.innerHTML = '<p style="color:#8b95a8">Жалоб пока нет</p>';
        return;
      }
      el.innerHTML = data.reports.map(r => `
        <div class="report-item">
          <div class="r-user">@${esc(r.username)}${r.user_id ? ' · ID ' + esc(String(r.user_id)) : ''}</div>
          <div class="r-reason">${esc(r.reason) || '<em>без комментария</em>'}</div>
          <div class="r-date">${esc(r.created_at)}</div>
        </div>
      `).join('');
    } catch (_) {}
  }

  // Auto-login if token exists
  if (token) {
    api('/api/admin/stats').then(({ data }) => {
      if (data.success) showApp();
      else logout();
    }).catch(logout);
  }
})();
