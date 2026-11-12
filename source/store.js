/* ---------- site config & storage (no Claude account needed) ---------- */
const CONFIG = window.FT_CONFIG || { backend:'', encrypted:false, preview:true };
const enc = new TextEncoder();
function b64(buf){ return btoa(String.fromCharCode(...new Uint8Array(buf))); }
async function sha256hex(s){ const h=await crypto.subtle.digest('SHA-256', enc.encode(s)); return [...new Uint8Array(h)].map(b=>b.toString(16).padStart(2,'0')).join(''); }
let FAMKEY=null, AESKEY=null;
function getPass(){ try{ return localStorage.getItem('ft-pass')||''; }catch(_){ return ''; } }
const normPass=p=>String(p||'').toLowerCase().replace(/[^a-z0-9]/g,'');
async function deriveAES(pass){
  pass=normPass(pass);
  if(AESKEY && AESKEY.pass===pass) return AESKEY.key;
  const salt=Uint8Array.from(atob(CONFIG.salt||''),c=>c.charCodeAt(0));
  const base=await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
  const key=await crypto.subtle.deriveKey({name:'PBKDF2', salt, iterations:600000, hash:'SHA-256'}, base, {name:'AES-GCM', length:256}, false, ['decrypt']);
  AESKEY={pass,key}; return key;
}
async function decryptRaw(buf, pass){ const u=new Uint8Array(buf); const key=await deriveAES(pass||getPass()); return crypto.subtle.decrypt({name:'AES-GCM', iv:u.slice(0,12)}, key, u.slice(12)); }
async function decryptBuf(buf, pass){ return JSON.parse(new TextDecoder().decode(await decryptRaw(buf, pass))); }
async function loadJSON(name){
  if(!CONFIG.encrypted){ const r=await fetch(name); return r.json(); }
  const r=await fetch(name+'.enc'); return decryptBuf(await r.arrayBuffer());
}
// Book page scans are locked too: each one is unlocked when it scrolls into view.
const IMGCACHE=new Map();
async function unlockImg(el){ const s=el.dataset.esrc; el.removeAttribute('data-esrc'); try{ let u=IMGCACHE.get(s);
  if(!u){ const r=await fetch(s+'.enc'); u=URL.createObjectURL(new Blob([await decryptRaw(await r.arrayBuffer())],{type:'image/jpeg'})); IMGCACHE.set(s,u); } el.src=u; }catch(_){} }
if(CONFIG.encrypted){
  const io=new IntersectionObserver(es=>es.forEach(e=>{ if(e.isIntersecting){ io.unobserve(e.target); unlockImg(e.target); } }),{rootMargin:'400px'});
  new MutationObserver(()=>document.querySelectorAll('img[data-esrc]:not([data-obs])').forEach(i=>{ i.dataset.obs='1'; io.observe(i); })).observe(document.documentElement,{childList:true,subtree:true});
}
// Family password: asked once per device, then remembered.
async function passwordGate(){
  if(!CONFIG.encrypted) return;
  const probe=await (await fetch('check.enc')).arrayBuffer();
  const tryPass=async p=>{ try{ await decryptRaw(probe.slice(0), p); return true; }catch(_){ return false; } };
  let p=getPass(); if(p && await tryPass(p)){ FAMKEY=await sha256hex('fischer:'+normPass(p)); return; }
  document.body.insertAdjacentHTML('afterbegin', `<div class="gate" id="gate"><form class="gatebox" id="gateForm"><h1>Fischer Family Tree</h1><p>Enter the family password. You only need to do this once on each phone or computer.</p><input id="gatePass" type="password" autocomplete="current-password" placeholder="Family password" required><button class="btn primary" style="width:100%;padding:11px">Open the tree</button><p id="gateMsg" style="color:var(--wine);min-height:1.5em"></p></form></div>`);
  document.querySelector('.hero').classList.add('hidden'); document.querySelector('.navbar').classList.add('hidden'); document.querySelector('.wrap').classList.add('hidden');
  await new Promise(res=>{ $('#gateForm').addEventListener('submit', async e=>{ e.preventDefault(); const v=$('#gatePass').value; $('#gateMsg').textContent='Checking…';
    if(await tryPass(v)){ try{ localStorage.setItem('ft-pass', v); }catch(_){} FAMKEY=await sha256hex('fischer:'+normPass(v)); res(); }
    else $('#gateMsg').textContent='That password isn’t right. Ask Chris for the family password.'; }); });
  $('#gate').remove(); document.querySelector('.hero').classList.remove('hidden'); document.querySelector('.navbar').classList.remove('hidden'); document.querySelector('.wrap').classList.remove('hidden');
}

// A small database that works the same in the preview (saved on this device) and on the
// live site (saved to the family's Google Sheet through a web-app address).
function makeDB(cfg){
  const COLS=['edits','inbox','obits','history'];
  const data=Object.fromEntries(COLS.map(c=>[c,{}]));
  const subs=Object.fromEntries(COLS.map(c=>[c,[]]));
  const remote=!!cfg.backend;
  const LS='ft-preview-db';
  if(!remote){ try{ const s=JSON.parse(localStorage.getItem(LS)||'null'); if(s) for(const c of COLS) data[c]=s[c]||{}; }catch(_){}
    if(!Object.keys(data.inbox).length && window.FT_SAMPLE_INBOX) for(const it of window.FT_SAMPLE_INBOX) data.inbox[it.id]=it; }
  const persist=()=>{ if(!remote) try{ localStorage.setItem(LS, JSON.stringify(data)); }catch(_){} };
  const snap=(c,order)=>{ let e=Object.entries(data[c]); if(order) e.sort((a,b)=>(order.dir==='desc'?-1:1)*((a[1][order.f]||0)-(b[1][order.f]||0)));
    if(order&&order.n) e=e.slice(0,order.n); return {docs:e.map(([id,v])=>({id, data:()=>v})), metadata:{fromCache:false}}; };
  const emit=c=>{ for(const s of subs[c]) try{ s.cb(snap(c,s.order)); }catch(_){} };
  async function send(c,id,op,body){
    if(!remote){ persist(); return; }
    const r=await fetch(cfg.backend, {method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body:JSON.stringify({k:FAMKEY, col:c, id, op, data:body})});
    const j=await r.json().catch(()=>({})); if(!r.ok||!j.ok){ const e=new Error(j.error||'save failed'); throw e; }
  }
  async function pull(){
    const r=await fetch(cfg.backend+'?k='+encodeURIComponent(FAMKEY||'')); const j=await r.json();
    if(!j.ok) throw new Error(j.error||'load failed');
    for(const c of COLS){ const before=JSON.stringify(data[c]); data[c]=j[c]||{}; if(JSON.stringify(data[c])!==before) emit(c); }
  }
  const docRef=(c,id)=>({
    async set(o){ const prev=data[c][id]; data[c][id]=JSON.parse(JSON.stringify(o)); emit(c); try{ await send(c,id,'set',data[c][id]); }catch(e){ if(prev===undefined) delete data[c][id]; else data[c][id]=prev; emit(c); throw e; } },
    async update(o){ const prev=data[c][id]; data[c][id]={...(prev||{}), ...JSON.parse(JSON.stringify(o))}; emit(c); try{ await send(c,id,'update',o); }catch(e){ if(prev===undefined) delete data[c][id]; else data[c][id]=prev; emit(c); throw e; } },
    async delete(){ const prev=data[c][id]; delete data[c][id]; emit(c); try{ await send(c,id,'delete',null); }catch(e){ if(prev!==undefined) data[c][id]=prev; emit(c); throw e; } },
  });
  const colRef=(c,order)=>({
    doc:id=>docRef(c,id),
    orderBy:(f,dir)=>colRef(c,{...(order||{}),f,dir}),
    limit:n=>colRef(c,{...(order||{}),n}),
    onSnapshot(cb,err){ const s={cb,order}; subs[c].push(s); if(!remote||loaded) cb(snap(c,order)); else waiting.push(()=>cb(snap(c,order))); if(err) errs.push(err); return ()=>{ subs[c]=subs[c].filter(x=>x!==s); }; },
  });
  let loaded=false; const waiting=[], errs=[];
  if(remote){
    const first=()=>pull().then(()=>{ if(!loaded){ loaded=true; waiting.splice(0).forEach(f=>f()); } }).catch(e=>{ if(!loaded) errs.forEach(f=>f(e)); });
    first(); setInterval(()=>{ if(document.visibilityState==='visible') pull().catch(()=>{}); }, 45000);
    document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='visible') pull().catch(()=>{}); });
  }
  async function uploadPhoto(dataUrl){ if(!remote) return dataUrl;
    const r=await fetch(cfg.backend,{method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body:JSON.stringify({k:FAMKEY, op:'photo', data:dataUrl})});
    const j=await r.json().catch(()=>({})); if(!j.ok) throw new Error(j.error||'photo failed'); return j.url; }
  return { collection:c=>colRef(c), doc:path=>{ const [c,id]=path.split('/'); return docRef(c,id); }, remote, uploadPhoto };
}

/* ---------- who's approving (asked once per device, only when someone first approves or edits) ---------- */
try{ const m=JSON.parse(localStorage.getItem('ft-me')||'null'); if(m&&m.name){ S.me=m.name; S.meId=m.id||''; } }catch(_){}
function setMe(name,id){ S.me=name; S.meId=id||''; try{ localStorage.setItem('ft-me', JSON.stringify({name, id:id||''})); }catch(_){} renderMeLine(); }
function renderMeLine(){ const el=$('#meline'); if(!el) return; el.innerHTML = S.me ? `Approvals and changes from this device are signed <b>${esc(S.me)}</b>. <button class="linkbtn" data-me="change">Not you?</button>` : ''; }
function ensureMe(){
  if(S.me) return Promise.resolve(true);
  return new Promise(res=>{
    const m=$('#who');
    m.innerHTML=`<div class="sheet whosheet" role="dialog" aria-labelledby="whoH"><h2 id="whoH">Who’s approving?</h2>
      <p>Pick yourself once. Your name is then added automatically to everything you approve or change from this phone or computer.</p>
      <label class="field"><span>Find yourself in the tree</span><div class="pick"><input id="whoIn" placeholder="Start typing your name…" autocomplete="off"></div></label>
      <div class="whoalt"><label class="field" style="margin:0"><span>Not in the tree yet? Type your name instead</span><input id="whoTxt" placeholder="First and last name" autocomplete="name"></label></div>
      <div class="foot"><button class="btn" data-who="cancel">Cancel</button><button class="btn primary" data-who="ok">Continue</button></div></div>`;
    m.classList.remove('hidden');
    let picked=null;
    makePicker($('#whoIn'),{onPick:id=>{ picked=id; setRel($('#whoIn'),id); }});
    setTimeout(()=>$('#whoIn').focus(),30);
    const done=ok=>{ m.classList.add('hidden'); m.innerHTML=''; m.onclick=null; res(ok); };
    m.onclick=e=>{ const b=e.target.closest('[data-who]'); if(!b) return;
      if(b.dataset.who==='cancel') return done(false);
      const typed=$('#whoTxt').value.trim(), pid=picked||$('#whoIn').dataset.id;
      if(pid&&P(pid)){ setMe(fullName(P(pid)), pid); return done(true); }
      if(typed.length>1){ setMe(typed,''); return done(true); }
      toast('Pick your name, or type it in the box below.'); };
  });
}
document.addEventListener('click',e=>{ const b=e.target.closest('[data-me]'); if(!b) return; S.me=null; S.meId=''; try{ localStorage.removeItem('ft-me'); }catch(_){} renderMeLine(); ensureMe(); });
