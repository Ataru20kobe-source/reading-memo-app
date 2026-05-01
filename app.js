
const DRAFT_DIR    = '読書メモ/fromMyApp/drafts';
const OBSIDIAN_DIR = '読書メモ/fromMyApp';

let currentTab       = 'general';
let currentDraftFile = null;
let currentDraftSha  = null;
let novelRating      = 0;
let previewMd        = '';
let previewFile      = '';

const cfg = {
  get key()    { return localStorage.getItem('rm_key')    || '' },
  get token()  { return localStorage.getItem('rm_token')  || '' },
  get repo()   { return localStorage.getItem('rm_repo')   || '' },
  get branch() { return localStorage.getItem('rm_branch') || 'main' },
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
function closeSettingsOut(e) { if(e.target===document.getElementById('settingsOverlay')) closeSettings(); }
function saveSettings() {
  ['key','token','repo','branch'].forEach(k =>
    localStorage.setItem('rm_'+k, document.getElementById('cfg-'+k).value.trim() || (k==='branch'?'main':''))
  );
  const el = document.getElementById('settingsSt');
  el.textContent='保存しました'; el.className='settings-st ok';
  setTimeout(()=>{ el.textContent=''; el.className='settings-st'; }, 2000);
}

async function ghReq(method, path, body) {
  const res = await fetch(
    `https://api.github.com/repos/${cfg.repo}/contents/${encodeURIComponent(path)}${method==='GET'?'?ref='+cfg.branch:''}`,
    { method, headers:{ Authorization:`token ${cfg.token}`, Accept:'application/vnd.github.v3+json', 'Content-Type':'application/json' },
      ...(body ? {body:JSON.stringify(body)} : {}) }
  );
  const d = await res.json();
  if (!res.ok) throw new Error(d.message || `${method} ${path} failed`);
  return d;
}
async function ghGet(path) { return ghReq('GET',path); }
async function ghPut(path,content,sha,msg) {
  return ghReq('PUT', path, { message:msg, content:btoa(unescape(encodeURIComponent(content))), branch:cfg.branch, ...(sha?{sha}:{}) });
}
async function ghDel(path,sha,msg) { return ghReq('DELETE',path,{message:msg,sha,branch:cfg.branch}); }
async function assertDir(dir) {
  try { await ghGet(dir); }
  catch { throw new Error(`フォルダ「${dir}」がVaultに見つかりません。Obsidianで先に作成してください。`); }
}

async function loadLibrary() {
  if (!cfg.token || !cfg.repo) {
    document.getElementById('draftList').innerHTML = '<div class="list-error">⚙ 設定からGitHubトークンとリポジトリを入力してください</div>';
    document.getElementById('doneList').innerHTML  = '<div class="list-empty"></div>';
    document.getElementById('draftCount').textContent = '0';
    document.getElementById('doneCount').textContent  = '0';
    return;
  }
  document.getElementById('draftList').innerHTML = '<div class="list-loading">読み込み中...</div>';
  try {
    const files = (await ghGet(DRAFT_DIR)).filter(f=>f.name.endsWith('.json'));
    document.getElementById('draftCount').textContent = files.length;
    if (!files.length) {
      document.getElementById('draftList').innerHTML = '<div class="list-empty">下書きはありません</div>';
    } else {
      const items = await Promise.all(files.map(async f=>{
        try {
          const d = await ghGet(`${DRAFT_DIR}/${f.name}`);
          const data = JSON.parse(decodeURIComponent(escape(atob(d.content.replace(/\n/g,'')))));
          return {...data, _file:f.name, _sha:d.sha};
        } catch { return {_file:f.name, _sha:null, title:'（読込エラー）', mode:'general'}; }
      }));
      document.getElementById('draftList').innerHTML =
        '<div class="card-list">'+items.map(draftCard).join('')+'</div>';
    }
  } catch(e) {
    document.getElementById('draftList').innerHTML = `<div class="list-error">${e.message}</div>`;
  }

  document.getElementById('doneList').innerHTML = '<div class="list-loading">読み込み中...</div>';
  try {
    const files = (await ghGet(OBSIDIAN_DIR)).filter(f=>f.name.endsWith('.md'));
    document.getElementById('doneCount').textContent = files.length;
    if (!files.length) {
      document.getElementById('doneList').innerHTML = '<div class="list-empty">まだObsidianへの出力はありません</div>';
    } else {
      document.getElementById('doneList').innerHTML =
        '<div class="card-list">'+files.map(doneCard).join('')+'</div>';
    }
  } catch(e) {
    document.getElementById('doneList').innerHTML = `<div class="list-error">${e.message}</div>`;
  }
}

function draftCard(d) {
  const nv  = d.mode==='novel';
  const upd = d._updatedAt ? new Date(d._updatedAt).toLocaleDateString('ja-JP',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}) : '';
  const fn  = J(d._file);
  return `<div class="draft-card" onclick="openDraft(${fn})">
    <div class="card-bar ${nv?'novel':'general'}"></div>
    <div class="card-body">
      <div class="card-top">
        <div class="card-title">${x(d.title||'（タイトルなし）')}</div>
        <div class="card-badge ${nv?'novel':'general'}">${nv?'小説':'一般書'}</div>
      </div>
      <div class="card-meta">
        <span class="card-author">${x(d.author||'著者未記入')}</span>
        ${d.date?`<span>${d.date.slice(0,10)}</span>`:''}
        ${upd?`<span>更新 ${upd}</span>`:''}
      </div>
    </div>
    <div class="card-actions" onclick="event.stopPropagation()">
      <button class="card-btn edit" title="編集" onclick="openDraft(${fn})">✎</button>
      <button class="card-btn" title="削除" onclick="confirmDel(${fn},${J(d._sha||'')},${J(d.title||'このメモ')})">✕</button>
    </div>
  </div>`;
}

function doneCard(f) {
  const name = f.name.replace(/\.md$/,'');
  return `<div class="draft-card" onclick="openPreview(${J(f.name)},${J(name)})">
    <div class="card-bar done"></div>
    <div class="card-body">
      <div class="card-top">
        <div class="card-title">${x(name)}</div>
        <div class="card-badge done">出力済み</div>
      </div>
    </div>
    <div class="card-actions" onclick="event.stopPropagation()">
      <button class="card-btn view" title="プレビュー" onclick="openPreview(${J(f.name)},${J(name)})">👁</button>
      <button class="card-btn" title="削除" onclick="confirmDelDone(${J(f.name)},${J(f.sha)},${J(name)})">✕</button>
    </div>
  </div>`;
}

async function openPreview(filename, title) {
  try {
    const d = await ghGet(`${OBSIDIAN_DIR}/${filename}`);
    previewMd   = decodeURIComponent(escape(atob(d.content.replace(/\n/g,''))));
    previewFile = filename;
    document.getElementById('previewTitle').textContent   = title;
    document.getElementById('previewContent').textContent = previewMd;
    document.getElementById('previewOverlay').classList.add('open');
  } catch(e) { alert('読込エラー: '+e.message); }
}
function closePreview()     { document.getElementById('previewOverlay').classList.remove('open'); }
function closePreviewOut(e) { if(e.target===document.getElementById('previewOverlay')) closePreview(); }
function dlPreview()        { if(previewMd) dl(previewMd, previewFile); }

function showConfirm(title, sub, cb) {
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmSub').textContent   = sub;
  document.getElementById('confirmOk').onclick = ()=>{ closeConfirm(); cb(); };
  document.getElementById('confirmOverlay').classList.add('open');
}
function closeConfirm() { document.getElementById('confirmOverlay').classList.remove('open'); }

function confirmDel(file, sha, title) {
  showConfirm('下書きを削除', `「${title}」を削除します。元に戻せません。`, async()=>{
    try { await ghDel(`${DRAFT_DIR}/${file}`, sha, `🗑 下書き削除: ${title}`); loadLibrary(); }
    catch(e) { alert('削除エラー: '+e.message); }
  });
}
function confirmDelDone(file, sha, title) {
  showConfirm('出力済みメモを削除', `「${title}」をVaultから削除します。元に戻せません。`, async()=>{
    try { await ghDel(`${OBSIDIAN_DIR}/${file}`, sha, `🗑 メモ削除: ${title}`); loadLibrary(); }
    catch(e) { alert('削除エラー: '+e.message); }
  });
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById('screen-'+id).classList.add('active');
  window.scrollTo(0,0);
}
function goLibrary() { showScreen('library'); loadLibrary(); }

function newMemo() {
  currentDraftFile=null; currentDraftSha=null;
  clearEditor(); switchTab('general');
  const t = new Date().toISOString().slice(0,10);
  document.getElementById('readDate').value  = t;
  document.getElementById('novelDate').value = t;
  showScreen('editor');
}

async function openDraft(file) {
  try {
    const d    = await ghGet(`${DRAFT_DIR}/${file}`);
    const raw  = d.content.replace(/\s/g,'');
    const data = JSON.parse(decodeURIComponent(escape(atob(raw))));
    currentDraftFile = file;
    currentDraftSha  = d.sha;
    clearEditor();
    fillForm(data);
    showScreen('editor');
  } catch(e) { alert('読込エラー: '+e.message); }
}

function clearEditor() {
  ['bookTitle','bookAuthor','readDate','tags','hookWhy','hookWhere','imagination',
   'logicAuthor','logicSelf','logicWhy','concept','childExplain',
   'novelTitle','novelAuthor','novelDate','novelCategory','novelTags',
   'novelNarration','novelStructure','novelStyle','novelTechnique',
   'novelImpression','novelWhyMoved','novelTheme','novelFree'
  ].forEach(id=>{ const e=document.getElementById(id); if(e) e.value=''; });
  setRating(0);
  ['reviewG','reviewN'].forEach(id=>{ const e=document.getElementById(id); if(e) e.value=''; });
  ['reviewPanelG','reviewPanelN'].forEach(id=>{ const e=document.getElementById(id); if(e) e.classList.remove('visible'); });
  ['genStG','genStN','pfG','pfN'].forEach(id=>{ const e=document.getElementById(id); if(e){e.textContent='';e.className=e.className.split(' ')[0];} });
}

function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t=>{t.className='tab';});
  document.getElementById('panel-'+tab).classList.add('active');
  document.getElementById('tab-'+tab).classList.add(tab==='general'?'active-general':'active-novel');
  document.getElementById('editorBadge').textContent = tab==='general'?'一般書・学術・ビジネス':'小説';
}

function setRating(n) {
  novelRating = n;
  document.querySelectorAll('.star-btn').forEach((b,i)=>b.classList.toggle('lit',i<n));
}

function gatherForm(mode) {
  if (mode==='general') return {
    mode:'general',
    title:V('bookTitle'),  author:V('bookAuthor'),  date:V('readDate'),  tags:V('tags'),
    hookWhy:V('hookWhy'),  hookWhere:V('hookWhere'), imagination:V('imagination'),
    logicAuthor:V('logicAuthor'), logicSelf:V('logicSelf'), logicWhy:V('logicWhy'),
    concept:V('concept'),  childExplain:V('childExplain'),
  };
  return {
    mode:'novel',
    title:V('novelTitle'),    author:V('novelAuthor'),    date:V('novelDate'),
    category:V('novelCategory'), tags:V('novelTags'),    rating:novelRating,
    narration:V('novelNarration'), structure:V('novelStructure'),
    style:V('novelStyle'),    technique:V('novelTechnique'),
    impression:V('novelImpression'), whyMoved:V('novelWhyMoved'),
    theme:V('novelTheme'),    free:V('novelFree'),
  };
}

function fillForm(d) {
  switchTab(d.mode||'general');
  const set=(id,v)=>{ const e=document.getElementById(id); if(e) e.value=v||''; };
  if ((d.mode||'general')==='general') {
    set('bookTitle',d.title); set('bookAuthor',d.author); set('readDate',d.date); set('tags',d.tags);
    set('hookWhy',d.hookWhy); set('hookWhere',d.hookWhere); set('imagination',d.imagination);
    set('logicAuthor',d.logicAuthor); set('logicSelf',d.logicSelf); set('logicWhy',d.logicWhy);
    set('concept',d.concept); set('childExplain',d.childExplain);
  } else {
    set('novelTitle',d.title); set('novelAuthor',d.author); set('novelDate',d.date);
    set('novelCategory',d.category); set('novelTags',d.tags);
    set('novelNarration',d.narration); set('novelStructure',d.structure);
    set('novelStyle',d.style); set('novelTechnique',d.technique);
    set('novelImpression',d.impression); set('novelWhyMoved',d.whyMoved);
    set('novelTheme',d.theme); set('novelFree',d.free);
    setRating(d.rating||0);
  }
}

async function saveDraft() {
  if (!cfg.token||!cfg.repo) { alert('⚙ 設定を入力してください'); return; }
  const btn = document.getElementById('draftSaveBtn');
  btn.disabled = true;
  try {
    await assertDir(DRAFT_DIR);
    const data = gatherForm(currentTab);
    data._updatedAt = new Date().toISOString();
    const json = JSON.stringify(data,null,2);
    if (!currentDraftFile) {
      const safe = (data.title||'draft').replace(/[\\/:*?"<>|]/g,'').slice(0,40)||'draft';
      currentDraftFile = `${Date.now()}_${safe}.json`;
    }
    const path = `${DRAFT_DIR}/${currentDraftFile}`;
    try { const cur=await ghGet(path); currentDraftSha=cur.sha; } catch {}
    const res = await ghPut(path, json, currentDraftSha, `📝 下書き: ${data.title||'無題'}`);
    currentDraftSha = res.content?.sha||null;
    const ind = document.getElementById('saveInd');
    ind.classList.add('show');
    setTimeout(()=>ind.classList.remove('show'),2200);
  } catch(e) { alert('保存エラー: '+e.message); }
  finally { btn.disabled=false; }
}

function buildPrompt(mode) {
  if (mode==='general') {
    const m=gatherForm('general');
    return `あなたは読書の思想的読解を支援するアシスタントです。
以下の読書メモを受け取り、Obsidian用Markdownを生成してください。

**書籍タイトル**: ${m.title}
**著者**: ${m.author||'不明'}
**読んだ日**: ${m.date||'未記入'}

### フック
- なぜ手に取ったか: ${m.hookWhy||'（未記入）'}
- どこで心が動いたか: ${m.hookWhere||'（未記入）'}

### 妄想吐き出し
${m.imagination||'（未記入）'}

### ロジック
- 著者の主張: ${m.logicAuthor||'（未記入）'}
- 自分の読み: ${m.logicSelf||'（未記入）'}
- そう読んだ理由: ${m.logicWhy||'（未記入）'}

### コンセプト
${m.concept||'（未記入）'}

### 子供への説明
${m.childExplain||'（未記入）'}

---
完全なMarkdownのみ返してください。YAMLフロントマターから始め、コードブロックや説明文は不要です。

出力セクション:
1. YAMLフロントマター（title, author, date, tags配列, type: 読書メモ）
2. この本の思想的位置づけ（150字程度）
3. テーマと問い（箇条書き3〜5点）
4. メモの構造化（フック・妄想・ロジック・コンセプト・子供説明を見出し付きで再構成）
5. 深掘り問い（3〜5点）— SE経験・空手・内発性への関心があれば織り込む
6. 関連概念・参照先

思索的な個人ノートとして自然な日本語で。`;
  }
  const m=gatherForm('novel');
  const stars=m.rating>0?'★'.repeat(m.rating)+'☆'.repeat(5-m.rating):'未評価';
  return `あなたは小説読解と文章技法の分析を支援するアシスタントです。
読み手が書き手でもある視点を重視して、以下の小説メモをObsidian用Markdownに整理・深掘りしてください。

**作品タイトル**: ${m.title}
**著者**: ${m.author||'不明'}  **評価**: ${stars}
**カテゴリ**: ${m.category||'未記入'}  **読んだ日**: ${m.date||'未記入'}

### 構造（書き手として）
- 語り・視点: ${m.narration||'（未記入）'}
- 時間・構成: ${m.structure||'（未記入）'}
- 文体・リズム: ${m.style||'（未記入）'}
- 盗める技法: ${m.technique||'（未記入）'}

### 印象
- 場面: ${m.impression||'（未記入）'}
- なぜ動いたか: ${m.whyMoved||'（未記入）'}

### テーマと問い
${m.theme||'（未記入）'}

### 自由メモ
${m.free||'（未記入）'}

---
完全なMarkdownのみ返してください。YAMLフロントマターから始め、コードブロックや説明文は不要です。

出力セクション:
1. YAMLフロントマター（title, author, date, category, rating数値, tags配列, type: 小説メモ）
2. 作品の文学的位置づけ（120字程度）
3. 構造分析（書き手視点）— 盗める技法を具体展開
4. 印象の記録と読解
5. テーマと問い（3点）
6. 自由メモの整理
7. 次に読むべき作品・参照先

書き手の個人ノートとして自然な日本語で。`;
}

async function generate(mode) {
  const tid = mode==='general'?'bookTitle':'novelTitle';
  if (!V(tid)) { setGenSt(mode,'タイトルを入力してください','error'); return; }
  if (!cfg.key) { setGenSt(mode,'⚙ 設定でAnthropicAPIキーを入力してください','error'); return; }
  const s = mode==='general'?'G':'N';
  const gBtn=document.getElementById('genBtn'+s);
  const rBtn=document.getElementById('regen'+s);
  [gBtn,rBtn].forEach(b=>{ if(b) b.disabled=true; });
  setGenSt(mode,'Claudeが読んでいます...',(mode==='novel'?'loading nv':'loading'));
  document.getElementById('reviewPanel'+s).classList.remove('visible');
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{'Content-Type':'application/json','x-api-key':cfg.key,'anthropic-version':'2023-06-01'},
      body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:1500,messages:[{role:'user',content:buildPrompt(mode)}]})
    });
    const data=await res.json();
    if (!res.ok) throw new Error(data.error?.message||'API エラー');
    const md=data.content.map(b=>b.text||'').join('').trim();
    document.getElementById('review'+s).value=md;
    document.getElementById('reviewPanel'+s).classList.add('visible');
    setGenSt(mode,'生成完了 — プレビューを確認・編集してからObsidianへ','ok');
    setTimeout(()=>document.getElementById('reviewPanel'+s).scrollIntoView({behavior:'smooth',block:'start'}),100);
  } catch(e) {
    setGenSt(mode,'エラー: '+e.message,'error');
  } finally {
    [gBtn,rBtn].forEach(b=>{ if(b) b.disabled=false; });
  }
}

function setGenSt(mode,msg,cls) {
  const el=document.getElementById('genSt'+(mode==='general'?'G':'N'));
  el.textContent=msg; el.className='gen-status '+(cls||'');
}

async function pushObsidian(mode) {
  const s     = mode==='general'?'G':'N';
  const md    = document.getElementById('review'+s).value.trim();
  const title = V(mode==='general'?'bookTitle':'novelTitle')||'メモ';
  const date  = V(mode==='general'?'readDate':'novelDate')||new Date().toISOString().slice(0,10);
  if (!cfg.token||!cfg.repo) { setPf(mode,'⚙ 設定でGitHubトークンとリポジトリを入力してください','err'); return; }
  if (!md)                   { setPf(mode,'先にClaudeで生成してください','err'); return; }
  document.getElementById('push'+s).disabled=true;
  setPf(mode,'フォルダを確認中...','loading');
  try {
    await assertDir(OBSIDIAN_DIR);
    const safe   = title.replace(/[\\/:*?"<>|]/g,'').slice(0,60);
    const mdFile = `${date}_${safe}.md`;
    const mdPath = `${OBSIDIAN_DIR}/${mdFile}`;
    setPf(mode,'Obsidianに送信中...','loading');
    let sha; try { sha=(await ghGet(mdPath)).sha; } catch {}
    await ghPut(mdPath, md, sha, `📚 読書メモ: ${title} (${date})`);
    setPf(mode,`✓ 読書メモ/fromMyApp/${mdFile} に保存しました`,'ok');
    if (currentDraftFile) {
      try {
        const cur=await ghGet(`${DRAFT_DIR}/${currentDraftFile}`);
        await ghDel(`${DRAFT_DIR}/${currentDraftFile}`, cur.sha, `✅ 完了: ${title}`);
        currentDraftFile=null; currentDraftSha=null;
      } catch {}
    }
  } catch(e) {
    setPf(mode,'✗ '+e.message,'err');
  } finally {
    document.getElementById('push'+s).disabled=false;
  }
}

function setPf(mode,msg,cls) {
  const el=document.getElementById('pf'+(mode==='general'?'G':'N'));
  el.textContent=msg; el.className='push-feedback '+(cls||'');
}

function dlMd(mode) {
  const s  = mode==='general'?'G':'N';
  const md = document.getElementById('review'+s).value.trim();
  if (!md) return;
  const title = V(mode==='general'?'bookTitle':'novelTitle')||'メモ';
  const date  = V(mode==='general'?'readDate':'novelDate')||new Date().toISOString().slice(0,10);
  dl(md, `${date}_${title.replace(/[\\/:*?"<>|]/g,'')}.md`);
}
function dl(content, filename) {
  const a=Object.assign(document.createElement('a'),{
    href:URL.createObjectURL(new Blob([content],{type:'text/markdown;charset=utf-8'})),
    download:filename
  });
  a.click(); URL.revokeObjectURL(a.href);
}

const V = id => document.getElementById(id)?.value||'';
const x = s  => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const J = v  => JSON.stringify(v);

document.addEventListener('DOMContentLoaded',()=>{
  loadLibrary();
  const t=new Date().toISOString().slice(0,10);
  document.getElementById('readDate').value=t;
  document.getElementById('novelDate').value=t;
});

