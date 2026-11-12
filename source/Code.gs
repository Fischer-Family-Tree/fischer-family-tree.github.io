/**
 * Fischer Family Tree – shared storage for the family website.
 * Lives in the family's Google Sheet (Extensions > Apps Script).
 * Every saved change is one row: collection | id | JSON | updated.
 * Only pages that know the family password (sent as a hashed key) can read or write.
 */
const SHEET = 'data';
const PHOTO_FOLDER = 'Fischer Family Tree – obituary photos';
const COLS = ['edits', 'inbox', 'obits', 'history'];

function famKey_() { return PropertiesService.getScriptProperties().getProperty('FAMKEY'); }
function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET);
  if (!sh) { sh = ss.insertSheet(SHEET); sh.appendRow(['collection', 'id', 'json', 'updated']); sh.setFrozenRows(1); }
  return sh;
}

function doGet(e) {
  if (!e.parameter.k || e.parameter.k !== famKey_()) return out_({ ok: false, error: 'bad key' });
  const res = { ok: true }; COLS.forEach(c => res[c] = {});
  const rows = sheet_().getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    const [c, id, json] = rows[i];
    if (!res[c] || !id) continue;
    try { res[c][id] = JSON.parse(json); } catch (err) {}
  }
  return out_(res);
}

function doPost(e) {
  let b; try { b = JSON.parse(e.postData.contents); } catch (err) { return out_({ ok: false, error: 'bad request' }); }
  if (!b.k || b.k !== famKey_()) return out_({ ok: false, error: 'bad key' });
  if (b.op === 'photo') return out_(savePhoto_(b.data));
  if (COLS.indexOf(b.col) < 0 || !b.id || String(b.id).length > 100) return out_({ ok: false, error: 'bad request' });
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const sh = sheet_(); const rows = sh.getDataRange().getValues();
    let r = -1;
    for (let i = 1; i < rows.length; i++) if (rows[i][0] === b.col && String(rows[i][1]) === String(b.id)) { r = i + 1; break; }
    if (b.op === 'delete') { if (r > 0) sh.deleteRow(r); return out_({ ok: true }); }
    let val = b.data || {};
    if (b.op === 'update' && r > 0) { try { val = Object.assign(JSON.parse(rows[r - 1][2]), val); } catch (err) {} }
    const json = JSON.stringify(val);
    if (json.length > 49000) return out_({ ok: false, error: 'too big' });
    const row = [b.col, String(b.id), json, new Date()];
    if (r > 0) sh.getRange(r, 1, 1, 4).setValues([row]); else sh.appendRow(row);
    return out_({ ok: true });
  } finally { lock.releaseLock(); }
}

function savePhoto_(dataUrl) {
  const m = String(dataUrl || '').match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  if (!m) return { ok: false, error: 'not a picture' };
  const bytes = Utilities.base64Decode(m[2]);
  if (bytes.length > 1500000) return { ok: false, error: 'too big' };
  const it = DriveApp.getFoldersByName(PHOTO_FOLDER);
  const folder = it.hasNext() ? it.next() : DriveApp.createFolder(PHOTO_FOLDER);
  const f = folder.createFile(Utilities.newBlob(bytes, m[1], 'obituary-' + Date.now() + '.jpg'));
  f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return { ok: true, url: 'https://drive.google.com/thumbnail?id=' + f.getId() + '&sz=w800' };
}

/** Run once from the editor after pasting the family key below, then delete the key from this line. */
function setKey() { PropertiesService.getScriptProperties().setProperty('FAMKEY', 'PASTE_KEY_HERE'); sheet_(); }
