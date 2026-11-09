/**
 * Snow & Ice Log — Google Sheets backend.
 *
 * Paste this into Extensions → Apps Script in the Google Sheet that should hold the log.
 * Version 2 (no PIN). After pasting, use Deploy → Manage deployments → Edit → Version: New version → Deploy.
 * Deploy → New deployment → Web app → Execute as: Me, Who has access: Anyone.
 */

const SHEET_NAME = 'Log';
const HEADERS = ['id', 'ts', 'type', 'area', 'cond', 'mat', 'qty', 'temp', 'by',
                 'notes', 'status', 'resolvedAt', 'createdAt'];

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
  }
  return sh;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function clean_(v, max) {
  return String(v == null ? '' : v).replace(/^[=+\-@]/, "'$&").slice(0, max || 200);
}

function doGet(e) {
  const values = sheet_().getDataRange().getValues();
  const head = values.shift();
  const entries = values.filter(r => r[0]).map(r => {
    const o = {};
    head.forEach((h, i) => {
      let v = r[i];
      if (v instanceof Date) v = Utilities.formatDate(v, Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm");
      if (typeof v === 'string' && v.charAt(0) === "'") v = v.slice(1);
      o[h] = v;
    });
    return o;
  });
  return json_({ ok: true, version: 2, entries: entries });
}

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'bad_json' }); }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = sheet_();
    if (body.action === 'add') {
      const x = body.entry || {};
      const id = Utilities.getUuid();
      sh.appendRow([
        id, clean_(x.ts, 20), clean_(x.type), clean_(x.area), clean_(x.cond), clean_(x.mat),
        x.qty === '' || x.qty == null ? '' : Number(x.qty),
        x.temp === '' || x.temp == null ? '' : Number(x.temp),
        clean_(x.by, 80), clean_(x.notes, 2000), x.status === 'open' ? 'open' : 'none', '',
        new Date().toISOString()
      ]);
      return json_({ ok: true, id: id });
    }
    if (body.action === 'resolve') {
      const ids = sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 1), 1).getValues();
      for (let i = 0; i < ids.length; i++) {
        if (ids[i][0] === body.id) {
          sh.getRange(i + 2, 11, 1, 2).setValues([['resolved', new Date().toISOString()]]);
          return json_({ ok: true });
        }
      }
      return json_({ ok: false, error: 'not_found' });
    }
    return json_({ ok: false, error: 'bad_action' });
  } finally {
    lock.releaseLock();
  }
}
