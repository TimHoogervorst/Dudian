import {api} from './ui.js';
import {icon} from './icons.js';
import {loginLandscape} from './login-landscape.js';

const form = document.querySelector('#account-form');
const submit = form.querySelector('[type=submit]');
const toggle = form.querySelector('.switch-account');
const {username,password} = form.elements;
const error = document.querySelector('#account-error');
let registering = false;
username.before(icon('person'));
password.before(icon('lock'));
const visibility = form.querySelector('.password-visibility');
function showPassword(visible) {
  password.type = visible ? 'text' : 'password';
  visibility.setAttribute('aria-label', visible ? 'Hide password' : 'Show password');
  visibility.replaceChildren(icon(visible ? 'eyeOff' : 'eye'));
}
showPassword(false);
visibility.onclick = () => showPassword(password.type === 'password');

toggle.onclick = () => {
  registering = !registering;
  showPassword(false);
  submit.textContent = registering ? 'Create account' : 'Log in';
  toggle.textContent = registering ? 'Use an existing account' : 'Create an account';
  document.title = submit.textContent + ' · Dudian';
  form.setAttribute('aria-label', submit.textContent);
  form.action = registering ? '/api/register' : '/api/login';
  password.autocomplete = registering ? 'new-password' : 'current-password';
  password.minLength = registering ? 8 : 1;
  error.textContent = '';
  username.focus();
};

form.onsubmit = async event => {
  event.preventDefault();
  if (submit.disabled) return;
  submit.disabled = toggle.disabled = true;
  error.textContent = '';
  try {
    await api(form.getAttribute('action'), {username:username.value,password:password.value});
    location.replace('/' + location.hash);
  } catch (failure) {
    error.textContent = failure.message;
    submit.disabled = toggle.disabled = false;
  }
};

api('/api/reader-count').then(({count}) => {
  const people = count === 1 ? 'person has' : 'people have';
  document.querySelector('#reader-count').textContent =
    new Intl.NumberFormat('en').format(count) + ' ' + people + ' joined Dudian.';
}).catch(() => { /* The login form works independently of the count. */ });

const scenes = [
  {lines:['你想喝什么？','一杯茶，谢谢。'], word:'茶'},
  {lines:['雨停了。','她推开窗，看见楼下那只猫。'], word:'窗'},
  {lines:['我们走哪条路？','沿着河走吧。'], word:'河'},
  {lines:['书里夹着一张车票。','她还记得那天的风。'], word:'风'},
  {lines:['这是谁的伞？','是我的，谢谢你。'], word:'伞'},
  {lines:['天刚亮。','街角的小店开了门。'], word:'门'},
  {lines:['月亮出来了。','湖面上亮起一条银线。'], word:'月'},
  {lines:['你听见了吗？','树上有只鸟。'], word:'鸟'},
  {lines:['灯还亮着。','有人在窗边看书。'], word:'灯'},
  {lines:['要一起走吗？','好呀，等我一下。'], word:'走'},
  {lines:['船靠岸了。','爷爷提着鱼回来了。'], word:'鱼'},
  {lines:['花开了吗？','你看，开了三朵。'], word:'花'},
  {lines:['这些不是你们要找的机器人。','哦，那你们走吧。'], word:'找'},
  {lines:['我爱你。','我也爱你。','我最爱你。','我最爱你！'], word:'爱'},
];
const backdrop = document.querySelector('.login-backdrop');
const card = document.querySelector('.login-card');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const landscape = document.querySelector('.login-landscape');
const touchesInk = loginLandscape(landscape,card,reducedMotion);
const inset = 12;
function clearOf(x, y, width, height, occupied) {
  return occupied.every(rect => x + width + inset <= rect.left || x >= rect.right + inset ||
    y + height + inset <= rect.top || y >= rect.bottom + inset);
}
function makePassage(scene, alreadyVisible) {
  const passage = document.createElement('div');
  passage.className = alreadyVisible ? 'passage already-visible' : 'passage';
  let lastGlyphDelay = 0;
  passage.style.setProperty('--fade', (1.2 + Math.random() * 3.8) + 's');
  scene.lines.forEach((line,lineIndex) => {
    const row = document.createElement('p');
    Array.from(line).forEach((character,column) => {
      const glyph = document.createElement('span');
      glyph.textContent = character;
      const delay = lineIndex * 1.8 + column * 0.12;
      lastGlyphDelay = Math.max(lastGlyphDelay, delay);
      glyph.style.setProperty('--delay', delay + 's');
      if (character === scene.word) glyph.className = 'highlight';
      row.append(glyph);
    });
    passage.append(row);
  });
  // Leave time to read the final reply once its ink has appeared.
  const minimumHold = alreadyVisible ? 1 : lastGlyphDelay + 2;
  passage.style.setProperty('--hold', (minimumHold + Math.random() ** 1.5 * 54) + 's');
  passage.onanimationend = event => {
    if (event.target !== passage || !passage.isConnected) return;
    passage.remove();
    schedulePassage();
  };
  return passage;
}

function addPassage(alreadyVisible = false) {
  const active = Array.from(backdrop.children);
  const available = scenes.filter(scene => !active.some(node => node.dataset.scene === scene.word));
  const scene = available[Math.floor(Math.random() * available.length)];
  const passage = makePassage(scene, alreadyVisible);
  passage.dataset.scene = scene.word;
  backdrop.append(passage);
  const {width,height} = passage.getBoundingClientRect();
  const occupied = [card,...active].map(node => node.getBoundingClientRect());
  const rangeX = backdrop.clientWidth - width - inset * 2;
  const rangeY = backdrop.clientHeight - height - inset * 2;
  if (rangeX >= 0 && rangeY >= 0) {
    for (let attempt = 0; attempt < 64; attempt++) {
      const x = inset + Math.random() * rangeX;
      const y = inset + Math.random() * rangeY;
      if (clearOf(x, y, width, height, occupied) && !touchesInk(x,y,width,height)) {
        passage.style.left = x + 'px';
        passage.style.top = y + 'px';
        return true;
      }
    }
  }
  passage.remove();
  return false;
}

const pendingArrivals = new Set();
function schedulePassage(firstArrival = false) {
  // Each passage has its own replacement timer.
  const delay = firstArrival ? 750 + Math.random() * 15000 : 350 + Math.random() ** 2 * 7500;
  const timer = setTimeout(() => {
    pendingArrivals.delete(timer);
    if (!addPassage()) schedulePassage();
  }, delay);
  pendingArrivals.add(timer);
}
function layoutBackdrop(retire = false) {
  const width = backdrop.clientWidth;
  const height = backdrop.clientHeight;
  const cardRect = card.getBoundingClientRect();
  const cardArea = cardRect.width * cardRect.height;
  const density = (width * height - cardArea) / (1920 * 1080 - cardArea);
  const limit = document.hidden || !height ? 0 : reducedMotion.matches ? 1 :
    Math.max(1, Math.min(8, Math.round(8 * density)));
  const occupied = [cardRect];
  for (const passage of Array.from(backdrop.children)) {
    const rect = passage.getBoundingClientRect();
    if (occupied.length > limit || rect.right > width - inset || rect.bottom > height - inset ||
        !clearOf(rect.x, rect.y, rect.width, rect.height, occupied)) passage.remove();
    else if (touchesInk(rect.x, rect.y, rect.width, rect.height)) {
      if ((retire === true || passage.classList.contains('retiring')) && !reducedMotion.matches) {
        passage.classList.add('retiring');
        occupied.push(rect);
      } else passage.remove();
    } else occupied.push(rect);
  }
  // Keep passages and arrival timers that still fit when the viewport changes.
  for (const timer of pendingArrivals) {
    if (backdrop.childElementCount + pendingArrivals.size <= limit) break;
    clearTimeout(timer);
    pendingArrivals.delete(timer);
  }
  for (let slot = backdrop.childElementCount + pendingArrivals.size; slot < limit; slot++) {
    if (slot < Math.ceil(limit / 2) && addPassage(true)) continue;
    if (!reducedMotion.matches) schedulePassage(true);
  }
}
const layoutChanges = new ResizeObserver(layoutBackdrop);
landscape.addEventListener('landscape-layout',event => layoutBackdrop(event.detail.retire));
layoutChanges.observe(card);
layoutChanges.observe(backdrop);
reducedMotion.addEventListener('change', () => {
  backdrop.replaceChildren();
  pendingArrivals.forEach(clearTimeout);
  pendingArrivals.clear();
  layoutBackdrop();
});
document.addEventListener('visibilitychange', layoutBackdrop);
