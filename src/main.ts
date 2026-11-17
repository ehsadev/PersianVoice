import './style.css';
import { decodeAudio, MAX_BYTES, MAX_SECONDS } from './audio';
import { forceClosedObjects, parseSchema, schemaFromExample, type Json } from './schema';
import { deleteTemplate, listTemplates, saveTemplate } from './storage';
import { ASR_MODELS, type AsrEngine, type AsrResult } from './models';
import { errorRates } from './metrics';
import { extractWithOpenRouter, OPENROUTER_MODELS, type OpenRouterModel } from './openrouter';

const exampleText = 'یک عدد لباس بچه و دو عدد شلوار لی به آقای جعفری فروختم.';
const exampleSchema = { type: 'object', additionalProperties: false, properties: { customer: { type: ['string', 'null'], description: 'نام مشتری بدون عنوان احترام' }, operation: { type: ['string', 'null'], enum: ['sale', 'purchase', null] }, items: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { name: { type: 'string' }, quantity: { type: 'number', minimum: 0 } }, required: ['name', 'quantity'] } } }, required: ['customer', 'operation', 'items'] };
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <a class="skip-link" href="#workflow">رفتن به مراحل کار</a><header class="topbar"><div class="brand"><span class="brand-mark" aria-hidden="true">◉</span><span>آوا</span><small>کارگاه گفتار فارسی</small></div><div class="privacy"><span class="privacy-dot"></span>پردازش صوت روی دستگاه شما</div></header>
  <main id="workflow"><section class="hero"><div class="hero-copy"><div class="eyebrow">استودیوی گفتار به داده · فارسی و راست‌به‌چپ</div><h1>از صدای فارسی،<br><em>دادهٔ قابل بررسی</em> بسازید.</h1><p>صوت را با Whisper یا شنوا رونویسی کنید، متن را بازبینی کنید و با قالب دلخواه خود از OpenRouter خروجی JSON بگیرید.</p><div class="hero-pills"><span>✓ مدل‌های صوتی در مرورگر</span><span>✓ متن قابل ویرایش</span><span>✓ اعتبارسنجی JSON Schema</span></div></div><div class="journey" aria-label="مراحل کار"><div><b>۰۱</b><span>صوت را انتخاب کنید</span></div><div><b>۰۲</b><span>رونویسی را بازبینی کنید</span></div><div><b>۰۳</b><span>قالب را مشخص کنید</span></div><div><b>۰۴</b><span>JSON را بررسی کنید</span></div></div></section>
  <div class="notice" id="capability">در حال بررسی قابلیت‌های مرورگر…</div>
  <div class="grid"><section class="card audio-card"><div class="card-head"><span class="step">۰۱</span><div><h2>صوت فارسی</h2><p>یک صوت را با یک یا چند موتور بسنجید.</p></div></div><label class="field-label" for="asrMode">موتور تشخیص گفتار</label><select id="asrMode" class="wide-select"><option value="">موتور را انتخاب کنید</option><option value="tiny">Whisper Tiny</option><option value="small">Whisper Small</option><option value="shenava">شنوا ریزه‌پیزه</option><option value="shenavaRizeh">شنوا ریزه</option><option value="shenavaKoochik">شنوا کوچک</option><option value="both">مقایسه Whisper Tiny و ریزه‌پیزه</option><option value="shenavaAll">مقایسه سه شنوا</option><option value="all">مقایسه همهٔ پنج موتور</option></select><label class="field-label" for="executionDevice">روش اجرا</label><select id="executionDevice" class="wide-select"><option value="auto">خودکار: WebGPU سپس WASM</option><option value="webgpu">فقط WebGPU</option><option value="wasm">فقط WASM</option></select><div id="asrModels" class="model-list"></div><div class="actions"><button id="record" class="primary">● شروع ضبط</button><button id="stopRecord" disabled>■ توقف ضبط</button><label class="file-button">بارگذاری صوت<input id="audioFile" type="file" accept="audio/*"></label></div><div class="audio-info"><span id="recordTime">۰۰:۰۰</span><span id="audioName">هنوز صوتی انتخاب نشده است</span></div><audio id="player" controls hidden></audio><label class="field-label" for="reference">متن صحیح مرجع (اختیاری)</label><textarea id="reference" class="compact" placeholder="اگر متن صحیح را دارید، برای محاسبه WER و CER وارد کنید."></textarea><div class="actions"><button id="transcribe" class="primary" disabled>تبدیل صوت به متن</button><button id="report" disabled>دریافت گزارش مقایسه</button><button id="useReference">استفاده از متن مرجع برای JSON</button></div><p class="hint">حداکثر ۲ دقیقه و ۲۵ مگابایت. صوت به ۱۶ کیلوهرتز تک‌کاناله تبدیل می‌شود. مدل‌ها ترتیبی اجرا و آزاد می‌شوند.</p></section>
  <section class="card transcript-card"><div class="card-head"><span class="step">۰۲</span><div><h2>متن قابل ویرایش</h2><p>رونویسی را اصلاح کنید یا مستقیم بنویسید.</p></div></div><textarea id="transcript" placeholder="متن فارسی را اینجا بنویسید…" spellcheck="true"></textarea><div class="under"><span id="textCount">۰ نویسه</span><button id="sample" class="text-button">بارگذاری نمونه</button></div></section>
  <section class="card schema-card"><div class="card-head"><span class="step">۰۳</span><div><h2>قالب اجباری JSON</h2><p>Schema نسخهٔ Draft-07 را ویرایش و بررسی کنید.</p></div></div><div class="segmented"><button id="modeSchema" class="selected">JSON Schema</button><button id="modeExample">از نمونهٔ JSON</button></div><div id="exampleBox" hidden><textarea id="example" class="compact" placeholder='{"name":"کالا","quantity":1}'></textarea><button id="makeSchema">ساخت Schema اولیه</button></div><textarea id="schema" class="code" dir="ltr" placeholder='{"type":"object","properties":{...}}'></textarea><div class="actions"><button id="checkSchema">بررسی قالب</button><span id="schemaStatus" class="small-status">قالب وارد نشده است</span></div><div class="template-tools"><input id="templateName" placeholder="نام قالب" aria-label="نام قالب"><button id="saveTemplate">ذخیره</button><select id="templates" aria-label="قالب‌های ذخیره‌شده"><option value="">قالب‌های ذخیره‌شده</option></select><button id="deleteTemplate">حذف</button><button id="exportTemplate">صدور</button><label class="file-button">ورود<input id="importTemplate" type="file" accept="application/json,.json" hidden></label></div><p class="hint">شیءها، آرایه‌ها، required، enum، null و $ref داخلی پشتیبانی می‌شوند. فیلد اضافی پذیرفته نمی‌شود.</p></section>
  <section class="card output-card"><div class="card-head"><span class="step">۰۴</span><div><h2>خروجی ساخت‌یافته</h2><p>نتیجه را پیش از هر استفاده‌ای بازبینی کنید.</p></div></div><label class="field-label" for="apiModel">مدل رایگان استخراج JSON</label><select id="apiModel" class="wide-select"><option value="nvidia/nemotron-3.5-super-vl:free">Nemotron 3.5 Super VL</option><option value="baidu/ernie-5.5-flash-preview:free">ERNIE 5.5 Flash Preview</option><option value="inclusionai/ling-3.2-flash:free">Ling 3.2 Flash</option><option value="liquid/lfm-3-1.7b:free">LFM3 1.7B</option></select><div id="apiInfo" class="model"></div><div id="apiKeyStatus" class="key-status" role="status">در حال بررسی اتصال امن OpenRouter…</div><p class="hint privacy-hint">کلید API فقط در فایل <code>.env</code> روی سرور محلی خوانده می‌شود و به مرورگر تحویل داده نمی‌شود. هنگام استخراج، متن و JSON Schema به OpenRouter فرستاده می‌شوند؛ فایل صوتی ارسال نمی‌شود. مدل‌های رایگان سهمیهٔ مشترک دارند و دسترسی آن‌ها ممکن است تغییر کند.</p><div class="actions"><button id="extract" class="primary">تبدیل متن به JSON</button><button id="compareJson">مقایسه JSON متن‌های ASR</button><button id="cancel" disabled>توقف پردازش</button></div><div id="status" class="status idle">آماده</div><div id="progress" class="progress-list"></div><div id="timings" class="timings"></div><pre id="output" class="output" dir="ltr"><span class="placeholder">JSON معتبر اینجا نمایش داده می‌شود.</span></pre><div class="actions"><button id="copy" disabled>کپی JSON</button><button id="download" disabled>دریافت فایل</button></div></section></div><section class="card results-section"><div class="card-head"><span class="step">⇄</span><div><h2>نتایج گفتار و مقایسه</h2><p>متن خام، زمان‌ها، خطاها و معیارهای هر موتور جدا ثبت می‌شود.</p></div></div><div id="asrResults" class="results-grid"><p class="hint">پس از تبدیل صوت، نتیجهٔ هر موتور اینجا نمایش داده می‌شود.</p></div></section><section id="jsonCompare" class="card results-section" hidden><h2>مقایسه JSON</h2><p class="hint">اعتبار ساختاری به معنی صحت برداشت از متن نیست.</p><div id="jsonCompareResults" class="results-grid"></div></section>
  <section class="footer-card"><div><h2>مدل‌ها و فضای ذخیره</h2><p id="cacheSize">در حال بررسی فضای کش…</p><p id="offline">آمادگی آفلاین مدل‌های صوتی بررسی نشده است.</p></div><div class="actions"><button id="persistStorage">درخواست نگهداری پایدار</button><button id="clearCache">حذف کش مدل‌ها</button></div></section>
  <footer>آوا هیچ فاکتور یا تغییر موجودی ثبت نمی‌کند. صحت معنایی نتیجه را خودتان بررسی کنید.</footer></main>`;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const transcript = $<HTMLTextAreaElement>('transcript');
const schemaInput = $<HTMLTextAreaElement>('schema');
const status = $('status');
const progress = $('progress');
let audio: Blob | null = null;
let audioUrl: string | null = null;
let stream: MediaStream | null = null;
let recorder: MediaRecorder | null = null;
let timer: number | null = null;
let started = 0;
let apiController: AbortController | null = null;
let asrWorker: Worker | null = null;
let cancelPending: (() => void) | null = null;
let busy = false;
let result: unknown = null;
let resultVersion = '';
let transcriptionMs: number | null = null;
let extractionMs: number | null = null;
const asrResults = new Map<AsrEngine, AsrResult>();
const jsonResults = new Map<string, { result?: unknown; error?: string; extractionMs: number; model: string; source: string }>();
let audioSeconds = 0;
let cancelled = false;

function selectedEngines(): AsrEngine[] {
  const choice = $<HTMLSelectElement>('asrMode').value;
  return choice === 'all' ? ['tiny', 'small', 'shenava', 'shenavaRizeh', 'shenavaKoochik'] : choice === 'both' ? ['tiny', 'shenava'] : choice === 'shenavaAll' ? ['shenava', 'shenavaRizeh', 'shenavaKoochik'] : choice in ASR_MODELS ? [choice as AsrEngine] : [];
}
function updateModelInfo(): void {
  $('asrModels').innerHTML = selectedEngines().map(key => { const m = ASR_MODELS[key]; return `<div class="model"><strong>${escapeHtml(m.label)}</strong> · ${escapeHtml(m.revision)}<span>${escapeHtml(m.files)} · دریافت حدود ${m.downloadMB} MB · ${escapeHtml(m.runtime)}</span></div>`; }).join('');
  const model = $<HTMLSelectElement>('apiModel').value as OpenRouterModel;
  $('apiInfo').innerHTML = `<strong>${escapeHtml(model)}</strong><span>${escapeHtml(OPENROUTER_MODELS[model].provider)} · JSON Schema اجباری · اعتبارسنجی Ajv</span>`;
}
function renderAsrResults(): void {
  const reference = $<HTMLTextAreaElement>('reference').value;
  $('asrResults').innerHTML = [...asrResults.values()].map(r => {
    const m = ASR_MODELS[r.engine], rates = reference.trim() && !r.error ? errorRates(reference, r.raw) : null;
    if (rates) { r.wer = rates.wer; r.cer = rates.cer; } else { delete r.wer; delete r.cer; }
    const metrics = r.metrics;
    return `<article class="result-card"><h3>${escapeHtml(m.label)} <small>${escapeHtml(m.revision)}</small></h3><div class="status ${r.error ? 'error' : 'success'}">${r.error ? escapeHtml(r.error) : 'رونویسی انجام شد'}</div><p class="field-label">متن خام مدل</p><pre class="raw-text">${escapeHtml(r.raw || '—')}</pre>${r.error ? '' : `<label class="field-label">متن ویرایش‌شده برای JSON</label><textarea data-edit="${r.engine}" class="compact">${escapeHtml(r.edited ?? r.raw)}</textarea><button data-use="${r.engine}">استفاده از این متن</button>`}<div class="metrics">بارگذاری: ${formatTime(metrics.loadMs)} · پیش‌پردازش: ${formatTime(metrics.prepMs)} · استنتاج: ${formatTime(metrics.inferMs)}<br>کل بدون دانلود: ${formatTime(metrics.totalMs)} · صوت: ${metrics.audioSeconds.toFixed(1)} ثانیه · RTF: ${metrics.rtf.toFixed(2)} · ${metrics.device.toUpperCase()}${rates ? `<br>WER: ${(rates.wer * 100).toFixed(1)}٪ · CER: ${(rates.cer * 100).toFixed(1)}٪` : ''}</div></article>`;
  }).join('') || '<p class="hint">هنوز نتیجه‌ای وجود ندارد.</p>';
  ($<HTMLButtonElement>('report')).disabled = asrResults.size === 0;
}

function setStatus(kind: string, message: string): void { status.className = `status ${kind}`; status.textContent = message; }
function invalidate(): void { result = null; resultVersion = ''; $('output').innerHTML = '<span class="placeholder">خروجی با تغییر متن یا قالب منقضی شد.</span>'; ($<HTMLButtonElement>('copy')).disabled = true; ($<HTMLButtonElement>('download')).disabled = true; }
function snapshot(): string { return transcript.value + '\u0000' + schemaInput.value + '\u0000' + $<HTMLSelectElement>('apiModel').value; }
function setBusy(value: boolean): void { busy = value; ($<HTMLButtonElement>('transcribe')).disabled = value || !audio; ($<HTMLButtonElement>('extract')).disabled = value; ($<HTMLButtonElement>('compareJson')).disabled = value; ($<HTMLButtonElement>('record')).disabled = value; ($<HTMLInputElement>('audioFile')).disabled = value; ($<HTMLSelectElement>('apiModel')).disabled = value; ($<HTMLSelectElement>('asrMode')).disabled = value; ($<HTMLSelectElement>('executionDevice')).disabled = value; ($<HTMLButtonElement>('cancel')).disabled = !value; }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }
function showError(message: string): void { setStatus('error', message); progress.textContent = ''; }
function formatTime(ms: number): string { return `${(ms / 1000).toFixed(1)} ثانیه`; }
function updateTimes(): void { $('timings').textContent = [transcriptionMs != null && `تبدیل صوت: ${formatTime(transcriptionMs)}`, extractionMs != null && `استخراج: ${formatTime(extractionMs)}`].filter(Boolean).join(' · '); }
function escapeHtml(value: string): string { return value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!); }
function highlight(json: string): string { return escapeHtml(json).replace(/(&quot;(?:\\.|[^&])*?&quot;)(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g, (_, str, colon, keyword, number) => str ? `<span class="${colon ? 'key' : 'string'}">${str}</span>${colon ?? ''}` : keyword ? `<span class="literal">${keyword}</span>` : `<span class="number">${number}</span>`); }

async function requireDevice(): Promise<'webgpu' | 'wasm'> {
  const choice = $<HTMLSelectElement>('executionDevice').value;
  if (choice !== 'wasm' && 'gpu' in navigator) {
    try { if (await (navigator as Navigator & { gpu: { requestAdapter(): Promise<unknown> } }).gpu.requestAdapter()) return 'webgpu'; }
    catch { /* fall through to actual WASM attempt */ }
  }
  if (choice === 'webgpu') throw new Error('آداپتور WebGPU در این مرورگر در دسترس نیست.');
  if (typeof WebAssembly !== 'undefined') return 'wasm';
  throw new Error('این مرورگر نه WebGPU و نه WebAssembly دارد.');
}
async function runExtraction(text: string, schema: Record<string, unknown>, model: OpenRouterModel): Promise<unknown> {
  const controller = new AbortController();
  apiController = controller;
  setStatus('working', 'در حال استخراج با OpenRouter؛ متن و Schema ارسال شدند.');
  try { return await extractWithOpenRouter(text, schema, controller.signal, fetch, model); }
  finally { if (apiController === controller) apiController = null; }
}

async function runAsrEngine(engine: AsrEngine, samples: Float32Array): Promise<AsrResult> {
  const device = await requireDevice();
  const started = performance.now();
  asrWorker = new Worker(new URL('./asr.worker.ts', import.meta.url), { type: 'module' });
  const active = asrWorker;
  try {
    const detail = await new Promise<AsrResult['metrics'] & { raw: string }>((resolve, reject) => {
      const onMessage = (event: MessageEvent<{ event: string; detail: any }>) => {
        const m = event.data;
        if (m.event === 'status') setStatus('working', m.detail);
        if (m.event === 'download') {
          const d = m.detail;
          const amount = typeof d.loaded === 'number' ? `${(d.loaded / 1048576).toFixed(1)} MB` : '';
          const total = typeof d.total === 'number' ? ` / ${(d.total / 1048576).toFixed(1)} MB` : '';
          progress.textContent = `${ASR_MODELS[engine].label} · ${d.file ?? 'مدل'}: ${amount}${total} ${d.status === 'cached' ? '(کش)' : ''}`;
        }
        if (m.event === 'result' || m.event === 'error') { cleanup(); m.event === 'result' ? resolve(m.detail) : reject(new Error(m.detail)); }
      };
      const onError = (event: ErrorEvent) => { cleanup(); reject(new Error(event.message || 'خطای Worker صوت')); };
      const cleanup = () => { cancelPending = null; active.removeEventListener('message', onMessage); active.removeEventListener('error', onError); };
      cancelPending = () => { cleanup(); reject(new Error('پردازش لغو شد.')); };
      active.addEventListener('message', onMessage); active.addEventListener('error', onError);
      active.postMessage({ engine, audio: samples, device });
    });
    return { engine, raw: detail.raw, edited: detail.raw, metrics: detail };
  } catch (error) {
    if (errorMessage(error) === 'پردازش لغو شد.') throw error;
    return { engine, raw: '', error: errorMessage(error), metrics: { loadMs: performance.now() - started, prepMs: 0, inferMs: 0, totalMs: 0, audioSeconds: samples.length / 16000, rtf: 0, device } };
  } finally { active.terminate(); if (asrWorker === active) asrWorker = null; }
}

async function chooseAudio(blob: Blob, name: string): Promise<void> {
  if (blob.size > MAX_BYTES) throw new Error('حجم صوت بیش از ۲۵ مگابایت است.');
  if (audioUrl) URL.revokeObjectURL(audioUrl);
  audio = blob; audioUrl = URL.createObjectURL(blob);
  asrResults.clear(); jsonResults.clear(); renderAsrResults(); $('jsonCompare').hidden = true;
  const player = $<HTMLAudioElement>('player'); player.src = audioUrl; player.hidden = false;
  $('audioName').textContent = `${name} · ${(blob.size / 1048576).toFixed(1)} مگابایت`;
  ($<HTMLButtonElement>('transcribe')).disabled = busy;
}

function stopMedia(): void { if (timer != null) clearInterval(timer); timer = null; stream?.getTracks().forEach(t => t.stop()); stream = null; ($<HTMLButtonElement>('record')).disabled = false; ($<HTMLButtonElement>('stopRecord')).disabled = true; }
$('record').onclick = async () => {
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('میکروفن در این مرورگر یا اتصال ناامن در دسترس نیست.');
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const parts: BlobPart[] = [];
    recorder = new MediaRecorder(stream);
    recorder.ondataavailable = e => { if (e.data.size) parts.push(e.data); };
    recorder.onstop = () => { const blob = new Blob(parts, { type: recorder?.mimeType || 'audio/webm' }); stopMedia(); chooseAudio(blob, 'ضبط میکروفن').catch(e => showError(errorMessage(e))); };
    recorder.onerror = () => { stopMedia(); showError('ضبط صوت با خطا روبه‌رو شد.'); };
    recorder.start(); started = Date.now();
    ($<HTMLButtonElement>('record')).disabled = true; ($<HTMLButtonElement>('stopRecord')).disabled = false;
    timer = window.setInterval(() => { const seconds = Math.floor((Date.now() - started) / 1000); $('recordTime').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`; if (seconds >= MAX_SECONDS) recorder?.stop(); }, 250);
    setStatus('working', 'ضبط در حال انجام است.');
  } catch (e) { stopMedia(); showError(errorMessage(e)); }
};
$('stopRecord').onclick = () => { if (recorder?.state === 'recording') recorder.stop(); };
$<HTMLInputElement>('audioFile').onchange = async e => { const file = (e.target as HTMLInputElement).files?.[0]; if (file) try { await chooseAudio(file, file.name); } catch (error) { showError(errorMessage(error)); } };
$('transcribe').onclick = async () => {
  if (!audio || busy) return;
  const engines = selectedEngines();
  if (!engines.length) return showError('ابتدا موتور تشخیص گفتار را انتخاب کنید.');
  cancelled = false; setBusy(true); invalidate(); progress.textContent = ''; asrResults.clear(); renderAsrResults(); const began = performance.now();
  try {
    setStatus('working', 'در حال آماده‌سازی صوت');
    const prepStarted = performance.now(); const samples = await decodeAudio(audio); const commonPrep = performance.now() - prepStarted;
    audioSeconds = samples.length / 16000;
    for (const engine of engines) {
      if (cancelled) break;
      const item = await runAsrEngine(engine, samples);
      item.metrics.prepMs += commonPrep;
      item.metrics.totalMs += commonPrep;
      item.metrics.rtf = item.metrics.totalMs / 1000 / audioSeconds;
      asrResults.set(engine, item); renderAsrResults();
    }
    if (!cancelled) { const first = [...asrResults.values()].find(x => !x.error); if (first) { transcript.value = first.raw; transcript.dispatchEvent(new Event('input')); } transcriptionMs = performance.now() - began; updateTimes(); setStatus(first ? 'success' : 'error', first ? 'نتایج صوت آماده‌اند. متن‌ها و خطاها را بازبینی کنید.' : 'هیچ موتور صوتی با موفقیت اجرا نشد؛ خطای هر موتور را ببینید.'); await updateCache(); }
  }
  catch (e) { if (errorMessage(e) !== 'پردازش لغو شد.') showError(errorMessage(e)); }
  finally { setBusy(false); }
};
transcript.oninput = () => { $('textCount').textContent = `${transcript.value.length.toLocaleString('fa-IR')} نویسه`; invalidate(); };
schemaInput.oninput = () => { $('schemaStatus').textContent = 'قالب تغییر کرده؛ دوباره بررسی کنید'; invalidate(); };
$('sample').onclick = () => { transcript.value = exampleText; schemaInput.value = JSON.stringify(exampleSchema, null, 2); transcript.dispatchEvent(new Event('input')); schemaInput.dispatchEvent(new Event('input')); };
$('modeSchema').onclick = () => { $('exampleBox').hidden = true; $('modeSchema').classList.add('selected'); $('modeExample').classList.remove('selected'); };
$('modeExample').onclick = () => { $('exampleBox').hidden = false; $('modeExample').classList.add('selected'); $('modeSchema').classList.remove('selected'); };
$('makeSchema').onclick = () => { try { const { schema, ambiguous } = schemaFromExample(JSON.parse($<HTMLTextAreaElement>('example').value) as Json); schemaInput.value = JSON.stringify(schema, null, 2); schemaInput.dispatchEvent(new Event('input')); $('schemaStatus').textContent = ambiguous.length ? `نوع این مسیرها را تکمیل کنید: ${ambiguous.join('، ') || '/'}` : 'Schema اولیه ساخته شد؛ آن را بازبینی کنید.'; } catch (e) { showError('نمونهٔ JSON نامعتبر است: ' + errorMessage(e)); } };
$('checkSchema').onclick = () => { try { const parsed = parseSchema(schemaInput.value); $('schemaStatus').textContent = 'قالب Draft-07 معتبر است ✓'; setStatus('success', `قالب معتبر است (${Object.keys(parsed).length} ویژگی اصلی).`); } catch (e) { $('schemaStatus').textContent = errorMessage(e); showError(errorMessage(e)); } };
$('extract').onclick = async () => {
  if (busy) return;
  invalidate(); progress.textContent = '';
  if (!transcript.value.trim()) return showError('ابتدا متن را وارد کنید.');
  let schema;
  try { schema = forceClosedObjects(parseSchema(schemaInput.value)); } catch (e) { return showError('قالب معتبر نیست: ' + errorMessage(e)); }
  setBusy(true); const version = snapshot(); const began = performance.now();
  try { const data = await runExtraction(transcript.value, schema, $<HTMLSelectElement>('apiModel').value as OpenRouterModel); if (version !== snapshot()) throw new Error('متن یا قالب در زمان پردازش تغییر کرد؛ دوباره اجرا کنید.'); result = data; resultVersion = version; const json = JSON.stringify(data, null, 2); $('output').innerHTML = highlight(json); ($<HTMLButtonElement>('copy')).disabled = false; ($<HTMLButtonElement>('download')).disabled = false; extractionMs = performance.now() - began; updateTimes(); setStatus('success', 'JSON از نظر ساختاری معتبر است. صحت معنایی را بازبینی کنید.'); await updateCache(); }
  catch (e) { if (errorMessage(e) !== 'پردازش لغو شد.') showError(errorMessage(e)); }
  finally { setBusy(false); }
};
$('cancel').onclick = () => { if (!busy) return; cancelled = true; cancelPending?.(); cancelPending = null; asrWorker?.terminate(); asrWorker = null; apiController?.abort(); apiController = null; setBusy(false); invalidate(); progress.textContent = ''; setStatus('cancelled', 'پردازش متوقف شد.'); };
$('copy').onclick = async () => { if (result && resultVersion === snapshot()) await navigator.clipboard.writeText(JSON.stringify(result, null, 2)); };
$('download').onclick = () => { if (!result || resultVersion !== snapshot()) return; const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = 'ava-output.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
$<HTMLSelectElement>('asrMode').onchange = updateModelInfo;
$<HTMLSelectElement>('apiModel').onchange = () => { updateModelInfo(); invalidate(); };
$<HTMLTextAreaElement>('reference').oninput = renderAsrResults;
$('useReference').onclick = () => { const value = $<HTMLTextAreaElement>('reference').value.trim(); if (!value) return showError('متن مرجع وارد نشده است.'); transcript.value = value; transcript.dispatchEvent(new Event('input')); setStatus('success', 'متن مرجع برای آزمایش مستقیم OpenRouter انتخاب شد.'); };
$('asrResults').addEventListener('input', event => { const target = event.target as HTMLTextAreaElement; const key = target.dataset.edit as AsrEngine | undefined; if (key) { const item = asrResults.get(key); if (item) item.edited = target.value; } });
$('asrResults').addEventListener('click', event => { const target = event.target as HTMLButtonElement; const key = target.dataset.use as AsrEngine | undefined; if (key) { const item = asrResults.get(key); if (item && !item.error) { transcript.value = item.edited ?? item.raw; transcript.dispatchEvent(new Event('input')); setStatus('success', `${ASR_MODELS[key].label}: متن برای استخراج انتخاب شد.`); } } });
function downloadJson(filename: string, value: unknown): void { const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
$('report').onclick = () => { const report = { createdAt: new Date().toISOString(), audioSeconds, audioIncluded: false, reference: $<HTMLTextAreaElement>('reference').value || null, normalization: 'NFKC; ی/ک/ه/ا یکسان؛ ارقام فارسی/عربی به لاتین؛ حذف اعراب، نیم‌فاصله و علائم؛ فشرده‌سازی فاصله‌ها', engines: [...asrResults.values()].map(r => ({ ...r, model: ASR_MODELS[r.engine] })), jsonModel: $<HTMLSelectElement>('apiModel').value, schema: schemaInput.value || null, jsonComparisons: Object.fromEntries(jsonResults) }; downloadJson('ava-comparison.json', report); };
$('compareJson').onclick = async () => {
  if (busy) return;
  const candidates = [...asrResults.values()].filter(x => !x.error);
  if (candidates.length < 2) return showError('برای مقایسه JSON، دست‌کم دو متن ASR موفق لازم است.');
  let schema;
  try { schema = forceClosedObjects(parseSchema(schemaInput.value)); } catch (error) { return showError('قالب معتبر نیست: ' + errorMessage(error)); }
  cancelled = false; setBusy(true); progress.textContent = ''; jsonResults.clear(); $('jsonCompare').hidden = false; $('jsonCompareResults').innerHTML = '';
  const model = $<HTMLSelectElement>('apiModel').value as OpenRouterModel;
  try {
    for (const item of candidates) {
      if (cancelled) break;
      setStatus('working', `استخراج JSON از متن ${ASR_MODELS[item.engine].label}`);
      const source = item.edited ?? item.raw, began = performance.now();
      try { const value = await runExtraction(source, schema, model); jsonResults.set(item.engine, { result: value, extractionMs: performance.now() - began, model, source }); }
      catch (error) { if (errorMessage(error) === 'پردازش لغو شد.') break; jsonResults.set(item.engine, { error: errorMessage(error), extractionMs: performance.now() - began, model, source }); }
      $('jsonCompareResults').innerHTML = [...jsonResults].map(([engine, row]) => `<article class="result-card"><h3>${escapeHtml(ASR_MODELS[engine as AsrEngine].label)}</h3><div class="status ${row.error ? 'error' : 'success'}">${row.error ? escapeHtml(row.error) : 'JSON از نظر ساختاری معتبر است؛ صحت معنایی بازبینی شود.'}</div><div class="metrics">استخراج: ${formatTime(row.extractionMs)} · ${escapeHtml(row.model)}</div><pre class="output" dir="ltr">${row.result ? highlight(JSON.stringify(row.result, null, 2)) : ''}</pre></article>`).join('');
    }
    if (!cancelled) setStatus('success', 'مقایسه JSON پایان یافت. نتیجهٔ هر متن را جدا بازبینی کنید.');
  } finally { setBusy(false); }
};

async function refreshTemplates(): Promise<void> { const select = $<HTMLSelectElement>('templates'); const old = select.value; select.innerHTML = '<option value="">قالب‌های ذخیره‌شده</option>'; for (const t of await listTemplates()) { const option = document.createElement('option'); option.value = t.id; option.textContent = t.name; select.append(option); } select.value = old; }
$('saveTemplate').onclick = async () => { try { parseSchema(schemaInput.value); const name = $<HTMLInputElement>('templateName').value.trim(); if (!name) throw new Error('نام قالب را وارد کنید.'); const id = $<HTMLSelectElement>('templates').value || crypto.randomUUID(); await saveTemplate({ id, name, schema: schemaInput.value, updated: Date.now() }); await refreshTemplates(); $<HTMLSelectElement>('templates').value = id; setStatus('success', 'قالب در IndexedDB ذخیره شد.'); } catch (e) { showError(errorMessage(e)); } };
$<HTMLSelectElement>('templates').onchange = async e => { const t = (await listTemplates()).find(x => x.id === (e.target as HTMLSelectElement).value); if (t) { schemaInput.value = t.schema; $<HTMLInputElement>('templateName').value = t.name; schemaInput.dispatchEvent(new Event('input')); } };
$('deleteTemplate').onclick = async () => { const select = $<HTMLSelectElement>('templates'); if (!select.value) return; await deleteTemplate(select.value); await refreshTemplates(); setStatus('success', 'قالب ذخیره‌شده حذف شد.'); };
$('exportTemplate').onclick = () => { try { parseSchema(schemaInput.value); const url = URL.createObjectURL(new Blob([schemaInput.value], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = 'ava-schema.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); } catch (e) { showError(errorMessage(e)); } };
$<HTMLInputElement>('importTemplate').onchange = async e => { const file = (e.target as HTMLInputElement).files?.[0]; if (!file) return; try { const text = await file.text(); parseSchema(text); schemaInput.value = JSON.stringify(JSON.parse(text), null, 2); schemaInput.dispatchEvent(new Event('input')); setStatus('success', 'قالب وارد شد؛ برای نگهداری آن ذخیره کنید.'); } catch (error) { showError(errorMessage(error)); } };

async function updateCache(): Promise<void> {
  if (!('caches' in window)) return;
  let bytes = 0; const files: string[] = [];
  for (const key of await caches.keys()) for (const request of await (await caches.open(key)).keys()) { const response = await (await caches.open(key)).match(request); bytes += Number(response?.headers.get('content-length') || 0); files.push(request.url); }
  $('cacheSize').textContent = `حداقل ${(bytes / 1048576).toFixed(1)} مگابایت طبق Content-Length پاسخ‌های کش‌شده؛ اندازهٔ واقعی کش ممکن است بیشتر باشد.`;
  const models = Object.values(ASR_MODELS);
  const seen = models.filter(model => files.some(url => url.includes(model.repo)));
  const persistent = await navigator.storage?.persisted?.().catch(() => false);
  $('offline').textContent = `فایل‌هایی از ${seen.map(model => model.label).join('، ') || 'هیچ مدل'} در کش مرورگر دیده شدند. ${persistent ? 'نگهداری پایدار مرورگر فعال است.' : 'مرورگر ممکن است کش را در کمبود فضا حذف کند؛ می‌توانید نگهداری پایدار را درخواست کنید.'}`;
}
$('persistStorage').onclick = async () => { if (!navigator.storage?.persist) return showError('این مرورگر نگهداری پایدار را پشتیبانی نمی‌کند.'); try { const granted = await navigator.storage.persist(); setStatus(granted ? 'success' : 'error', granted ? 'نگهداری پایدار کش مدل‌ها فعال شد.' : 'مرورگر درخواست نگهداری پایدار را نپذیرفت؛ کش فعلی همچنان باقی است.'); await updateCache(); } catch (error) { showError(errorMessage(error)); } };
$('clearCache').onclick = async () => { if (busy) $('cancel').click(); const keys = await caches.keys(); await Promise.all(keys.filter(k => k.startsWith('ava-models') || k.includes('transformers')).map(k => caches.delete(k))); await updateCache(); setStatus('success', 'کش مدل‌های قابل شناسایی حذف شد.'); };
async function init(): Promise<void> {
  updateModelInfo();
  try {
    const response = await fetch('/api/status', { cache: 'no-store' });
    const state = await response.json() as { configured?: boolean };
    const indicator = $('apiKeyStatus');
    indicator.className = `key-status ${response.ok && state.configured ? 'ready' : 'missing'}`;
    indicator.textContent = response.ok && state.configured ? '● اتصال OpenRouter آماده است؛ کلید در سرور محلی نگهداری می‌شود.' : '● کلید OpenRouter در سرور تنظیم نشده است. فایل .env را بررسی و سرور را دوباره اجرا کنید.';
  } catch {
    const indicator = $('apiKeyStatus');
    indicator.className = 'key-status missing';
    indicator.textContent = '● سرویس محلی در دسترس نیست. برنامه را با npm run dev یا npm start اجرا کنید.';
  }
  const device = await requireDevice().catch(() => null);
  $('capability').textContent = device === 'webgpu' ? 'برای مدل‌های صوتی آداپتور WebGPU در دسترس است؛ سازگاری مدل هنگام بارگذاری بررسی می‌شود.' : device === 'wasm' ? 'برای مدل‌های صوتی WebGPU در دسترس نیست. اجرای WASM آزمایش می‌شود؛ ممکن است به حافظهٔ زیادی نیاز داشته باشد.' : 'این مرورگر برای اجرای مدل‌های صوتی مناسب نیست: WebGPU و WASM در دسترس نیستند.';
  await refreshTemplates(); await updateCache();
  if (import.meta.env.PROD && 'serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
}
init().catch(e => showError(errorMessage(e)));

