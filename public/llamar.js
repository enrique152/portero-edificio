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
  ws.onclose = () => statusDot.classList.remove('on');
  ws.onmessage = (ev) => handleMessage(JSON.parse(ev.data));
}

async function startCall() {
  startBtn.disabled = true;
  startCard.classList.add('hidden');
  callCard.classList.remove('hidden');
  callStatus.textContent = 'Llamando…';

  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  } catch (err) {
    callStatus.textContent = 'No se pudo acceder a la cámara. Dale permiso e intentá de nuevo.';
    return;
  }
  localVideo.srcObject = localStream;

  ws.send(JSON.stringify({ type: 'join', unit, role: 'portero' }));
  ws.send(JSON.stringify({ type: 'call', unit }));
}

async function startOffer() {
  pc = new RTCPeerConnection({ iceServers: STUN_SERVERS });
  localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
  pc.ontrack = (ev) => { remoteVideo.srcObject = ev.streams[0]; };
  pc.onicecandidate = (ev) => {
    if (ev.candidate) ws.send(JSON.stringify({ type: 'ice-candidate', unit, candidate: ev.candidate }));
  };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'connected') callStatus.textContent = 'En videollamada';
    if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) endCall();
  };

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  ws.send(JSON.stringify({ type: 'offer', unit, sdp: offer }));
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
  ws.send(JSON.stringify({ type: 'hangup', unit }));
  remoteVideo.srcObject = null;
  localVideo.srcObject = null;
  startBtn.disabled = false;
  startCard.classList.remove('hidden');
  callCard.classList.add('hidden');
}

startBtn.onclick = startCall;
hangupBtn.onclick = endCall;

connectWS();
