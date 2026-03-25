// ODP Evaluation Platform — API client
const API = (() => {
  const getToken  = () => localStorage.getItem('odp_token') || '';
  const setToken  = t  => localStorage.setItem('odp_token', t);
  const clearToken = () => localStorage.removeItem('odp_token');

  async function req(method, path, body=null, isForm=false) {
    const headers = {};
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const opts = { method, headers };
    if (body && isForm)  opts.body = body;
    else if (body)       { headers['Content-Type']='application/json'; opts.body=JSON.stringify(body); }

    const res = await fetch(path, opts);

    // 401 during normal requests → clear token and show login (no redirect loop)
    if (res.status === 401) {
      clearToken();
      // Only redirect if we're NOT already on the login screen (i.e. we were authed)
      if (token) { location.href = '/'; }
      throw new Error('Not authenticated');
    }
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try { const d = await res.json(); msg = d.detail || JSON.stringify(d); } catch {}
      throw new Error(msg);
    }
    if (res.status === 204) return null;
    const ct = res.headers.get('content-type') || '';
    return ct.includes('json') ? res.json() : res.blob();
  }

  const get      = p     => req('GET',   p);
  const post     = (p,b) => req('POST',  p, b);
  const patch    = (p,b) => req('PATCH', p, b);
  const del      = p     => req('DELETE',p);
  const postForm = (p,f) => req('POST',  p, f, true);

  // Auth — NEVER redirects, just returns boolean
  async function login(password) {
    const d = await post('/api/auth/token', { password });
    setToken(d.access_token);
  }
  async function checkAuth() {
    if (!getToken()) return false;
    try {
      const res = await fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (!res.ok) clearToken();
      return res.ok;
    } catch { return false; }
  }

  const surveys = {
    list:       ()      => get('/api/surveys'),
    get:        id      => get(`/api/surveys/${id}`),
    create:     fd      => postForm('/api/surveys', fd),
    update:     (id,b)  => patch(`/api/surveys/${id}`, b),
    uploadCSV:  (id,fd) => postForm(`/api/surveys/${id}/upload-csv`, fd),
    publish:    id      => post(`/api/surveys/${id}/publish`, {}),
    unpublish:  id      => post(`/api/surveys/${id}/unpublish`, {}),
    delete:     id      => del(`/api/surveys/${id}`),
    responses:  id      => get(`/api/surveys/${id}/responses`),
    sessions:   id      => get(`/api/surveys/${id}/sessions`),
    stats:      id      => get(`/api/surveys/${id}/stats`),
    exportCSV:  id => get(`/api/surveys/${id}/export/csv`).then(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `survey-${id}-responses.csv`;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
    }),
    exportXLSX: id => get(`/api/surveys/${id}/export/excel`).then(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `survey-${id}.xlsx`;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
    }),
  };

  const evaluate = {
    start:  slug => post(`/api/survey/${slug}/start`, {}),
    submit: body => post('/api/responses', body),
  };

  return { login, checkAuth, clearToken, getToken, surveys, evaluate };
})();
