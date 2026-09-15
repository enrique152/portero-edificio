 const STUN_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

const unit = new URLSearchParams(location.search).get('unit');
let ws, pc, localStream;

const statusDot = document.getElementById('statusDot');
const unitTag = document.getElementById('unitTag');
const unitTagCall = document.getElementById('unitTagCall');
const startCard = document.getElementById('startCard');
const callCard = document.getElementById('callCard');
const startBtn = document.getElementById('startBtn');
const callStatus = document.getElementById('callStatus');
const remoteVideo = document.getElementById('remoteVideo');
const localVideo = document.getElementById('localVideo');
const hangupBtn = document.getElementById('hangupBtn');

if (!unit) {
  document.querySelector('.panel').innerHTML = '<p class="plate">Este código QR no indica una unidad válida.</p>';
  throw new Error('sin unidad');
}
unitTag.textContent = unit;
unitTagCall.textContent = unit;

function connectWS() {
  ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
  ws.onopen = () => statusDot.classList.add('on');
  ws.onclose = () => {
    statusDot.classList.remove('on');
    setTimeout(connectWS, 1500); // el server gratuito puede "dormirse"; reintentamos solos
  };
  ws.onmessage = (ev) => handleMessage(JSON.parse(ev.data));
}

// Si el servidor estaba "dormido" (plan gratuito), la primera conexión puede
// tardar unos segundos en levantar. Esperamos a que esté realmente abierta
// antes de mandar nada, en vez de fallar en silencio.
function wsReady() {
  return new Promise((resolve) => {
    if (ws && ws.readyState === WebSocket.OPEN) return resolve();
    const check = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        clearInterval(check);
        resolve();
      }
    }, 200);
  });
}
function wsSend(data) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
}

async function startCall() {
  startBtn.disabled = true;
  startCard.classList.add('hidden');
  callCard.classList.remove('hidden');
  callStatus.textContent = 'Conectando…';

  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  } catch (err) {
    callStatus.textContent = 'No se pudo acceder a la cámara. Dale permiso e intentá de nuevo.';
    return;
  }
  localVideo.srcObject = localStream;

  // Si el sistema estaba inactivo puede tardar hasta ~30-50s en despertar
  const slowNotice = setTimeout(() => {
    callStatus.textContent = 'El sistema estaba inactivo, esperá unos segundos…';
  }, 3000);
  await wsReady();
  clearTimeout(slowNotice);

  callStatus.textContent = 'Llamando…';
  wsSend({ type: 'join', unit, role: 'portero' });
  wsSend({ type: 'call', unit });
}

async function startOffer() {
  pc = new RTCPeerConnection({ iceServers: STUN_SERVERS });
  localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
  pc.ontrack = (ev) => { remoteVideo.srcObject = ev.streams[0]; };
  pc.onicecandidate = (ev) => {
    if (ev.candidate) wsSend({ type: 'ice-candidate', unit, candidate: ev.candidate });
  };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'connected') callStatus.textContent = 'En videollamada';
    if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) endCall();
  };

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  wsSend({ type: 'offer', unit, sdp: offer });
}

async function handleMessage(msg) {
  if (msg.unit && msg.unit !== unit) return;
  switch (msg.type) {
    case 'ready':
      callStatus.textContent = 'Conectando…';
      await startOffer();
      break;
    case 'answer':
      if (pc) await pc.setRemoteDescription(msg.sdp);
      break;
    case 'ice-candidate':
      if (pc) { try { await pc.addIceCandidate(msg.candidate); } catch {} }
      break;
    case 'hangup':
      callStatus.textContent = 'Llamada finalizada';
      setTimeout(endCall, 900);
      break;
  }
}

function endCall() {
  if (pc) { pc.close(); pc = null; }
  if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
  wsSend({ type: 'hangup', unit });
  remoteVideo.srcObject = null;
  localVideo.srcObject = null;
  startBtn.disabled = false;
  startCard.classList.remove('hidden');
  callCard.classList.add('hidden');
}

startBtn.onclick = startCall;
hangupBtn.onclick = endCall;

connectWS();
