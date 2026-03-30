// ═══════════════════════════════════════════════════════
//  Evaluator — opens slug link, gets random patterns,
//  fills form, submits directly to API
// ═══════════════════════════════════════════════════════
const Evaluate = (() => {
  const { $, $$, el, html, toast, formatDuration, now } = Utils;

  let state = {
    slug: null, payload: null,
    current: 0, responses: [],
    startTime: null, patternStart: null,
  };

  async function init() {
    const slug = new URLSearchParams(location.search).get('s');
    if (!slug) { showError('No survey link detected. Use the link provided to you.'); return; }
    state.slug = slug;

    try {
      const payload = await API.evaluate.start(slug);
      state.payload   = payload;
      state.startTime = Date.now();
      state.responses = payload.patterns.map(p => ({
        pattern_id:    p._id ?? 0,
        pattern_title: p.title || '',
        started_at:    null,
        completed_at:  null,
        duration_ms:   null,
        answers:       {}
      }));

      document.title = payload.survey_title || 'ODP Evaluation';
      showWelcome();
    } catch(e) {
      const msg = e.message.includes('403')
        ? 'This survey is not currently accepting responses.'
        : e.message.includes('404')
        ? 'Survey not found. Please check your link.'
        : e.message;
      showError(msg);
    }
  }

  // ── Welcome screen ─────────────────────────────────────────────
  function showWelcome() {
    const p = state.payload;
    $('#app').innerHTML = `
      <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px">
        <div style="max-width:560px;width:100%;text-align:center">
          <div class="hero-tag" style="display:inline-flex;margin-bottom:24px">Evaluation Survey</div>
          <h1 style="font-family:var(--serif);font-size:2rem;margin-bottom:16px">${esc(p.survey_title)}</h1>
          ${p.survey_description ? `<p style="margin-bottom:24px;font-size:.95rem">${esc(p.survey_description)}</p>` : ''}
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin:28px 0;text-align:left">
            <div class="stat-card amber"><div class="stat-value">${p.n_patterns}</div><div class="stat-label">Patterns to review</div></div>
            <div class="stat-card cyan"><div class="stat-value">${p.questions.length}</div><div class="stat-label">Questions each</div></div>
            <div class="stat-card violet"><div class="stat-value">~${Math.ceil(p.n_patterns*p.questions.filter(q=>q.type==='likert').length*0.3+p.n_patterns*2)} min</div><div class="stat-label">Estimated time</div></div>
          </div>
          <div class="alert alert-info mb-24" style="text-align:left">
            ℹ️ Your responses are saved automatically when you click Submit Survey at the end. You do not need to download or email anything.
          </div>
          <details style="text-align:left;margin-bottom:24px">
            <summary style="cursor:pointer;font-family:var(--mono);font-size:.78rem;color:var(--text-muted)">
              See your ${p.n_patterns} assigned patterns
            </summary>
            <div style="margin-top:12px">
              ${p.patterns.map((pt,i)=>`
                <div style="padding:8px 0;border-bottom:1px solid var(--border);font-size:.85rem">
                  <span style="font-family:var(--mono);color:var(--amber);font-size:.7rem;margin-right:8px">#${i+1}</span>
                  ${esc(pt.title || Object.values(pt).find(v=>v&&v.length<100) || 'Pattern '+(i+1))}
                </div>`).join('')}
            </div>
          </details>
          <button id="start-btn" class="btn btn-primary btn-lg">Begin Evaluation →</button>
          <p class="mt-16" style="font-size:.75rem;color:var(--text-muted)">Evaluator session #${p.session_num}</p>
        </div>
      </div>`;

    $('#start-btn').onclick = () => renderShell();
  }

  // ── Survey shell (sticky header + pattern area) ────────────────
  function renderShell() {
    const p = state.payload;
    $('#app').innerHTML = `
      <div id="eval-header" style="position:sticky;top:0;z-index:100;background:rgba(4,6,15,.95);backdrop-filter:blur(20px);border-bottom:1px solid var(--border)">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 24px;gap:16px">
          <strong style="font-family:var(--serif);font-size:.95rem">${esc(p.survey_title)}</strong>
          <span id="timer" style="font-family:var(--mono);font-size:.72rem;color:var(--text-muted)"></span>
        </div>
        <div style="height:3px;background:var(--border)">
          <div id="prog-fill" style="height:100%;background:linear-gradient(90deg,var(--amber),var(--cyan));width:0%;transition:width .5s ease"></div>
        </div>
        <div style="display:flex;justify-content:space-between;padding:5px 24px">
          <span id="prog-label" style="font-family:var(--mono);font-size:.7rem;color:var(--text-muted)">Pattern 1 of ${p.patterns.length}</span>
          <span style="font-family:var(--mono);font-size:.7rem;color:var(--text-muted)">Session #${p.session_num}</span>
        </div>
      </div>
      <div id="pattern-area" class="container-sm" style="padding-top:24px;padding-bottom:80px"></div>`;

    setInterval(() => {
      const el = $('#timer');
      if (el) el.textContent = formatDuration(Date.now() - state.startTime);
    }, 1000);

    showPattern(0);
  }

  // ── Render pattern + questions ─────────────────────────────────
  function showPattern(idx) {
    const { patterns, questions } = state.payload;
    if (idx >= patterns.length) { submitAll(); return; }

    const pat  = patterns[idx];
    const resp = state.responses[idx];
    if (!resp.started_at) resp.started_at = now();
    state.patternStart = Date.now();
    state.current      = idx;

    // Progress
    $('#prog-fill').style.width  = (idx / patterns.length * 100) + '%';
    $('#prog-label').textContent = `Pattern ${idx+1} of ${patterns.length}`;

    const area = $('#pattern-area');
    area.innerHTML = '';

    const card = el('div', { class:'pattern-card', style:'animation:fadeUp .3s ease both' });

    // Header
    const hdr = el('div', { class:'pattern-card-header' });
    hdr.innerHTML = `
      <div class="pattern-number">Pattern ${idx+1} of ${patterns.length}</div>
      <div class="pattern-title">${esc(getf(pat,'title') || 'Pattern '+(idx+1))}</div>
      <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
        ${getf(pat,'year')?`<span class="badge badge-muted">${esc(getf(pat,'year'))}</span>`:''}
        ${getf(pat,'Type')||getf(pat,'type')?`<span class="badge badge-violet">${esc(getf(pat,'Type')||getf(pat,'type'))}</span>`:''}
      </div>
      <div class="pattern-links">
        ${Object.keys(pat).filter(k => k.endsWith('_link') || k === 'ODPs links').map(k => {
          const v = pat[k]; if (!v) return '';
          const name = k === 'pdf_link' ? '📄 Paper'
                     : k === 'ODPs links' ? '🔗 ODP Wiki'
                     : '🔗 ' + k.replace(/_link$/, '').replace(/_/g, ' ');
          return `<a class="pattern-link" href="${esc(v)}" target="_blank" rel="noopener">${name}</a>`;
        }).join('')}
      </div>`;
    card.appendChild(hdr);

    // Body: content columns
    const body = el('div', { class:'pattern-card-body' });
    const skip = new Set(['title','Title','year','Year','pdf_link','ODPs links','_id','type','Type']);
    Object.keys(pat).filter(k => k.endsWith('_link')).forEach(k => skip.add(k));
    Object.keys(pat).filter(k => !skip.has(k) && !k.startsWith('_') && pat[k]).forEach(col => {
      const blk = el('div', { class:`field-block ${/scenario/i.test(col)?'scenario':/cq|competency/i.test(col)?'cqs':''}` });
      blk.innerHTML = `<div class="field-block-label">${esc(col)}</div><div class="field-block-content">${esc(pat[col])}</div>`;
      body.appendChild(blk);
    });

    // Evaluation questions
    const evalSec = el('div', { class:'eval-section' });
    evalSec.appendChild(html('h4',{},'✦ Your Evaluation'));
    questions.forEach((q,qi) => evalSec.appendChild(buildWidget(q,qi,idx,resp)));
    body.appendChild(evalSec);
    card.appendChild(body);

    // Nav bar
    const isLast = idx === patterns.length - 1;
    const nav = el('div', { class:'pattern-nav' });
    if (idx > 0) nav.appendChild(el('button', { class:'btn btn-secondary', onclick:()=>saveGo(idx-1) }, '← Previous'));
    else nav.appendChild(el('span'));
    nav.appendChild(el('div', { style:'display:flex;gap:8px;align-items:center' },
      el('span', { style:'font-family:var(--mono);font-size:.72rem;color:var(--text-muted)' }, `${idx+1}/${patterns.length}`),
      el('button', { class:`btn ${isLast?'btn-primary':'btn-cyan'}`, onclick:()=>saveGo(idx+1) },
        isLast ? '✓ Submit Survey' : 'Next Pattern →')
    ));
    card.appendChild(nav);

    area.appendChild(card);
    window.scrollTo({ top:0, behavior:'smooth' });
  }

  // ── Question widget ────────────────────────────────────────────
  function buildWidget(q, qi, patIdx, resp) {
    const wrap = el('div', { class:'question-item', 'data-qid':q.id });
    wrap.appendChild(html('div', { class:'question-label' },
      `<span class="q-num">Q${qi+1}</span> ${esc(q.label)}${q.required?' <span class="q-req">*</span>':''}`
    ));
    if (q.help) wrap.appendChild(html('p', { style:'font-size:.82rem;color:var(--text-muted);margin-bottom:12px' }, esc(q.help)));

    const name = `p${patIdx}_${q.id}`;
    const cur  = resp.answers[q.id];

    if (q.type === 'likert') {
      const scale = q.scale || 5;
      const grp   = el('div', { class:'likert-group' });
      for (let n = 1; n <= scale; n++) {
        const id  = `${name}_${n}`;
        const inp = el('input', { class:'likert-option', type:'radio', name, id, value:String(n) });
        if (String(cur) === String(n)) inp.checked = true;
        inp.addEventListener('change', () => { resp.answers[q.id] = n; });
        grp.appendChild(inp);
        grp.appendChild(html('label', { for:id }, `<span class="likert-num">${n}</span>`));
      }
      wrap.appendChild(grp);
      if (q.labels?.length >= 2)
        wrap.appendChild(el('div', { class:'likert-labels' }, el('span',{},q.labels[0]), el('span',{},q.labels[1])));
    } else if (q.type === 'boolean') {
      const grp = el('div', { class:'likert-group' });
      ['yes','no'].forEach(val => {
        const id  = `${name}_${val}`;
        const inp = el('input', { class:'likert-option', type:'radio', name, id, value:val });
        if (cur === val) inp.checked = true;
        inp.addEventListener('change', () => { resp.answers[q.id] = val; });
        grp.appendChild(inp);
        grp.appendChild(html('label', { for:id }, `<span class="likert-num">${val==='yes'?'✓':'✗'}</span><span>${val==='yes'?'Yes':'No'}</span>`));
      });
      wrap.appendChild(grp);
    } else if (q.type === 'select') {
      const sel = el('select', { class:'form-control', name });
      sel.appendChild(el('option', { value:'' }, '— Select —'));
      (q.options||[]).forEach(opt => { const o=el('option',{value:opt},opt); if(cur===opt)o.selected=true; sel.appendChild(o); });
      sel.addEventListener('change', () => { resp.answers[q.id] = sel.value; });
      wrap.appendChild(sel);
    } else if (q.type === 'textarea') {
      const ta = el('textarea', { class:'form-control', name, placeholder:q.placeholder||'', rows:'4' });
      if (cur) ta.value = cur;
      ta.addEventListener('input', () => { resp.answers[q.id] = ta.value; });
      wrap.appendChild(ta);
    } else {
      const inp = el('input', { type:'text', class:'form-control', name, placeholder:q.placeholder||'' });
      if (cur) inp.value = cur;
      inp.addEventListener('input', () => { resp.answers[q.id] = inp.value; });
      wrap.appendChild(inp);
    }

    wrap.appendChild(el('div', { class:'field-error hidden', id:`err-${name}` }, 'This field is required'));
    return wrap;
  }

  // ── Validate + navigate ────────────────────────────────────────
  function saveGo(next) {
    const idx  = state.current;
    const resp = state.responses[idx];
    const qs   = state.payload.questions;
    let ok = true;
    qs.forEach(q => {
      const errEl = document.getElementById(`err-p${idx}_${q.id}`);
      if (!errEl) return;
      const val     = resp.answers[q.id];
      const missing = q.required && (val===undefined || val===null || String(val).trim()==='');
      errEl.classList.toggle('hidden', !missing);
      if (missing) ok = false;
    });
    if (!ok) {
      toast('Please answer all required questions before continuing', 'error');
      document.querySelector('.field-error:not(.hidden)')?.scrollIntoView({ behavior:'smooth', block:'center' });
      return;
    }
    resp.completed_at = now();
    resp.duration_ms  = Date.now() - state.patternStart;
    if (next >= state.payload.patterns.length) submitAll();
    else showPattern(next);
  }

  // ── Submit to API ──────────────────────────────────────────────
  async function submitAll() {
    const sessionMs = Date.now() - state.startTime;
    const area      = $('#pattern-area');
    area.innerHTML  = `
      <div style="text-align:center;padding:60px 24px">
        <div class="spinner" style="margin:0 auto 16px"></div>
        <p style="font-family:var(--mono);color:var(--text-muted)">Saving your responses…</p>
      </div>`;

    try {
      await API.evaluate.submit({
        session_token:       state.payload.session_token,
        responses:           state.responses,
        session_duration_ms: sessionMs,
      });
      showDone(sessionMs);
    } catch(e) {
      if (e.message.includes('409')) {
        showDone(sessionMs, true);
      } else {
        area.innerHTML = `
          <div class="alert alert-error mb-16">${esc(e.message)}</div>
          <button class="btn btn-primary" onclick="location.reload()">Try Again</button>`;
      }
    }
  }

  function showDone(sessionMs, alreadyDone=false) {
    $('#prog-fill').style.width = '100%';
    $('#prog-label').textContent = 'All patterns completed ✓';
    const area = $('#pattern-area');
    area.innerHTML = `
      <div class="completion-screen">
        <div class="completion-icon">✦</div>
        <h2>Thank You!</h2>
        <p style="max-width:440px;margin:0 auto 32px">
          ${alreadyDone
            ? 'Your responses were already recorded.'
            : `Your evaluation of <strong>${state.payload.n_patterns} patterns</strong> has been saved. The survey coordinator can now see your results.`}
        </p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;max-width:340px;margin:0 auto 32px;text-align:left">
          <div class="stat-card amber"><div class="stat-value">${state.payload.n_patterns}</div><div class="stat-label">Patterns evaluated</div></div>
          <div class="stat-card cyan"><div class="stat-value">${formatDuration(sessionMs)}</div><div class="stat-label">Total time</div></div>
        </div>
        <div class="alert alert-success" style="max-width:420px;margin:0 auto">
          ✓ Responses saved — you can safely close this page.
        </div>
      </div>`;
  }

  function showError(msg) {
    $('#app').innerHTML = `
      <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px">
        <div style="text-align:center;max-width:440px">
          <div style="font-size:3rem;margin-bottom:16px;color:var(--red)">⚠</div>
          <h2 style="font-family:var(--serif);margin-bottom:12px">Survey Unavailable</h2>
          <p>${esc(msg)}</p>
        </div>
      </div>`;
  }

  function getf(obj,k) { if(obj[k]!=null)return obj[k]; const lk=k.toLowerCase(); for(const kk of Object.keys(obj)) if(kk.toLowerCase()===lk)return obj[kk]; return ''; }
  function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => Evaluate.init());
