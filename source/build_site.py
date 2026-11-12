#!/usr/bin/env python3
"""Build the standalone Fischer Family Tree site from family-tree.html + site_src/*.
Usage: build_site.py OUTDIR [--preview]"""
import re, sys, json, pathlib
SRC = pathlib.Path('/home/claude')
S = SRC / 'site_src'
out = pathlib.Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
preview = '--preview' in sys.argv
html = (SRC / 'family-tree.html').read_text()

def rep(old, new, count=1, regex=False):
    global html
    if regex:
        html, n = re.subn(old, lambda _m: new, html, count=count, flags=re.S)
    else:
        n = html.count(old)
        html = html.replace(old, new, count)
    assert n >= 1, f'patch not found: {old[:80]!r}'

# ---- head: fonts + new CSS
rep(r'<link rel="preconnect".*?</style>', '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
    '<link href="https://fonts.googleapis.com/css2?family=Alegreya:ital,wght@0,400;0,500;0,700;0,800;1,400&family=Alegreya+Sans:wght@400;500;700&display=swap" rel="stylesheet">\n'
    '<meta name="robots" content="noindex,nofollow">\n<style>\n' + (S/'style.css').read_text() + '</style>', regex=True)
rep(r'<title>.*?</title>', '<title>Fischer Family Tree</title>', regex=True)

# ---- hero + nav (moved out of .wrap)
vine = (S/'vine.svg').read_text()
rep(r'<div class="wrap">\s*<header>.*?</nav>', f'''<header class="hero">
  {vine}
  <div class="hero-in">
    <h1>Fischer Family Tree</h1>
    <div class="books">The Nölting and Ehlers families, from Hanover to Missouri, as recorded in the two family books</div>
    <div class="sub" id="sub">Loading…</div>
    <div class="home-pill" id="homePill"></div>
  </div>
</header>
<div class="navbar"><nav aria-label="Sections">
    <button data-tab="find" class="on">Find someone</button>
    <button data-tab="relate">How are they related?</button>
    <button data-tab="books">Browse the books</button>
    <button data-tab="obit">Obituaries</button>
    <button data-tab="backup">Changes</button>
    <button class="add" data-act="new">＋ Add person</button>
</nav></div>
<div class="wrap">
  <div id="banner" class="banner hidden"></div>
  <p class="scanwarn">Built from scans of the Nölting and Ehlers family books. Scanning can misread names and dates, especially in the oldest generations. Each person’s page links to the original book page, and anyone can use <b>Edit</b> to fix a mistake.</p>''', regex=True)

# ---- obituary tab: no AI on the page; the daily check reads them
rep(r'<h2 style="font-size:22px">Add people from an obituary</h2>.*?<div id="obitReview"></div>\s*</div>\s*<div class="card" style="margin-top:16px">\s*<h3>Obituaries from websites</h3>.*?</div>',
    '''<div id="obitReview"></div>
      <h2 style="font-size:26px">Approve an obituary yourself</h2>
      <p class="hint">Found one the daily check missed? Paste it here and tap <b>Find in tree</b>. Pick the right person, check the date, and approve it. New relatives it mentions (a new great-grandchild, say) are added the next morning, or you can add them now with <b>＋ Add person</b>.</p>
      <label class="field" style="margin-top:12px"><span>Name of the person who died <small style="font-weight:400;color:var(--muted)">(optional, if it isn’t at the start of the obituary)</small></span><input id="obitName" autocomplete="off"></label>
      <textarea id="obitText" class="code" style="min-height:180px;font:16px/1.5 var(--sans)" placeholder="Paste the obituary text here…"></textarea>
      <div id="quickBox"></div>
      <div class="obitbar"><span style="flex:1"></span><button class="btn primary" data-act="readobit">Find in tree</button></div>
      <div id="obitStatus" class="hint"></div>
    </div>''', regex=True)
rep('<h3>Obituaries already added</h3>', '<h3>Approved obituaries</h3>')
rep('Every addition or fix anyone in the family makes is listed here with who made it. Chris can undo any change.',
    'Every addition or fix anyone in the family makes is listed here with the name of who made it. Any change can be undone.')
rep('<div class="toast" id="toast"></div>', '<div class="modal hidden" id="who" style="z-index:80"></div>\n<div class="toast" id="toast"></div>\n<p class="meline" id="meline"></p>')
rep('<p class="meline" id="meline"></p>', '')
rep('</section>\n</div>\n\n<div class="modal hidden" id="modal">', '</section>\n  <p class="meline" id="meline"></p>\n</div>\n\n<div class="modal hidden" id="modal">')

# ---- JS: storage shim after helpers
rep("const yr = s => (String(s || '').match(/\\d{4}/) || [''])[0];",
    "const yr = s => (String(s || '').match(/\\d{4}/) || [''])[0];\n" + (S/'store.js').read_text())

# who() now gets a plain name
rep(r"S\.names=S\.names\|\|\{\}; let namesPending=null;\nfunction who\(id\)\{.*?return 'Someone'; \}\n",
    "function who(by){ return by || 'Someone'; }\n", regex=True)
# history names
rep(r"let names=\{\}; try\{ const u=S\.user;.*?catch\(_\)\{\}\n", "", regex=True)
rep("const who=names[x.by]||'Someone';", "const who=x.by||'Someone';")
rep("if(!S.db){ box.innerHTML='<div class=\"dym\">Sign in to Claude to see changes.</div>'; return; }", "if(!S.db) return;")
# ask who once before the first save
rep("async function guarded(fn){\n", "async function guarded(fn){\n  if(!(await ensureMe())) return false;\n")
rep("const body=clean({...p, updated:Date.now(), by:S.me||''});", "const body=clean({...p, updated:Date.now(), by:S.me||''});")

# readObit -> send the pasted obituary to the inbox for the overnight read
rep(r"async function readObit\(\)\{.*?\n\}\nfunction personLike", open('/home/claude/site_src/quickobit.js').read()+"\nfunction personLike", regex=True)
# Review uses the people the daily check already read out of the obituary
rep(r"if\(act==='review'\)\{.*?readObit\(\);\n", '''if(act==='review'){
    if(!it.data||!it.data.deceased){ toast('This one hasn’t been read yet. It will be ready by tomorrow morning.'); return; }
    S.inboxCurrent=id; OB={text:it.text||'', data:it.data, file:''}; buildObitRows(); renderObitReview();
    $('#obitReview').scrollIntoView({behavior:'smooth',block:'start'});
''', regex=True)
# inbox heading + approval wording
rep("checked daily from Kidwell-Garber, Fox, Scrivner-Page-Dady, Reser &amp; Davis-Miller, and Legacy.com", "Found every morning at 8:30 from Kidwell-Garber, Fox, Scrivner-Page-Dady, Reser &amp; Davis-Miller and Legacy.com. Anyone in the family can approve one.")
rep('data-iact="review">Review</button>', 'data-iact="review">Review &amp; approve</button>')
rep("'Approved and added to the tree':'Marked not family'} by <b>", "'<span class=\"approved\">Approved</span> and added to the tree':'Marked not family'} by <b>")
# nav badge
rep("if(tb) tb.textContent = n?`Add from obituary (${n})`:'Add from obituary';", "if(tb) tb.innerHTML = 'Obituaries'+(n?`<span class=\"badge\">${n}</span>`:'');")

# relationship thread: mark marriage steps
rep(r"function pathHTML\(path\)\{.*?\n\}\n", '''function pathHTML(path){
  if(!path || path.length<2) return '';
  let h='<ol class="path">', anyM=false;
  for(let i=1;i<path.length;i++){ const x=path[i-1], y=path[i]; const m=!parentsOf(x).includes(y)&&!childrenOf(x).includes(y); anyM=anyM||m;
    h+=`<li class="${m?'m':''}"><a href="#" data-go="${y}"><b>${esc(shortName(P(y)))}</b></a> <span class="how">is ${esc(poss(shortName(P(x))))} ${stepWord(x,y)}</span></li>`; }
  return h+'</ol>'+(anyM?'<div class="pathkey"><span><i></i>by birth</span><span><i class="m"></i>by marriage</span></div>':'');
}
''', regex=True)

# boot: load data through loadJSON (handles the family password) and use the site database
rep("const res=await fetch('people.json'); const arr=await res.json();", "await passwordGate(); const arr=await loadJSON('people.json');")
rep("fetch('gallery.json').then(r=>r.json()).then(", "loadJSON('gallery.json').then(")
rep(r"let db=null;\n  try\{ db = window\.claude.*?\n  S\.col=db\.collection\('edits'\); S\.db=db;\n  try\{ const u=await window\.claude\.use\('user'\);.*?\n",
    "const db=makeDB(CONFIG);\n  S.col=db.collection('edits'); S.db=db; S.isOwner=true; renderMeLine();\n"
    "  if(!db.remote){ const b=$('#banner'); b.innerHTML='<b>Preview.</b> This is a look at the new website. Changes you make here are only saved on this device.'; b.classList.remove('hidden'); }\n", regex=True)
rep("Couldn’t load your saved changes right now. Try reopening the page in a little while.", "Couldn’t reach the family’s saved changes right now. Check your internet connection and reopen the page.")

rep("$('#obitFile').addEventListener('change',e=>{ const f=e.target.files[0]; $('#obitFileName').textContent=f?f.name:''; });\n", "")
rep("${(o.people||[]).length} people · approved by", "${(o.people||[]).length===1?'1 person':(o.people||[]).length+' people'} · approved by")
rep("${p.notes?`<details class=\"notes\"", "${obitBlock(id)}\n    ${p.notes?`<details class=\"notes\"")
rep("function fullName(p){ if(!p) return 'Unknown'; return [p.first,p.middle,p.last].filter(Boolean)", "function fullName(p){ if(!p) return 'Unknown'; return [p.first,p.middle,p.last,p.suffix].filter(Boolean)")
rep("S.obits=snap.docs.map(d=>({...d.data(),id:d.id})).sort((a,b)=>b.added-a.added); if(S.tab==='obit') renderObitHistory();", "S.obits=snap.docs.map(d=>({...d.data(),id:d.id})).sort((a,b)=>b.added-a.added); if(S.tab==='obit') renderObitHistory(); if(S.selected) renderProfile();")
rep('<div class="pname">${esc(fullName(p))}</div>', '${portrait(id)}<div class="pname">${esc(fullName(p))}</div>')
rep("people:[...new Set(Object.values(idOf))], deceased:D||null, text:OB.text.slice(0,20000)}));", "people:[...new Set(Object.values(idOf))], deceased:D||null, photo:await savePhoto(((S.inbox||[]).find(i=>i.id===S.inboxCurrent)||{}).photo||''), text:OB.text.slice(0,20000)}));")
rep('const row=i=>`<div class="ibrow"><div><b>', 'const row=i=>`<div class="ibrow"><div>${i.photo?`<img class="ibthumb" src="${esc(i.photo)}" alt="">`:\'\'}<b>')
if not preview:
    rep('loading="lazy" src="${src}"', 'loading="lazy" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" data-esrc="${src}"')
# leftover claude.ai wording
html = html.replace('send Claude a list of names and how they’re related, and it can fill this in for you', 'ask Chris to add a list of names')
assert 'window.claude' not in html, 'claude.ai calls remain'

cfg = {'backend':'', 'encrypted':False, 'preview':True} if preview else json.loads((S/'site_config.json').read_text())
import base64
SAMPLE_PHOTO='data:image/svg+xml;base64,'+base64.b64encode(b'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 150"><rect width="120" height="150" fill="#DCE7DD"/><circle cx="60" cy="58" r="26" fill="#24533F"/><path d="M18 150c4-38 22-56 42-56s38 18 42 56z" fill="#24533F"/></svg>').decode()
sample = []
if preview:
    sample = [{"id":"sample1","name":"Example: Margaret Ann Sample","died":"10 Nov 2026","source":"Sample obituary for this preview only","found":1794500000000,"status":"new","photo":SAMPLE_PHOTO,
      "text":"Margaret Ann Sample, 88, of Stover passed away November 10, 2026. This is a made-up obituary so you can try approving one in the preview.",
      "data":{"deceased":{"first":"Margaret","middle":"Ann","last":"Sample","gender":"F","died":"10 Nov 2026","residence":"Stover"},"source":"Preview sample","summary":"A made-up obituary for trying out approvals.",
              "people":[{"ref":"p1","first":"Robert","last":"Sample","gender":"M","relation":"spouse","of":"deceased","deceased":True}]}}]
boot = f"<script>window.FT_CONFIG={json.dumps(cfg)};window.FT_SAMPLE_INBOX={json.dumps(sample)};</script>\n<script>"
html = html.replace('<script>\n/* ---------- state & helpers', boot + '\n/* ---------- state & helpers', 1)
(out/'index.html').write_text(html)
print('wrote', out/'index.html', len(html))
