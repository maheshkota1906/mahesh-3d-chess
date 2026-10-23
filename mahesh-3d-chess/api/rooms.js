const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function codeValue(v) { return typeof v === 'string' ? v.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) : ''; }
function token() { return Array.from(crypto.getRandomValues(new Uint8Array(24)), b => b.toString(16).padStart(2, '0')).join(''); }
function ensureConfig() { if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error('Server setup incomplete: add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel Environment Variables.'); }
async function db(path, options={}) {
  const r = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${path}`, {
    ...options,
    body: options.body && typeof options.body !== 'string' ? JSON.stringify(options.body) : options.body,
    headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type':'application/json', Prefer: options.prefer || 'return=representation', ...(options.headers||{}) }
  });
  const text = await r.text(); let data; try { data=text?JSON.parse(text):null; } catch { data={message:text}; }
  if (!r.ok) { const e = new Error(data?.message || data?.hint || 'Database request failed.'); e.status=r.status; throw e; }
  return data;
}
function publicRoom(row) {
  const now=Date.now(); let white=Number(row.white_ms), black=Number(row.black_ms);
  if(row.clock_started_at && row.status==='playing') { const elapsed=Math.max(0,now-Date.parse(row.clock_started_at)); if(row.turn==='w')white=Math.max(0,white-elapsed);else black=Math.max(0,black-elapsed); }
  let status=row.status,result=row.result;
  if(status==='playing'&&(white<=0||black<=0)){status='finished';result=white<=0?'Black wins on time':'White wins on time';}
  return {code:row.code,fen:row.fen,pgn:row.pgn,turn:row.turn,clockMinutes:row.clock_minutes,whiteMs:white,blackMs:black,clockStarted:!!row.clock_started_at,status,result,version:Number(row.version),updatedAt:row.updated_at};
}
const select='code,white_token,black_token,fen,pgn,turn,clock_minutes,white_ms,black_ms,clock_started_at,status,result,version,updated_at';
async function findRoom(code){const rows=await db(`chess_rooms?code=eq.${encodeURIComponent(code)}&select=${select}&limit=1`);return rows?.[0]||null;}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  try {
    ensureConfig();
    if(req.method==='GET'){
      const code=codeValue(req.query?.code); if(!code)return res.status(400).json({error:'Room code is required.'});
      const row=await findRoom(code);if(!row)return res.status(404).json({error:'Room not found. Check the code or create a room.'});
      return res.status(200).json({room:publicRoom(row)});
    }
    if(req.method!=='POST')return res.status(405).json({error:'Method not allowed.'});
    const body=req.body||{},action=String(body.action||'');
    if(action==='create'){
      const clockMinutes=Number(body.clockMinutes)===10?10:5;let row=null,code='';
      for(let i=0;i<5&&!row;i++){
        code=Array.from({length:6},()=> 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random()*32)]).join('');
        const whiteToken=token(),ms=clockMinutes*60000;
        const rows=await db('chess_rooms',{method:'POST',body:{code,white_token:whiteToken,black_token:null,fen:'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',pgn:'',turn:'w',clock_minutes:clockMinutes,white_ms:ms,black_ms:ms,status:'waiting',version:0},headers:{Prefer:'return=representation'}}).catch(e=>{if(e.status===409||e.status===400)return [];throw e;});
        if(rows?.length)return res.status(201).json({room:publicRoom(rows[0]),seat:'w',token:whiteToken});
      }
      return res.status(503).json({error:'Could not create a room. Please retry.'});
    }
    const code=codeValue(body.code);if(!code)return res.status(400).json({error:'Room code is required.'});
    const row=await findRoom(code);if(!row)return res.status(404).json({error:'Room not found.'});
    if(action==='join'){
      if(row.status!=='waiting'||row.black_token)return res.status(409).json({error:'This room already has two players or the game has started.'});
      const blackToken=token();const rows=await db(`chess_rooms?code=eq.${encodeURIComponent(code)}&status=eq.waiting&black_token=is.null`,{method:'PATCH',body:{black_token:blackToken,status:'playing',clock_started_at:new Date().toISOString(),updated_at:new Date().toISOString(),version:Number(row.version)+1},headers:{Prefer:'return=representation'}});
      if(!rows?.length)return res.status(409).json({error:'Someone else joined this room first.'});
      return res.status(200).json({room:publicRoom(rows[0]),seat:'b',token:blackToken});
    }
    if(action==='move'){
      const seatToken=String(body.token||''),seat=seatToken&&seatToken===row.white_token?'w':seatToken&&seatToken===row.black_token?'b':'';
      if(!seat)return res.status(403).json({error:'This browser is not assigned to a seat in this room.'});
      if(row.status!=='playing'||!row.black_token)return res.status(409).json({error:'Waiting for the other player to join.'});
      if(seat!==row.turn)return res.status(409).json({error:'It is the other player’s turn.'});
      if(typeof body.fen!=='string'||body.fen.length>300||typeof body.pgn!=='string'||body.pgn.length>20000)return res.status(400).json({error:'Invalid move state.'});
      const now=Date.now(),started=row.clock_started_at?Date.parse(row.clock_started_at):null;let whiteMs=Number(row.white_ms),blackMs=Number(row.black_ms);
      if(started!==null){const elapsed=Math.max(0,now-started);if(row.turn==='w')whiteMs-=elapsed;else blackMs-=elapsed;}
      if(whiteMs<=0||blackMs<=0){const result=whiteMs<=0?'Black wins on time':'White wins on time';const rows=await db(`chess_rooms?code=eq.${encodeURIComponent(code)}&version=eq.${Number(row.version)}`,{method:'PATCH',body:{white_ms:Math.max(0,whiteMs),black_ms:Math.max(0,blackMs),status:'finished',result,clock_started_at:null,updated_at:new Date().toISOString(),version:Number(row.version)+1},headers:{Prefer:'return=representation'}});return res.status(200).json({room:publicRoom(rows[0]||row)});}
      const resultText=typeof body.result==='string'?body.result.slice(0,100):null;
      const patch={fen:body.fen,pgn:body.pgn,turn:row.turn==='w'?'b':'w',white_ms:Math.max(0,Math.floor(whiteMs)),black_ms:Math.max(0,Math.floor(blackMs)),clock_started_at:resultText?null:new Date().toISOString(),status:resultText?'finished':'playing',result:resultText,updated_at:new Date().toISOString(),version:Number(row.version)+1};
      const rows=await db(`chess_rooms?code=eq.${encodeURIComponent(code)}&version=eq.${Number(row.version)}`,{method:'PATCH',body:patch,headers:{Prefer:'return=representation'}});
      if(!rows?.length)return res.status(409).json({error:'The room changed. Refresh the game state and try again.'});
      return res.status(200).json({room:publicRoom(rows[0])});
    }
    return res.status(400).json({error:'Unknown room action.'});
  } catch(err) { console.error('chess room error',err?.message||'unknown');return res.status(err.status||500).json({error:err.message||'Room service is temporarily unavailable.'}); }
}
