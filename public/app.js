import * as THREE from "https://esm.sh/three@0.180.0";
// OrbitControls removed: board view stays fixed.
import { GLTFLoader } from "https://esm.sh/three@0.180.0/examples/jsm/loaders/GLTFLoader.js";
import { RGBELoader } from "https://esm.sh/three@0.180.0/examples/jsm/loaders/RGBELoader.js";
import { Chess } from "https://esm.sh/chess.js@1.4.0";

const NAMES = ["BlackBishop_01","BlackBishop_02","BlackKnight_02","BlackKnight_01","BlackKing","BlackPawn_01","BlackPawn_02","BlackPawn_03","BlackPawn_04","BlackPawn_05","BlackPawn_6","BlackPawn_07","BlackPawn_08","BlackQueen","BlackRook_01","BlackRook_02","ChessBoard","WhiteBishop_01","WhiteBishop_02","WhiteKnight_01","WhiteKnight_02","WhiteKing","WhitePawn_01","WhitePawn_02","WhitePawn_03","WhitePawn_04","WhitePawn_05","WhitePawn_06","WhitePawn_07","WhitePawn_08","WhiteQueen","WhiteRook_01","WhiteRook_02"];
const $ = id => document.getElementById(id);
const chess = new Chess();
let scene, camera, renderer, raycaster, pointer, boardGroup, piecesGroup, markerGroup;
let selected = null, legalTargets = [], flipped = false, mode = "computer", busy = false;
let customRoot = null, customPrototypes = new Map(), loadedNames = [], uploadUrl = null;
let clockMinutes=5, clockRemaining={w:300000,b:300000}, clockActive=null, clockStarted=false, clockLastTick=0, clockInterval=null, clockFinished=false, audioContext=null;
let onlineMode=false, roomCode=null, roomSeat=null, roomToken=null, roomEvents=null, roomVersion=-1, applyingRemote=false, roomSyncBusy=false, roomStateStatus="waiting";
let squareMeshes = new Map(), pieceObjects = new Map(), targetObjects = [], lastMove = null;
let capturedPieces = {w:[],b:[]}, animationBusy = false, capturedGroup = null;
const pieceValues = {p:1,n:3,b:3,r:5,q:9,k:100};
const colors = {light:0xd9c6a6,dark:0x665445,accent:0xe8bd72,white:0xf3eee4,black:0x262b35};
function toast(msg){const t=$("toast");t.textContent=msg;t.classList.add("show");clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.classList.remove("show"),2600)}
function formatClock(ms){const total=Math.max(0,Math.ceil(ms/1000));return String(Math.floor(total/60)).padStart(2,"0")+":"+String(total%60).padStart(2,"0")}
function renderClocks(){
 $("white-clock").textContent=formatClock(clockRemaining.w);$("black-clock").textContent=formatClock(clockRemaining.b);
 $("white-clock-box").classList.toggle("active",clockStarted&&!clockFinished&&clockActive==="w");$("black-clock-box").classList.toggle("active",clockStarted&&!clockFinished&&clockActive==="b");
 $("white-clock-box").classList.toggle("flagged",clockFinished&&clockRemaining.w<=0);$("black-clock-box").classList.toggle("flagged",clockFinished&&clockRemaining.b<=0);
 $("clock-note").textContent=clockFinished?(clockRemaining.w<=0?"White ran out of time":clockRemaining.b<=0?"Black ran out of time":"Game clock stopped"):clockStarted?"Running · "+(clockActive==="w"?"White":"Black")+" to move":"Clock starts on the first move";
}
function resetClock(){if(clockInterval){clearInterval(clockInterval);clockInterval=null}clockRemaining={w:clockMinutes*60000,b:clockMinutes*60000};clockActive=null;clockStarted=false;clockLastTick=0;clockFinished=false;document.querySelectorAll(".clock-preset").forEach(b=>b.classList.toggle("active",Number(b.dataset.minutes)===clockMinutes));renderClocks()}
function startClock(){if(clockFinished||chess.isGameOver())return;if(!clockStarted){clockStarted=true;clockActive=chess.turn();clockLastTick=performance.now();clockInterval=setInterval(tickClock,100);renderClocks()}}
function tickClock(){if(!clockStarted||clockFinished||!clockActive)return;const now=performance.now();clockRemaining[clockActive]-=now-clockLastTick;clockLastTick=now;if(clockRemaining[clockActive]<=0){clockRemaining[clockActive]=0;clockFinished=true;clearInterval(clockInterval);clockInterval=null;const loser=clockActive;clockActive=null;$("status").textContent=(loser==="w"?"White":"Black")+" ran out of time";$("turn-chip").textContent="TIME OUT";$("clock-note").textContent=(loser==="w"?"White":"Black")+" ran out of time";renderClocks();playSound("flag");toast((loser==="w"?"Black":"White")+" wins on time!");return}renderClocks()}
function switchClockTurn(){if(!clockStarted||clockFinished)return;clockActive=chess.turn();clockLastTick=performance.now();renderClocks()}
let lastVoiceAnnouncement="";
function announceMoveTurn(made){try{if(!( "speechSynthesis" in window))return;const phrase=chess.isCheckmate()?"Checkmate":chess.isCheck()?"Check":(made.color==="w"?"White":"Black")+" moved. "+(chess.turn()==="w"?"White":"Black")+" to move.";window.speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(phrase);u.lang="en-US";u.rate=.95;u.volume=1;window.speechSynthesis.speak(u)}catch(e){console.warn("Voice announcement unavailable",e)}}
function unlockGameAudio(){try{const Ctx=window.AudioContext||window.webkitAudioContext;if(Ctx){if(!audioContext)audioContext=new Ctx();if(audioContext.state==="suspended")audioContext.resume()}}catch(e){}try{if("speechSynthesis" in window)window.speechSynthesis.getVoices()}catch(e){}}
function announceChessState(){if(!("speechSynthesis" in window))return;let phrase="";if(chess.isCheckmate())phrase="Checkmate";else if(chess.isCheck())phrase="Check";if(!phrase){lastVoiceAnnouncement="";return}if(phrase===lastVoiceAnnouncement)return;lastVoiceAnnouncement=phrase;try{window.speechSynthesis.cancel();const utterance=new SpeechSynthesisUtterance(phrase);utterance.lang="en-US";utterance.rate=.88;utterance.pitch=1;utterance.volume=.9;window.speechSynthesis.speak(utterance)}catch(e){}}
const chessSoundPlayers={};
function playSound(kind){try{const file=kind==="capture"?"capture.mp3":kind==="castle"?"castle.mp3":kind==="flag"?"tenseconds.mp3":"move-self.mp3";const remoteUrl=kind==="capture"?"https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/capture.mp3":kind==="castle"?"https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/castle.mp3":kind==="flag"?"https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/tenseconds.mp3":"https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/move-self.mp3";const soundUrl=onlineMode?new URL("/sounds/"+file,location.href).href:remoteUrl;let player=chessSoundPlayers[kind];if(!player){player=new Audio();player.preload="auto";player.src=soundUrl;chessSoundPlayers[kind]=player}else if(player.src!==soundUrl){player.src=soundUrl}player.volume=(kind==="capture"||kind==="castle")?0.9:0.82;player.currentTime=0;const result=player.play();if(result&&typeof result.catch==="function")result.catch(e=>console.warn("Chess sound playback blocked or unavailable",e))}catch(e){console.warn("Chess sound unavailable",e)}}
async function roomApi(payload,method="POST"){const response=await fetch("/api/rooms"+(method==="GET"?"?code="+encodeURIComponent(payload.code):""),{method,headers:method==="POST"?{"Content-Type":"application/json"}:{},body:method==="POST"?JSON.stringify(payload):undefined});const data=await response.json().catch(()=>({error:"Room service returned an invalid response."}));if(!response.ok)throw new Error(data.error||"Room request failed.");return data}
function setRoomStatus(message,type=""){const el=$("room-status");el.textContent=message;el.classList.toggle("online",type==="online");el.classList.toggle("error",type==="error")}
function saveRoomIdentity(){try{localStorage.setItem("chess-room-"+roomCode,JSON.stringify({token:roomToken,seat:roomSeat}))}catch(e){}}
function showRoomIdentity(){const box=$("room-code-display");box.classList.remove("hidden");$("room-code-value").textContent=roomCode||"------";$("room-seat-label").textContent=roomSeat==="w"?"You are White":roomSeat==="b"?"You are Black":"Waiting for opponent";$("share-room").disabled=!roomCode}
function activateOnlineMode(){onlineMode=true;mode="online";document.querySelectorAll(".mode-option").forEach(b=>b.classList.remove("active"));$("difficulty").disabled=true;$("difficulty").style.opacity=".45";$("undo-btn").disabled=true;}
async function createOnlineRoom(){try{clockMinutes=Number(document.querySelector(".clock-preset.active")?.dataset.minutes||clockMinutes);const data=await roomApi({action:"create",clockMinutes});roomCode=data.room.code;roomSeat=data.seat;roomToken=data.token;roomVersion=-1;activateOnlineMode();resetGame();saveRoomIdentity();showRoomIdentity();setRoomStatus("Room created. Share the invite link and wait for your friend.", "online");await applyRoomSnapshot(data.room);connectRoomEvents();history.replaceState(null,"",location.pathname+"?room="+roomCode)}catch(e){setRoomStatus(e.message,"error");toast(e.message)}}
async function joinOnlineRoom(){const code=String($("room-code-input").value||new URLSearchParams(location.search).get("room")||"").toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,8);if(!code){setRoomStatus("Enter a room code or open your friend's invite link.","error");return}try{let identity=null;try{identity=JSON.parse(localStorage.getItem("chess-room-"+code)||"null")}catch(e){}let data;if(identity?.token){roomCode=code;roomToken=identity.token;roomSeat=identity.seat;data=await roomApi({code},"GET");data={...data,seat:roomSeat,token:roomToken}}else{data=await roomApi({action:"join",code});roomCode=code;roomSeat=data.seat;roomToken=data.token}roomVersion=-1;activateOnlineMode();resetGame();saveRoomIdentity();showRoomIdentity();$("room-code-input").value=code;setRoomStatus(data.room.status==="waiting"?"Joined room. Waiting for the other player.":"Connected to online match.", "online");await applyRoomSnapshot(data.room);connectRoomEvents();history.replaceState(null,"",location.pathname+"?room="+roomCode)}catch(e){setRoomStatus(e.message,"error");toast(e.message)}}
function connectRoomEvents(){if(!roomCode||!globalThis.hatchable?.events)return;try{roomEvents=globalThis.hatchable.events.connect({authUrl:"/api/events-token?code="+encodeURIComponent(roomCode)});roomEvents.channel("room:"+roomCode).on("state",()=>syncRoomSnapshot())}catch(e){setRoomStatus("Room connected; live updates reconnecting…")}}
async function syncRoomSnapshot(){if(!roomCode||roomSyncBusy)return;roomSyncBusy=true;try{const data=await roomApi({code:roomCode},"GET");await applyRoomSnapshot(data.room)}catch(e){setRoomStatus("Connection interrupted. Waiting to reconnect…")}finally{roomSyncBusy=false}}
async function applyRoomSnapshot(room){if(!room||Number(room.version)<roomVersion)return;roomVersion=Number(room.version);roomStateStatus=room.status;applyingRemote=true;try{const previousPly=chess.history().length;if(room.pgn){try{chess.load_pgn(room.pgn)}catch(e){chess.load(room.fen)}}else chess.load(room.fen);const remoteHistory=chess.history({verbose:true});if(remoteHistory.length>previousPly){const latest=remoteHistory[remoteHistory.length-1];playSound(latest.flags&&(latest.flags.includes("k")||latest.flags.includes("q"))?"castle":latest.captured?"capture":"move")}selected=null;legalTargets=[];lastMove=chess.history({verbose:true}).slice(-1)[0]||null;clockMinutes=Number(room.clockMinutes)||5;clockRemaining={w:Number(room.whiteMs),b:Number(room.blackMs)};clockStarted=!!room.clockStarted&&room.status==="playing";clockFinished=room.status==="finished";clockActive=clockStarted?room.turn:null;clockLastTick=performance.now();if(clockInterval)clearInterval(clockInterval);clockInterval=clockStarted?setInterval(tickClock,100):null;renderPieces();renderHistory();renderCaptured();renderClocks();if(room.status==="waiting")setRoomStatus("Room created. Waiting for your friend to join…","online");else if(room.status==="playing")setRoomStatus("Connected · Room "+room.code+" · You are "+(roomSeat==="w"?"White":"Black"),"online");else setRoomStatus(room.result||"Game finished","online");$("room-seat-label").textContent=roomSeat==="w"?"You are White":roomSeat==="b"?"You are Black":"Waiting for opponent";}finally{applyingRemote=false}}
function init(){
 scene=new THREE.Scene();scene.background=new THREE.Color(0x252a32);scene.fog=new THREE.Fog(0x252a32,16,29);
 const stage=$("board-stage");camera=new THREE.PerspectiveCamera(36,1,.1,100);camera.position.set(0,8.2,11.3);
 renderer=new THREE.WebGLRenderer({canvas:$("board-canvas"),antialias:true,alpha:false});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=0.88;
 camera.lookAt(0,0,0);
 // True HDR environment: visible studio backdrop plus image-based lighting/reflections.
 const pmremGenerator=new THREE.PMREMGenerator(renderer);
 pmremGenerator.compileEquirectangularShader();
 new RGBELoader().load("/brown_photostudio_02_1k.hdr",texture=>{
  texture.mapping=THREE.EquirectangularReflectionMapping;
  const envMap=pmremGenerator.fromEquirectangular(texture).texture;
  scene.environment=envMap;
  scene.environmentIntensity=0.22;
  scene.background=texture;
  scene.backgroundBlurriness=0.28;
  pmremGenerator.dispose();
 },undefined,error=>{console.error("HDRI could not be loaded",error);pmremGenerator.dispose()});
 scene.add(new THREE.HemisphereLight(0xf4e9d8,0x343c4a,2.1));
 const key=new THREE.DirectionalLight(0xfff1dc,2.0);key.position.set(-4,9,5);key.castShadow=true;key.shadow.mapSize.set(2048,2048);key.shadow.camera.left=-7;key.shadow.camera.right=7;key.shadow.camera.top=7;key.shadow.camera.bottom=-7;scene.add(key);
 const fill=new THREE.DirectionalLight(0xcbd8ef,0.45);fill.position.set(4,5,-5);scene.add(fill);
 const floor=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshStandardMaterial({color:0x20242b,roughness:.82}));floor.rotation.x=-Math.PI/2;floor.position.y=-.23;floor.receiveShadow=true;scene.add(floor);
 // Warm chess lounge: table beneath the board, room walls and soft architectural lighting.
 const tableMat=new THREE.MeshStandardMaterial({color:0x292522,roughness:.27,metalness:.12});
 const tableTop=new THREE.Mesh(new THREE.BoxGeometry(12.8,.38,11.4),tableMat);tableTop.position.set(0,-.48,0);tableTop.receiveShadow=true;tableTop.castShadow=true;scene.add(tableTop);
 const edgeMat=new THREE.MeshStandardMaterial({color:0x747b86,roughness:.24,metalness:.55});
 const tableEdge=new THREE.Mesh(new THREE.BoxGeometry(12.92,.09,11.52),edgeMat);tableEdge.position.set(0,-.27,0);scene.add(tableEdge);
 const legMat=new THREE.MeshStandardMaterial({color:0x302119,roughness:.45});
 for(const x of [-5.7,5.7])for(const z of [-5,5]){const leg=new THREE.Mesh(new THREE.BoxGeometry(.38,2.7,.38),legMat);leg.position.set(x,-1.9,z);leg.castShadow=true;scene.add(leg)}
 const wallMat=new THREE.MeshStandardMaterial({color:0x353944,roughness:.9});
 const backWall=new THREE.Mesh(new THREE.PlaneGeometry(24,11),wallMat);backWall.position.set(0,4.5,-8.8);scene.add(backWall);
 const leftWall=new THREE.Mesh(new THREE.PlaneGeometry(18,11),new THREE.MeshStandardMaterial({color:0x292e38,roughness:.92,side:THREE.DoubleSide}));leftWall.rotation.y=Math.PI/2;leftWall.position.set(-9,4.5,0);scene.add(leftWall);
 const rightWall=leftWall.clone();rightWall.position.x=9;scene.add(rightWall);
 const panelMat=new THREE.MeshStandardMaterial({color:0x3b414b,roughness:.62});
 for(const x of [-6,-3,0,3,6]){const panel=new THREE.Mesh(new THREE.BoxGeometry(2.35,5.8,.12),panelMat);panel.position.set(x,3.2,-8.68);scene.add(panel)}
 const roomGlow=new THREE.PointLight(0xffe6c7,24,24,2);roomGlow.position.set(0,7,0);scene.add(roomGlow);
 const warmRim=new THREE.PointLight(0xffd1a1,10,18,2);warmRim.position.set(-6,4,-3);scene.add(warmRim);
 boardGroup=new THREE.Group();piecesGroup=new THREE.Group();markerGroup=new THREE.Group();capturedGroup=new THREE.Group();scene.add(boardGroup,piecesGroup,markerGroup,capturedGroup);
 const base=new THREE.Mesh(new THREE.BoxGeometry(8.55,.32,8.55),new THREE.MeshStandardMaterial({color:0x17191d,roughness:.32,metalness:.12}));base.position.y=-.08;base.receiveShadow=true;base.castShadow=true;boardGroup.add(base);
 const trim=new THREE.Mesh(new THREE.BoxGeometry(8.35,.1,8.35),new THREE.MeshStandardMaterial({color:0x777d87,roughness:.3,metalness:.28}));trim.position.y=.1;boardGroup.add(trim);
 for(let rank=1;rank<=8;rank++)for(let file=0;file<8;file++){
  const name=String.fromCharCode(97+file)+rank,x=file-3.5,z=4.5-rank;
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(1,.09,1),new THREE.MeshStandardMaterial({color:(file+rank)%2===0?0xf4f5f7:0x202329,roughness:.92,metalness:0}));
  mesh.position.set(x,.19,z);mesh.receiveShadow=true;mesh.userData.square=name;boardGroup.add(mesh);squareMeshes.set(name,mesh);
 }
 raycaster=new THREE.Raycaster();pointer=new THREE.Vector2();
 renderer.domElement.addEventListener("pointerdown",e=>{unlockGameAudio();onBoardClick(e)});
 window.addEventListener("resize",resize);resize();renderPieces();animate();
 $("board-loading").style.display="none";
}
function resize(){if(!renderer)return;const r=$("board-stage").getBoundingClientRect();renderer.setSize(r.width,r.height,false);camera.aspect=r.width/Math.max(1,r.height);camera.updateProjectionMatrix()}
function animate(){requestAnimationFrame(animate);renderer.render(scene,camera)}
function squarePos(sq){const file=sq.charCodeAt(0)-97,rank=Number(sq[1]);return new THREE.Vector3(file-3.5,.24,4.5-rank)}
function makeFallbackPiece(type,color){
 const group=new THREE.Group(),white=color==="w",mat=new THREE.MeshStandardMaterial({color:white?0xf0e8d8:0x20242d,roughness:.31,metalness:.18});
 const gold=new THREE.MeshStandardMaterial({color:white?0xc1a779:0x8e9aa8,roughness:.3,metalness:.45});
 const cyl=(r1,r2,h,y,m)=>{const o=new THREE.Mesh(new THREE.CylinderGeometry(r1,r2,h,24),m);o.position.y=y;o.castShadow=true;o.receiveShadow=true;group.add(o)};
 cyl(.31,.34,.12,.12,gold);cyl(.25,.28,.15,.25,mat);
 if(type==="p"){cyl(.13,.2,.25,.43,mat);const b=new THREE.Mesh(new THREE.SphereGeometry(.16,20,16),mat);b.position.y=.63;b.castShadow=true;group.add(b)}
 else if(type==="r"){cyl(.2,.24,.52,.57,mat);cyl(.29,.29,.1,.88,gold);for(let i=0;i<4;i++){const b=new THREE.Mesh(new THREE.BoxGeometry(.1,.12,.1),mat);b.position.set(Math.cos(i*Math.PI/2)*.2,.98,Math.sin(i*Math.PI/2)*.2);group.add(b)}}
 else if(type==="n"){const b=new THREE.Mesh(new THREE.ConeGeometry(.23,.56,5),mat);b.position.set(0,.63,0);b.rotation.z=-.16;group.add(b);const e=new THREE.Mesh(new THREE.SphereGeometry(.045,12,8),gold);e.position.set(.08,.72,.18);group.add(e)}
 else if(type==="b"){cyl(.16,.22,.48,.59,mat);cyl(.2,.25,.1,.87,gold);const b=new THREE.Mesh(new THREE.SphereGeometry(.16,20,16),mat);b.position.y=1.04;group.add(b);const cut=new THREE.Mesh(new THREE.BoxGeometry(.055,.28,.06),gold);cut.position.set(0,1.04,.13);cut.rotation.z=.4;group.add(cut)}
 else if(type==="q"){cyl(.19,.25,.62,.62,mat);cyl(.3,.3,.1,.98,gold);const c=new THREE.Mesh(new THREE.SphereGeometry(.22,20,16),mat);c.position.y=1.17;group.add(c);for(let i=0;i<5;i++){const b=new THREE.Mesh(new THREE.SphereGeometry(.06,12,8),gold);b.position.set(Math.cos(i*1.256)*.25,1.08,Math.sin(i*1.256)*.25);group.add(b)}}
 else if(type==="k"){cyl(.2,.26,.68,.64,mat);cyl(.31,.31,.1,1.02,gold);const cross=new THREE.Group();const a=new THREE.Mesh(new THREE.BoxGeometry(.1,.38,.1),gold);a.position.y=1.29;const b=new THREE.Mesh(new THREE.BoxGeometry(.28,.09,.1),gold);b.position.y=1.31;cross.add(a,b);group.add(cross)}
 group.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true}});return group
}
function pieceName(piece,square){
 const color=piece.color==="w"?"White":"Black",type={p:"Pawn",n:"Knight",b:"Bishop",r:"Rook",q:"Queen",k:"King"}[piece.type];
 if(piece.type==="k"||piece.type==="q")return color+type;
 const candidates=loadedNames.filter(n=>n.startsWith(color+type+"_"));
 if(!candidates.length)return color+type;
 const file=square.charCodeAt(0)-97,rank=Number(square[1]);
 const ordinal=piece.type==="p"?(piece.color==="w"?file+1:8-file):((file+rank)%2)+1;
 let desired=color+type+"_"+String(ordinal).padStart(2,"0");
 if(piece.type==="p"&&piece.color==="b"&&ordinal===6)desired="BlackPawn_6";
 if(customPrototypes.has(desired))return desired;
 return candidates[(piece.type==="p"?file:Math.abs(file-rank))%candidates.length]
}
function createPiece(piece,square){
 const name=pieceName(piece,square);let obj;
 if(customPrototypes.has(name)){obj=customPrototypes.get(name).clone(true);obj.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;if(o.material){o.material=o.material.clone();if(piece.color==="w"&&o.material.color){o.material.color.lerp(new THREE.Color(0xd8dce2),0.28);o.material.roughness=Math.min(o.material.roughness??0.4,0.32);o.material.metalness=Math.max(o.material.metalness??0,0.08)}}}})}
 else obj=makeFallbackPiece(piece.type,piece.color);
 obj.userData.square=square;obj.userData.piece=true;
 const pos=squarePos(square);
 if(customPrototypes.has(name)){
  obj.position.set(0,0,0);
  const box=new THREE.Box3().setFromObject(obj),size=box.getSize(new THREE.Vector3());
  const h=Math.max(size.y,.001),target=piece.type==="p"?.88:piece.type==="r"?.92:piece.type==="k"?1.48:1.32;
  obj.scale.multiplyScalar(target/h);
  obj.position.set(pos.x,.24,pos.z);
 }else obj.position.set(pos.x,.24,pos.z);
 if(piece.color==="b"&&customPrototypes.has(name))obj.rotation.y=Math.PI;
 obj.userData.name=name;return obj
}
function clearGroup(g){while(g.children.length){const o=g.children.pop();if(o.geometry)o.geometry.dispose();}}
function renderPieces(){
 clearGroup(piecesGroup);pieceObjects.clear();clearGroup(markerGroup);targetObjects=[];
 for(const s of chess.board().flat().filter(Boolean)){}
 const board=chess.board();for(let r=0;r<8;r++)for(let f=0;f<8;f++){const p=board[r][f];if(!p)continue;const sq=String.fromCharCode(97+f)+(8-r);const obj=createPiece(p,sq);piecesGroup.add(obj);pieceObjects.set(sq,obj)}
 if(lastMove){for(const sq of [lastMove.from,lastMove.to]){const marker=new THREE.Mesh(new THREE.PlaneGeometry(.94,.94),new THREE.MeshBasicMaterial({color:colors.accent,transparent:true,opacity:.23,depthWrite:false}));marker.rotation.x=-Math.PI/2;const pos=squarePos(sq);marker.position.set(pos.x,.246,pos.z);markerGroup.add(marker)}}
 if(selected){const marker=new THREE.Mesh(new THREE.PlaneGeometry(.94,.94),new THREE.MeshBasicMaterial({color:0x70c99b,transparent:true,opacity:.36,depthWrite:false}));marker.rotation.x=-Math.PI/2;const pos=squarePos(selected);marker.position.set(pos.x,.25,pos.z);markerGroup.add(marker)}
 legalTargets.forEach(m=>{const pos=squarePos(m.to);const isCapture=!!m.captured||m.flags.includes("e");const target=new THREE.Mesh(new THREE.PlaneGeometry(.94,.94),new THREE.MeshBasicMaterial({color:isCapture?0xff785f:0x72d6a0,transparent:true,opacity:isCapture?.42:.38,depthWrite:false,side:THREE.DoubleSide}));target.rotation.x=-Math.PI/2;target.position.set(pos.x,.255,pos.z);target.userData.square=m.to;markerGroup.add(target);targetObjects.push(target)});
 updateStatus();announceChessState()
}
function onBoardClick(e){
 if(busy||clockFinished)return;if(onlineMode){if(roomStateStatus!=="playing"){toast("Wait for your friend to join the room.");return}if(roomSeat!==chess.turn()){toast("It is your opponent's turn.");return}}const rect=renderer.domElement.getBoundingClientRect();pointer.x=((e.clientX-rect.left)/rect.width)*2-1;pointer.y=-((e.clientY-rect.top)/rect.height)*2+1;raycaster.setFromCamera(pointer,camera);
 const hits=raycaster.intersectObjects([...piecesGroup.children,...boardGroup.children,...markerGroup.children],true);if(!hits.length)return;
 let obj=hits[0].object;while(obj&&!obj.userData.square&&obj.parent)obj=obj.parent;if(!obj||!obj.userData.square)return;const sq=obj.userData.square;
 if(selected&&legalTargets.some(m=>m.to===sq)){const moves=chess.moves({square:selected,verbose:true}).filter(m=>m.to===sq);if(moves.length){makeMove(moves[0]);return}}
 const p=chess.get(sq);if(p&&p.color===chess.turn()){selected=sq;legalTargets=chess.moves({square:sq,verbose:true});renderPieces()}else{selected=null;legalTargets=[];renderPieces()}
}
async function makeMove(move){
 if(clockFinished||animationBusy)return;if(onlineMode&&(roomStateStatus!=="playing"||roomSeat!==chess.turn()))return;unlockGameAudio();const movingObject=pieceObjects.get(move.from);const movingGhost=movingObject?movingObject.clone(true):null;const startPosition=movingObject?movingObject.position.clone():null;const capturedBefore=chess.get(move.to);startClock();const made=chess.move({from:move.from,to:move.to,promotion:move.promotion||"q"});if(!made)return;if(capturedBefore){capturedPieces[made.color].push({type:capturedBefore.type,color:capturedBefore.color});renderCaptured()}playSound(made.flags.includes("k")||made.flags.includes("q")?"castle":made.captured?"capture":"move");lastMove=made;selected=null;legalTargets=[];renderPieces();renderHistory();animateMoveVisual(movingGhost,startPosition,move.to,capturedBefore);
 if(onlineMode){try{const result=chess.isGameOver()?(chess.isCheckmate()?(chess.turn()==="w"?"Black wins by checkmate":"White wins by checkmate"):chess.isDraw()?"Draw":"Game over"):null;const data=await roomApi({action:"move",code:roomCode,token:roomToken,fen:chess.fen(),pgn:chess.pgn(),result});await applyRoomSnapshot(data.room)}catch(e){toast(e.message);await syncRoomSnapshot()}return}
 if(chess.isGameOver()){if(clockInterval)clearInterval(clockInterval);clockInterval=null;clockStarted=false;clockActive=null;renderClocks();updateStatus();toast(chess.isCheckmate()?"Checkmate!":chess.isDraw()?"Game drawn.":"Game over.");return}switchClockTurn();if(mode==="computer"&&chess.turn()==="b"){busy=true;setTimeout(()=>{computerMove();busy=false},380)}
}
function computerMove(){
 if(chess.isGameOver()||mode!=="computer"||onlineMode||chess.turn()!=="b")return;if(animationBusy){setTimeout(computerMove,100);return}const moves=chess.moves({verbose:true});if(!moves.length)return;let best=[];
 const difficulty=$("difficulty").value;
 for(const m of moves){let score=Math.random()*(difficulty==="easy"?8:difficulty==="medium"?3:.5);if(m.captured)score+=pieceValues[m.captured]* (difficulty==="easy"?.4:1);if(m.san.includes("#"))score+=1000;if(m.san.includes("+"))score+=difficulty==="hard"?1.2:.4;const test=new Chess(chess.fen());test.move(m);if(test.isCheckmate())score+=200;if(difficulty!=="easy"&&m.captured){const after=new Chess(test.fen());if(after.isCheck())score-=.1}best.push({m,score})}
 best.sort((a,b)=>b.score-a.score);makeMove(best[0].m)
}
function updateStatus(){
 const turn=chess.turn()==="w"?"White":"Black";let status=turn+" to move";if(chess.isCheckmate())status="Checkmate — "+(chess.turn()==="w"?"Black":"White")+" wins";else if(chess.isStalemate())status="Draw — stalemate";else if(chess.isThreefoldRepetition())status="Draw — repetition";else if(chess.isDraw())status="Draw";else if(chess.isCheck())status+=" · Check";
 $("status").textContent=status;$("turn-chip").textContent=chess.isGameOver()?"GAME OVER":turn.toUpperCase();$("move-count").textContent="MOVE "+(Math.floor(chess.history().length/2)+1);$("last-move").textContent=lastMove?lastMove.san+" · "+lastMove.from+" → "+lastMove.to:"No moves yet";
}
function animateMoveVisual(ghost,startPosition,toSquare,capturedPiece){
 if(!ghost||!startPosition)return;
 animationBusy=true;
 const destination=squarePos(toSquare);destination.y=.24;
 ghost.position.copy(startPosition);ghost.scale.multiplyScalar(1.001);piecesGroup.add(ghost);
 const target=pieceObjects.get(toSquare);if(target)target.visible=false;
 const from=performance.now(),duration=capturedPiece?420:300;
 const start=startPosition.clone();
 const ease=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
 const tick=now=>{const t=Math.min(1,(now-from)/duration),e=ease(t);ghost.position.lerpVectors(start,destination,e);ghost.position.y=.24+Math.sin(Math.PI*t)*(capturedPiece?.18:.12);ghost.rotation.y+=(capturedPiece?.08:.025);if(t<1){requestAnimationFrame(tick);return}piecesGroup.remove(ghost);ghost.traverse(o=>{if(o.isMesh){o.geometry?.dispose();if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else o.material?.dispose()}});if(target)target.visible=true;animationBusy=false;};
 requestAnimationFrame(tick);
}
function renderCaptured(){
 const glyphs={p:"♟",n:"♞",b:"♝",r:"♜",q:"♛",k:"♚"};
 const white=capturedPieces.w.map(p=>p.color==="b"?glyphs[p.type]:glyphs[p.type].replace("♟","♙")).join(" ")||"—";
 const black=capturedPieces.b.map(p=>p.color==="w"?({p:"♙",n:"♘",b:"♗",r:"♖",q:"♕",k:"♔"}[p.type]):glyphs[p.type]).join(" ")||"—";
 if($("white-captured"))$("white-captured").textContent=white;
 if($("black-captured"))$("black-captured").textContent=black;
}
function renderHistory(){
 const hist=chess.history({verbose:true});const root=$("move-list");if(!hist.length){root.innerHTML='<div class="empty-moves">Your moves will appear here.</div>';return}
 let html="";for(let i=0;i<hist.length;i+=2){html+='<div class="move-row"><span class="move-no">'+(Math.floor(i/2)+1)+'.</span><span>'+(hist[i]?.san||"")+'</span><span>'+(hist[i+1]?.san||"")+'</span></div>'}root.innerHTML=html;root.scrollTop=root.scrollHeight;updateStatus()
}
function resetGame(){chess.reset();selected=null;legalTargets=[];lastMove=null;busy=false;capturedPieces={w:[],b:[]};resetClock();renderPieces();renderHistory();renderCaptured()}
function fitCustomPrototype(root){
 root.updateWorldMatrix(true,true);
 const baked=new THREE.Group();
 root.traverse(node=>{
  if(!node.isMesh||!node.geometry)return;
  const geometry=node.geometry.clone();
  geometry.applyMatrix4(node.matrixWorld);
  const material=Array.isArray(node.material)?node.material.map(m=>m.clone()):node.material.clone();
  const mesh=new THREE.Mesh(geometry,material);
  mesh.castShadow=true;mesh.receiveShadow=true;
  baked.add(mesh);
 });
 baked.updateMatrixWorld(true);
 let box=new THREE.Box3().setFromObject(baked),size=box.getSize(new THREE.Vector3());
 const max=Math.max(size.x,size.y,size.z);
 if(!isFinite(max)||max<.0001)return baked;
 const center=box.getCenter(new THREE.Vector3());
 const scale=(1/max),bottom=box.min.y;
 baked.traverse(node=>{
  if(node.isMesh&&node.geometry){
   node.geometry.translate(-center.x,-bottom,-center.z);
   node.geometry.scale(scale,scale,scale);
  }
 });
 baked.position.set(0,0,0);
 baked.updateMatrixWorld(true);
 return baked
}
function parseGLBBuffer(buffer, displayName="custom chess set"){
 $("upload-state").textContent="Loading "+displayName+"…";
 new GLTFLoader().parse(buffer,"",gltf=>{
  customRoot=gltf.scene;customPrototypes.clear();loadedNames=[];customRoot.updateMatrixWorld(true);
  customRoot.traverse(node=>{
   if(!node.name||node.name.toLowerCase()==="chessboard")return;
   const found=NAMES.find(n=>n.toLowerCase()===node.name.toLowerCase());
   if(found&&(node.isMesh||node.children.length)){
    const prototype=fitCustomPrototype(node);customPrototypes.set(found,prototype);loadedNames.push(found);
   }
  });
  if(!customPrototypes.size){customRoot.traverse(node=>{if(node.isMesh&&node.name&&node.name.toLowerCase()!=="chessboard"){const prototype=fitCustomPrototype(node);customPrototypes.set(node.name,prototype);loadedNames.push(node.name)}})}
  $("upload-state").textContent="Loaded your chess set · ready to play";renderPieces();
  if(customPrototypes.size)toast("Your chess set loaded automatically.");else toast("GLB loaded, but piece names were not detected.");
 },err=>{console.error(err);$("upload-state").textContent="Could not read this GLB file.";toast("GLB import failed. Check that it is a binary GLB.")});
}
async function loadDefaultGLB(){
 try{
  $("upload-state").textContent="Loading your default chess set…";
  const response=await fetch("/chess-set.glb",{cache:"no-cache"});
  if(!response.ok)throw new Error("Default chess model not found");
  const buffer=await response.arrayBuffer();parseGLBBuffer(buffer,"your chess set");
 }catch(error){console.error("Default chess GLB could not be loaded",error);$("upload-state").textContent="Using the built-in 3D chess set (custom model unavailable)";}
}
function showPieceNames(){ /* Piece-name list intentionally removed from the game UI. */ }
document.querySelectorAll(".mode-option").forEach(btn=>btn.addEventListener("click",()=>{unlockGameAudio();onlineMode=false;roomStateStatus="waiting";mode=btn.dataset.mode;document.querySelectorAll(".mode-option").forEach(b=>b.classList.toggle("active",b===btn));$("difficulty").disabled=mode!=="computer";$("difficulty").style.opacity=mode==="computer"?"1":".45";$("undo-btn").disabled=false;resetGame();toast(mode==="friend"?"Local two-player mode selected.":"Computer opponent selected.")}));
$("drop-zone").addEventListener("dragleave",()=>$("drop-zone").classList.remove("drag"));
// Piece-name UI intentionally removed.
$("undo-btn").addEventListener("click",()=>{if(onlineMode){toast("Undo is disabled in online matches.");return}if(!chess.history().length)return;chess.undo();if(mode==="computer"&&chess.turn()==="b"&&chess.history().length)chess.undo();lastMove=chess.history({verbose:true}).slice(-1)[0]||null;selected=null;legalTargets=[];resetClock();renderPieces();renderHistory()});
$("reset-btn").addEventListener("click",()=>{if(onlineMode){toast("To start a new online game, create a new room.");return}resetGame()});
// Fixed camera and board orientation.
document.querySelectorAll(".clock-preset").forEach(btn=>btn.addEventListener("click",()=>{if(onlineMode){toast("Time control is fixed for this room. Create a new room to change it.");return}clockMinutes=Number(btn.dataset.minutes);resetGame();toast(clockMinutes===5?"5-minute Blitz selected.":"10-minute Rapid selected.")}));
$("copy-pgn").addEventListener("click",async()=>{try{await navigator.clipboard.writeText(chess.pgn());toast("PGN copied to clipboard.")}catch(e){toast("Clipboard access unavailable.")}});
$("create-room").addEventListener("click",createOnlineRoom);
$("join-room").addEventListener("click",joinOnlineRoom);
$("room-code-input").addEventListener("keydown",e=>{if(e.key==="Enter")joinOnlineRoom()});
$("share-room").addEventListener("click",async()=>{if(!roomCode)return;const inviteUrl=new URL(location.href);inviteUrl.searchParams.set("room",roomCode);const link=inviteUrl.toString();try{await navigator.clipboard.writeText(link);toast("Invite link copied. Send it to your friend.")}catch(e){$("room-code-input").value=roomCode;toast("Copy this room code and send it to your friend: "+roomCode)}});
init();resetClock();renderHistory();loadDefaultGLB();
const inviteCode=new URLSearchParams(location.search).get("room");if(inviteCode){$("room-code-input").value=inviteCode.toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,8);setRoomStatus("Invite link detected. Click Join to enter your friend's room.");try{const identity=JSON.parse(localStorage.getItem("chess-room-"+$("room-code-input").value)||"null");if(identity?.token){joinOnlineRoom()}}catch(e){}}