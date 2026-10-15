import { Roulette } from './roulette';
import { stages, type StageDef } from './data/maps';
import options from './options';
import { normalizeNames } from './nameInput';

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const names = $<HTMLTextAreaElement>('#in_names');
const settings = $('#settings');
const startButton = $<HTMLButtonElement>('#btnStart');
const shuffleButton = $<HTMLButtonElement>('#btnShuffle');
const resetButton = $<HTMLButtonElement>('#btnReset');
const mapSelect = $<HTMLSelectElement>('#sltMap');
const rank = $<HTMLInputElement>('#in_winningRank');
const rangeStart = $<HTMLInputElement>('#in_rangeStart');
const rangeEnd = $<HTMLInputElement>('#in_rangeEnd');
const notice = $('#notice');
const gallery = $<HTMLDialogElement>('#mapGallery');
const recording = $<HTMLInputElement>('#chkAutoRecording');
const darkMode = $<HTMLInputElement>('#chkDarkMode');
const skill = $<HTMLInputElement>('#chkSkill');
const mapTitles = ['운명의 수레바퀴', '버블팝', '욕망의 항아리', '밤을 달리다 (by item4)'];
type WinnerType = 'first' | 'last' | 'custom' | 'multi';
let winnerType: WinnerType = 'first';
let running = false;
let initialized = false;
let count = 0;
let finished = false;
let inputTimer: ReturnType<typeof setTimeout> | undefined;
let finishTimer: ReturnType<typeof setTimeout> | undefined;

function read(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function remember(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* The game also works with storage disabled. */ }
}
function announce(message: string) { $('#announcement').textContent = message; }
function toast(message: string) {
  const node = document.createElement('div');
  node.className = 'toast';
  node.setAttribute('role', 'status');
  node.textContent = message;
  document.body.append(node);
  setTimeout(() => node.remove(), 2400);
}

const roulette = new Roulette();
// Preserve the original page's small public interface for inspection and embedding.
Object.assign(window, { roulette, options });

function updateWinner(changed?: 'start' | 'end') {
  const maximum = Math.max(1, count);
  const integer = (input: HTMLInputElement) => Math.min(maximum, Math.max(1, Math.trunc(Number(input.value)) || 1));
  let first = 1;
  let last = 1;
  if (winnerType === 'last') first = last = maximum;
  if (winnerType === 'custom') first = last = integer(rank);
  if (winnerType === 'multi') {
    first = integer(rangeStart);
    last = integer(rangeEnd);
    if (last < first) changed === 'end' ? first = last : last = first;
  }
  for (const input of [rank, rangeStart, rangeEnd]) input.max = String(maximum);
  rank.value = String(first);
  rangeStart.value = String(first);
  rangeEnd.value = String(last);
  if (initialized) roulette.setWinnerRange(first - 1, last - 1);
  document.querySelectorAll<HTMLButtonElement>('[data-winner]').forEach(button => {
    const active = button.dataset.winner === winnerType;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  rank.classList.toggle('active', winnerType === 'custom');
  $('.row-range').classList.toggle('active', winnerType === 'multi');
}

function prepare(normalize = false) {
  clearTimeout(inputTimer);
  clearTimeout(finishTimer);
  if (!initialized || running) return;
  const parsed = normalizeNames(names.value);
  if (normalize) names.value = parsed.text;
  roulette.setMarbles(parsed.entries);
  count = roulette.getCount();
  finished = false;
  settings.dataset.state = 'ready';
  startButton.disabled = count === 0;
  shuffleButton.disabled = count === 0;
  remember('mbr_names', parsed.text);
  updateWinner();
  if (normalize && parsed.limited) toast('구슬은 최대 500개, 이름은 80자까지 사용할 수 있습니다.');
}

function showSettings() {
  clearTimeout(finishTimer);
  settings.classList.remove('hide');
  resetButton.hidden = true;
}

function reset() {
  if (!initialized) return;
  running = false;
  // Cancels pending recording downloads before a new round is created.
  roulette.cancelRecording();
  showSettings();
  prepare();
  announce('경기를 초기화했습니다. 다시 시작할 수 있습니다.');
}

async function start() {
  if (!initialized || running) return;
  if (finished) prepare();
  const parsed = normalizeNames(names.value);
  if (!parsed.total) { toast('먼저 이름을 입력해주세요.'); names.focus(); return; }
  if (inputTimer !== undefined) prepare(true);
  running = true;
  settings.dataset.state = 'running';
  settings.classList.add('hide');
  resetButton.hidden = false;
  announce(`${count}개의 구슬로 경기를 시작합니다.`);
  roulette.start();
}

function changeMap(index: number) {
  if (!initialized || running) return;
  roulette.setMap(index);
  mapSelect.value = String(index);
  remember('mbr_map', String(index));
  prepare();
  announce(`${mapTitles[index]} 맵을 선택했습니다.`);
}

function thumbnail(stage: StageDef): string {
  const c = document.createElement('canvas');
  c.width = 100;
  c.height = 140;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, c.width, c.height);
  const scale = 124 / stage.goalY;
  ctx.translate(50 - 13 * scale, 5);
  ctx.scale(scale, scale);
  ctx.strokeStyle = '#86e7e8';
  ctx.lineWidth = 1 / scale;
  for (const entity of stage.entities ?? []) {
    ctx.save();
    ctx.translate(entity.position.x, entity.position.y);
    ctx.beginPath();
    const shape = entity.shape;
    if (shape.type === 'polyline') {
      shape.points.forEach(([x, y], i) => i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y));
      ctx.stroke();
    } else {
      ctx.fillStyle = shape.type === 'circle' ? '#f9ec48' : '#00e1e3';
      if (shape.type === 'circle') ctx.arc(0, 0, shape.radius, 0, Math.PI * 2);
      else { ctx.rotate(shape.rotation); ctx.rect(-shape.width, -shape.height, shape.width * 2, shape.height * 2); }
      ctx.fill();
    }
    ctx.restore();
  }
  return c.toDataURL();
}

function buildMapGallery() {
  const descriptions = ['회전하는 장애물과 지그재그 코스를 통과하세요.', '톡톡 튀는 구슬 사이로 행운의 길을 찾아보세요.', '거대한 항아리 안에서 마지막까지 알 수 없는 레이스.', '길고 다채로운 코스에서 펼쳐지는 한밤의 질주.'];
  stages.forEach((stage, index) => {
    mapSelect.add(new Option(mapTitles[index], String(index)));
    const card = document.createElement('article');
    card.className = 'mb-card';
    const thumb = document.createElement('div');
    thumb.className = 'mb-thumb';
    const img = new Image(); img.src = thumbnail(stage); img.alt = `${mapTitles[index]} 코스 미리보기`;
    thumb.append(img);
    const info = document.createElement('div'); info.className = 'mb-card-info';
    const title = document.createElement('strong'); title.className = 'mb-card-title'; title.textContent = mapTitles[index];
    const desc = document.createElement('span'); desc.className = 'mb-card-author'; desc.textContent = descriptions[index];
    info.append(title, desc);
    const choose = document.createElement('button');
    choose.className = 'mb-action mb-action-install'; choose.textContent = '선택';
    choose.setAttribute('aria-label', `${mapTitles[index]} 선택`);
    choose.addEventListener('click', () => { changeMap(index); gallery.close(); });
    card.append(thumb, info, choose);
    $('#mapList').append(card);
  });
}

function openNotice() {
  notice.style.display = 'flex';
  settings.inert = true;
  resetButton.inert = true;
  $('#closeNotice').focus();
}
function closeNotice() {
  notice.style.display = 'none';
  settings.inert = false;
  resetButton.inert = false;
  remember('mbr_help_seen', '1');
  $('#btnNotice').focus();
}

names.addEventListener('input', () => {
  clearTimeout(inputTimer);
  inputTimer = setTimeout(() => { prepare(); inputTimer = undefined; }, 180);
});
names.addEventListener('blur', () => { prepare(true); inputTimer = undefined; });
shuffleButton.addEventListener('click', () => { prepare(true); announce('구슬을 섞었습니다.'); });
startButton.addEventListener('click', () => { void start(); });
resetButton.addEventListener('click', reset);
mapSelect.addEventListener('change', () => changeMap(Number(mapSelect.value)));
document.querySelectorAll<HTMLButtonElement>('[data-winner]').forEach(button => {
  button.addEventListener('click', () => {
    const previous = winnerType;
    winnerType = button.dataset.winner as WinnerType;
    if (winnerType === 'multi' && previous !== 'multi') rangeEnd.value = String(Math.min(3, count));
    updateWinner();
  });
});
rank.addEventListener('change', () => { winnerType = 'custom'; updateWinner(); });
rangeStart.addEventListener('change', () => { winnerType = 'multi'; updateWinner('start'); });
rangeEnd.addEventListener('change', () => { winnerType = 'multi'; updateWinner('end'); });
skill.addEventListener('change', () => { options.useSkills = skill.checked; remember('mbr_skills', String(skill.checked)); });
darkMode.addEventListener('change', () => {
  roulette.setTheme(darkMode.checked ? 'dark' : 'light');
  document.documentElement.classList.toggle('light', !darkMode.checked);
  remember('mbr_dark', String(darkMode.checked));
});
recording.addEventListener('change', () => roulette.setAutoRecording(recording.checked));
$('#btnToggleSettings').addEventListener('click', () => {
  const collapsed = $('#extraSettings').classList.toggle('collapsed');
  $('.toggle-arrow').textContent = collapsed ? '▲' : '▼';
  $('#btnToggleSettings').setAttribute('aria-expanded', String(!collapsed));
});
$('#btnNotice').addEventListener('click', openNotice);
$('#closeNotice').addEventListener('click', closeNotice);
$('#btnMoreMaps').addEventListener('click', () => gallery.showModal());
$('#closeMaps').addEventListener('click', () => gallery.close());
notice.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeNotice();
  if (event.key === 'Tab') { event.preventDefault(); $('#closeNotice').focus(); }
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && running && !gallery.open && notice.style.display !== 'flex') reset();
});
roulette.addEventListener('goal', event => {
  running = false;
  finished = true;
  settings.dataset.state = 'finished';
  const result = (event as CustomEvent<{ winners: string[] }>).detail;
  announce(`당첨: ${result.winners.join(', ')}`);
  finishTimer = setTimeout(showSettings, 2000);
});
roulette.addEventListener('message', event => toast(String((event as CustomEvent).detail)));

buildMapGallery();
const queryNames = new URLSearchParams(location.search).get('names');
names.value = queryNames ?? read('mbr_names') ?? names.value;
const startedAt = performance.now();
function initialize() {
  if (!roulette.isReady) {
    if (performance.now() - startedAt > 15000) {
      $('#loading').textContent = '룰렛을 불러오지 못했습니다. 페이지를 새로고침해주세요.';
      return;
    }
    setTimeout(initialize, 50);
    return;
  }
  initialized = true;
  darkMode.checked = read('mbr_dark') !== 'false';
  darkMode.dispatchEvent(new Event('change'));
  skill.checked = read('mbr_skills') !== 'false';
  options.useSkills = skill.checked;
  if (!('MediaRecorder' in window) || !HTMLCanvasElement.prototype.captureStream) {
    recording.disabled = true;
    recording.title = '이 브라우저는 화면 녹화를 지원하지 않습니다.';
  }
  const savedMap = Number(read('mbr_map'));
  if (Number.isInteger(savedMap) && savedMap >= 0 && savedMap < stages.length) changeMap(savedMap);
  else prepare();
  $('#loading').remove();
  if (!read('mbr_help_seen')) openNotice();
}
initialize();
