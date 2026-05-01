// BooksMemo app.js
// ASCII-only. All Japanese text lives in index.html as data-* attributes on #i18n.
 
var DRAFT_DIR    = 'BooksMemo/fromMyApp/drafts';
var OBSIDIAN_DIR = 'BooksMemo/fromMyApp';
 
var currentTab       = 'general';
var currentDraftFile = null;
var currentDraftSha  = null;
var novelRating      = 0;
var previewMd        = '';
var previewFile      = '';
 
// Read all i18n strings from the #i18n meta element in HTML
var T = {};
function loadI18n() {
  var el = document.getElementById('i18n');
  if (!el) return;
  var attrs = el.attributes;
  for (var i = 0; i < attrs.length; i++) {
    var name = attrs[i].name;
    if (name.indexOf('data-') === 0) {
      var key = name.slice(5); // strip 'data-'
      T[key] = attrs[i].value;
    }
  }
}
 
function t(key) { return T[key] || key; }
 
// Apply i18n to static elements
function applyI18n() {
  setText('libTitle',            t('app-title'));
  setText('libSub',              t('app-sub'));
  setText('settingsOpenBtn',     t('settings'));
  setText('newMemoLabel',        t('new-memo'));
  setText('newMemoHint',         t('new-memo-hint'));
  setText('draftsLabel',         t('drafts'));
  setText('savedLabel',          t('saved'));
  setText('reloadBtn',           t('reload'));
  setText('backBtn',             t('back'));
  setText('draftSaveBtn',        t('save-draft'));
  setText('saveInd',             t('saved-ok'));
  setText('editorHeading',       t('app-title'));
  setText('genBtnG',             t('generate-general'));
  setText('genBtnN',             t('generate-novel'));
  setText('regenG',              t('regenerate'));
  setText('regenN',              t('regenerate'));
  setText('pushG',               t('push'));
  setText('pushN',               t('push'));
  setText('dlBtnG',              t('dl'));
  setText('dlBtnN',              t('dl'));
  setText('reviewLabelG',        t('preview-label'));
  setText('reviewLabelN',        t('preview-label'));
  setText('reviewHintG',         t('preview-hint'));
  setText('reviewHintN',         t('preview-hint'));
  setText('confirmCancelBtn',    t('confirm-cancel'));
  setText('confirmOk',           t('confirm-delete'));
  setText('previewDlBtn',        t('preview-dl'));
  setText('settingsTitle',       t('settings-title'));
  setText('settingsApiSection',  t('settings-api-section'));
  setText('settingsGhSection',   t('settings-gh-section'));
  setText('settingsKeyLabel',    t('settings-key-label'));
  setText('settingsKeyHint',     t('settings-key-hint') + ' console.anthropic.com');
  setText('settingsTokenLabel',  t('settings-token-label'));
  setText('settingsTokenHint',   t('settings-token-hint'));
  setText('settingsRepoLabel',   t('settings-repo-label'));
  setText('settingsBranchLabel', t('settings-branch-label'));
  setText('settingsFolderHint',  t('settings-folder-hint'));
  setText('settingsSaveBtn',     t('settings-save'));
  // tab labels
  setText('tab-general', t('general-tab'));
  setText('tab-novel',   t('novel-tab'));
  // initial badge
  setText('editorBadge', t('general-badge'));
}
 
function setText(id, text) {
  var el = document.getElementById(id);
  if (el) el.textContent = text;
}
 
// Config
var cfg = {
  get key()    { return localStorage.getItem('rm_key')    || ''; },
  get token()  { return localStorage.getItem('rm_token')  || ''; },
  get repo()   { return localStorage.getItem('rm_repo')   || ''; },
  get branch() { return localStorage.getItem('rm_branch') || 'main'; }
};
 
function openSettings() {
  document.getElementById('cfg-key').value    = cfg.key;
  document.getElementById('cfg-token').value  = cfg.token;
  document.getElementById('cfg-repo').value   = cfg.repo;
  document.getElementById('cfg-branch').value = cfg.branch;
  document.getElementById('settingsSt').textContent = '';
  document.getElementById('settingsOverlay').classList.add('open');
}
function closeSettings()     { document.getElementById('settingsOverlay').classList.remove('open'); }
function closeSettingsOut(e) { if (e.target === document.getElementById('settingsOverlay')) closeSettings(); }
function saveSettings() {
  ['key','token','repo','branch'].forEach(function(k) {
    var val = document.getElementById('cfg-' + k).value.trim();
    localStorage.setItem('rm_' + k, k === 'branch' && !val ? 'main' : val);
  });
  var el = document.getElementById('settingsSt');
  el.textContent = t('settings-saved');
  el.className = 'settings-st ok';
  setTimeout(function() { el.textContent = ''; el.className = 'settings-st'; }, 2000);
}
 
// GitHub API
function ghReq(method, path, body) {
  var url = 'https://api.github.com/repos/' + cfg.repo + '/contents/' + encodeURIComponent(path);
  if (method === 'GET') url += '?ref=' + cfg.branch;
  return fetch(url, {
    method: method,
    headers: {
      'Authorization': 'token ' + cfg.token,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  }).then(function(res) {
    return res.json().then(function(d) {
      if (!res.ok) throw new Error(d.message || method + ' ' + path + ' failed');
      return d;
    });
  });
}
function ghGet(path) { return ghReq('GET', path); }
function ghPut(path, content, sha, msg) {
  var body = { message: msg, content: btoa(unescape(encodeURIComponent(content))), branch: cfg.branch };
  if (sha) body.sha = sha;
  return ghReq('PUT', path, body);
}
function ghDel(path, sha, msg) {
  return ghReq('DELETE', path, { message: msg, sha: sha, branch: cfg.branch });
}
function assertDir(dir) {
  return ghGet(dir).catch(function() {
    throw new Error(t('folder-error') + ' (' + dir + ')');
  });
}
 
// Library
function loadLibrary() {
  if (!cfg.token || !cfg.repo) {
    document.getElementById('draftList').innerHTML = '<div class="list-error">' + t('no-settings') + '</div>';
    document.getElementById('doneList').innerHTML  = '<div class="list-empty"></div>';
    document.getElementById('draftCount').textContent = '0';
    document.getElementById('doneCount').textContent  = '0';
    return;
  }
 
  document.getElementById('draftList').innerHTML = '<div class="list-loading">' + t('loading') + '</div>';
  ghGet(DRAFT_DIR).then(function(files) {
    var jsonFiles = files.filter(function(f) { return f.name.indexOf('.json') !== -1; });
    document.getElementById('draftCount').textContent = jsonFiles.length;
    if (!jsonFiles.length) {
      document.getElementById('draftList').innerHTML = '<div class="list-empty">' + t('no-drafts') + '</div>';
      return;
    }
    return Promise.all(jsonFiles.map(function(f) {
      return ghGet(DRAFT_DIR + '/' + f.name).then(function(d) {
        var data = JSON.parse(decodeURIComponent(escape(atob(d.content.replace(/\s/g, '')))));
        data._file = f.name;
        data._sha  = d.sha;
        return data;
      }).catch(function() {
        return { _file: f.name, _sha: null, title: t('no-title-card'), mode: 'general' };
      });
    })).then(function(items) {
      document.getElementById('draftList').innerHTML =
        '<div class="card-list">' + items.map(draftCard).join('') + '</div>';
    });
  }).catch(function(e) {
    document.getElementById('draftList').innerHTML = '<div class="list-error">' + t('load-error') + e.message + '</div>';
  });
 
  document.getElementById('doneList').innerHTML = '<div class="list-loading">' + t('loading') + '</div>';
  ghGet(OBSIDIAN_DIR).then(function(files) {
    var mdFiles = files.filter(function(f) { return f.name.slice(-3) === '.md'; });
    document.getElementById('doneCount').textContent = mdFiles.length;
    if (!mdFiles.length) {
      document.getElementById('doneList').innerHTML = '<div class="list-empty">' + t('no-saved') + '</div>';
      return;
    }
    document.getElementById('doneList').innerHTML =
      '<div class="card-list">' + mdFiles.map(doneCard).join('') + '</div>';
  }).catch(function(e) {
    document.getElementById('doneList').innerHTML = '<div class="list-error">' + t('load-error') + e.message + '</div>';
  });
}
 
function draftCard(d) {
  var nv  = d.mode === 'novel';
  var upd = d._updatedAt
    ? new Date(d._updatedAt).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '';
  var fn    = "'" + d._file.replace(/'/g, "\\'") + "'";
  var sha   = "'" + (d._sha  || '').replace(/'/g, "\\'") + "'";
  var title = "'" + (d.title || '').replace(/'/g, "\\'") + "'";
  return '<div class="draft-card" onclick="openDraft(' + fn + ')">'
    + '<div class="card-bar ' + (nv ? 'novel' : 'general') + '"></div>'
    + '<div class="card-body">'
    + '<div class="card-top">'
    + '<div class="card-title">' + esc(d.title || t('no-title-card')) + '</div>'
    + '<div class="card-badge ' + (nv ? 'novel' : 'general') + '">' + (nv ? t('novel-label') : t('general-label')) + '</div>'
    + '</div>'
    + '<div class="card-meta">'
    + '<span class="card-author">' + esc(d.author || t('no-author')) + '</span>'
    + (d.date ? '<span>' + d.date.slice(0, 10) + '</span>' : '')
    + (upd ? '<span>' + t('updated') + upd + '</span>' : '')
    + '</div></div>'
    + '<div class="card-actions" onclick="event.stopPropagation()">'
    + '<button class="card-btn edit" onclick="openDraft(' + fn + ')">&#x270E;</button>'
    + '<button class="card-btn" onclick="confirmDel(' + fn + ',' + sha + ',' + title + ')">&#x2715;</button>'
    + '</div></div>';
}
 
function doneCard(f) {
  var name     = f.name.replace(/\.md$/, '');
  var fnStr    = "'" + f.name.replace(/'/g, "\\'") + "'";
  var nameStr  = "'" + name.replace(/'/g, "\\'") + "'";
  var shaStr   = "'" + (f.sha || '').replace(/'/g, "\\'") + "'";
  return '<div class="draft-card" onclick="openPreview(' + fnStr + ',' + nameStr + ')">'
    + '<div class="card-bar done"></div>'
    + '<div class="card-body">'
    + '<div class="card-top">'
    + '<div class="card-title">' + esc(name) + '</div>'
    + '<div class="card-badge done">' + t('saved-label') + '</div>'
    + '</div></div>'
    + '<div class="card-actions" onclick="event.stopPropagation()">'
    + '<button class="card-btn view" onclick="openPreview(' + fnStr + ',' + nameStr + ')">&#x1F441;</button>'
    + '<button class="card-btn" onclick="confirmDelDone(' + fnStr + ',' + shaStr + ',' + nameStr + ')">&#x2715;</button>'
    + '</div></div>';
}
 
// Preview
function openPreview(filename, title) {
  ghGet(OBSIDIAN_DIR + '/' + filename).then(function(d) {
    previewMd   = decodeURIComponent(escape(atob(d.content.replace(/\n/g, ''))));
    previewFile = filename;
    document.getElementById('previewTitle').textContent   = title;
    document.getElementById('previewContent').textContent = previewMd;
    document.getElementById('previewOverlay').classList.add('open');
  }).catch(function(e) { alert(t('load-error') + e.message); });
}
function closePreview()     { document.getElementById('previewOverlay').classList.remove('open'); }
function closePreviewOut(e) { if (e.target === document.getElementById('previewOverlay')) closePreview(); }
function dlPreview()        { if (previewMd) dl(previewMd, previewFile); }
 
// Confirm
function showConfirm(title, sub, cb) {
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmSub').textContent   = sub;
  document.getElementById('confirmOk').onclick = function() { closeConfirm(); cb(); };
  document.getElementById('confirmOverlay').classList.add('open');
}
function closeConfirm() { document.getElementById('confirmOverlay').classList.remove('open'); }
 
function confirmDel(file, sha, title) {
  showConfirm(
    t('confirm-draft-title'),
    '\u300c' + (title || t('no-title-card')) + '\u300d' + t('confirm-draft-sub'),
    function() {
      ghDel(DRAFT_DIR + '/' + file, sha, 'Delete draft: ' + title)
        .then(loadLibrary)
        .catch(function(e) { alert(t('delete-error') + e.message); });
    }
  );
}
function confirmDelDone(file, sha, title) {
  showConfirm(
    t('confirm-done-title'),
    '\u300c' + (title || '') + '\u300d' + t('confirm-done-sub'),
    function() {
      ghDel(OBSIDIAN_DIR + '/' + file, sha, 'Delete note: ' + title)
        .then(loadLibrary)
        .catch(function(e) { alert(t('delete-error') + e.message); });
    }
  );
}
 
// Navigation
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(function(s) { s.classList.remove('active'); });
  document.getElementById('screen-' + id).classList.add('active');
  window.scrollTo(0, 0);
}
function goLibrary() { showScreen('library'); loadLibrary(); }
 
function newMemo() {
  currentDraftFile = null;
  currentDraftSha  = null;
  clearEditor();
  switchTab('general');
  var today = new Date().toISOString().slice(0, 10);
  document.getElementById('readDate').value  = today;
  document.getElementById('novelDate').value = today;
  showScreen('editor');
}
 
function openDraft(file) {
  ghGet(DRAFT_DIR + '/' + file).then(function(d) {
    var data = JSON.parse(decodeURIComponent(escape(atob(d.content.replace(/\s/g, '')))));
    currentDraftFile = file;
    currentDraftSha  = d.sha;
    clearEditor();
    fillForm(data);
    showScreen('editor');
  }).catch(function(e) { alert(t('load-error') + e.message); });
}
 
// Editor
function clearEditor() {
  ['bookTitle','bookAuthor','readDate','tags','hookWhy','hookWhere','imagination',
   'logicAuthor','logicSelf','logicWhy','concept','childExplain',
   'novelTitle','novelAuthor','novelDate','novelCategory','novelTags',
   'novelNarration','novelStructure','novelStyle','novelTechnique',
   'novelImpression','novelWhyMoved','novelTheme','novelFree'
  ].forEach(function(id) { var e = document.getElementById(id); if (e) e.value = ''; });
  setRating(0);
  ['reviewG','reviewN'].forEach(function(id) { var e = document.getElementById(id); if (e) e.value = ''; });
  ['reviewPanelG','reviewPanelN'].forEach(function(id) {
    var e = document.getElementById(id); if (e) e.classList.remove('visible');
  });
  ['genStG','genStN','pfG','pfN'].forEach(function(id) {
    var e = document.getElementById(id);
    if (e) { e.textContent = ''; e.className = e.className.split(' ')[0]; }
  });
}
 
function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.panel').forEach(function(p) { p.classList.remove('active'); });
  document.querySelectorAll('.tab').forEach(function(tb) { tb.className = 'tab'; });
  document.getElementById('panel-' + tab).classList.add('active');
  document.getElementById('tab-' + tab).classList.add(tab === 'general' ? 'active-general' : 'active-novel');
  setText('editorBadge', tab === 'general' ? t('general-badge') : t('novel-badge'));
}
 
function setRating(n) {
  novelRating = n;
  document.querySelectorAll('.star-btn').forEach(function(b, i) { b.classList.toggle('lit', i < n); });
}
 
function gatherForm(mode) {
  if (mode === 'general') {
    return {
      mode: 'general',
      title: V('bookTitle'), author: V('bookAuthor'), date: V('readDate'), tags: V('tags'),
      hookWhy: V('hookWhy'), hookWhere: V('hookWhere'), imagination: V('imagination'),
      logicAuthor: V('logicAuthor'), logicSelf: V('logicSelf'), logicWhy: V('logicWhy'),
      concept: V('concept'), childExplain: V('childExplain')
    };
  }
  return {
    mode: 'novel',
    title: V('novelTitle'), author: V('novelAuthor'), date: V('novelDate'),
    category: V('novelCategory'), tags: V('novelTags'), rating: novelRating,
    narration: V('novelNarration'), structure: V('novelStructure'),
    style: V('novelStyle'), technique: V('novelTechnique'),
    impression: V('novelImpression'), whyMoved: V('novelWhyMoved'),
    theme: V('novelTheme'), free: V('novelFree')
  };
}
 
function fillForm(d) {
  switchTab(d.mode || 'general');
  function set(id, v) { var e = document.getElementById(id); if (e) e.value = v || ''; }
  if ((d.mode || 'general') === 'general') {
    set('bookTitle', d.title); set('bookAuthor', d.author); set('readDate', d.date); set('tags', d.tags);
    set('hookWhy', d.hookWhy); set('hookWhere', d.hookWhere); set('imagination', d.imagination);
    set('logicAuthor', d.logicAuthor); set('logicSelf', d.logicSelf); set('logicWhy', d.logicWhy);
    set('concept', d.concept); set('childExplain', d.childExplain);
  } else {
    set('novelTitle', d.title); set('novelAuthor', d.author); set('novelDate', d.date);
    set('novelCategory', d.category); set('novelTags', d.tags);
    set('novelNarration', d.narration); set('novelStructure', d.structure);
    set('novelStyle', d.style); set('novelTechnique', d.technique);
    set('novelImpression', d.impression); set('novelWhyMoved', d.whyMoved);
    set('novelTheme', d.theme); set('novelFree', d.free);
    setRating(d.rating || 0);
  }
}
 
// Draft save
function saveDraft() {
  if (!cfg.token || !cfg.repo) { alert(t('no-settings')); return; }
  var btn = document.getElementById('draftSaveBtn');
  btn.disabled = true;
  assertDir(DRAFT_DIR).then(function() {
    var data = gatherForm(currentTab);
    data._updatedAt = new Date().toISOString();
    var json = JSON.stringify(data, null, 2);
    if (!currentDraftFile) {
      var safe = (data.title || 'draft').replace(/[\\/:*?"<>|]/g, '').slice(0, 40) || 'draft';
      currentDraftFile = Date.now() + '_' + safe + '.json';
    }
    var path = DRAFT_DIR + '/' + currentDraftFile;
    return ghGet(path).then(function(cur) {
      currentDraftSha = cur.sha;
    }).catch(function() {}).then(function() {
      return ghPut(path, json, currentDraftSha, 'Draft: ' + (data.title || 'untitled'));
    }).then(function(res) {
      currentDraftSha = res.content && res.content.sha ? res.content.sha : null;
      var ind = document.getElementById('saveInd');
      ind.classList.add('show');
      setTimeout(function() { ind.classList.remove('show'); }, 2200);
    });
  }).catch(function(e) {
    alert(t('save-error') + e.message);
  }).then(function() {
    btn.disabled = false;
  });
}
 
// Claude prompts
function buildPrompt(mode) {
  if (mode === 'general') {
    var m = gatherForm('general');
    return 'You are an assistant supporting deep intellectual reading.\n'
      + 'Generate Obsidian-ready Markdown from the reading notes below.\n\n'
      + '**Title**: ' + m.title + '\n'
      + '**Author**: ' + (m.author || 'Unknown') + '\n'
      + '**Date read**: ' + (m.date || 'Not recorded') + '\n\n'
      + '### Hook\n'
      + '- Why picked up: ' + (m.hookWhy || '(blank)') + '\n'
      + '- Where heart moved: ' + (m.hookWhere || '(blank)') + '\n\n'
      + '### Free association\n' + (m.imagination || '(blank)') + '\n\n'
      + '### Logic\n'
      + '- Author argues: ' + (m.logicAuthor || '(blank)') + '\n'
      + '- I read it as same structure as: ' + (m.logicSelf || '(blank)') + '\n'
      + '- Because: ' + (m.logicWhy || '(blank)') + '\n\n'
      + '### Concept\n' + (m.concept || '(blank)') + '\n\n'
      + '### Child explanation\n' + (m.childExplain || '(blank)') + '\n\n'
      + '---\n'
      + 'Return complete Markdown ONLY. Start with YAML front matter. No code fences or extra text.\n\n'
      + 'Sections:\n'
      + '1. YAML front matter (title, author, date, tags array, type: \u8aad\u66f8\u30e1\u30e2)\n'
      + '2. Intellectual positioning (~150 chars in Japanese)\n'
      + '3. Themes and questions (3-5 bullets)\n'
      + '4. Structured notes (hook / free assoc / logic / concept / child explanation with headings)\n'
      + '5. Deeper questions (3-5) -- weave in SE experience, karate, intrinsic motivation if relevant\n'
      + '6. Related concepts and references\n\n'
      + 'Write in natural Japanese as a personal intellectual notebook.';
  }
  var m = gatherForm('novel');
  var stars = m.rating > 0
    ? '\u2605\u2605\u2605\u2605\u2605'.slice(0, m.rating) + '\u2606\u2606\u2606\u2606\u2606'.slice(0, 5 - m.rating)
    : 'Not rated';
  return 'You are an assistant supporting literary analysis and craft study.\n'
    + 'The reader is also a writer. Prioritise the craft perspective.\n\n'
    + '**Title**: ' + m.title + '\n'
    + '**Author**: ' + (m.author || 'Unknown') + '  **Rating**: ' + stars + '\n'
    + '**Category**: ' + (m.category || 'Not recorded') + '  **Date**: ' + (m.date || 'Not recorded') + '\n\n'
    + '### Structure (as a writer)\n'
    + '- Narration/POV: ' + (m.narration || '(blank)') + '\n'
    + '- Time/structure: ' + (m.structure || '(blank)') + '\n'
    + '- Prose rhythm: ' + (m.style || '(blank)') + '\n'
    + '- Techniques to steal: ' + (m.technique || '(blank)') + '\n\n'
    + '### What stayed with me\n'
    + '- Scene: ' + (m.impression || '(blank)') + '\n'
    + '- Why it moved me: ' + (m.whyMoved || '(blank)') + '\n\n'
    + '### Theme\n' + (m.theme || '(blank)') + '\n\n'
    + '### Other notes\n' + (m.free || '(blank)') + '\n\n'
    + '---\n'
    + 'Return complete Markdown ONLY. Start with YAML front matter. No code fences or extra text.\n\n'
    + 'Sections:\n'
    + '1. YAML front matter (title, author, date, category, rating as number, tags array, type: \u5c0f\u8aac\u30e1\u30e2)\n'
    + '2. Literary positioning (~120 chars in Japanese)\n'
    + '3. Craft analysis -- expand techniques to steal concretely\n'
    + '4. What stayed with me -- develop scene and why it moved\n'
    + '5. Theme and questions (3 points)\n'
    + '6. Other notes\n'
    + '7. What to read next / related works\n\n'
    + 'Write in natural Japanese as a personal writer\'s notebook.';
}
 
function generate(mode) {
  var tid = mode === 'general' ? 'bookTitle' : 'novelTitle';
  if (!V(tid)) { setGenSt(mode, t('no-title'), 'error'); return; }
  if (!cfg.key) { setGenSt(mode, t('no-api-key'), 'error'); return; }
  var s    = mode === 'general' ? 'G' : 'N';
  var gBtn = document.getElementById('genBtn' + s);
  var rBtn = document.getElementById('regen' + s);
  if (gBtn) gBtn.disabled = true;
  if (rBtn) rBtn.disabled = true;
  setGenSt(mode, t('claude-loading'), 'loading' + (mode === 'novel' ? ' nv' : ''));
  document.getElementById('reviewPanel' + s).classList.remove('visible');
 
  fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': cfg.key,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      messages: [{ role: 'user', content: buildPrompt(mode) }]
    })
  }).then(function(res) {
    return res.json().then(function(data) {
      if (!res.ok) throw new Error((data.error && data.error.message) || 'API error');
      return data;
    });
  }).then(function(data) {
    var md = data.content.map(function(b) { return b.text || ''; }).join('').trim();
    document.getElementById('review' + s).value = md;
    document.getElementById('reviewPanel' + s).classList.add('visible');
    setGenSt(mode, t('claude-done'), 'ok');
    setTimeout(function() {
      document.getElementById('reviewPanel' + s).scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }).catch(function(e) {
    setGenSt(mode, t('claude-error') + e.message, 'error');
  }).then(function() {
    if (gBtn) gBtn.disabled = false;
    if (rBtn) rBtn.disabled = false;
  });
}
 
function setGenSt(mode, msg, cls) {
  var el = document.getElementById('genSt' + (mode === 'general' ? 'G' : 'N'));
  el.textContent = msg;
  el.className = 'gen-status ' + (cls || '');
}
 
// Push to Obsidian
function pushObsidian(mode) {
  var s     = mode === 'general' ? 'G' : 'N';
  var md    = document.getElementById('review' + s).value.trim();
  var title = V(mode === 'general' ? 'bookTitle' : 'novelTitle') || 'memo';
  var date  = V(mode === 'general' ? 'readDate'  : 'novelDate')  || new Date().toISOString().slice(0, 10);
  if (!cfg.token || !cfg.repo) { setPf(mode, t('no-token'), 'err'); return; }
  if (!md)                     { setPf(mode, t('no-md'), 'err'); return; }
  document.getElementById('push' + s).disabled = true;
  setPf(mode, t('checking-folder'), 'loading');
 
  assertDir(OBSIDIAN_DIR).then(function() {
    var safe   = title.replace(/[\\/:*?"<>|]/g, '').slice(0, 60);
    var mdFile = date + '_' + safe + '.md';
    var mdPath = OBSIDIAN_DIR + '/' + mdFile;
    setPf(mode, t('sending'), 'loading');
    return ghGet(mdPath).then(function(d) { return d.sha; }).catch(function() { return null; })
      .then(function(sha) {
        return ghPut(mdPath, md, sha, 'Note: ' + title + ' (' + date + ')');
      }).then(function() {
        setPf(mode, t('push-ok'), 'ok');
        if (currentDraftFile) {
          return ghGet(DRAFT_DIR + '/' + currentDraftFile).then(function(cur) {
            return ghDel(DRAFT_DIR + '/' + currentDraftFile, cur.sha, 'Done: ' + title);
          }).then(function() {
            currentDraftFile = null;
            currentDraftSha  = null;
          }).catch(function() {});
        }
      });
  }).catch(function(e) {
    setPf(mode, t('push-error') + e.message, 'err');
  }).then(function() {
    document.getElementById('push' + s).disabled = false;
  });
}
 
function setPf(mode, msg, cls) {
  var el = document.getElementById('pf' + (mode === 'general' ? 'G' : 'N'));
  el.textContent = msg;
  el.className = 'push-feedback ' + (cls || '');
}
 
// Download
function dlMd(mode) {
  var s  = mode === 'general' ? 'G' : 'N';
  var md = document.getElementById('review' + s).value.trim();
  if (!md) return;
  var title = V(mode === 'general' ? 'bookTitle' : 'novelTitle') || 'memo';
  var date  = V(mode === 'general' ? 'readDate'  : 'novelDate')  || new Date().toISOString().slice(0, 10);
  dl(md, date + '_' + title.replace(/[\\/:*?"<>|]/g, '') + '.md');
}
function dl(content, filename) {
  var a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type: 'text/markdown;charset=utf-8' }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
 
// Utils
function V(id) { var e = document.getElementById(id); return e ? e.value : ''; }
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
 
// Init
document.addEventListener('DOMContentLoaded', function() {
  loadI18n();
  applyI18n();
  loadLibrary();
  var today = new Date().toISOString().slice(0, 10);
  document.getElementById('readDate').value  = today;
  document.getElementById('novelDate').value = today;
});
 
