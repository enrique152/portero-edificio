const STUN_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
];

let ws, pc, localStream, currentUnit = null;

const unitsEl = document.getElementById('units');
const statusDot = document.getElementById('statusDot');
const callPanel = document.getElementById('callPanel');
const callUnitTag = document.getElementById('callUnitTag');
const callStatus = document.getElementById('callStatus');
const remoteVideo = document.getElementById('remoteVideo');
const localVideo = document.getElementById('localVideo');
const hangupBtn = document.getElementById('hangupBtn');

function connectWS() {
  ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
  ws.onopen = () => statusDot.classList.add('on');
  ws.onclose = () => { statusDot.classList.remove('on'); setTimeout(connectWS, 2000); };
  ws.onmessage = (ev) => handleMessage(JSON.parse(ev.data));
}

async function loadUnits() {
  const units = await fetch('/api/units').then(r => r.json());
  unitsEl.innerHTML = '';
  units.forEach(u => {
    const btn = document.createElement('button');
    btn.className = 'unit-btn';
    btn.dataset.unit = u.id;
    btn.innerHTML = `<span class="num">${u.id}</span><span class="label">${u.label}</span><span class="ring-led"></span>`;
    btn.onclick = () => callUnit(u.id, u.label);
    unitsEl.appendChild(btn);
  });
}

function callUnit(unitId, label) {
  if (currentUnit) return; // ya hay una llamada en curso
  currentUnit = unitId;
  document.querySelector(`.unit-btn[data-unit="${unitId}"]`)?.classList.add('calling');
  callUnitTag.textContent = label;
  callStatus.textContent = 'Llamando…';
  callPanel.classList.remove('hidden');

  ws.send(JSON.stringify({ type: 'join', unit: unitId, role: 'portero' }));
  ws.send(JSON.stringify({ type: 'call', unit: unitId }));
}

async function startOfferTo(unitId) {
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  localVideo.srcObject = localStream;

  pc = new RTCPeerConnection({ iceServers: STUN_SERVERS });
  localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
  pc.ontrack = (ev) => { remoteVideo.srcObject = ev.streams[0]; };
  pc.onicecandidate = (ev) => {
    if (ev.candidate) {
      ws.send(JSON.stringify({ type: 'ice-candidate', unit: unitId, candidate: ev.candidate }));
    }
  };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'connected') callStatus.textContent = 'En videollamada';
    if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) endCall();
  };

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  ws.send(JSON.stringify({ type: 'offer', unit: unitId, sdp: offer }));
}

async function handleMessage(msg) {
  if (msg.unit && msg.unit !== currentUnit) return;

  switch (msg.type) {
    case 'ready': // el vecino atendió y está listo para recibir la oferta
      callStatus.textContent = 'Conectando…';
      await startOfferTo(msg.unit);
      break;
    case 'answer':
      await pc.setRemoteDescription(msg.sdp);
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
  if (currentUnit) {
    document.querySelector(`.unit-btn[data-unit="${currentUnit}"]`)?.classList.remove('calling');
    ws.send(JSON.stringify({ type: 'hangup', unit: currentUnit }));
  }
  currentUnit = null;
  callPanel.classList.add('hidden');
  remoteVideo.srcObject = null;
  localVideo.srcObject = null;
}

hangupBtn.onclick = endCall;

connectWS();
loadUnits();
