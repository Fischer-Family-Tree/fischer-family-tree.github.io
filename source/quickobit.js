const MONTHS=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
const MON_RE='(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sept?(?:ember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\\.?';
function fmtDate(mon,day,year){ const m=MONTHS.indexOf(mon.slice(0,3).toLowerCase()); return `${+day} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m]} ${year}`; }
function parseObit(text, nameHint){
  const t=text.replace(/\s+/g,' ').trim();
  // name: the typed name, or the words before the first comma ("Margaret Ann (Koch) Schmidt, 88, of Stover…")
  let raw=(nameHint||'').trim();
  if(!raw){ const m=t.match(/^(?:Obituary[:\s-]*)?([A-Z][^,.;:]{3,60}?)(?:,| age | passed| died| of )/); raw=m?m[1]:t.split(/[,.]/)[0]; }
  const maiden=((raw.match(/\(([^)]+)\)/)||[])[1]||'').replace(/^n[ée]e\s+/i,'').trim();
  const nick=((raw.match(/[“"]([^”"]+)[”"]/)||[])[1]||'').trim();
  const words=raw.replace(/\([^)]*\)/g,' ').replace(/[“"][^”"]*[”"]/g,' ').replace(/\b(Mrs?|Ms|Dr|Jr|Sr|II|III)\.?\b/g,' ').trim().split(/\s+/).filter(Boolean);
  const first=words[0]||'', last=words.length>1?words[words.length-1]:'', middle=words.slice(1,-1).join(' ');
  // date of death: after "passed away / died / entered rest…", else the first full date in the text
  const death=new RegExp('(?:passed away|died|entered (?:into )?(?:eternal )?rest|went (?:home )?to be with[^,.]{0,30}|departed this life)[^.]{0,40}?'+MON_RE+'\\s+(\\d{1,2}),?\\s+(\\d{4})','i');
  const any=new RegExp(MON_RE+'\\s+(\\d{1,2}),?\\s+(\\d{4})','g');
  let died='', m=t.match(death);
  if(m) died=fmtDate(m[1],m[2],m[3]);
  else { const all=[...t.matchAll(any)].filter(x=>+x[3]>=1990); if(all.length){ const x=all.sort((a,b)=>+b[3]-+a[3])[0]; died=fmtDate(x[1],x[2],x[3]); } }
  const age=(t.match(/,\s*(\d{1,3}),/)||t.match(/\bage(?:d)?\s+(\d{1,3})\b/i)||[])[1];
  let born='', bm=t.match(new RegExp('(?:was )?born[^.]{0,40}?'+MON_RE+'\\s+(\\d{1,2}),?\\s+(\\d{4})','i'));
  if(bm) born=fmtDate(bm[1],bm[2],bm[3]); else if(age && died) born=String(+yr(died)-+age);
  return {first, middle, last, maiden, nickname:nick, died, born, age};
}
let QB=null;
async function readObit(){
  const text=$('#obitText').value.trim(), hint=$('#obitName').value.trim();
  if(text.length<40){ toast('Paste the obituary text first.'); return; }
  const x=parseObit(text, hint);
  const cands=findCands(x).map(c=>c[1]);
  // also try a looser search on the name as typed
  for(const p of search([x.first,x.last].filter(Boolean).join(' ')).list.slice(0,6)) if(!cands.includes(p.id) && cands.length<6) cands.push(p.id);
  const strong=id=>{ const p=P(id); const mm=norm(x.middle).split(' ')[0], pm=norm(p.middle||'').split(' ')[0];
    if(mm&&pm&&mm[0]!==pm[0]) return false; const by=yr(x.born), pb=yr(p.born); if(by&&pb&&Math.abs(+by-+pb)>1) return false; return norm(p.last)===norm(x.last)||marriedNames(p).map(norm).includes(norm(x.last)); };
  QB={x, text, cands, pick:cands.length?(strong(cands[0])?cands[0]:null):'new'};
  renderQuick();
  $('#quickBox').scrollIntoView({behavior:'smooth', block:'start'});
}
function renderQuick(){
  const box=$('#quickBox'); if(!QB){ box.innerHTML=''; return; }
  const {x,cands}=QB, nm=[x.first,x.middle,x.last].filter(Boolean).join(' ')+(x.maiden?` (née ${x.maiden})`:'');
  const opt=(id)=>{ const p=P(id), lt=life(p), par=parentsOf(id).map(i=>shortName(P(i))).join(' & '), sp=spousesOf(id).map(i=>shortName(P(i))).join(', ');
    return `<label class="qopt"><input type="radio" name="qpick" value="${id}" ${QB.pick===id?'checked':''}>
      <span><b>${esc(fullName(p))}</b> ${lt?`<small>${esc(lt)}</small>`:''}<br><small>${par?'Child of '+esc(par):''}${par&&sp?' · ':''}${sp?'Married to '+esc(sp):''}</small>
      ${p.died?`<br><small class="warn">Already marked as died ${esc(p.died)}</small>`:''}</span></label>`; };
  box.innerHTML=`<div class="quick">
    <h3>Who is this obituary for?</h3>
    <p class="hint" style="margin-top:2px">The obituary looks like it’s for <b>${esc(nm||'(name not found)')}</b>${x.age?`, age ${esc(x.age)}`:''}. Pick the matching person in the tree.</p>
    ${cands.length?cands.map(opt).join(''):'<p class="hint">No one in the tree matches that name.</p>'}
    <label class="qopt"><input type="radio" name="qpick" value="new" ${QB.pick==='new'?'checked':''}><span><b>Not in the tree yet</b><br><small>Add ${esc(nm||'them')} as a new person</small></span></label>
    <div class="two" style="margin-top:12px">
      <label class="field"><span>Date of death</span><input id="qDied" value="${esc(x.died)}" placeholder="e.g. 10 Nov 2026"></label>
      <label class="field"><span>Where the obituary came from</span><input id="qSrc" placeholder="e.g. Fox Funeral Home"></label>
    </div>
    <div class="qphoto">${QB.photo?`<img src="${esc(QB.photo)}" alt="Obituary photo">`:''}
      <label class="btn"><input type="file" accept="image/*" id="qPhoto" hidden>${QB.photo?'Change photo':'📷 Add the obituary photo'}</label>
      ${QB.photo?'<button class="btn" data-act="qnophoto">Remove photo</button>':''}</div>
    <div class="foot"><button class="btn" data-act="qcancel">Cancel</button><button class="btn gold" data-act="qapprove">Approve</button></div>
  </div>`;
}
document.addEventListener('change',async e=>{ if(e.target.name==='qpick' && QB) QB.pick=e.target.value;
  if(e.target.id==='qPhoto' && QB && e.target.files[0]){ const keep={died:$('#qDied').value, src:$('#qSrc').value}; QB.photo=await shrinkPhoto(e.target.files[0]); renderQuick(); $('#qDied').value=keep.died; $('#qSrc').value=keep.src; } });
document.addEventListener('click',e=>{ if(e.target.closest('[data-act="qnophoto"]')&&QB){ QB.photo=''; renderQuick(); } });
// Make a phone photo small enough to store (about 600px wide).
function shrinkPhoto(file){ return new Promise((res,rej)=>{ const img=new Image(), url=URL.createObjectURL(file);
  img.onload=()=>{ const max=640, sc=Math.min(1,max/Math.max(img.width,img.height)), c=document.createElement('canvas'); c.width=Math.round(img.width*sc); c.height=Math.round(img.height*sc);
    c.getContext('2d').drawImage(img,0,0,c.width,c.height); URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg',0.82)); };
  img.onerror=()=>{ toast('That file isn’t a picture this page can read.'); rej(); }; img.src=url; }); }
// On the live site the photo is saved to the family’s Google Drive; in the preview it stays in the record.
async function savePhoto(data){ if(!data) return ''; if(S.db && S.db.uploadPhoto) return S.db.uploadPhoto(data); return data; }
document.addEventListener('click',async e=>{ const b=e.target.closest('[data-act="qcancel"],[data-act="qapprove"]'); if(!b||!QB) return;
  if(b.dataset.act==='qcancel'){ QB=null; renderQuick(); return; }
  const died=$('#qDied').value.trim(), src=$('#qSrc').value.trim(), {x,text}=QB, photoData=QB.photo||'';
  if(!QB.pick){ toast('Pick the person this obituary is for, or “Not in the tree yet”.'); return; }
  if(!died){ toast('Add the date of death first.'); $('#qDied').focus(); return; }
  let id=QB.pick, name='';
  const ok=await guarded(async()=>{
    if(id==='new'){ id=newId(); await putPerson({id, first:x.first, middle:x.middle, last:x.last, maiden:x.maiden, nickname:x.nickname, born:x.born&&x.born.length>4?x.born:'', died, gender:'', parents:[], spouses:[], notes:''}); }
    else { const p=P(id); const keep={...(S.edits.get(id)||S.base.get(id)||{})}; await putPerson({...keep, id, died}); }
    name=fullName(P(id)); const photo=await savePhoto(photoData);
    await S.db.collection('obits').doc(newId()).set(clean({name, died, source:src||('Sent in by '+S.me), added:Date.now(), by:S.me||'', people:[id], deceased:id, photo, text:text.slice(0,20000)}));
    await S.db.collection('inbox').doc(newId()).set(clean({name, died, text:text.slice(0,20000), source:src||('Sent in by '+S.me), found:Date.now(), status:'added', reviewed:Date.now(), by:S.me||'', people:[id], deceased:id, needsRelatives:true}));
  });
  if(ok){ QB=null; renderQuick(); $('#obitText').value=''; $('#obitName').value=''; toast(`Approved: ${name}`); renderObitHistory(); renderInbox(); select(id); }
});function obitBlock(id){
  const list=(S.obits||[]).filter(o=>o.deceased===id);
  if(!list.length) return '';
  return list.map(o=>`<details class="obitcard" open><summary>Obituary${o.died?` · died ${esc(o.died)}`:''}</summary>
    <div class="obitmeta">${o.source?esc(o.source)+' · ':''}Approved by <b>${esc(who(o.by))}</b> on ${new Date(o.added).toLocaleDateString()}</div>
    <div class="obitbody">${o.photo?`<img class="obitphoto" src="${esc(o.photo)}" alt="${esc(o.name||'')}">`:''}${o.text?`<div class="obittext">${esc(o.text)}</div>`:''}</div></details>`).join('');
}

function portrait(id){ const o=(S.obits||[]).find(o=>o.deceased===id && o.photo); return o?`<img class="portrait" src="${esc(o.photo)}" alt="${esc(fullName(P(id)))}">`:''; }
