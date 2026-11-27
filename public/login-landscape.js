import {landscapeBrush} from './landscape-brush.js';

const scenes = [
  {name:'red-tree', wide:[[.89,.91],[.90,.47],[.76,.46]], phone:[[.86,.91],[.89,.46],[.72,.42]]},
  {name:'left-bank', wide:[[.11,.90],[.14,.48],[.22,.14]], phone:[[.16,.89],[.21,.49],[.29,.13]]},
  {name:'temple', wide:[[.88,.89],[.91,.55],[.92,.32]], phone:[[.86,.9],[.89,.55],[.93,.29]]},
];
const assets = new Map();
function loadScene(scene,format) {
  const url = '/landscapes/' + scene.name + '-' + format + '.png';
  if (!assets.has(url)) {
    const image = new Image();
    image.src = url;
    const loaded = image.decode().then(() => {
      // Sample the finished ink, including overhanging branches, once per asset.
      const sample = document.createElement('canvas');
      sample.width = 320;
      sample.height = Math.round(320 * image.naturalHeight / image.naturalWidth);
      const ctx = sample.getContext('2d');
      ctx.drawImage(image,0,0,sample.width,sample.height);
      const {data} = ctx.getImageData(0,0,sample.width,sample.height);
      const skyline = Array(32).fill(1);
      for (let y=0; y<sample.height; y++) {
        for (let x=0; x<sample.width; x++) {
          if (data[(y*sample.width+x)*4+3] > 12) {
            const column = Math.floor(x/10);
            skyline[column] = Math.min(skyline[column],y/sample.height);
          }
        }
      }
      return {scene,image,skyline};
    }).catch(error => { assets.delete(url); throw error; });
    assets.set(url,loaded);
  }
  return assets.get(url);
}

export function loginLandscape(host,card,motion) {
  const canvas = host.querySelector('canvas');
  const still = host.querySelector('img');
  let brush;
  let current, incoming, format, mode, frame, timer, version = 0;
  let bounds, redraw;
  let order = scenes.slice();
  function notify(retire = false) {
    host.dispatchEvent(new CustomEvent('landscape-layout',{detail:{retire}}));
  }
  function stop() {
    version++;
    clearTimeout(timer);
    cancelAnimationFrame(frame);
    redraw = null;
    current = incoming = null;
    canvas.hidden = still.hidden = true;
  }
  function show(asset,run) {
    current = asset;
    incoming = null;
    notify();
    still.src = asset.image.src;
    still.hidden = mode !== 'still';
    canvas.hidden = mode === 'still';
    if (mode === 'still') return;
    brush.load(asset.image,asset.scene[format]);
    let progress = 0, wipe = -.15;
    redraw = () => brush.draw(progress,wipe);
    function animate(duration,update,done) {
      const start = performance.now();
      let lastPaint = -Infinity;
      function tick(now) {
        if (version !== run) return;
        const t = Math.min(1,Math.max(0,(now-start)/duration));
        if (t === 1 || now-lastPaint >= 1000/30) {
          lastPaint = now;
          update(t);
          redraw();
        }
        if (t < 1) frame = requestAnimationFrame(tick);
        else done();
      }
      tick(start);
    }
    async function changeScene() {
      // Shuffle each set of three, avoiding a repeat across set boundaries.
      if (!order.length) order = scenes.slice();
      const choices = order.filter(scene => scene !== current.scene);
      const next = choices[Math.floor(Math.random()*choices.length)];
      try {
        const asset = await loadScene(next,format);
        if (version !== run) return;
        incoming = asset;
        notify(true);
        order = order.filter(scene => scene !== next);
        animate(1100,t => { wipe = -.15 + 1.3*t; },() => show(asset,run));
      } catch {
        if (version === run) timer = setTimeout(changeScene,10000);
      }
    }
    animate(15000 + Math.random()*10000,t => { progress = t*1.12; },() => {
      timer = setTimeout(changeScene,8000 + Math.random()*7000);
    });
  }
  function layout() {
    const nextFormat = innerWidth <= 800 ? 'phone' : 'wide';
    const phone = nextFormat === 'phone';
    const vh = document.documentElement.clientHeight;
    const room = vh - card.getBoundingClientRect().bottom - 12;
    // On desktop, only the low center shoreline shares the form's column.
    const height = Math.floor(Math.min(innerWidth * (phone ? .30 : .20),
      vh * (phone ? .19 : .32), room * (phone ? 1 : 1.6)));
    const keyboard = phone && window.visualViewport?.height < vh - 100;
    const hidden = document.hidden || keyboard || height < (phone?65:52);
    host.hidden = hidden;
    host.style.height = Math.max(0,height) + 'px';
    bounds = host.getBoundingClientRect();
    // The painting is decorative. Keep GPU work bounded on high-DPI monitors.
    const scale = Math.min(devicePixelRatio,1.5,2000/innerWidth);
    const widthPx = Math.max(1,Math.round(bounds.width*scale));
    const heightPx = Math.max(1,Math.round(bounds.height*scale));
    if (canvas.width !== widthPx || canvas.height !== heightPx) {
      canvas.width = widthPx;
      canvas.height = heightPx;
      redraw?.();
    }
    if (!hidden && !motion.matches && brush === undefined) brush = landscapeBrush(canvas);
    const nextMode = hidden ? 'off' : motion.matches || !brush ? 'still' : 'draw';
    if (format === nextFormat && mode === nextMode) { notify(); return; }
    const scene = current?.scene ?? scenes[0];
    stop();
    format = nextFormat;
    mode = nextMode;
    notify();
    if (hidden) return;
    const run = version;
    order = scenes.filter(item => item !== scene);
    loadScene(scene,format).then(asset => {
      if (version === run) show(asset,run);
    }).catch(() => { /* Artwork is independent of account access. */ });
  }
  canvas.addEventListener('webglcontextlost',event => {
    event.preventDefault();
    brush = null;
    layout();
  });
  new ResizeObserver(layout).observe(card);
  window.addEventListener('resize',layout);
  window.visualViewport?.addEventListener('resize',layout);
  document.addEventListener('visibilitychange',layout);
  motion.addEventListener('change',layout);
  layout();
  return function touchesInk(x,y,width,height) {
    if (!current || y+height+32 < bounds.top) return false;
    const first = Math.max(0,Math.floor((x-32)/bounds.width*32));
    const last = Math.min(31,Math.floor((x+width+32)/bounds.width*32));
    for (let i=first; i<=last; i++) {
      const edge = Math.min(current.skyline[i],incoming?.skyline[i] ?? 1);
      if (edge < 1 && y+height+32 > bounds.top + edge*bounds.height) return true;
    }
    return false;
  };
}
