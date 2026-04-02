// ═══════════════════════════════════════════════════════
//  Admin — full dashboard with scientific stats + charts
// ═══════════════════════════════════════════════════════
const Admin = (() => {
  const { $, $$, el, html, toast, copyToClipboard, formatDuration, randomId } = Utils;

  // ── Bootstrap ──────────────────────────────────────────────────
  async function init() {
    const authed = await API.checkAuth();
    authed ? showDashboard() : showLogin();
  }

  // ── Login ──────────────────────────────────────────────────────
  function showLogin() {
    $('#app').innerHTML = `
      <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px">
        <div style="width:100%;max-width:360px">
          <div style="text-align:center;margin-bottom:36px">
            <div class="logo-icon" style="width:56px;height:56px;font-size:20px;margin:0 auto 16px">OE</div>
            <h2 style="font-family:var(--serif);font-size:1.8rem">Admin Login</h2>
            <p class="mt-8">ODP Evaluation Platform</p>
          </div>
          <div class="card">
            <div class="form-group">
              <label class="form-label">Password</label>
              <input type="password" id="pw" class="form-control" placeholder="Admin password" autofocus>
            </div>
            <button id="login-btn" class="btn btn-primary w-full">Sign in →</button>
            <p class="mt-16" style="font-size:.75rem;color:var(--text-muted);text-align:center">
            </p>
          </div>
        </div>
      </div>`;
    const go = async () => {
      const pw = $('#pw').value.trim(); if (!pw) return;
      try { await API.login(pw); showDashboard(); }
      catch { toast('Wrong password', 'error'); }
    };
    $('#login-btn').onclick = go;
    $('#pw').onkeydown = e => { if (e.key==='Enter') go(); };
  }

  // ── Dashboard ──────────────────────────────────────────────────
  function showDashboard() {
    $('#app').innerHTML = `
      <div style="max-width:1000px;margin:0 auto;padding:32px 24px 80px">
        <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:32px;flex-wrap:wrap;gap:16px">
          <div>
            <div class="hero-tag" style="display:inline-flex;margin-bottom:12px">Admin Dashboard</div>
            <h2 style="font-family:var(--serif);font-size:2rem">Your Surveys</h2>
          </div>
          <div style="display:flex;gap:8px">
            <button id="logout-btn" class="btn btn-ghost btn-sm">Sign out</button>
            <button id="new-btn" class="btn btn-primary">＋ New Survey</button>
          </div>
        </div>
        <div id="survey-list"></div>
      </div>`;
    $('#logout-btn').onclick = () => { API.clearToken(); showLogin(); };
    $('#new-btn').onclick    = () => showWizard();
    loadList();
  }

  async function loadList() {
    const list = $('#survey-list');
    list.innerHTML = '<div style="display:flex;gap:12px;align-items:center;padding:20px 0"><div class="spinner"></div><span class="mono" style="color:var(--text-muted)">Loading…</span></div>';
    try {
      const surveys = await API.surveys.list();
      list.innerHTML = '';
      if (!surveys.length) {
        list.innerHTML = `
          <div style="text-align:center;padding:64px 0;border:2px dashed var(--border);border-radius:16px">
            <div style="font-size:3rem;margin-bottom:16px;opacity:.3">📋</div>
            <h3 style="font-family:var(--serif);margin-bottom:8px">No surveys yet</h3>
            <p style="color:var(--text-muted)">Click "＋ New Survey" to get started.</p>
          </div>`;
        return;
      }

      const total = surveys.length;
      const pub   = surveys.filter(s=>s.status==='published').length;
      const resps = surveys.reduce((a,s)=>a+s.response_count,0);
      list.insertAdjacentHTML('beforeend', `
        <div class="grid-auto mb-24">
          ${sc('Surveys',total,'amber')} ${sc('Published',pub,'green')} ${sc('Responses',resps,'cyan')}
        </div>`);

      surveys.forEach(sv => {
        const statusBadge = {draft:'<span class="badge badge-muted">draft</span>',published:'<span class="badge badge-green">● live</span>',paused:'<span class="badge badge-amber">paused</span>'}[sv.status]||'';
        const card = el('div',{class:'card mb-16'});
        card.innerHTML = `
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap">
            <div style="flex:1;min-width:200px">
              <div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap">${statusBadge}<span class="label">#${sv.id} · ${new Date(sv.created_at).toLocaleDateString()}</span></div>
              <div class="card-title mb-6">${esc(sv.title)}</div>
              ${sv.description?`<p style="font-size:.85rem;margin-bottom:12px">${esc(sv.description)}</p>`:''}
              <div style="display:flex;gap:16px;flex-wrap:wrap;font-size:.78rem;color:var(--text-muted)">
                <span>📋 ${sv.pattern_count}</span><span>👥 ${sv.session_count}</span>
                <span>✅ ${sv.completed_count}</span><span>💬 ${sv.response_count}</span>
              </div>
              ${sv.status==='published'&&sv.public_url?`
                <div class="mt-12" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                  <code style="font-family:var(--mono);font-size:.72rem;color:var(--cyan);background:rgba(78,201,240,.08);padding:4px 10px;border-radius:4px;border:1px solid rgba(78,201,240,.2);word-break:break-all">${esc(sv.public_url)}</code>
                  <button class="link-copy copy-url" data-url="${esc(sv.public_url)}">Copy</button>
                </div>`:''}
            </div>
            <div style="display:flex;gap:8px;flex-shrink:0;flex-wrap:wrap">
              <button class="btn btn-secondary btn-sm sv-open" data-id="${sv.id}">Open →</button>
              <button class="btn btn-ghost btn-sm sv-del" data-id="${sv.id}" data-title="${esc(sv.title)}">Delete</button>
            </div>
          </div>
          ${sv.session_count>0?`<div class="progress-bar mt-16"><div class="progress-fill" style="width:${Math.round(sv.completed_count/sv.session_count*100)}%"></div></div><div class="label mt-4">${sv.completed_count}/${sv.session_count} sessions completed</div>`:''}
        `;
        card.querySelector('.sv-open').onclick = ()=>openDetail(sv.id);
        card.querySelector('.sv-del').onclick  = async()=>{
          if(!confirm(`Delete "${sv.title}"?`)) return;
          await API.surveys.delete(sv.id); toast('Deleted','info'); loadList();
        };
        card.querySelector('.copy-url')?.addEventListener('click',function(){
          copyToClipboard(this.dataset.url).then(()=>{this.textContent='✓';setTimeout(()=>this.textContent='Copy',2000);});
        });
        list.appendChild(card);
      });
    } catch(e) { list.innerHTML=`<div class="alert alert-error">${esc(e.message)}</div>`; }
  }

  // ── New survey wizard ───────────────────────────────────────────
  function showWizard() {
    const ov = el('div',{style:'position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:200;display:flex;align-items:center;justify-content:center;padding:24px;overflow-y:auto'});
    ov.innerHTML = `
      <div class="card" style="width:100%;max-width:560px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px">
          <div class="card-title">Create New Survey</div>
          <button id="wz-x" class="btn btn-ghost btn-sm">✕</button>
        </div>
        <form id="cf">
          <div class="form-group">
            <label class="form-label">Survey Title <span style="color:var(--red)">*</span></label>
            <input name="title" type="text" class="form-control" required placeholder="e.g. WOP 2023 ODP Evaluation" autofocus>
          </div>
          <div class="form-group">
            <label class="form-label">Description <span style="color:var(--text-muted)">(shown to evaluators)</span></label>
            <textarea name="description" class="form-control" rows="2" placeholder="Brief context about this study…"></textarea>
          </div>
          <div class="form-group">
            <label class="form-label">Pattern CSV <span style="color:var(--red)">*</span></label>
            <input name="csv_file" id="csv-inp" type="file" accept=".csv" style="display:none">
            <div id="csv-drop" style="border:2px dashed var(--border2);border-radius:8px;padding:28px;text-align:center;cursor:pointer;transition:all .2s">
              <div style="font-size:2rem;margin-bottom:8px">📋</div>
              <div style="font-family:var(--mono);font-size:.78rem;color:var(--text-muted)">Drop CSV here or <span style="color:var(--amber);text-decoration:underline">browse</span></div>
              <div id="csv-name" style="margin-top:8px;font-family:var(--mono);font-size:.72rem;color:var(--green)"></div>
            </div>
            <p class="mt-8" style="font-size:.75rem;color:var(--text-muted)">
              Needs <code class="mono">title</code> + <code class="mono">Scenario</code> columns.
              <a href="/sample.csv" download style="color:var(--cyan)">Download sample CSV →</a>
            </p>
          </div>
          <div class="form-group">
            <label class="form-label">Questions JSON <span style="color:var(--text-muted)">(optional)</span></label>
            <div style="display:flex;align-items:center;gap:10px">
              <label class="btn btn-ghost btn-sm" style="cursor:pointer">
                Browse…
                <input name="questions_json" id="q-json-inp" type="file" accept=".json" style="display:none">
              </label>
              <span id="q-json-name" style="font-family:var(--mono);font-size:.72rem;color:var(--green)"></span>
            </div>
            <p class="mt-6" style="font-size:.75rem;color:var(--text-muted)">
              Upload a JSON file to define custom questions instead of the defaults.
              <a href="/sample_questions.json" download style="color:var(--cyan)">Download sample →</a>
            </p>
          </div>
          <div class="form-group">
            <label class="form-label">Patterns per evaluator</label>
            <input name="n_per_evaluator" type="number" class="form-control" value="3" min="1" max="50" style="max-width:100px">
            <p class="mt-6" style="font-size:.75rem;color:var(--text-muted)">Each person gets this many randomly assigned patterns</p>
          </div>
          <div class="form-group">
            <label class="form-label">Estimated session time <span style="color:var(--text-muted)">(minutes, 0 = auto-calculate)</span></label>
            <input name="time_limit_minutes" type="number" class="form-control" value="20" min="0" max="180" style="max-width:100px">
            <p class="mt-6" style="font-size:.75rem;color:var(--text-muted)">Shown to evaluators on the welcome screen as an estimated duration</p>
          </div>
          <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:8px">
            <button type="button" id="wz-cancel" class="btn btn-secondary">Cancel</button>
            <button type="submit" id="wz-ok" class="btn btn-primary">Create Survey →</button>
          </div>
        </form>
      </div>`;
    document.body.appendChild(ov);
    const close = ()=>ov.remove();
    $('#wz-x',ov).onclick=''; // handled below
    ov.addEventListener('click', e=>{ if(e.target===ov) close(); });
    $('#wz-x',ov).onclick    = close;
    $('#wz-cancel',ov).onclick = close;

    const drop = $('#csv-drop',ov);
    const inp  = $('#csv-inp',ov);
    drop.onclick = ()=>inp.click();
    drop.ondragover=e=>{e.preventDefault();drop.style.borderColor='var(--amber)';};
    drop.ondragleave=()=>{drop.style.borderColor='var(--border2)';};
    drop.ondrop=e=>{
      e.preventDefault();drop.style.borderColor='var(--border2)';
      const dt=new DataTransfer();dt.items.add(e.dataTransfer.files[0]);
      inp.files=dt.files;$('#csv-name',ov).textContent='✓ '+e.dataTransfer.files[0].name;
    };
    inp.onchange=()=>$('#csv-name',ov).textContent='✓ '+(inp.files[0]?.name||'');
    $('#q-json-inp',ov).onchange=e=>$('#q-json-name',ov).textContent=e.target.files[0]?'✓ '+e.target.files[0].name:'';

    $('#cf',ov).onsubmit=async e=>{
      e.preventDefault();
      if (!$('#csv-inp',ov).files.length) { toast('Please select a CSV file','error'); return; }
      const btn=$('#wz-ok',ov);btn.disabled=true;btn.textContent='Creating…';
      try {
        const sv=await API.surveys.create(new FormData(e.target));
        toast(`Created with ${sv.pattern_count} patterns!`,'success');
        close(); openDetail(sv.id);
      } catch(err) {
        toast(err.message,'error');btn.disabled=false;btn.textContent='Create Survey →';
      }
    };
  }

  // ── Survey detail ───────────────────────────────────────────────
  async function openDetail(id) {
    $('#app').innerHTML = `
      <div style="max-width:1000px;margin:0 auto;padding:24px 24px 80px">
        <button id="back" class="btn btn-ghost btn-sm mb-24">← All Surveys</button>
        <div id="dr"></div>
      </div>`;
    $('#back').onclick = ()=>showDashboard();
    await renderDetail(id);
  }

  async function renderDetail(id) {
    try {
      const [sv,stats]=await Promise.all([API.surveys.get(id), API.surveys.stats(id).catch(()=>null)]);
      buildDetail(sv,stats);
    } catch(e) { $('#dr').innerHTML=`<div class="alert alert-error">${esc(e.message)}</div>`; }
  }

  function buildDetail(sv,stats) {
    const root=$('#dr');
    const stColor={draft:'amber',published:'green',paused:'amber'}[sv.status]||'muted';

    root.innerHTML=`
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:16px;margin-bottom:24px">
        <div>
          <div style="display:flex;gap:8px;margin-bottom:8px">
            <span class="badge badge-${stColor}">${sv.status}</span>
            <span class="label">#${sv.id}</span>
          </div>
          <h2 style="font-family:var(--serif);font-size:1.8rem;margin-bottom:6px">${esc(sv.title)}</h2>
          ${sv.description?`<p style="max-width:560px">${esc(sv.description)}</p>`:''}
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${sv.status==='published'
            ?`<button id="unpub-btn" class="btn btn-ghost btn-sm">⏸ Pause</button>`
            :`<button id="pub-btn" class="btn btn-primary">${sv.status==='draft'?'🚀 Publish Survey':'▶ Re-publish'}</button>`}
          <button id="del-btn" class="btn btn-ghost btn-sm">Delete</button>
        </div>
      </div>

      ${sv.status==='published'&&sv.public_url?`
        <div class="card mb-24" style="border-color:var(--green);background:rgba(52,211,153,.05)">
          <div class="label mb-8" style="color:var(--green)">✓ Survey is live — share this link with evaluators</div>
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            <code id="pub-url" style="font-family:var(--mono);font-size:.82rem;color:var(--cyan);background:rgba(78,201,240,.08);padding:8px 14px;border-radius:6px;border:1px solid rgba(78,201,240,.2);flex:1;word-break:break-all">${esc(sv.public_url)}</code>
            <button id="copy-url-btn" class="btn btn-cyan btn-sm">Copy Link</button>
            <a href="${esc(sv.public_url)}" target="_blank" class="btn btn-ghost btn-sm">Preview ↗</a>
          </div>
          <p class="mt-10" style="font-size:.78rem;color:var(--text-muted)">
            Anyone who opens this link is randomly assigned <strong>${sv.settings?.n_per_evaluator||3}</strong> patterns.
          </p>
        </div>`
      :sv.status==='draft'?`<div class="alert alert-warning mb-24">⚠ Draft — configure below then click <strong>Publish Survey</strong> to generate a shareable link.</div>`
      :`<div class="alert alert-info mb-24">⏸ Paused — evaluators cannot submit. Re-publish to resume.</div>`}

      <div class="grid-auto mb-24">
        ${sc('Patterns',sv.pattern_count,'amber')} ${sc('Sessions',sv.session_count,'cyan')}
        ${sc('Completed',sv.completed_count,'green')} ${sc('Responses',sv.response_count,'violet')}
      </div>

      <div id="tabs-bar" style="display:flex;gap:4px;border-bottom:1px solid var(--border);margin-bottom:24px"></div>
      <div id="tab-pane"></div>
    `;

    root.querySelector('#pub-btn')?.addEventListener('click',async()=>{
      try { const u=await API.surveys.publish(sv.id); toast('Published!','success'); buildDetail(u,stats); }
      catch(e){toast(e.message,'error');}
    });
    root.querySelector('#unpub-btn')?.addEventListener('click',async()=>{
      try { const u=await API.surveys.unpublish(sv.id); toast('Paused','info'); buildDetail(u,stats); }
      catch(e){toast(e.message,'error');}
    });
    root.querySelector('#copy-url-btn')?.addEventListener('click',function(){
      copyToClipboard(sv.public_url).then(()=>{this.textContent='✓ Copied!';setTimeout(()=>this.textContent='Copy Link',2000);});
    });
    root.querySelector('#del-btn').onclick=async()=>{
      if(!confirm(`Delete "${sv.title}"?`)) return;
      await API.surveys.delete(sv.id); toast('Deleted','info'); showDashboard();
    };

    const tabs=[{id:'configure',label:'⚙ Configure'},{id:'questions',label:'❓ Questions'},{id:'results',label:'📊 Results & Statistics'}];
    const bar=$('#tabs-bar',root);
    tabs.forEach(t=>{
      const btn=el('button',{class:'btn btn-ghost btn-sm tab-btn','data-t':t.id,style:'border-radius:6px 6px 0 0;border-bottom:2px solid transparent'},t.label);
      btn.onclick=()=>switchTab(t.id,sv,stats);
      bar.appendChild(btn);
    });
    switchTab('configure',sv,stats);
  }

  function switchTab(id,sv,stats){
    $$('.tab-btn').forEach(b=>{const a=b.dataset.t===id;b.style.borderBottomColor=a?'var(--amber)':'transparent';b.style.color=a?'var(--amber)':'';});
    const pane=$('#tab-pane');
    if(id==='configure') renderConfigure(pane,sv);
    if(id==='questions')  renderQuestions(pane,sv);
    if(id==='results')    renderResults(pane,sv,stats);
  }

  // ── Configure tab ──────────────────────────────────────────────
  function renderConfigure(pane,sv){
    const cols=(sv.settings?.csv_headers||Object.keys((sv.patterns||[])[0]||{}).filter(k=>!k.startsWith('_')));
    const sel=new Set(sv.display_columns);
    const nPer=sv.settings?.n_per_evaluator||3;
    const tLim=sv.settings?.time_limit_minutes??20;

    pane.innerHTML=`
      <div class="card mb-16">
        <div class="card-title mb-16">Survey Settings</div>
        <div class="grid-2">
          <div class="form-group"><label class="form-label">Title</label><input id="cfg-t" class="form-control" value="${esc(sv.title)}"></div>
          <div class="form-group">
            <label class="form-label">Patterns per evaluator</label>
            <input id="cfg-n" type="number" class="form-control" value="${nPer}" min="1" max="${sv.pattern_count}" style="max-width:100px">
            <p class="mt-6" style="font-size:.75rem;color:var(--text-muted)">Max ${sv.pattern_count}</p>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Estimated session time <span style="color:var(--text-muted)">(minutes, 0 = auto-calculate)</span></label>
          <input id="cfg-tl" type="number" class="form-control" value="${tLim}" min="0" max="180" style="max-width:100px">
          <p class="mt-6" style="font-size:.75rem;color:var(--text-muted)">Shown to evaluators on the welcome screen as an estimated duration</p>
        </div>
        <div class="form-group"><label class="form-label">Description</label><textarea id="cfg-d" class="form-control" rows="2">${esc(sv.description)}</textarea></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button id="save-cfg" class="btn btn-primary btn-sm">Save Settings</button>
          <label class="btn btn-ghost btn-sm" style="cursor:pointer">↑ Replace CSV<input type="file" accept=".csv" id="recsv" style="display:none"></label>
        </div>
      </div>
      <div class="card">
        <div class="card-title mb-4">Columns shown to evaluators</div>
        <p class="mb-16" style="font-size:.85rem">Choose which CSV columns appear on each pattern card.</p>
        <div id="chips" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px"></div>
        <button id="save-cols" class="btn btn-primary btn-sm">Save Column Selection</button>
        <div class="section-label mt-24"><span class="section-label-text">Pattern Preview (${sv.pattern_count} rows)</span></div>
        <div class="preview-table-wrap"><table class="data-table" id="ptbl"><thead><tr></tr></thead><tbody></tbody></table></div>
      </div>`;

    // Chips
    const userSel=new Set(sel);
    const renderPrev=()=>{
      const ac=cols.filter(c=>userSel.has(c));
      $( '#ptbl thead tr',pane).innerHTML=ac.map(c=>`<th>${esc(c)}</th>`).join('');
      $('#ptbl tbody',pane).innerHTML=(sv.patterns||[]).slice(0,6).map(p=>`<tr>${ac.map(c=>`<td style="max-width:200px;font-size:.8rem">${esc(String(p[c]||'').slice(0,90))}</td>`).join('')}</tr>`).join('');
    };
    const chipsEl=$('#chips',pane);
    cols.filter(c=>!c.startsWith('_')).forEach(c=>{
      const chip=el('label',{class:`col-chip ${userSel.has(c)?'selected':''}`});
      const cb=el('input',{type:'checkbox'});cb.checked=userSel.has(c);
      cb.onchange=()=>{userSel[cb.checked?'add':'delete'](c);chip.classList.toggle('selected',cb.checked);renderPrev();};
      chip.appendChild(cb);chip.appendChild(document.createTextNode(c));
      chipsEl.appendChild(chip);
    });
    renderPrev();

    $('#save-cfg',pane).onclick=async()=>{
      try{await API.surveys.update(sv.id,{title:$('#cfg-t',pane).value,description:$('#cfg-d',pane).value,n_per_evaluator:+$('#cfg-n',pane).value,time_limit_minutes:+$('#cfg-tl',pane).value});toast('Saved','success');}
      catch(e){toast(e.message,'error');}
    };
    $('#save-cols',pane).onclick=async()=>{
      try{await API.surveys.update(sv.id,{display_columns:[...userSel]});sv.display_columns=[...userSel];toast('Saved','success');}
      catch(e){toast(e.message,'error');}
    };
    $('#recsv',pane).onchange=async e=>{
      const fd=new FormData();fd.append('csv_file',e.target.files[0]);
      try{const u=await API.surveys.uploadCSV(sv.id,fd);toast(`CSV updated: ${u.pattern_count} patterns`,'success');await renderDetail(sv.id);}
      catch(e){toast(e.message,'error');}
    };
  }

  // ── Questions tab ──────────────────────────────────────────────
  function renderQuestions(pane, sv) {
    // Working copies — initialise from question_sets or fall back to questions
    const qSets = JSON.parse(JSON.stringify(
      (sv.question_sets && Object.keys(sv.question_sets).length)
        ? sv.question_sets
        : { default: sv.questions || [] }
    ));
    const pMap = JSON.parse(JSON.stringify(sv.pattern_question_map || {}));
    let activeSet = 'default';

    function render() {
      const setNames = Object.keys(qSets);
      const qs       = qSets[activeSet] || [];

      pane.innerHTML = `
        <div class="card mb-16">
          <div class="card-title mb-4">Question Sets</div>
          <p class="mb-16" style="font-size:.85rem">
            Define different question templates. Patterns not assigned to a set use <strong>default</strong>.
          </p>
          <div id="qs-tabs" style="display:flex;gap:4px;border-bottom:1px solid var(--border);margin-bottom:16px;flex-wrap:wrap"></div>
          <div id="qs-editor"></div>
          <div style="border-top:1px solid var(--border);padding-top:16px;margin-top:16px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <span style="font-size:.8rem;color:var(--text-muted)">New set:</span>
            <input id="new-set-nm" class="form-control" placeholder="e.g. author" style="max-width:150px;height:32px;font-size:.82rem">
            <label class="btn btn-ghost btn-sm" style="cursor:pointer">
              Browse JSON<input type="file" id="new-set-json" accept=".json" style="display:none">
            </label>
            <button id="add-set-btn" class="btn btn-ghost btn-sm">＋ Add Set</button>
          </div>
        </div>
        <div class="card">
          <div class="card-title mb-4">Pattern → Question Set</div>
          <p class="mb-12" style="font-size:.85rem">
            Assign each pattern to a question set. Unassigned patterns use <strong>default</strong>.
          </p>
          <div id="pmap-wrap"></div>
          <div style="display:flex;justify-content:flex-end;margin-top:16px">
            <button id="save-pmap" class="btn btn-primary btn-sm">Save Assignments</button>
          </div>
        </div>`;

      // ── Set tabs ────────────────────────────────────────────
      const tabsEl = $('#qs-tabs', pane);
      setNames.forEach(name => {
        const isActive = name === activeSet;
        const btn = el('button', {
          class: 'btn btn-ghost btn-sm',
          style: `border-radius:6px 6px 0 0;border-bottom:2px solid ${isActive?'var(--amber)':'transparent'};color:${isActive?'var(--amber)':''}`
        }, name === 'default' ? 'Default' : name);
        btn.onclick = () => { activeSet = name; render(); };
        tabsEl.appendChild(btn);
      });

      // ── Editor for active set ────────────────────────────────
      const edEl = $('#qs-editor', pane);
      edEl.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px">
          <span class="label">Editing: <strong>${esc(activeSet === 'default' ? 'Default' : activeSet)}</strong> — ${qs.length} question(s)</span>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            ${activeSet !== 'default' ? `<button id="del-set-btn" class="btn btn-ghost btn-sm" style="color:var(--red)">Delete Set</button>` : ''}
            <label class="btn btn-ghost btn-sm" style="cursor:pointer">
              Replace with JSON<input type="file" id="repl-json" accept=".json" style="display:none">
            </label>
            <button id="save-qs-btn" class="btn btn-primary btn-sm">Save Set</button>
          </div>
        </div>
        <div id="q-list"></div>
        <button id="add-q-btn" class="btn btn-ghost w-full mt-12">＋ Add Question</button>`;

      const renderQList = () => {
        const l = $('#q-list', pane); l.innerHTML = '';
        qs.forEach((q, i) => buildQItem(l, q, i, qs, renderQList));
      };
      renderQList();

      $('#add-q-btn', pane).onclick = () => {
        qs.push({ id: randomId('q'), type: 'text', label: 'New Question', help: '', required: false });
        renderQList();
      };

      $('#save-qs-btn', pane).onclick = async () => {
        try {
          qSets[activeSet] = qs;
          const payload = { question_sets: { ...qSets } };
          if (activeSet === 'default') payload.questions = qs;
          const updated = await API.surveys.update(sv.id, payload);
          sv.question_sets = updated.question_sets;
          if (activeSet === 'default') sv.questions = qs;
          toast('Question set saved', 'success');
        } catch(e) { toast(e.message, 'error'); }
      };

      $('#repl-json', pane)?.addEventListener('change', async e => {
        const file = e.target.files[0]; if (!file) return;
        try {
          const text = await Utils.readFileAsText(file);
          const parsed = JSON.parse(text);
          if (!Array.isArray(parsed)) throw new Error('JSON must be an array of questions');
          qs.splice(0, qs.length, ...parsed);
          renderQList();
          toast(`Loaded ${parsed.length} questions from ${file.name}`, 'success');
        } catch(e) { toast('Invalid JSON: ' + e.message, 'error'); }
      });

      $('#del-set-btn', pane)?.addEventListener('click', async () => {
        const setName = activeSet;
        if (!confirm(`Delete question set "${setName}"?\nPatterns assigned to it will fall back to "default".`)) return;
        Object.keys(pMap).forEach(k => { if (pMap[k] === setName) delete pMap[k]; });
        delete qSets[setName];
        activeSet = 'default';
        try {
          await API.surveys.update(sv.id, { question_sets: { ...qSets }, pattern_question_map: { ...pMap } });
          sv.question_sets = { ...qSets }; sv.pattern_question_map = { ...pMap };
          toast(`Set "${setName}" deleted`, 'info');
        } catch(e) { toast(e.message, 'error'); }
        render();
      });

      // ── Add set ─────────────────────────────────────────────
      $('#add-set-btn', pane).onclick = async () => {
        const nm = ($('#new-set-nm', pane).value || '').trim().toLowerCase().replace(/\s+/g, '_');
        if (!nm) { toast('Enter a set name', 'error'); return; }
        if (qSets[nm]) { toast(`Set "${nm}" already exists`, 'error'); return; }
        const jsonFile = $('#new-set-json', pane).files[0];
        let newQs = [];
        if (jsonFile) {
          try {
            const parsed = JSON.parse(await Utils.readFileAsText(jsonFile));
            if (!Array.isArray(parsed)) throw new Error('JSON must be an array');
            newQs = parsed;
          } catch(e) { toast('Invalid JSON: ' + e.message, 'error'); return; }
        } else {
          newQs = JSON.parse(JSON.stringify(qSets['default'] || []));
        }
        qSets[nm] = newQs;
        activeSet = nm;
        try {
          const updated = await API.surveys.update(sv.id, { question_sets: { ...qSets } });
          sv.question_sets = updated.question_sets;
          toast(`Set "${nm}" created`, 'success');
        } catch(e) { toast(e.message, 'error'); }
        render();
      };

      // ── Pattern → set mapping table ──────────────────────────
      const patterns = sv.patterns || [];
      const patKey   = p => { for (const k of ['scenario_id','Scenario_id','ScenarioID']) if (p[k]) return String(p[k]); return String(p._id ?? ''); };
      const wrap     = $('#pmap-wrap', pane);

      if (!patterns.length) {
        wrap.innerHTML = '<p style="color:var(--text-muted);font-size:.85rem">No patterns loaded.</p>';
      } else {
        wrap.innerHTML = `
          <input id="pmap-search" class="form-control mb-12" placeholder="Filter by ID or title…" style="max-width:320px">
          <div style="max-height:380px;overflow-y:auto;border:1px solid var(--border);border-radius:8px">
            <table class="data-table" style="margin:0;width:100%">
              <thead><tr>
                <th style="width:130px">Scenario ID</th><th>Title</th><th style="width:160px">Question Set</th>
              </tr></thead>
              <tbody id="pmap-body"></tbody>
            </table>
          </div>`;

        // Prefix-matching fallback: "2023-133" matches "2023-133-01" and vice versa
      const resolveSet = key => {
        if (key in pMap) return pMap[key];
        const found = Object.entries(pMap).find(([k]) => key.startsWith(k + '-') || k.startsWith(key + '-'));
        return found ? found[1] : 'default';
      };

      const renderPMap = (filter = '') => {
          const fl = filter.toLowerCase();
          const body = $('#pmap-body', pane); body.innerHTML = '';
          patterns
            .filter(p => !fl || (p.title||'').toLowerCase().includes(fl) || patKey(p).toLowerCase().includes(fl))
            .forEach(p => {
              const key = patKey(p);
              const cur = resolveSet(key);
              const tr = el('tr');
              tr.innerHTML = `
                <td style="font-family:var(--mono);font-size:.75rem;color:var(--cyan)">${esc(key)}</td>
                <td style="font-size:.82rem">${esc(p.title || '')}</td>
                <td>
                  <select class="form-control pmap-sel" style="font-size:.8rem;height:28px;padding:2px 8px">
                    ${Object.keys(qSets).map(n => `<option value="${n}" ${cur===n?'selected':''}>${n==='default'?'Default':n}</option>`).join('')}
                  </select>
                </td>`;
              body.appendChild(tr);
              tr.querySelector('.pmap-sel').onchange = e => {
                if (e.target.value === 'default') delete pMap[key];
                else pMap[key] = e.target.value;
              };
            });
        };
        renderPMap();
        $('#pmap-search', pane).oninput = e => renderPMap(e.target.value);
      }

      $('#save-pmap', pane).onclick = async () => {
        try {
          await API.surveys.update(sv.id, { pattern_question_map: { ...pMap } });
          sv.pattern_question_map = { ...pMap };
          toast('Assignments saved', 'success');
        } catch(e) { toast(e.message, 'error'); }
      };
    }

    render();
  }

  function buildQItem(list,q,idx,qs,refresh){
    const item=el('div',{class:'q-builder-item'});
    item.innerHTML=`
      <div style="display:flex;justify-content:space-between;margin-bottom:10px">
        <span class="badge badge-muted">Q${idx+1} · ${q.type}</span>
        <div style="display:flex;gap:6px">
          ${idx>0?`<button class="btn btn-ghost btn-sm q-up">↑</button>`:''}
          ${idx<qs.length-1?`<button class="btn btn-ghost btn-sm q-dn">↓</button>`:''}
          <button class="q-remove">✕</button>
        </div>
      </div>
      <div class="q-builder-row">
        <div class="form-group" style="flex:2;min-width:180px"><label class="form-label">Label</label><input type="text" class="form-control q-label" value="${esc(q.label)}"></div>
        <div class="form-group" style="min-width:130px"><label class="form-label">Type</label>
          <select class="form-control q-type">${['likert','text','textarea','boolean','select'].map(t=>`<option value="${t}" ${q.type===t?'selected':''}>${t}</option>`).join('')}</select></div>
        <div class="form-group" style="min-width:80px"><label class="form-label">Required</label>
          <select class="form-control q-req"><option value="true" ${q.required?'selected':''}>Yes</option><option value="false" ${!q.required?'selected':''}>No</option></select></div>
      </div>
      <div class="form-group"><label class="form-label">Help text</label><input type="text" class="form-control q-help" value="${esc(q.help||'')}"></div>
      ${q.type==='likert'?`<div class="q-builder-row">
        <div class="form-group" style="min-width:100px"><label class="form-label">Scale</label><select class="form-control q-scale">${[3,4,5,6,7].map(n=>`<option value="${n}" ${q.scale==n?'selected':''}>${n}-pt</option>`).join('')}</select></div>
        <div class="form-group" style="flex:1"><label class="form-label">Low label</label><input type="text" class="form-control q-low" value="${esc((q.labels||[])[0]||'')}"></div>
        <div class="form-group" style="flex:1"><label class="form-label">High label</label><input type="text" class="form-control q-high" value="${esc((q.labels||[])[1]||'')}"></div>
      </div>`:q.type==='select'?`<div class="form-group"><label class="form-label">Options (one per line)</label><textarea class="form-control q-opts" rows="3">${esc((q.options||[]).join('\n'))}</textarea></div>`:''}
    `;
    item.querySelector('.q-label').oninput=e=>{q.label=e.target.value;};
    item.querySelector('.q-help').oninput=e=>{q.help=e.target.value;};
    item.querySelector('.q-req').onchange=e=>{q.required=e.target.value==='true';};
    item.querySelector('.q-type').onchange=e=>{q.type=e.target.value;refresh();};
    item.querySelector('.q-scale')?.addEventListener('change',e=>{q.scale=+e.target.value;});
    item.querySelector('.q-low')?.addEventListener('input',e=>{(q.labels=q.labels||['',''])[0]=e.target.value;});
    item.querySelector('.q-high')?.addEventListener('input',e=>{(q.labels=q.labels||['',''])[1]=e.target.value;});
    item.querySelector('.q-opts')?.addEventListener('input',e=>{q.options=e.target.value.split('\n').filter(Boolean);});
    item.querySelector('.q-remove').onclick=()=>{qs.splice(idx,1);refresh();};
    item.querySelector('.q-up')?.addEventListener('click',()=>{[qs[idx-1],qs[idx]]=[qs[idx],qs[idx-1]];refresh();});
    item.querySelector('.q-dn')?.addEventListener('click',()=>{[qs[idx],qs[idx+1]]=[qs[idx+1],qs[idx]];refresh();});
    list.appendChild(item);
  }

  // ── Results & Statistics tab ────────────────────────────────────
  function renderResults(pane,sv,stats){
    pane.innerHTML=`
      <div style="display:flex;gap:8px;margin-bottom:24px;flex-wrap:wrap;align-items:center">
        <button class="btn btn-secondary btn-sm" onclick="API.surveys.exportCSV(${sv.id})">⬇ CSV</button>
        <button class="btn btn-secondary btn-sm" onclick="API.surveys.exportXLSX(${sv.id})">⬇ Excel</button>
        <button id="refresh-btn" class="btn btn-ghost btn-sm">↺ Refresh</button>
        <span style="flex:1"></span>
        <button id="clear-all-btn" class="btn btn-ghost btn-sm" style="color:var(--red);border-color:var(--red)">🗑 Clear All Responses</button>
      </div>
      <div id="sessions-section"></div>
      <div id="stats-body"></div>`;

    $('#refresh-btn',pane).onclick=async()=>{
      try{
        const [s,sess]=await Promise.all([API.surveys.stats(sv.id),API.surveys.sessions(sv.id)]);
        buildSessionsList($('#sessions-section',pane),sv,sess,pane);
        buildStats($('#stats-body',pane),sv,s);
        toast('Refreshed','success');
      }catch(e){toast(e.message,'error');}
    };

    $('#clear-all-btn',pane).onclick=async()=>{
      if(!confirm(`Delete ALL responses and sessions for "${sv.title}"?\nThis cannot be undone.`)) return;
      try{
        await API.surveys.clearResponses(sv.id);
        toast('All responses cleared','info');
        const [s,sess]=await Promise.all([API.surveys.stats(sv.id),API.surveys.sessions(sv.id)]);
        buildSessionsList($('#sessions-section',pane),sv,sess,pane);
        buildStats($('#stats-body',pane),sv,s);
      }catch(e){toast(e.message,'error');}
    };

    API.surveys.sessions(sv.id)
      .then(sess=>buildSessionsList($('#sessions-section',pane),sv,sess,pane))
      .catch(()=>{});
    buildStats($('#stats-body',pane),sv,stats);
  }

  function buildSessionsList(container,sv,sessions,pane){
    if(!sessions||!sessions.length){ container.innerHTML=''; return; }
    let h=`
      <div class="section-label mb-12"><span class="section-label-text">Sessions (${sessions.length})</span></div>
      <div class="card mb-24" style="padding:0;overflow:hidden">
        <table class="data-table" style="margin:0">
          <thead><tr>
            <th>#</th><th>Opened</th><th>Submitted</th><th>Status</th><th>Responses</th><th></th>
          </tr></thead>
          <tbody>`;
    sessions.forEach(s=>{
      const opened=s.opened_at?new Date(s.opened_at).toLocaleString():'—';
      const submitted=s.submitted_at?new Date(s.submitted_at).toLocaleString():'—';
      const status=s.is_completed
        ?'<span class="badge badge-green">completed</span>'
        :'<span class="badge badge-muted">incomplete</span>';
      h+=`<tr>
        <td style="font-family:var(--mono)">#${s.num}</td>
        <td style="font-size:.8rem">${opened}</td>
        <td style="font-size:.8rem">${submitted}</td>
        <td>${status}</td>
        <td style="font-family:var(--mono)">${s.n_responses}</td>
        <td><button class="btn btn-ghost btn-sm sess-del" data-num="${s.num}"
          style="color:var(--red);padding:2px 8px">✕ Remove</button></td>
      </tr>`;
    });
    h+=`</tbody></table></div>`;
    container.innerHTML=h;
    container.querySelectorAll('.sess-del').forEach(btn=>{
      btn.onclick=async()=>{
        const snum=+btn.dataset.num;
        if(!confirm(`Remove session #${snum} and all its responses?`)) return;
        try{
          await API.surveys.deleteSession(sv.id,snum);
          toast(`Session #${snum} removed`,'info');
          const [s,sess]=await Promise.all([API.surveys.stats(sv.id),API.surveys.sessions(sv.id)]);
          buildSessionsList(container,sv,sess,pane);
          buildStats($('#stats-body',pane),sv,s);
        }catch(e){toast(e.message,'error');}
      };
    });
  }

  function buildStats(container,sv,stats){
    if(!stats||!stats.n_responses){
      container.innerHTML=`<div style="text-align:center;padding:48px;border:2px dashed var(--border);border-radius:12px"><div style="font-size:2.5rem;opacity:.3;margin-bottom:12px">📊</div><p style="color:var(--text-muted)">No responses yet. Share the survey link to start collecting.</p></div>`;
      return;
    }

    const lqs=stats.question_stats.filter(q=>q.question_type==='likert');

    // ── Overview stats ─────────────────────────────
    let h=`
      <div class="grid-auto mb-24">
        ${sc('Sessions',stats.n_sessions,'amber')} ${sc('Completed',stats.n_completed,'green')}
        ${sc('Responses',stats.n_responses,'cyan')}
        ${sc('Avg Time',stats.avg_session_ms?formatDuration(stats.avg_session_ms):'–','violet')}
      </div>`;

    // ── Inter-rater agreement summary ──────────────
    if(stats.overall_krippendorff_alpha!==null&&stats.overall_krippendorff_alpha!==undefined){
      const alpha=stats.overall_krippendorff_alpha;
      const interp=stats.overall_krippendorff_alpha_interp||'';
      const col=alpha>=0.8?'var(--green)':alpha>=0.67?'var(--amber)':'var(--red)';
      h+=`
        <div class="card mb-24" style="border-color:${col};background:rgba(0,0,0,.2)">
          <div class="label mb-8">Inter-Rater Reliability — Krippendorff's α (ordinal)</div>
          <div style="display:flex;align-items:center;gap:20px;flex-wrap:wrap">
            <div style="font-family:var(--mono);font-size:2.4rem;font-weight:700;color:${col}">${alpha.toFixed(3)}</div>
            <div>
              <div style="font-weight:600;color:${col}">${interp}</div>
              <div style="font-size:.78rem;color:var(--text-muted);margin-top:4px">
                α ≥ 0.80 = strong · α ≥ 0.67 = tentative · α &lt; 0.67 = insufficient
              </div>
            </div>
          </div>
        </div>`;
    }

    // ── Per-question stats + bar charts ────────────
    h+=`<div class="section-label"><span class="section-label-text">Per-Question Analysis</span></div>`;
    lqs.forEach(q=>{
      const dist=q.distribution||{};
      const maxC=Math.max(...Object.values(dist),1);
      const alpha=q.krippendorff_alpha;
      const kappa=q.fleiss_kappa;
      const aCol=alpha===null?'var(--text-muted)':alpha>=0.8?'var(--green)':alpha>=0.67?'var(--amber)':'var(--red)';
      const kCol=kappa===null?'var(--text-muted)':kappa>0.6?'var(--green)':kappa>0.4?'var(--amber)':'var(--red)';
      h+=`
        <div class="card mb-16">
          <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:16px;margin-bottom:20px">
            <div>
              <div class="label mb-4">${esc(q.question_id)}</div>
              <div style="font-family:var(--serif);font-size:1.05rem;font-weight:600">${esc(q.question_label)}</div>
              ${q.labels?`<div style="font-size:.75rem;color:var(--text-muted);margin-top:4px">${esc(q.labels[0])} → ${esc(q.labels[1])}</div>`:''}
            </div>
            <div style="display:flex;gap:12px;flex-wrap:wrap">
              <div style="text-align:center">
                <div style="font-family:var(--mono);font-size:1.6rem;font-weight:700;color:var(--amber)">${q.mean!=null?q.mean.toFixed(2):'–'}</div>
                <div class="label">mean</div>
              </div>
              <div style="text-align:center">
                <div style="font-family:var(--mono);font-size:1.1rem;font-weight:600;color:var(--text)">${q.std!=null?q.std.toFixed(2):'–'}</div>
                <div class="label">std dev</div>
              </div>
              <div style="text-align:center">
                <div style="font-family:var(--mono);font-size:1.1rem;font-weight:600;color:var(--text)">${q.median!=null?q.median:'–'}</div>
                <div class="label">median</div>
              </div>
              <div style="text-align:center">
                <div style="font-family:var(--mono);font-size:1.1rem;font-weight:600;color:var(--text)">${q.iqr!=null?q.iqr:'–'}</div>
                <div class="label">IQR</div>
              </div>
            </div>
          </div>
          ${q.ci_95_low!=null?`<div class="alert alert-info mb-16" style="padding:8px 14px;font-size:.8rem">
            95% CI for mean: [${q.ci_95_low}, ${q.ci_95_high}] · n = ${q.n}</div>`:''}
          ${Object.entries(dist).map(([k,count])=>`
            <div class="chart-bar-row">
              <span class="chart-bar-label">${k}</span>
              <div class="chart-bar-track">
                <div class="chart-bar-fill" style="width:${maxC?count/maxC*100:0}%">${count>0?`<span class="chart-bar-count">${count}</span>`:''}</div>
              </div>
              <span class="chart-bar-pct">${q.n?Math.round(count/q.n*100):0}%</span>
            </div>`).join('')}
          <div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:16px;padding-top:16px;border-top:1px solid var(--border)">
            <div>
              <span class="label">Krippendorff's α: </span>
              <span style="font-family:var(--mono);font-size:.82rem;color:${aCol}">${alpha!=null?alpha.toFixed(3):'—'}</span>
              ${alpha!=null?`<span style="font-size:.75rem;color:var(--text-muted);margin-left:6px">(${q.krippendorff_alpha_interp})</span>`:''}
            </div>
            <div>
              <span class="label">Fleiss' κ: </span>
              <span style="font-family:var(--mono);font-size:.82rem;color:${kCol}">${kappa!=null?kappa.toFixed(3):'—'}</span>
              ${kappa!=null?`<span style="font-size:.75rem;color:var(--text-muted);margin-left:6px">(${q.fleiss_kappa_interp})</span>`:''}
            </div>
          </div>
        </div>`;
    });

    // ── Pattern ranking with heatmap ───────────────
    if(stats.pattern_stats?.length){
      h+=`<div class="section-label mt-24"><span class="section-label-text">Pattern Ranking (by mean score)</span></div>`;
      h+=`<div class="preview-table-wrap mb-8"><table class="data-table">
        <thead><tr>
          <th>#</th><th>Pattern</th><th>N</th>
          ${lqs.map(q=>`<th title="${esc(q.question_label)}">${esc(q.question_label.length>14?q.question_label.slice(0,14)+'…':q.question_label)}</th>`).join('')}
          <th>Overall</th>
        </tr></thead><tbody>
          ${stats.pattern_stats.map((p,i)=>{
            const ov=p.overall_mean;
            const ovCol=ov==null?'var(--text-muted)':ov>=3.5?'var(--green)':ov>=2.5?'var(--amber)':'var(--red)';
            return `<tr>
              <td style="font-family:var(--mono);font-size:.75rem;color:var(--text-muted)">${i+1}</td>
              <td style="max-width:240px;font-size:.82rem">${esc(p.pattern_title)}</td>
              <td><span class="badge badge-muted">${p.n_responses}</span></td>
              ${lqs.map(q=>{
                const v=p.means[q.question_id];
                const col=v==null?'var(--text-muted)':v>=3.5?'var(--green)':v>=2.5?'var(--amber)':'var(--red)';
                return `<td style="font-family:var(--mono);font-size:.82rem;color:${col}">${v!=null?v.toFixed(2):'–'}</td>`;
              }).join('')}
              <td style="font-family:var(--mono);font-size:.85rem;font-weight:700;color:${ovCol}">${ov!=null?ov.toFixed(2):'–'}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table></div>`;

      // ── Coverage bar chart ─────────────────────────
      h+=`<div class="card mt-16 mb-16">
        <div class="label mb-12">Pattern Coverage (# responses per pattern)</div>`;
      const maxN=Math.max(...stats.pattern_stats.map(p=>p.n_responses),1);
      stats.pattern_stats.forEach(p=>{
        h+=`<div class="chart-bar-row">
          <span style="font-family:var(--mono);font-size:.7rem;color:var(--text-muted);width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex-shrink:0;text-align:right;padding-right:8px" title="${esc(p.pattern_title)}">${esc(p.pattern_title.slice(0,30))}…</span>
          <div class="chart-bar-track"><div class="chart-bar-fill" style="width:${p.n_responses/maxN*100}%;background:linear-gradient(90deg,var(--cyan),var(--cyan-dim))">${p.n_responses>0?`<span class="chart-bar-count">${p.n_responses}</span>`:''}</div></div>
        </div>`;
      });
      h+=`</div>`;
    }

    // ── Legend for agreement scores ────────────────
    h+=`
      <div class="card mt-24" style="background:rgba(255,255,255,.02)">
        <div class="label mb-12">Agreement Score Reference</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;font-size:.8rem">
          <div>
            <div style="font-weight:600;margin-bottom:8px;font-family:var(--mono)">Krippendorff's α (ordinal)</div>
            <div style="color:var(--green)">α ≥ 0.80 — Strong agreement</div>
            <div style="color:var(--amber)">α ≥ 0.67 — Tentative agreement</div>
            <div style="color:var(--red)">α &lt; 0.67 — Do not rely on data</div>
          </div>
          <div>
            <div style="font-weight:600;margin-bottom:8px;font-family:var(--mono)">Fleiss' κ (categorical)</div>
            <div style="color:var(--green)">κ &gt; 0.80 — Almost perfect</div>
            <div style="color:var(--green)">κ &gt; 0.60 — Substantial</div>
            <div style="color:var(--amber)">κ &gt; 0.40 — Moderate</div>
            <div style="color:var(--red)">κ ≤ 0.40 — Fair or poor</div>
          </div>
        </div>
      </div>`;

    container.innerHTML=h;
  }

  function sc(l,v,c){return `<div class="stat-card ${c}"><div class="stat-value">${v}</div><div class="stat-label">${l}</div></div>`;}
  function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

  return { init };
})();

document.addEventListener('DOMContentLoaded', ()=>Admin.init());
