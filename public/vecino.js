
const STUN_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

const unit = new URLSearchParams(location.search).get('unit');
let ws, pc, localStream;

const statusDot = document.getElementById('statusDot');
const idleCard = document.getElementById('idleCard');
const callCard = document.getElementById('callCard');
const unitTag = document.getElementById('unitTag');
const unitTagCall = document.getElementById('unitTagCall');
const enableBtn = document.getElementById('enableBtn');
const videos = document.getElementById('videos');
const remoteVideo = document.getElementById('remoteVideo');
const localVideo = document.getElementById('localVideo');
const ringActions = document.getElementById('ringActions');
const liveActions = document.getElementById('liveActions');
const acceptBtn = document.getElementById('acceptBtn');
const declineBtn = document.getElementById('declineBtn');
const hangupBtn = document.getElementById('hangupBtn');

if (!unit) {
  document.querySelector('.panel').innerHTML = '<p class="plate">Falta indicar la unidad (?unit=...) en el link.</p>';
  throw new Error('sin unidad');
}
unitTag.textContent = unit;
unitTagCall.textContent = unit;

function connectWS() {
  ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
  ws.onopen = () => {
    statusDot.classList.add('on');
    ws.send(JSON.stringify({ type: 'join', unit, role: 'vecino' }));
  };
  ws.onclose = () => { statusDot.classList.remove('on'); setTimeout(connectWS, 2000); };
  ws.onmessage = (ev) => handleMessage(JSON.parse(ev.data));
}
function wsSend(data) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
}

function showRing() {
  idleCard.classList.add('hidden');
  callCard.classList.remove('hidden');
  ringActions.classList.remove('hidden');
  liveActions.classList.add('hidden');
  videos.classList.add('hidden');
}

function resetToIdle() {
  idleCard.classList.remove('hidden');
  callCard.classList.add('hidden');
}

async function acceptCall() {
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  localVideo.srcObject = localStream;
  videos.classList.remove('hidden');
  ringActions.classList.add('hidden');
  liveActions.classList.remove('hidden');

  pc = new RTCPeerConnection({ iceServers: STUN_SERVERS });
  localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
  pc.ontrack = (ev) => { remoteVideo.srcObject = ev.streams[0]; };
  pc.onicecandidate = (ev) => {
    if (ev.candidate) wsSend({ type: 'ice-candidate', unit, candidate: ev.candidate });
  };
  pc.onconnectionstatechange = () => {
    if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) endCall();
  };

  wsSend({ type: 'ready', unit });
}

async function handleMessage(msg) {
  if (msg.unit && msg.unit !== unit) return;
  switch (msg.type) {
    case 'incoming-call':
      showRing();
      break;
    case 'offer':
      if (!pc) return; // solo procesamos si ya aceptamos
      await pc.setRemoteDescription(msg.sdp);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      wsSend({ type: 'answer', unit, sdp: answer });
      break;
    case 'ice-candidate':
      if (pc) { try { await pc.addIceCandidate(msg.candidate); } catch {} }
      break;
    case 'hangup':
      endCall();
      break;
  }
}

function endCall() {
  if (pc) { pc.close(); pc = null; }
  if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
  remoteVideo.srcObject = null;
  localVideo.srcObject = null;
  resetToIdle();
}

acceptBtn.onclick = acceptCall;
declineBtn.onclick = () => { wsSend({ type: 'hangup', unit }); resetToIdle(); };
hangupBtn.onclick = () => { wsSend({ type: 'hangup', unit }); endCall(); };

// --- Avisos push: se activan una sola vez, no exponen ningún número ---
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

async function enablePush() {
  enableBtn.disabled = true;
  enableBtn.textContent = 'Activando…';
  try {
    const reg = await navigator.serviceWorker.register('sw.js');
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { enableBtn.textContent = 'Permiso denegado'; return; }

    const vapidKey = await fetch('/api/vapid-public-key').then(r => r.text());
    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    });
    await fetch('/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ unit, subscription }),
    });
    enableBtn.textContent = 'Avisos activados ✓';
  } catch (err) {
    console.error(err);
    enableBtn.disabled = false;
    enableBtn.textContent = 'Reintentar activar avisos';
  }
}

enableBtn.onclick = enablePush;

connectWS();
