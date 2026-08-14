// Netlify Function: lê a pasta do Google Drive (conta de serviço), interpreta os
// relatórios (inventário Stokki, Full Shopee, Full ML, saídas Domuslog, produção)
// e devolve a Visão Geral consolidada por SKU.
//
// Variáveis de ambiente necessárias (Netlify > Site settings > Environment variables):
//   GOOGLE_SERVICE_ACCOUNT_EMAIL  -> e-mail da conta de serviço
//   GOOGLE_PRIVATE_KEY            -> chave privada da conta de serviço (com \n)
//   DRIVE_FOLDER_ID              -> ID da pasta do Drive compartilhada com a conta de serviço

const { google } = require('googleapis');
const XLSX = require('xlsx');

const FOLDER = process.env.DRIVE_FOLDER_ID;
const EMAIL  = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const KEY    = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

function driveClient() {
  const auth = new google.auth.JWT(EMAIL, null, KEY, ['https://www.googleapis.com/auth/drive.readonly']);
  return google.drive({ version: 'v3', auth });
}

// ---------- helpers de parsing (mesma lógica do front) ----------
const _norm = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const _num = x => { if (x == null) return 0; if (typeof x === 'number') return x; let s = String(x).trim(); if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.'); const n = parseFloat(s); return isNaN(n) ? 0 : n; };
const _isSku = x => /^[A-Z][A-Z0-9.\-]+$/.test(String(x || '').trim());

function findCols(rows, targets) {
  const res = {}, scan = Math.min(rows.length, 25);
  for (const key in targets) {
    const alts = targets[key].map(_norm);
    for (let r = 0; r < scan && res[key] == null; r++) { const row = rows[r] || []; for (let c = 0; c < row.length; c++) { if (alts.includes(_norm(row[c]))) { res[key] = c; break; } } }
    for (let r = 0; r < scan && res[key] == null; r++) { const row = rows[r] || []; for (let c = 0; c < row.length; c++) { const cell = _norm(row[c]); if (cell && alts.some(a => cell.includes(a))) { res[key] = c; break; } } }
  }
  return res;
}

// identifica o tipo de relatório pela presença de colunas-assinatura
function classify(rows) {
  const flat = new Set();
  for (let r = 0; r < Math.min(rows.length, 25); r++) (rows[r] || []).forEach(c => flat.add(_norm(c)));
  const has = t => [...flat].some(c => c.includes(t));
  if (has('codigo de barras interno')) return 'prod';
  if (has('seller sku id')) return 'shopee';
  if (has('aptas para venda') || has('entrada pendente')) return 'ml';
  if (has('quantidade') && has('sku') && (has('cliente') || has('mes') || has('descricao'))) return 'saidas';
  if (has('disponivel') && (has('sku') || has('codigo'))) return 'domus';
  return null;
}

const EXTRACT = {
  domus: rows => { const ci = findCols(rows, { sku: ['sku', 'codigo'], disp: ['disponivel'] }); const o = {}; if (ci.sku == null || ci.disp == null) return o; for (const r of rows) { const s = String(r[ci.sku] || '').trim(); if (_isSku(s) && s !== 'SKU') o[s] = (o[s] || 0) + _num(r[ci.disp]); } return o; },
  shopee: rows => { const ci = findCols(rows, { sku: ['seller sku id'], sell: ['sellable'], res: ['reserved'], pend: ['pending asn inbound'], sold: ['unitssoldinlast30days'] }); const o = {}; if (ci.sku == null) return o; for (const r of rows) { const s = String(r[ci.sku] || '').trim(); if (!_isSku(s)) continue; const x = o[s] || { sell: 0, pend: 0, sold: 0 }; x.sell += _num(r[ci.pend]) + _num(r[ci.sell]) + _num(r[ci.res]); x.sold += _num(r[ci.sold]); o[s] = x; } return o; },
  ml: rows => { const ci = findCols(rows, { sku: ['sku'], sold: ['vendas ultimos 30 dias (un.)', 'vendas ultimos 30 dias (un)'], pend: ['entrada pendente'], aptas: ['aptas para venda'] }); const o = {}; if (ci.sku == null) return o; for (const r of rows) { const s = String(r[ci.sku] || '').trim(); if (_isSku(s) && s !== 'SKU') { const x = o[s] || { aptas: 0, pend: 0, sold: 0 }; x.aptas += _num(r[ci.aptas]); x.pend += _num(r[ci.pend]); x.sold += _num(r[ci.sold]); o[s] = x; } } return o; },
  saidas: rows => { const ci = findCols(rows, { sku: ['sku'], qtd: ['quantidade'] }); const o = {}; if (ci.sku == null || ci.qtd == null) return o; for (const r of rows) { const s = String(r[ci.sku] || '').trim(); if (_isSku(s) && s !== 'SKU') o[s] = (o[s] || 0) + _num(r[ci.qtd]); } return o; },
  prod: rows => { const ci = findCols(rows, { sku: ['codigo de barras interno'], disp: ['quantidade total disponivel'], prod: ['quantidade total producao'] }); const o = {}; if (ci.sku == null) return o; for (const r of rows) { const s = String(r[ci.sku] || '').trim(); if (_isSku(s)) { const x = o[s] || { disp: 0, prod: 0 }; x.disp += _num(r[ci.disp]); x.prod += _num(r[ci.prod]); o[s] = x; } } return o; }
};

// lista uma pasta (com paginação)
async function listFolder(drive, folderId) {
  let files = [], pageToken;
  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'nextPageToken, files(id,name,mimeType,modifiedTime)',
      pageSize: 200, pageToken,
      supportsAllDrives: true, includeItemsFromAllDrives: true
    });
    files = files.concat(res.data.files || []);
    pageToken = res.data.nextPageToken;
  } while (pageToken);
  return files;
}
// junta todos os arquivos da pasta e das subpastas (recursivo)
async function gatherFiles(drive, folderId, depth) {
  if (depth > 5) return [];
  const items = await listFolder(drive, folderId);
  let out = [];
  for (const it of items) {
    if (it.mimeType === 'application/vnd.google-apps.folder') out = out.concat(await gatherFiles(drive, it.id, depth + 1));
    else out.push(it);
  }
  return out;
}

async function getWorkbook(drive, file) {
  let buf;
  if (file.mimeType === 'application/vnd.google-apps.spreadsheet') {
    const res = await drive.files.export({ fileId: file.id, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }, { responseType: 'arraybuffer' });
    buf = Buffer.from(res.data);
  } else {
    const res = await drive.files.get({ fileId: file.id, alt: 'media' }, { responseType: 'arraybuffer' });
    buf = Buffer.from(res.data);
  }
  return XLSX.read(buf, { type: 'buffer' });
}

exports.handler = async (event) => {
  const headers = {
    'content-type': 'application/json',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, OPTIONS',
    'access-control-allow-headers': 'Content-Type'
  };
  if (event && event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  try {
    if (!FOLDER || !EMAIL || !KEY) return { statusCode: 200, headers, body: JSON.stringify({ error: 'Configuração ausente: defina DRIVE_FOLDER_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL e GOOGLE_PRIVATE_KEY no Netlify.' }) };
    const drive = driveClient();
    const files = await gatherFiles(drive, FOLDER, 0); // inclui subpastas
    if (!files.length) return { statusCode: 200, headers, body: JSON.stringify({ error: 'A pasta (e subpastas) está vazia ou a conta de serviço não tem acesso.' }) };

    const sources = { domus: {}, shopee: {}, ml: {}, saidas: {}, prod: {} };
    const srcTime = {};
    let newest = null;

    for (const file of files) {
      let wb;
      try { wb = await getWorkbook(drive, file); } catch (e) { continue; } // ignora arquivos ilegíveis
      const seenInFile = new Set();
      for (const sn of wb.SheetNames) {
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: null, raw: true });
        const type = classify(rows);
        if (!type || seenInFile.has(type)) continue; // usa só a 1ª aba de cada tipo por arquivo
        const t = new Date(file.modifiedTime);
        if (srcTime[type] && t < srcTime[type]) continue;
        seenInFile.add(type);
        const data = EXTRACT[type](rows);
        if (Object.keys(data).length) { sources[type] = data; srcTime[type] = t; if (!newest || t > newest) newest = t; }
      }
    }

    const skus = new Set();
    Object.values(sources).forEach(o => Object.keys(o).forEach(s => skus.add(s)));
    const data = [];
    skus.forEach(sku => {
      const dom = sources.domus[sku] || 0, sh = sources.shopee[sku] || {}, mlSrc = sources.ml[sku] || {}, pr = sources.prod[sku] || {};
      const shopee = sh.sell || 0;                       // Full Shopee (Sellable)
      const mlQ = mlSrc.aptas || 0;                      // Full ML (Aptas para venda)
      const transito = (sh.pend || 0) + (mlSrc.pend || 0); // Em trânsito (Pending ASN + Entrada pendente)
      const cmDomus = sources.saidas[sku] || 0, cmShopee = sh.sold || 0, cmMl = mlSrc.sold || 0;
      // dfull = Full Shopee + Full ML + Em trânsito (complementar à Domuslog — sem dupla contagem)
      data.push({
        sku,
        dom: Math.round(dom),
        shopee: Math.round(shopee),
        ml: Math.round(mlQ),
        transito: Math.round(transito),
        dfull: Math.round(shopee + mlQ + transito),
        cmDomus: Math.round(cmDomus), cmShopee: Math.round(cmShopee), cmMl: Math.round(cmMl),
        pe: Math.round(pr.disp || 0), prod: Math.round(pr.prod || 0), cmensal: Math.round(cmDomus + cmShopee + cmMl)
      });
    });

    return {
      statusCode: 200, headers,
      body: JSON.stringify({
        data,
        updated: newest ? newest.toISOString() : null,
        sources: Object.fromEntries(Object.entries(sources).map(([k, v]) => [k, Object.keys(v).length]))
      })
    };
  } catch (err) {
    return { statusCode: 200, headers, body: JSON.stringify({ error: 'Falha ao ler o Drive: ' + (err.message || String(err)) }) };
  }
};
