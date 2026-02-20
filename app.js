import{initializeApp}from"https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import{getAuth,signInAnonymously}from"https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import{getFirestore,collection,query,where,getDocs,addDoc,updateDoc,doc,onSnapshot,getDoc,arrayUnion}from"https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const FC={apiKey:"AIzaSyBAloQE7GiygKpOg_M5WU3jwP2Xd4yHCbw",authDomain:"yutnori-bc2d0.firebaseapp.com",projectId:"yutnori-bc2d0",storageBucket:"yutnori-bc2d0.firebasestorage.app",messagingSenderId:"1067759084491",appId:"1:1067759084491:web:2fd82f415030c31a440c4e"};
const fbApp=initializeApp(FC),auth=getAuth(fbApp),fdb=getFirestore(fbApp);

const $=id=>document.getElementById(id);
const lobbyEl=$("lobby"),gameEl=$("game");
const findBtn=$("find-btn"),statusMsg=$("status-msg"),gameStatusMsg=$("game-status-msg");
const resultBox=$("result-box"),rollBtn=$("roll-btn"),skillsArea=$("skills-area");
const timerWrap=$("timer-wrap"),timerBar=$("timer-bar"),timerText=$("timer-text");
const boardEl=$("board"),boardSvg=$("board-svg");
const myPcsEl=$("my-pcs"),oppPcsEl=$("opp-pcs");
const fxOverlay=$("fx-overlay"),targetBanner=$("target-banner"),cancelTarget=$("cancel-target");
const roomInfo=$("room-info"),p1Name=$("p1-name"),p2Name=$("p2-name");
const backLobbyBtn=$("back-lobby-btn");
// 채팅
const chatToggle=$("chat-toggle"),chatBadge=$("chat-badge"),chatPanel=$("chat-panel");
const chatClose=$("chat-close"),chatMsgs=$("chat-msgs"),chatInput=$("chat-input"),chatSend=$("chat-send");

const GOAL=99;
let matchId=null,busy=false,activeSkill=null,turnTmr=null,tLeft=0;
let targetMode=null,lastMatch=null,unsubMatch=null;
let chatOpen=false,lastChatLen=0,unreadChat=0;
let presenceInterval=null; // 상대 퇴장 감지용

// ============================================================
// 윷판 좌표 + 경로
// ============================================================
const W=320,PAD=28;
const CN=[[PAD,W-PAD],[W-PAD,W-PAD],[W-PAD,PAD],[PAD,PAD]];
const NP={};
for(let s=0;s<4;s++){const[fx,fy]=CN[s],[tx,ty]=CN[(s+1)%4];for(let i=0;i<5;i++)NP[s*5+i]=[fx+(tx-fx)*i/5,fy+(ty-fy)*i/5];}
const cx=W/2,cy=W/2,Lr=(a,b,t)=>a+(b-a)*t;
NP[20]=[Lr(CN[1][0],cx,.33),Lr(CN[1][1],cy,.33)];NP[21]=[Lr(CN[1][0],cx,.66),Lr(CN[1][1],cy,.66)];
NP[22]=[cx,cy];NP[23]=[Lr(cx,CN[3][0],.33),Lr(cy,CN[3][1],.33)];NP[24]=[Lr(cx,CN[3][0],.66),Lr(cy,CN[3][1],.66)];
NP[25]=[Lr(CN[2][0],cx,.33),Lr(CN[2][1],cy,.33)];NP[26]=[Lr(CN[2][0],cx,.66),Lr(CN[2][1],cy,.66)];
NP[27]=[Lr(cx,CN[0][0],.33),Lr(cy,CN[0][1],.33)];NP[28]=[Lr(cx,CN[0][0],.66),Lr(cy,CN[0][1],.66)];

const ROUTES={outer:[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,GOAL],dA:[0,1,2,3,4,5,20,21,22,23,24,15,16,17,18,19,GOAL],dB:[0,1,2,3,4,5,6,7,8,9,10,25,26,22,27,28,GOAL],dAB:[0,1,2,3,4,5,20,21,22,27,28,GOAL]};
function getRoute(r){return ROUTES[r]||ROUTES.outer}
function advance(pc,steps){
  if(pc.f)return pc;const p=getRoute(pc.r);let ci=p.indexOf(pc.n);
  if(pc.n===-1){if(steps<=0)return pc;return{...pc,n:p[Math.min(steps,p.length-1)],r:switchR(pc.r,p[Math.min(steps,p.length-1)])};}
  if(ci===-1)ci=0;let ni=ci+steps;if(ni<0)ni=0;
  if(ni>=p.length-1)return{...pc,n:GOAL,f:true};
  const nn=p[ni],nr=switchR(pc.r,nn);
  if(nr!==pc.r){const np=getRoute(nr);const nci=np.indexOf(nn);if(nci!==-1)return{...pc,n:nn,r:nr};}
  return{...pc,n:nn,r:pc.r};
}
function switchR(c,n){if(c==="outer"&&n===5)return"dA";if(c==="outer"&&n===10)return"dB";if(c==="dA"&&n===22)return"dAB";return c;}
function canMv(pc,i,mv,all){if(pc.f)return false;if(mv===0)return false;if(pc.n===-1&&mv<=0)return false;for(let j=0;j<all.length;j++)if(j!==i&&all[j].s.includes(i))return false;if(pc.n===-1)return mv>0;const p=getRoute(pc.r);const ci=p.indexOf(pc.n);return ci+mv>=0;}

const YS=[{id:"pigTime",nm:"개돼지시간",em:"🐷",ds:"도+개 등록",cl:"bg-pink-700"},{id:"power100",nm:"100마력",em:"⚡",ds:"걸 확정",cl:"bg-purple-700"},{id:"reverse",nm:"후진기어",em:"⏪",ds:"빽도 확정",cl:"bg-red-700"},{id:"double",nm:"더블더블",em:"✖️",ds:"결과 2배",cl:"bg-orange-700"},{id:"moOrDo",nm:"모아니면도",em:"🎰",ds:"모50/도50",cl:"bg-teal-700"},{id:"midas",nm:"마이더스의손",em:"👑",ds:"윷50/모50",cl:"bg-yellow-700"},{id:"takeOut",nm:"테이크아웃",em:"📦",ds:"다음턴 사용",cl:"bg-cyan-700"},{id:"backStep",nm:"백스텝",em:"🔙",ds:"뒤로 이동",cl:"bg-gray-600"}];
const PS=[{id:"goHome",nm:"강제귀가",em:"🏠",ds:"상대→출발",tgt:"oppPiece",cl:"bg-amber-800"},{id:"carry",nm:"엎고가실게요",em:"🎒",ds:"대기말 업기",tgt:"myPiece",cl:"bg-amber-800"},{id:"swap",nm:"자리교환",em:"🔄",ds:"말 위치교환",tgt:"oppPiece",cl:"bg-amber-800"},{id:"frontPlz",nm:"제앞에놔주세요",em:"📍",ds:"상대 앞 소환",tgt:"oppPiece",cl:"bg-amber-800"},{id:"backHug",nm:"백허그",em:"🤗",ds:"상대 뒤이동",tgt:"oppPiece",cl:"bg-amber-800"},{id:"flipTable",nm:"밥상뒤집기",em:"🍽️",ds:"모두 랜덤",tgt:null,cl:"bg-amber-800"},{id:"bomb",nm:"폭발물주의",em:"💣",ds:"폭탄 설치",tgt:"node",cl:"bg-amber-800"},{id:"gate",nm:"코앞이네",em:"🚪",ds:"게이트 설치",tgt:"node",cl:"bg-amber-800"}];
function pickSkills(){const y=[...YS].sort(()=>Math.random()-.5)[0],p=[...PS].sort(()=>Math.random()-.5)[0];return[{...y,used:false,type:"yut"},{...p,used:false,type:"piece"}];}
function initPcs(){return[0,1,2,3].map(()=>({n:-1,r:"outer",f:false,s:[]}))}
function ser(pcs){return pcs.map(p=>({n:p.n,r:p.r,f:p.f,s:p.s}))}
function des(arr){if(!arr)return initPcs();return(Array.isArray(arr)?arr:Object.values(arr)).map(p=>({n:p.n??-1,r:p.r??"outer",f:p.f??false,s:p.s??[]}))}

// ============================================================
// 1. 로그인
// ============================================================
signInAnonymously(auth).then(()=>{
  const uid=auth.currentUser.uid;
  statusMsg.classList.remove("animate-pulse");
  statusMsg.innerHTML=`<span class="text-green-400 font-bold">접속 완료!</span> <span class="text-xs text-gray-600">${uid.slice(0,6)}</span>`;
  findBtn.classList.remove("hidden");
}).catch(()=>{statusMsg.innerHTML=`<span class="text-red-400">접속 실패</span>`});

// ============================================================
// 2. 매칭
// ============================================================
findBtn.addEventListener("click",async()=>{
  findBtn.disabled=true;findBtn.style.opacity=".5";
  statusMsg.innerHTML=`<span class="text-yellow-400 animate-pulse">매칭 중...</span>`;
  const uid=auth.currentUser.uid;
  const ref=collection(fdb,"matches"),q=query(ref,where("status","==","waiting"));
  try{
    const snap=await getDocs(q);let ok=false;
    for(const d of snap.docs){if(d.data().player1===uid)continue;
      matchId=d.id;
      await updateDoc(doc(fdb,"matches",matchId),{player2:uid,status:"playing",
        [`pcs.${uid}`]:ser(initPcs()),[`sk.${uid}`]:pickSkills(),
        [`alive.${uid}`]:Date.now()});
      ok=true;startGame(matchId);break;}
    if(!ok){
      const m=await addDoc(ref,{status:"waiting",player1:uid,player2:null,cur:uid,
        yut:null,pcs:{[uid]:ser(initPcs())},sk:{[uid]:pickSkills()},
        bombs:[],gates:[],saved:null,ts:Date.now(),
        alive:{[uid]:Date.now()},chat:[]});
      matchId=m.id;
      startGame(matchId);}
  }catch(e){console.error(e);statusMsg.innerHTML=`<span class="text-red-400">매칭 오류</span>`;findBtn.disabled=false;findBtn.style.opacity="1";}
});

// ============================================================
// 3. 게임 실시간 감지
// ============================================================
function startGame(mid){
  if(unsubMatch)unsubMatch();
  startPresence(mid);
  chatToggle.classList.remove("hidden");
  lastChatLen=0;unreadChat=0;updateBadge();

  unsubMatch=onSnapshot(doc(fdb,"matches",mid),snap=>{
    if(!snap.exists())return;
    const m=snap.data();lastMatch=m;
    const uid=auth.currentUser.uid;

    // 채팅 업데이트
    renderChat(m);

    if(m.status==="waiting"){
      lobbyEl.classList.remove("hidden");gameEl.classList.add("hidden");
      statusMsg.innerHTML=`<span class="text-indigo-300 animate-pulse">상대 대기 중... ⏳</span>`;
      return;
    }

    // 퇴장 감지
    if(m.status==="playing"){
      const opp=m.player1===uid?m.player2:m.player1;
      if(m.status==="playing"&&m.left===opp){
        gameStatusMsg.innerHTML=`<span class="text-2xl font-black text-yellow-400">🏆 상대 퇴장! 승리!</span>`;
        rollBtn.disabled=true;rollBtn.classList.add("hidden");stopTimer();stopPresence();
        backLobbyBtn.classList.remove("hidden");
        renderAll(m);return;
      }
    }

    lobbyEl.classList.add("hidden");gameEl.classList.remove("hidden");

    const amP1=m.player1===uid;
    p1Name.textContent=amP1?"나":"상대";p2Name.textContent=amP1?"상대":"나";
    p1Name.className=amP1?"text-indigo-300 font-bold":"text-red-300";
    p2Name.className=!amP1?"text-red-300 font-bold":"text-indigo-300";
    roomInfo.textContent=`방: ${mid.slice(0,6)}`;

    const me=m.cur===uid,hasY=m.yut!=null;
    const myP=des(m.pcs?.[uid]);

    if(m.status==="finished"){
      const win=myP.every(p=>p.f);
      gameStatusMsg.innerHTML=`<span class="text-3xl font-black ${win?'text-yellow-400':'text-red-400'}">${win?'🏆 승리!':'💀 패배...'}</span>`;
      rollBtn.disabled=true;rollBtn.classList.add("hidden");stopTimer();stopPresence();
      backLobbyBtn.classList.remove("hidden");
      renderAll(m);return;
    }

    backLobbyBtn.classList.add("hidden");

    if(me&&!hasY){
      if(m.saved){gameStatusMsg.innerHTML=`<span class="text-purple-400 font-bold">📦 저장된 결과 적용!</span>`;rollBtn.disabled=true;applySaved(m);}
      else{gameStatusMsg.innerHTML=`<span class="text-green-400 font-bold">🔥 윷을 던지세요!</span>`;rollBtn.disabled=false;startTimer("throw");}
    }else if(me&&hasY){
      const mv=m.yut.value;
      if(!myP.some((p,i)=>canMv(p,i,mv,myP))){gameStatusMsg.innerHTML=`<span class="text-red-400 font-bold">이동 불가!</span>`;rollBtn.disabled=true;stopTimer();autoSkip(m);}
      else{gameStatusMsg.innerHTML=`<span class="text-yellow-300 font-bold">👆 말 선택!</span>`;rollBtn.disabled=true;startTimer("move");}
    }else{gameStatusMsg.innerHTML=`<span class="text-gray-400">⏳ 상대 턴...</span>`;rollBtn.disabled=true;stopTimer();}

    if(hasY){const y=m.yut,big=Math.abs(y.value)>=4;
      resultBox.innerHTML=`<span class="yut-result-text ${big?'big':''}" style="color:${yutClr(y)}">${y.name}! (${y.value>0?'+':''}${y.value})</span>`;
      resultBox.classList.toggle("fx-glow-yut",big);if(big)showFx(y.name+"!!");}
    else{resultBox.innerHTML=`<span class="text-gray-500">🎲 대기 중</span>`;resultBox.classList.remove("fx-glow-yut");}
    renderAll(m);
  });
}

// ============================================================
// 4. 퇴장 감지 (Presence)
// ============================================================
function startPresence(mid){
  stopPresence();
  // 5초마다 alive 타임스탬프 갱신
  const tick=async()=>{
    if(!matchId)return;
    const uid=auth.currentUser?.uid;if(!uid)return;
    try{await updateDoc(doc(fdb,"matches",mid),{[`alive.${uid}`]:Date.now()});}catch(e){}
  };
  tick();
  presenceInterval=setInterval(tick,5000);

  // 페이지 떠날 때 left 필드 기록
  window._leaveHandler=async()=>{
    if(!matchId)return;
    const uid=auth.currentUser?.uid;if(!uid)return;
    try{await updateDoc(doc(fdb,"matches",matchId),{left:uid});}catch(e){}
  };
  window.addEventListener("beforeunload",window._leaveHandler);
}

function stopPresence(){
  if(presenceInterval){clearInterval(presenceInterval);presenceInterval=null;}
  if(window._leaveHandler){window.removeEventListener("beforeunload",window._leaveHandler);window._leaveHandler=null;}
}

backLobbyBtn.addEventListener("click",async()=>{
  // 나갈 때 left 기록
  if(matchId&&auth.currentUser){
    try{await updateDoc(doc(fdb,"matches",matchId),{left:auth.currentUser.uid});}catch(e){}
  }
  if(unsubMatch)unsubMatch();
  stopPresence();
  matchId=null;lastMatch=null;
  rollBtn.classList.remove("hidden");rollBtn.disabled=true;
  findBtn.disabled=false;findBtn.style.opacity="1";
  statusMsg.innerHTML="대전을 시작하세요!";
  gameEl.classList.add("hidden");lobbyEl.classList.remove("hidden");
  chatToggle.classList.add("hidden");chatPanel.classList.remove("open");
});

// ============================================================
// 5. 채팅
// ============================================================
chatToggle.addEventListener("click",()=>{chatOpen=!chatOpen;chatPanel.classList.toggle("open",chatOpen);if(chatOpen){unreadChat=0;updateBadge();chatMsgs.scrollTop=chatMsgs.scrollHeight;chatInput.focus();}});
chatClose.addEventListener("click",()=>{chatOpen=false;chatPanel.classList.remove("open");});

chatSend.addEventListener("click",sendChat);
chatInput.addEventListener("keydown",e=>{if(e.key==="Enter")sendChat();});

async function sendChat(){
  const txt=chatInput.value.trim();if(!txt||!matchId)return;
  chatInput.value="";
  const uid=auth.currentUser.uid;
  const msg={uid,text:txt.slice(0,100),ts:Date.now()};
  try{await updateDoc(doc(fdb,"matches",matchId),{chat:arrayUnion(msg)});}catch(e){console.error(e);}
}

function renderChat(m){
  const msgs=m.chat||[];
  const uid=auth.currentUser.uid;

  // 새 메시지 알림
  if(msgs.length>lastChatLen){
    const newMsgs=msgs.slice(lastChatLen);
    const oppNew=newMsgs.filter(msg=>msg.uid!==uid);
    if(oppNew.length>0&&!chatOpen){
      unreadChat+=oppNew.length;
      updateBadge();
      // 토스트 알림
      showToast(`💬 ${oppNew[oppNew.length-1].text.slice(0,20)}${oppNew[oppNew.length-1].text.length>20?'...':''}`);
    }
  }
  lastChatLen=msgs.length;

  // 렌더
  chatMsgs.innerHTML="";
  if(msgs.length===0){
    chatMsgs.innerHTML=`<div class="chat-msg sys">채팅을 시작하세요!</div>`;
    return;
  }
  msgs.forEach(msg=>{
    const div=document.createElement("div");
    const isMe=msg.uid===uid;
    div.className=`chat-msg ${isMe?'me':'opp'}`;
    div.textContent=msg.text;
    chatMsgs.appendChild(div);
  });
  // 자동 스크롤 (열려있을 때)
  if(chatOpen)chatMsgs.scrollTop=chatMsgs.scrollHeight;
}

function updateBadge(){
  if(unreadChat>0){chatBadge.style.display="flex";chatBadge.textContent=unreadChat>9?"9+":unreadChat;}
  else{chatBadge.style.display="none";}
}

// ============================================================
// 6. 타이머 / 윷 / 이동 (기존 로직)
// ============================================================
function yutClr(y){return y.value>=4?"#ffd23f":y.value<0?"#ef4444":"#c4b5fd";}

async function applySaved(m){if(busy)return;busy=true;try{await updateDoc(doc(fdb,"matches",matchId),{yut:m.saved,saved:null});}catch(e){console.error(e);}finally{busy=false;}}
async function autoSkip(m){if(busy)return;
  const uid=auth.currentUser.uid,opp=m.player1===uid?m.player2:m.player1;
  if(!opp){console.warn("autoSkip: no opponent");return;}
  busy=true;
  setTimeout(async()=>{try{await updateDoc(doc(fdb,"matches",matchId),{cur:opp,yut:null,ts:Date.now()});}catch(e){console.error(e);}finally{busy=false;}},1200);}

const TSEC=15;
function startTimer(ph){stopTimer();timerWrap.classList.remove("hidden");tLeft=TSEC;updTmr();
  turnTmr=setInterval(()=>{tLeft-=.1;if(tLeft<=0){tLeft=0;stopTimer();onTO(ph);}updTmr();},100);}
function stopTimer(){if(turnTmr){clearInterval(turnTmr);turnTmr=null;}timerWrap.classList.add("hidden");}
function updTmr(){const p=Math.max(0,tLeft/TSEC*100);timerBar.style.width=p+"%";timerText.textContent=Math.ceil(tLeft);
  const w=timerWrap;w.classList.remove("timer-safe","timer-warn","timer-danger");w.classList.add(tLeft>8?"timer-safe":tLeft>4?"timer-warn":"timer-danger");
  timerText.className=`font-bold text-xs ${tLeft>8?'text-emerald-400':tLeft>4?'text-amber-400':'text-red-400'}`;}
async function onTO(ph){if(busy||!lastMatch)return;const uid=auth.currentUser.uid;if(lastMatch.cur!==uid)return;
  if(ph==="throw"){busy=true;try{
    const res=randYut();
    if(res.value===0){const opp=lastMatch.player1===uid?lastMatch.player2:lastMatch.player1;
      await updateDoc(doc(fdb,"matches",matchId),{yut:null,cur:opp,ts:Date.now()});}
    else{await updateDoc(doc(fdb,"matches",matchId),{yut:res});}
  }catch(e){console.error(e);}finally{busy=false;}}else autoSkip(lastMatch);}

function randYut(){const r=Math.random()*100;if(r<3)return{value:0,name:"낙",color:"text-gray-400"};if(r<8)return{value:-1,name:"빽도",color:"text-red-400"};if(r<28)return{value:1,name:"도",color:"text-white"};if(r<56)return{value:2,name:"개",color:"text-blue-300"};if(r<78)return{value:3,name:"걸",color:"text-purple-300"};if(r<92)return{value:4,name:"윷",color:"text-yellow-400"};return{value:5,name:"모",color:"text-yellow-400"};}
function applyYS(id){switch(id){case"pigTime":{const pick=Math.random()<.5;return pick?{value:1,name:"도🐷",color:"text-pink-300",noExtra:true}:{value:2,name:"개🐷",color:"text-pink-300",noExtra:true};}case"power100":return{value:3,name:"걸⚡",color:"text-purple-400"};case"reverse":return{value:-1,name:"빽도⏪",color:"text-red-400"};case"double":{const b=randYut();return{...b,value:b.value*2,name:b.name+"✖️2"};}case"moOrDo":return Math.random()<.5?{value:5,name:"모🎰",color:"text-yellow-400"}:{value:1,name:"도🎰",color:"text-white"};case"midas":return Math.random()<.5?{value:4,name:"윷👑",color:"text-yellow-400"}:{value:5,name:"모👑",color:"text-yellow-400"};case"takeOut":{const b=randYut();return{...b,isTakeOut:true};}case"backStep":{const b=randYut();return{value:-Math.abs(b.value),name:b.name+"🔙",color:"text-gray-300"};}default:return randYut();}}

rollBtn.addEventListener("click",async()=>{
  if(!matchId||busy)return;busy=true;rollBtn.disabled=true;stopTimer();
  resultBox.innerHTML=`<span class="text-2xl animate-spin inline-block">🎲</span>`;
  boardEl.classList.add("fx-shake");setTimeout(()=>boardEl.classList.remove("fx-shake"),400);
  setTimeout(async()=>{try{let res;const u={};
    if(activeSkill){res=applyYS(activeSkill);const uid=auth.currentUser.uid;
      const ms=await getDoc(doc(fdb,"matches",matchId));if(ms.exists()){const sk=[...(ms.data().sk?.[uid]||[])];
        const si=sk.findIndex(s=>s.id===activeSkill&&!s.used);if(si!==-1){sk[si]={...sk[si],used:true};u[`sk.${uid}`]=sk;}}
      showToast(`${res.name} 발동!`);activeSkill=null;}else{res=randYut();}
    if(res.isTakeOut){const uid=auth.currentUser.uid,opp=lastMatch.player1===uid?lastMatch.player2:lastMatch.player1;
      u.saved=res;u.yut=null;u.cur=opp;u.ts=Date.now();showToast("📦 테이크아웃!");}
    else if(res.value===0){const uid=auth.currentUser.uid,opp=lastMatch.player1===uid?lastMatch.player2:lastMatch.player1;
      u.yut=null;u.cur=opp;u.ts=Date.now();showToast("낙! 턴 넘김");}
    else{u.yut=res;}
    await updateDoc(doc(fdb,"matches",matchId),u);}catch(e){console.error(e);rollBtn.disabled=false;}finally{busy=false;}},700);
});

// ============================================================
// 스킬 렌더링
// ============================================================
function renderSkills(m){
  const uid=auth.currentUser.uid,me=m.cur===uid,hasY=m.yut!=null;
  const sks=m.sk?.[uid]||[];skillsArea.innerHTML="";
  sks.forEach((sk,i)=>{const btn=document.createElement("button");
    const canY=me&&!hasY&&!sk.used&&sk.type==="yut"&&m.status==="playing";
    const canP=me&&!sk.used&&sk.type==="piece"&&m.status==="playing";const can=canY||canP;
    btn.className=`skill-card flex-1 py-2 px-2 rounded-xl text-white text-xs font-bold ${sk.cl} ${sk.used?'used':''} ${!can&&!sk.used?'opacity-50':''} ${activeSkill===sk.id?'active':''}`;
    btn.innerHTML=`${sk.em} ${sk.nm}<br><span class="font-normal opacity-70 text-[10px]">${sk.ds}</span>`;
    if(can)btn.onclick=()=>onSkill(sk,i,m);else btn.disabled=true;
    skillsArea.appendChild(btn);});
}
function onSkill(sk,i,m){
  if(sk.type==="yut"){activeSkill=activeSkill===sk.id?null:sk.id;
    gameStatusMsg.innerHTML=activeSkill?`<span class="text-purple-400 font-bold">${sk.em} ${sk.nm} 장전!</span>`:`<span class="text-green-400 font-bold">🔥 윷을 던지세요!</span>`;renderSkills(m);}
  else{if(sk.tgt){targetMode={skillId:sk.id,skillIdx:i,need:sk.tgt,sk};document.body.classList.add("target-mode");
    gameStatusMsg.innerHTML=`<span class="text-yellow-300 font-bold">👆 ${sk.tgt==='oppPiece'?'상대 말':sk.tgt==='myPiece'?'내 말':'칸'} 선택</span>`;renderAll(m);}
    else execPS(sk,i,m,null);}
}
cancelTarget.addEventListener("click",()=>{targetMode=null;document.body.classList.remove("target-mode");if(lastMatch)renderAll(lastMatch);});

async function execPS(sk,idx,m,target){
  if(busy)return;busy=true;targetMode=null;document.body.classList.remove("target-mode");
  const uid=auth.currentUser.uid,opp=m.player1===uid?m.player2:m.player1;
  const myP=des(m.pcs?.[uid]),opP=des(m.pcs?.[opp]);
  const sks=[...(m.sk[uid]||[])];sks[idx]={...sks[idx],used:true};const u={[`sk.${uid}`]:sks};let msg="";
  switch(sk.id){
    case"goHome":if(target!=null&&!opP[target].f&&opP[target].n>0){opP[target].s.forEach(si=>{opP[si]={n:-1,r:"outer",f:false,s:[]};});opP[target]={n:-1,r:"outer",f:false,s:[]};u[`pcs.${opp}`]=ser(opP);msg=`🏠 강제 귀가!`;}break;
    case"carry":if(target!=null&&myP[target].n>0&&!myP[target].f){const w=myP.findIndex((p,i)=>{if(p.n!==-1||p.f||i===target)return false;let stacked=false;myP.forEach((o,j)=>{if(j!==i&&o.s.includes(i))stacked=true;});return!stacked;});if(w!==-1){myP[target].s=[...myP[target].s,w];u[`pcs.${uid}`]=ser(myP);msg=`🎒 업기!`;}}break;
    case"swap":if(target!=null&&!opP[target].f&&opP[target].n>0){const myOn=myP.filter(p=>p.n>0&&!p.f);if(myOn.length){const mi=myP.indexOf(myOn[0]);const tn=myP[mi].n,tr=myP[mi].r;myP[mi]={...myP[mi],n:opP[target].n,r:opP[target].r};opP[target]={...opP[target],n:tn,r:tr};u[`pcs.${uid}`]=ser(myP);u[`pcs.${opp}`]=ser(opP);msg=`🔄 교환!`;}}break;
    case"frontPlz":if(target!=null&&!opP[target].f&&opP[target].n>0){const myOn=myP.filter(p=>p.n>0&&!p.f).sort((a,b)=>b.n-a.n);if(myOn.length){const ah=myOn[0];const pa=getRoute(ah.r);const ci=pa.indexOf(ah.n);const nn=ci>=3?pa[ci-Math.floor(Math.random()*3)-1]:pa[Math.max(0,ci-1)];opP[target]={...opP[target],n:nn,r:ah.r};u[`pcs.${opp}`]=ser(opP);msg=`📍 소환!`;}}break;
    case"backHug":if(target!=null&&!opP[target].f&&opP[target].n>0){const mp=myP.filter(p=>!p.f);if(mp.length){const mi=myP.indexOf(mp[0]);const pa=getRoute(opP[target].r);const ci=pa.indexOf(opP[target].n);myP[mi]={...myP[mi],n:ci>0?pa[ci-1]:pa[0],r:opP[target].r};u[`pcs.${uid}`]=ser(myP);msg=`🤗 백허그!`;}}break;
    case"flipTable":{const ns=[1,2,3,4,6,7,8,9,11,12,13,14,16,17,18,19,20,21,23,24,25,26,27,28];myP.forEach((p,i)=>{if(p.n>0&&!p.f)myP[i]={...p,n:ns[Math.floor(Math.random()*ns.length)],s:[]};});opP.forEach((p,i)=>{if(p.n>0&&!p.f)opP[i]={...p,n:ns[Math.floor(Math.random()*ns.length)],s:[]};});u[`pcs.${uid}`]=ser(myP);u[`pcs.${opp}`]=ser(opP);msg="🍽️ 밥상뒤집기!";break;}
    case"bomb":if(target!=null){u.bombs=[...(m.bombs||[]),target];msg=`💣 폭탄!`;}break;
    case"gate":if(target!=null){u.gates=[...(m.gates||[]),target];msg=`🚪 게이트!`;}break;
  }
  try{await updateDoc(doc(fdb,"matches",matchId),u);if(msg){showToast(msg);showFx(sk.em);}}catch(e){console.error(e);}finally{busy=false;}
}

// ============================================================
// 말 이동
// ============================================================
async function doMove(pi,mv,m){
  if(busy)return;busy=true;stopTimer();
  const uid=auth.currentUser.uid,opp=m.player1===uid?m.player2:m.player1;
  const myP=des(m.pcs?.[uid]),opP=des(m.pcs?.[opp]);const bombs=[...(m.bombs||[])],gates=[...(m.gates||[])];
  let pc=myP[pi];if(pc.n===-1&&mv>0){pc.n=0;pc.r="outer";}
  const moved=advance(pc,mv);myP[pi]=moved;
  pc.s.forEach(si=>{myP[si]={...myP[si],n:moved.n,r:moved.r,f:moved.f};});
  let extra=false,msg="";
  if((mv===4||mv===5)&&!m.yut?.noExtra)extra=true;
  const nn=moved.n;
  if(!moved.f&&nn>=0){
    opP.forEach((op,oi)=>{if(!op.f&&op.n===nn&&op.n>0){op.s.forEach(si=>{opP[si]={n:-1,r:"outer",f:false,s:[]};});opP[oi]={n:-1,r:"outer",f:false,s:[]};extra=true;msg+=`🎯 잡기! `;showFx("🎯");}});
    myP.forEach((o,oi)=>{if(oi===pi||o.f||o.n!==nn||o.n<=0)return;let st=false;myP.forEach((p,j)=>{if(j!==oi&&p.s.includes(oi))st=true;});if(st)return;
      if(!myP[pi].s.includes(oi)){myP[pi].s=[...myP[pi].s,oi,...o.s];myP[oi].s=[];msg+=`🤝 업기! `;}});
    const bi=bombs.indexOf(nn);if(bi!==-1){myP[pi].s.forEach(si=>{myP[si]={n:-1,r:"outer",f:false,s:[]};});myP[pi]={n:-1,r:"outer",f:false,s:[]};bombs.splice(bi,1);msg+=`💣 폭발! `;showFx("💣");}
    const gi=gates.indexOf(nn);if(gi!==-1){myP[pi]={...myP[pi],n:19};myP[pi].s.forEach(si=>{myP[si]={...myP[si],n:19};});gates.splice(gi,1);msg+=`🚪 워프! `;}
  }
  myP.forEach(p=>{if(p.f&&p.s.length)p.s.forEach(si=>{myP[si]={...myP[si],n:GOAL,f:true};});});
  const win=myP.every(p=>p.f);const next=(extra&&!win)?uid:opp;
  if(extra&&!win)msg+="🔥 추가턴!";if(mv===0)msg="낙! 턴 넘김";
  try{await updateDoc(doc(fdb,"matches",matchId),{[`pcs.${uid}`]:ser(myP),[`pcs.${opp}`]:ser(opP),bombs,gates,cur:next,yut:null,status:win?"finished":"playing",ts:Date.now()});
    if(msg)showToast(msg);}catch(e){console.error(e);}finally{busy=false;}
}

// ============================================================
// 렌더링
// ============================================================
function renderAll(m){renderBoard(m);renderPieces(m);renderSkills(m);}
function renderPieces(m){
  const uid=auth.currentUser.uid,opp=m.player1===uid?m.player2:m.player1;
  const me=m.cur===uid,hasY=m.yut!=null,canM=me&&hasY&&m.status==="playing";
  const myP=des(m.pcs?.[uid]),opP=des(m.pcs?.[opp]);const mv=hasY?m.yut.value:0;
  myPcsEl.innerHTML="";
  myP.forEach((pc,i)=>{let cr=-1;myP.forEach((o,j)=>{if(j!==i&&o.s.includes(i))cr=j;});
    const btn=document.createElement("button");const stk=pc.s.length?`[+${pc.s.length}]`:"";
    if(pc.f){btn.className="piece-btn py-1.5 rounded-lg text-[10px] font-bold bg-indigo-900/50 text-indigo-400 border border-indigo-500/30";btn.innerText="🏁";btn.disabled=true;}
    else if(cr>=0){btn.className="piece-btn py-1.5 rounded-lg text-[10px] font-bold bg-gray-800 text-gray-500";btn.innerText=`↕${cr+1}`;btn.disabled=true;}
    else{const ok=canM&&canMv(pc,i,mv,myP);btn.className=`piece-btn py-1.5 rounded-lg text-[10px] font-bold ${ok?'bg-indigo-500 text-white selectable ring-2 ring-yellow-400':'bg-indigo-500/30 text-indigo-300'}`;
      btn.innerText=`${i+1}${stk}\n${pc.n===-1?'대기':'📍'+pc.n}`;if(ok)btn.onclick=()=>doMove(i,mv,m);else btn.disabled=true;}
    myPcsEl.appendChild(btn);});
  oppPcsEl.innerHTML="";
  if(opp&&m.pcs?.[opp]){opP.forEach((pc,i)=>{let cr=-1;opP.forEach((o,j)=>{if(j!==i&&o.s.includes(i))cr=j;});
    const d=document.createElement("div");const stk=pc.s.length?`[+${pc.s.length}]`:"";
    d.className=pc.f?"py-1.5 rounded-lg text-[10px] font-bold text-center bg-red-900/30 text-red-500/50":cr>=0?"py-1.5 rounded-lg text-[10px] font-bold text-center bg-gray-800 text-gray-600":"py-1.5 rounded-lg text-[10px] font-bold text-center bg-red-500/20 text-red-200 border border-red-500/30";
    d.innerText=pc.f?"🏁":(cr>=0?`↕${cr+1}`:`${i+1}${stk}\n${pc.n===-1?'대기':'📍'+pc.n}`);oppPcsEl.appendChild(d);});}
  else oppPcsEl.innerHTML=`<div class="col-span-2 text-gray-600 text-xs py-2">대기 중</div>`;
}
function renderBoard(m){
  const uid=auth.currentUser.uid,opp=m.player1===uid?m.player2:m.player1;
  const myP=des(m.pcs?.[uid]),opP=des(m.pcs?.[opp]);const bombs=m.bombs||[],gates=m.gates||[];
  boardEl.querySelectorAll('.pm,.board-icon').forEach(e=>e.remove());
  bombs.forEach(n=>{const p=NP[n];if(!p)return;const e=document.createElement("div");e.className="board-icon";e.style.left=p[0]+"px";e.style.top=(p[1]-18)+"px";e.innerText="💣";boardEl.appendChild(e);});
  gates.forEach(n=>{const p=NP[n];if(!p)return;const e=document.createElement("div");e.className="board-icon";e.style.left=p[0]+"px";e.style.top=(p[1]-18)+"px";e.innerText="🚪";boardEl.appendChild(e);});
  const place=(pcs,cls,side)=>{pcs.forEach((pc,i)=>{if(pc.f||pc.n<0)return;let cd=false;pcs.forEach((o,j)=>{if(j!==i&&o.s.includes(i))cd=true;});if(cd)return;
    const pos=NP[pc.n];if(!pos)return;const off=side==="my"?[-7+i*4,-7+i*4]:[7-i*4,-7+i*4];
    const el=document.createElement("div");el.className=`pm ${cls} ${pc.s.length?'pm-stacked':''}`;
    if(targetMode){if(targetMode.need==="oppPiece"&&side==="opp"&&!pc.f&&pc.n>0){el.classList.add("targetable");el.style.cursor="pointer";el.onclick=()=>execPS(targetMode.sk,targetMode.skillIdx,lastMatch,i);}
      if(targetMode.need==="myPiece"&&side==="my"&&!pc.f&&pc.n>0){el.classList.add("targetable");el.style.cursor="pointer";el.onclick=()=>execPS(targetMode.sk,targetMode.skillIdx,lastMatch,i);}}
    el.style.left=(pos[0]+off[0])+"px";el.style.top=(pos[1]+off[1])+"px";el.innerText=pc.s.length?(pc.s.length+1):"";boardEl.appendChild(el);});};
  place(myP,"pm-my","my");place(opP,"pm-opp","opp");
  if(targetMode&&targetMode.need==="node"){boardEl.querySelectorAll(".yut-node").forEach(nd=>{const n=parseInt(nd.dataset.nodeId);
    if(n>0&&n<20){nd.style.cursor="pointer";nd.classList.add("ring-2","ring-yellow-400");
      nd.onclick=()=>{execPS(targetMode.sk,targetMode.skillIdx,lastMatch,n);boardEl.querySelectorAll(".yut-node").forEach(x=>{x.style.cursor="default";x.classList.remove("ring-2","ring-yellow-400");x.onclick=null;});};}});}
}

// ============================================================
// 보드 초기화 + 이펙트
// ============================================================
function initBoard(){
  const lines=[[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,0],[5,20,21,22],[22,23,24,15],[10,25,26,22],[22,27,28,0]];
  let svg='';lines.forEach(path=>{for(let i=0;i<path.length-1;i++){const[x1,y1]=NP[path[i]],[x2,y2]=NP[path[i+1]];svg+=`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#3a2d4a" stroke-width="2"/>`;}});
  boardSvg.innerHTML=svg;
  const corners=[0,5,10,15],center=[22];
  Object.entries(NP).forEach(([id,pos])=>{const n=parseInt(id);const el=document.createElement("div");el.dataset.nodeId=n;
    let cls="yut-node ";if(n===0)cls+="corner node-start";else if(corners.includes(n))cls+="corner node-corner";else if(center.includes(n))cls+="corner node-center";else cls+="node-normal";
    el.className=cls;el.style.left=pos[0]+"px";el.style.top=pos[1]+"px";el.innerHTML=`<span>${{0:"출발",5:"5",10:"10",15:"15",22:"★"}[n]||n}</span>`;boardEl.appendChild(el);});
}
function showFx(t){const el=document.createElement("div");el.className="fx-banner";el.textContent=t;fxOverlay.appendChild(el);setTimeout(()=>el.remove(),1000);}
function showToast(m){const el=document.createElement("div");el.className="event-toast";el.textContent=m;document.body.appendChild(el);setTimeout(()=>el.remove(),2500);}

initBoard();
