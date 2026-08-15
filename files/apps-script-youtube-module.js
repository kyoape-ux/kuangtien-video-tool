// ============================================================
// 光田醫院工具站 Apps Script Web App
// 模組：youtube（影片管理 — YouTube / Facebook / Instagram）
//        ig（IG 貼文管理）
//
// 使用方式：
// 1. 開啟 Google Sheets → 擴充功能 → Apps Script
// 2. 貼上此程式碼（若已有其他程式碼，合併 doGet/doPost 的 if 判斷區塊）
// 3. 將 SHEET_ID 替換為實際的 Google Sheets ID
// 4. 部署 → 管理部署 → 編輯（鉛筆圖示）→ 版本選「新版本」→ 部署
//    ※ 必須建立新版本，舊 URL 才會套用新程式碼
// ============================================================

const SHEET_ID = '1lhgsVhbfde4NA17ChK1XUkLax8S_TZmMB0rS4Z7dPDI';
const YT_SHEET  = 'yt_videos';
const CFG_SHEET = 'yt_config';
const IG_SHEET  = 'ig_posts';
const TH_SHEET  = 'threads_posts';

// ── 欄位定義（與前端對應）─────────────────────────────────
const VIDEO_HEADERS = [
  'id','title','date','type','cat','planner','producer','dur',
  'yt_url','yt_views','yt_likes','yt_comments','yt_imp','yt_ctr','yt_ratio','yt_avgdur',
  'fb_url','fb_views','fb_likes','fb_comments','fb_shares','fb_reach',
  'ig_url','ig_views','ig_likes','ig_comments','ig_shares','ig_reach',
  'note','statsDate','createdAt','updatedAt'
];

const IG_HEADERS = [
  'id','title','date','type','cat',
  'views','likes','comments','interactions','shares','saves','reach',
  'link','createdAt','updatedAt'
];

const TH_HEADERS = [
  'id','title','date','type','cat',
  'views','likes','replies','reposts',
  'link','createdAt','updatedAt'
];

// ── doGet ────────────────────────────────────────────────────

function doGet(e) {
  const action = e.parameter.action || '';
  const module = e.parameter.module || '';
  try {
    if (module === 'youtube') {
      if (action === 'getVideos') return jsonRes(getVideos());
      if (action === 'getConfig') return jsonRes(getYtConfig());
    }
    if (module === 'youtube' || module === 'ig') {
      if (action === 'getIgPosts') return jsonRes(getIgPosts());
    }
    if (module === 'youtube' || module === 'threads') {
      if (action === 'getThreadsPosts') return jsonRes(getThreadsPosts());
    }
    return jsonRes({ error: 'Unknown action' });
  } catch(err) {
    return jsonRes({ error: err.message });
  }
}

// ── doPost ───────────────────────────────────────────────────

function doPost(e) {
  const body = JSON.parse(e.postData.contents || '{}');
  const action = body.action || '';
  const module = body.module || '';
  try {
    if (module === 'youtube') {
      if (action === 'saveVideo')    return jsonRes(saveVideo(body.data));
      if (action === 'updateVideo')  return jsonRes(updateVideo(body.data));
      if (action === 'deleteVideo')  return jsonRes(deleteVideo(body.id));
      if (action === 'saveConfig')   return jsonRes(saveYtConfig(body.data));
      if (action === 'saveIgPost')       return jsonRes(saveIgPost(body.data));
      if (action === 'updateIgPost')     return jsonRes(updateIgPost(body.data));
      if (action === 'deleteIgPost')     return jsonRes(deleteIgPost(body.id));
      if (action === 'saveThreadsPost')   return jsonRes(saveThreadsPost(body.data));
      if (action === 'updateThreadsPost') return jsonRes(updateThreadsPost(body.data));
      if (action === 'deleteThreadsPost') return jsonRes(deleteThreadsPost(body.id));
      if (action === 'createMonthlyReport') return jsonRes(createMonthlyReport(body.ym, body.moLabel, body.videos));
    }
    return jsonRes({ error: 'Unknown action' });
  } catch(err) {
    return jsonRes({ error: err.message });
  }
}

// ── 影片 CRUD ──────────────────────────────────────────────

function fmtCell(v) {
  if (v !== null && v !== undefined && typeof v === 'object' && typeof v.getFullYear === 'function') {
    return Utilities.formatDate(v, 'Asia/Taipei', 'yyyy-MM-dd');
  }
  return v;
}

function getVideos() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sh = ss.getSheetByName(YT_SHEET);
  if (!sh) return { videos: [] };
  const rows = sh.getDataRange().getValues();
  if (rows.length <= 1) return { videos: [] };
  const headers = rows[0];
  const videos = rows.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = fmtCell(row[i]); });
    return obj;
  });
  return { videos };
}

function saveVideo(data) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sh = ss.getSheetByName(YT_SHEET);
  if (!sh) { sh = ss.insertSheet(YT_SHEET); sh.appendRow(VIDEO_HEADERS); }
  const now = new Date().toISOString();
  const id = data.id || (Date.now().toString(36) + Math.random().toString(36).slice(2,6));
  const row = VIDEO_HEADERS.map(h => {
    if (h === 'id') return id;
    if (h === 'createdAt') return data.createdAt || now;
    if (h === 'updatedAt') return now;
    return data[h] !== undefined ? data[h] : '';
  });
  sh.appendRow(row);
  return { success: true, id };
}

function updateVideo(data) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sh = ss.getSheetByName(YT_SHEET);
  if (!sh) return { success: false, error: 'Sheet not found' };
  const rows = sh.getDataRange().getValues();
  const headers = rows[0];
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(data.id)) {
      const now = new Date().toISOString();
      const newRow = VIDEO_HEADERS.map(h => {
        if (h === 'createdAt') return rows[i][headers.indexOf('createdAt')] || '';
        if (h === 'updatedAt') return now;
        return data[h] !== undefined ? data[h] : '';
      });
      sh.getRange(i+1, 1, 1, VIDEO_HEADERS.length).setValues([newRow]);
      return { success: true };
    }
  }
  // Not found → append as new
  return saveVideo(data);
}

function deleteVideo(id) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sh = ss.getSheetByName(YT_SHEET);
  if (!sh) return { success: false };
  const rows = sh.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(id)) { sh.deleteRow(i+1); return { success: true }; }
  }
  return { success: false, error: 'ID not found' };
}

// ── IG 貼文 CRUD ────────────────────────────────────────────

function getIgPosts() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sh = ss.getSheetByName(IG_SHEET);
  if (!sh) return { posts: [] };
  const rows = sh.getDataRange().getValues();
  if (rows.length <= 1) return { posts: [] };
  const headers = rows[0];
  const posts = rows.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = fmtCell(row[i]); });
    return obj;
  });
  return { posts };
}

function saveIgPost(data) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sh = ss.getSheetByName(IG_SHEET);
  if (!sh) { sh = ss.insertSheet(IG_SHEET); sh.appendRow(IG_HEADERS); }
  const now = new Date().toISOString();
  const id = data.id || (Date.now().toString(36) + Math.random().toString(36).slice(2,6));
  // 已存在相同 id 則改為更新，避免重複列（批次匯入時會發生）
  const existing = sh.getDataRange().getValues();
  for (let i = 1; i < existing.length; i++) {
    if (String(existing[i][0]) === String(id)) return updateIgPost(Object.assign({}, data, { id: id }));
  }
  const row = IG_HEADERS.map(h => {
    if (h === 'id') return id;
    if (h === 'createdAt') return data.createdAt || now;
    if (h === 'updatedAt') return now;
    return data[h] !== undefined ? data[h] : '';
  });
  sh.appendRow(row);
  return { success: true, id };
}

function updateIgPost(data) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sh = ss.getSheetByName(IG_SHEET);
  if (!sh) return saveIgPost(data); // sheet 不存在時自動建立並新增
  const rows = sh.getDataRange().getValues();
  const headers = rows[0];
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(data.id)) {
      const now = new Date().toISOString();
      const newRow = IG_HEADERS.map(h => {
        if (h === 'createdAt') return rows[i][headers.indexOf('createdAt')] || '';
        if (h === 'updatedAt') return now;
        return data[h] !== undefined ? data[h] : '';
      });
      sh.getRange(i+1, 1, 1, IG_HEADERS.length).setValues([newRow]);
      return { success: true };
    }
  }
  return saveIgPost(data);
}

function deleteIgPost(id) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sh = ss.getSheetByName(IG_SHEET);
  if (!sh) return { success: false };
  const rows = sh.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(id)) { sh.deleteRow(i+1); return { success: true }; }
  }
  return { success: false, error: 'ID not found' };
}

// ── Threads 貼文 CRUD ───────────────────────────────────────

function getThreadsPosts() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sh = ss.getSheetByName(TH_SHEET);
  if (!sh) return { posts: [] };
  const rows = sh.getDataRange().getValues();
  if (rows.length <= 1) return { posts: [] };
  const headers = rows[0];
  const posts = rows.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = fmtCell(row[i]); });
    return obj;
  });
  return { posts };
}

function saveThreadsPost(data) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sh = ss.getSheetByName(TH_SHEET);
  if (!sh) { sh = ss.insertSheet(TH_SHEET); sh.appendRow(TH_HEADERS); }
  const now = new Date().toISOString();
  const id = data.id || (Date.now().toString(36) + Math.random().toString(36).slice(2,6));
  // 已存在則改為更新，避免重複
  const rows = sh.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(id)) return updateThreadsPost(data);
  }
  const row = TH_HEADERS.map(h => {
    if (h === 'id') return id;
    if (h === 'createdAt') return data.createdAt || now;
    if (h === 'updatedAt') return now;
    return data[h] !== undefined ? data[h] : '';
  });
  sh.appendRow(row);
  return { success: true, id };
}

function updateThreadsPost(data) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sh = ss.getSheetByName(TH_SHEET);
  if (!sh) return saveThreadsPost(data);
  const rows = sh.getDataRange().getValues();
  const headers = rows[0];
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(data.id)) {
      const now = new Date().toISOString();
      const newRow = TH_HEADERS.map(h => {
        if (h === 'createdAt') return rows[i][headers.indexOf('createdAt')] || '';
        if (h === 'updatedAt') return now;
        return data[h] !== undefined ? data[h] : '';
      });
      sh.getRange(i+1, 1, 1, TH_HEADERS.length).setValues([newRow]);
      return { success: true };
    }
  }
  return saveThreadsPost(data);
}

function deleteThreadsPost(id) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sh = ss.getSheetByName(TH_SHEET);
  if (!sh) return { success: false };
  const rows = sh.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(id)) { sh.deleteRow(i+1); return { success: true }; }
  }
  return { success: false, error: 'ID not found' };
}

// ── 設定 ─────────────────────────────────────────────────────

function getYtConfig() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sh = ss.getSheetByName(CFG_SHEET);
  if (!sh) return { viewGoal:5000, countGoal:6, personalGoal:2000 };
  const rows = sh.getDataRange().getValues();
  const cfg = {};
  rows.forEach(r => { if(r[0]) cfg[r[0]] = Number(r[1]) || r[1]; });
  return cfg;
}

function saveYtConfig(data) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sh = ss.getSheetByName(CFG_SHEET);
  if (!sh) sh = ss.insertSheet(CFG_SHEET);
  sh.clearContents();
  Object.entries(data).forEach(([k,v]) => sh.appendRow([k, v]));
  return { success: true };
}

// ── 月報表匯出至 Google Sheets ────────────────────────────────

function createMonthlyReport(ym, moLabel, videos) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const shName = '月報_' + ym;
  const existing = ss.getSheetByName(shName);
  if (existing) ss.deleteSheet(existing);
  const sh = ss.insertSheet(shName);

  const GREEN = '#0F6E56', WHITE = '#FFFFFF', LIGHT = '#F2FAF6';

  function tv(d) {
    return (Number(d.yt_views)||0) + (Number(d.fb_views)||0) + (Number(d.ig_views)||0);
  }

  // ── KPI 標題列 ──
  sh.appendRow(['月份', moLabel, '', '總觀看', videos.reduce((s,d)=>s+tv(d),0), '', '影片數', videos.length]);
  sh.getRange(1,1,1,8).setBackground(GREEN).setFontColor(WHITE).setFontWeight('bold');

  sh.appendRow(['']);

  // ── TOP 5 ──
  const top5Row = sh.getLastRow() + 1;
  sh.appendRow(['🏆 本月觀看次數 TOP 5']);
  sh.getRange(top5Row, 1).setFontSize(12).setFontWeight('bold').setFontColor(GREEN);
  sh.appendRow(['排名', '影片標題', '類型', '類別', 'YT 觀看', 'FB 觀看', 'IG 觀看', '全平台合計']);
  const hdrTop5 = sh.getRange(sh.getLastRow(), 1, 1, 8);
  hdrTop5.setBackground(GREEN).setFontColor(WHITE).setFontWeight('bold');

  const sorted = videos.slice().sort((a,b) => tv(b) - tv(a));
  sorted.slice(0, 5).forEach((d, i) => {
    sh.appendRow([i+1, d.title||'', d.type||'', d.cat||'',
      Number(d.yt_views)||0, Number(d.fb_views)||0, Number(d.ig_views)||0, tv(d)]);
    sh.getRange(sh.getLastRow(), 1, 1, 8).setBackground(i%2===0 ? LIGHT : WHITE);
    sh.getRange(sh.getLastRow(), 8).setFontWeight('bold').setFontColor(GREEN);
  });

  sh.appendRow(['']);

  // ── 完整清單 ──
  const listRow = sh.getLastRow() + 1;
  sh.appendRow(['📋 本月影片清單（共 ' + videos.length + ' 部）']);
  sh.getRange(listRow, 1).setFontSize(12).setFontWeight('bold').setFontColor(GREEN);
  sh.appendRow(['發布日期', '影片標題', '類型', '類別', 'YT 觀看', 'FB 觀看', 'IG 觀看', '全平台合計', '企劃', '製作']);
  sh.getRange(sh.getLastRow(), 1, 1, 10).setBackground(GREEN).setFontColor(WHITE).setFontWeight('bold');

  videos.slice().sort((a,b)=>(a.date||'').localeCompare(b.date||'')).forEach((d, i) => {
    sh.appendRow([d.date||'', d.title||'', d.type||'', d.cat||'',
      Number(d.yt_views)||0, Number(d.fb_views)||0, Number(d.ig_views)||0, tv(d),
      d.planner||'', d.producer||'']);
    sh.getRange(sh.getLastRow(), 1, 1, 10).setBackground(i%2===0 ? LIGHT : WHITE);
    sh.getRange(sh.getLastRow(), 8).setFontWeight('bold');
  });

  // ── 欄寬 ──
  sh.setColumnWidth(1, 100);
  sh.setColumnWidth(2, 320);
  [3,4].forEach(c => sh.setColumnWidth(c, 70));
  [5,6,7,8].forEach(c => sh.setColumnWidth(c, 80));
  sh.setColumnWidth(9, 90);
  sh.setColumnWidth(10, 90);

  return { success: true, sheetId: SHEET_ID, gid: sh.getSheetId() };
}

// ── 工具函式 ─────────────────────────────────────────────────

function jsonRes(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
