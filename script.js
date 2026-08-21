import { pipeline, TextStreamer } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.0';

const netstatEl = document.getElementById('netstat');
const netstatText = document.getElementById('netstat-text');
const trafficGraph = document.getElementById('traffic-graph');
const trafficVal = document.getElementById('traffic-val');
const loadBtn = document.getElementById('load-btn');
const modelSelect = document.getElementById('model-select');
const engineStatus = document.getElementById('engine-status');
const progressWrap = document.getElementById('progress-wrap');
const progressFill = document.getElementById('progress-fill');
const progressFile = document.getElementById('progress-file');
const progressPct = document.getElementById('progress-pct');
const thread = document.getElementById('thread');
const input = document.getElementById('input');
const sendBtn = document.getElementById('send-btn');
const statsBar = document.getElementById('stats-bar');
const statDevice = document.getElementById('stat-device');
const statSpeed = document.getElementById('stat-speed');
const statNet = document.getElementById('stat-net');

// build traffic graph bars
const BAR_COUNT = 28;
let bars = [];
for(let i=0;i<BAR_COUNT;i++){
  const b = document.createElement('div');
  b.className = 'traffic-bar';
  b.style.height = '2px';
  trafficGraph.appendChild(b);
  bars.push(b);
}
function pushTraffic(value){ // value 0..1
  bars.shift().remove();
  const b = document.createElement('div');
  b.className = 'traffic-bar';
  const h = Math.max(2, value*36);
  b.style.height = h+'px';
  b.style.background = value>0.05 ? 'var(--amber)' : 'var(--teal-dim)';
  trafficGraph.appendChild(b);
  bars.push(b);
}
setInterval(()=>{ if(!downloading) pushTraffic(0); }, 180);

let downloading = false;
let generator = null;
let netCalls = 0;

function setNetLive(on, label){
  netstatEl.className = 'netstat ' + (on ? 'live' : 'off');
  netstatText.textContent = label;
}

loadBtn.addEventListener('click', async ()=>{
  if(downloading) return;
  downloading = true;
  loadBtn.disabled = true;
  modelSelect.disabled = true;
  progressWrap.style.display = 'block';
  engineStatus.textContent = 'モデルをダウンロード中…（サイズによって数十秒〜数分）';
  setNetLive(true, 'ダウンロード中');
  trafficVal.textContent = '取得中…';

  const modelId = modelSelect.value;
  const seenFiles = {};

  try{
    generator = await pipeline('text-generation', modelId, {
      dtype: 'q8',
      progress_callback: (p)=>{
        if(p.status === 'progress'){
          const pct = Math.round(p.progress || 0);
          progressFill.style.width = pct + '%';
          progressPct.textContent = pct + '%';
          progressFile.textContent = (p.file || '').split('/').pop();
          pushTraffic(Math.min(1, (p.progress||0)/100 + 0.15));
          trafficVal.textContent = ((p.loaded||0)/1024/1024).toFixed(1) + ' MB取得済み';
        } else if(p.status === 'done'){
          pushTraffic(0.9);
        }
      }
    });

    progressFill.style.width = '100%';
    progressPct.textContent = '100%';
    progressFile.textContent = 'ロード完了';
    engineStatus.innerHTML = '<b style="color:var(--teal)">✓ ロード完了。</b> 以降の生成は完全にオフラインで動作します。';
    loadBtn.textContent = '再ロード';
    loadBtn.disabled = false;
    input.disabled = false;
    sendBtn.disabled = false;
    input.placeholder = 'メッセージを入力…';
    statsBar.style.display = 'flex';

    // detect device used
    let device = 'wasm (CPU)';
    try{
      if(navigator.gpu){ device = 'webgpu (GPU)'; }
    }catch(e){}
    statDevice.textContent = device;
    statNet.textContent = netCalls + '回（モデル取得のみ）';

    thread.innerHTML = '';
    appendMsg('ai', 'モデル「' + modelId + '」の準備ができました。何か話しかけてください。この応答もすべて端末内で生成されています。');

    setTimeout(()=> setNetLive(false, '通信なし'), 800);

  }catch(err){
    engineStatus.textContent = 'エラー: ' + (err?.message || err);
    loadBtn.disabled = false;
    setNetLive(false, 'エラー');
  }
  downloading = false;
});

function appendMsg(role, text){
  const el = document.createElement('div');
  el.className = 'msg ' + role;
  el.textContent = text;
  thread.appendChild(el);
  thread.scrollIntoView({block:'end'});
  window.scrollTo(0, document.body.scrollHeight);
  return el;
}

async function handleSend(){
  const text = input.value.trim();
  if(!text || !generator) return;
  input.value = '';
  input.style.height = 'auto';
  appendMsg('user', text);
  sendBtn.disabled = true;
  input.disabled = true;

  const aiEl = appendMsg('ai', '');
  aiEl.innerHTML = '<span class="caret"></span>';

  const t0 = performance.now();
  let tokenCount = 0;
  let fullText = '';

  try{
    const streamer = new TextStreamer(generator.tokenizer, {
      skip_prompt: true,
      callback_function: (chunk)=>{
        fullText += chunk;
        tokenCount++;
        aiEl.innerHTML = escapeHtml(fullText) + '<span class="caret"></span>';
        window.scrollTo(0, document.body.scrollHeight);
      }
    });

    await generator(text, {
      max_new_tokens: 80,
      temperature: 0.7,
      top_k: 40,
      do_sample: true,
      streamer
    });

    const elapsed = (performance.now() - t0) / 1000;
    statSpeed.textContent = (tokenCount / elapsed).toFixed(1) + ' tok/s';
    aiEl.textContent = fullText.trim() || '(空の応答)';
  }catch(err){
    aiEl.textContent = 'エラー: ' + (err?.message || err);
  }

  sendBtn.disabled = false;
  input.disabled = false;
  input.focus();
}

function escapeHtml(s){
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

sendBtn.addEventListener('click', handleSend);
input.addEventListener('keydown', (e)=>{
  if(e.key === 'Enter' && !e.shiftKey){
    e.preventDefault();
    handleSend();
  }
});
input.addEventListener('input', ()=>{
  input.style.height = 'auto';
  input.style.height = Math.min(100, input.scrollHeight) + 'px';
});
