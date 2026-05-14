import { parquetRead } from 'hyparquet';

const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
const replIdentity = process.env.REPL_IDENTITY;
const webReplRenewal = process.env.WEB_REPL_RENEWAL;
const xReplitToken = replIdentity ? 'repl ' + replIdentity : webReplRenewal ? 'depl ' + webReplRenewal : null;

const cResp = await fetch(`https://${hostname}/api/v2/connection?include_secrets=true&connector_names=sharepoint`, {
  headers: { Accept: 'application/json', 'X-Replit-Token': xReplitToken }
});
const cData = await cResp.json();
const token = cData.items?.[0]?.settings?.access_token || cData.items?.[0]?.settings?.oauth?.credentials?.access_token;

const r = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/01PWHOXR5YWQVGQTKRCBGYBQI4MUM3FZ27/content`, { headers: { Authorization: `Bearer ${token}` } });
const buf = Buffer.from(await r.arrayBuffer());
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

const rows = await new Promise((res, rej) => {
  parquetRead({
    file: { byteLength: ab.byteLength, slice: (s, e) => Promise.resolve(ab.slice(s, e)) },
    rowFormat: 'object', limit: 3,
    onComplete: data => res(data),
  }).catch(rej);
});

rows.forEach((r, i) => {
  const w = r['week ending'];
  console.log(`Row ${i}: week_ending value=${String(w)} type=${typeof w} isBigInt=${typeof w === 'bigint'}`);
  const wNum = typeof w === 'bigint' ? Number(w) : w;
  const excelDate = new Date((wNum - 25569) * 86400 * 1000);
  const unixDate = new Date(wNum * 1000); // as unix seconds
  const unixMsDate = new Date(wNum); // as unix ms
  console.log(`  Excel serial: ${excelDate.toDateString()}`);
  console.log(`  Unix seconds: ${unixDate.toDateString()}`);
  console.log(`  As raw: ${wNum}`);
  console.log(`  client=${r['client']}, store=${r['cleaned store name']}, store_soh=${r['store soh']}`);
});
