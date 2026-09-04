const canvas = document.getElementById("fireworks");
const ctx = canvas.getContext("2d", { alpha: true });

const startBtn = document.getElementById("startBtn");
const replayBtn = document.getElementById("replayBtn");
const hero = document.querySelector(".hero");
const countdown = document.getElementById("countdown");
const countValue = document.getElementById("countValue");
const showUi = document.getElementById("showUi");

let W = 0;
let H = 0;
let DPR = 1;
let running = true;
let raf = 0;

const rockets = [];
const particles = [];
const glitters = [];
const flashes = [];

const MAX_PARTICLES = 1250;
const MAX_ROCKETS = 18;
const MAX_GLITTER = 260;

const TAU = Math.PI * 2;

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 1.5);
  W = window.innerWidth;
  H = window.innerHeight;

  canvas.width = Math.floor(W * DPR);
  canvas.height = Math.floor(H * DPR);
  canvas.style.width = W + "px";
  canvas.style.height = H + "px";

  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}

window.addEventListener("resize", resize, { passive: true });
resize();

/* Pre-rendered glow sprites: much cheaper than creating gradients per particle/frame. */
const spriteCache = new Map();

function getSprite(hue, size) {
  const key = `${Math.round(hue / 8) * 8}_${size}`;
  if (spriteCache.has(key)) return spriteCache.get(key);

  const s = size * 8;
  const off = document.createElement("canvas");
  off.width = off.height = s;
  const c = off.getContext("2d");
  const g = c.createRadialGradient(s/2, s/2, 0, s/2, s/2, s/2);
  g.addColorStop(0, `hsla(${hue},100%,96%,1)`);
  g.addColorStop(.08, `hsla(${hue},100%,88%,1)`);
  g.addColorStop(.25, `hsla(${hue},100%,68%,.56)`);
  g.addColorStop(1, `hsla(${hue},100%,55%,0)`);
  c.fillStyle = g;
  c.fillRect(0, 0, s, s);

  spriteCache.set(key, off);
  return off;
}

function pickHue() {
  const colors = [4, 22, 38, 52, 190, 205, 225, 260, 292, 320];
  return colors[(Math.random() * colors.length) | 0];
}

class Rocket {
  constructor(x, targetY, hue, delay = 0, burst = "normal") {
    this.x = x;
    this.y = H + 15;
    this.targetY = targetY;
    this.vx = (Math.random() - .5) * .7;
    this.vy = -(9.5 + Math.random() * 2.1);
    this.hue = hue;
    this.delay = delay;
    this.burst = burst;
    this.age = -delay;
    this.trail = [];
    this.dead = false;
  }

  update(dt) {
    this.age += dt;
    if (this.age < 0) return;

    this.trail.push([this.x, this.y]);
    if (this.trail.length > 11) this.trail.shift();

    this.x += this.vx * dt * 60;
    this.y += this.vy * dt * 60;
    this.vy += .105 * dt * 60;

    if (this.y <= this.targetY || this.vy >= -1.5) {
      if (this.burst === "heart") {
        heartExplosion(this.x, this.y, this.hue);
        heartFollowupSequence(this.x, this.y);
      } else if (this.burst === "ring") {
        ringExplosion(this.x, this.y, this.hue);
      } else {
        explode(this.x, this.y, this.hue);
      }
      this.dead = true;
    }
  }

  draw() {
    if (this.age < 0) return;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    for (let i = 0; i < this.trail.length - 1; i++) {
      const a = i / this.trail.length;
      ctx.strokeStyle = `hsla(${this.hue},100%,72%,${a * .35})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(this.trail[i][0], this.trail[i][1]);
      ctx.lineTo(this.trail[i+1][0], this.trail[i+1][1]);
      ctx.stroke();
    }

    const glow = getSprite(this.hue, 2);
    ctx.globalAlpha = .9;
    ctx.drawImage(glow, this.x - 8, this.y - 8, 16, 16);
    ctx.restore();
  }
}

class Particle {
  constructor(x, y, vx, vy, hue, size, life, type = "spark") {
    this.x = x;
    this.y = y;
    this.px = x;
    this.py = y;
    this.vx = vx;
    this.vy = vy;
    this.hue = hue;
    this.size = size;
    this.life = life;
    this.maxLife = life;
    this.type = type;
    this.dead = false;
    this.drag = type === "palm" ? .986 : .982;
    this.gravity = type === "palm" ? .035 : .07;
  }

  update(dt) {
    this.px = this.x;
    this.py = this.y;

    const step = dt * 60;
    this.vx *= Math.pow(this.drag, step);
    this.vy *= Math.pow(this.drag, step);
    this.vy += this.gravity * step;

    this.x += this.vx * step;
    this.y += this.vy * step;

    this.life -= dt;

    if (this.life <= 0) this.dead = true;
  }

  draw() {
    const t = Math.max(0, this.life / this.maxLife);
    const alpha = Math.min(1, t * 1.8);

    ctx.globalAlpha = alpha;

    if (this.type === "spark" || this.type === "heart") {
      const isHeart = this.type === "heart";
      const boost = isHeart ? 1 : .9;
      ctx.globalAlpha = Math.min(1, alpha * (isHeart ? 1.18 : 1.06));
      ctx.strokeStyle = `hsla(${this.hue},100%,${isHeart ? 88 : 76 + t * 21}%,${alpha})`;
      ctx.lineWidth = Math.max(isHeart ? 1.25 : .8, this.size * t * boost);
      ctx.beginPath();
      ctx.moveTo(this.px, this.py);
      ctx.lineTo(this.x, this.y);
      ctx.stroke();
    } else {
      const sprite = getSprite(this.hue, this.size > 2 ? 3 : 2);
      const s = this.size * 6;
      ctx.drawImage(sprite, this.x - s/2, this.y - s/2, s, s);
    }
  }
}

class Glitter {
  constructor(x, y, hue) {
    this.x = x;
    this.y = y;
    this.vx = (Math.random() - .5) * 1.6;
    this.vy = Math.random() * .8 + .3;
    this.life = .25 + Math.random() * .55;
    this.maxLife = this.life;
    this.hue = hue;
    this.dead = false;
  }

  update(dt) {
    const step = dt * 60;
    this.vy += .02 * step;
    this.x += this.vx * step;
    this.y += this.vy * step;
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
  }

  draw() {
    const a = this.life / this.maxLife;
    ctx.globalAlpha = a;
    ctx.fillStyle = `hsla(${this.hue},100%,95%,${a})`;
    ctx.fillRect(this.x, this.y, 1.4, 1.4);
  }
}

function addParticle(p) {
  if (particles.length < MAX_PARTICLES) particles.push(p);
}

function explode(x, y, hue = pickHue(), size = 1) {
  const count = Math.min(145, Math.floor(100 + Math.random() * 30));

  /* Main spherical burst */
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * TAU;
    const speed = (2.1 + Math.pow(Math.random(), .35) * 4.7) * size;
    const variation = (Math.random() - .5) * .55;

    addParticle(new Particle(
      x, y,
      Math.cos(angle) * (speed + variation),
      Math.sin(angle) * (speed + variation),
      hue + (Math.random() - .5) * 12,
      Math.random() < .82 ? 1.25 : 1.9,
      .75 + Math.random() * .75,
      "spark"
    ));
  }

  /* Bright inner core */
  for (let i = 0; i < 22; i++) {
    const a = Math.random() * TAU;
    const s = .7 + Math.random() * 1.8;
    addParticle(new Particle(
      x, y,
      Math.cos(a) * s,
      Math.sin(a) * s,
      hue,
      2.4,
      .25 + Math.random() * .25,
      "glow"
    ));
  }

  /* Falling gold glitter */
  for (let i = 0; i < 24 && glitters.length < MAX_GLITTER; i++) {
    glitters.push(new Glitter(x, y, hue < 80 ? 48 : hue));
  }

  flashes.push({ x, y, r: 5, life: .16, hue });
}

function ringExplosion(x, y, hue) {
  const count = 86;
  for (let i = 0; i < count; i++) {
    const a = TAU * i / count;
    const speed = 3.5 + Math.random() * .7;
    addParticle(new Particle(
      x, y,
      Math.cos(a) * speed,
      Math.sin(a) * speed,
      hue,
      1.5,
      .95 + Math.random() * .25,
      "spark"
    ));
  }
  flashes.push({ x, y, r: 8, life: .18, hue });
}

function heartExplosion(x, y, hue) {
  const count = 210;

  /* Bright double-outline heart so the shape reads clearly over the skyline. */
  for (let layer = 0; layer < 2; layer++) {
    const scale = layer === 0 ? 4.8 : 4.45;
    const layerHue = layer === 0 ? hue : 350;

    for (let i = 0; i < count; i++) {
      const t = (i / count) * TAU;
      const jitter = .92 + Math.random() * .16;

      /* Parametric heart */
      const hx = 16 * Math.pow(Math.sin(t), 3);
      const hy = -(13 * Math.cos(t) - 5 * Math.cos(2*t) - 2 * Math.cos(3*t) - Math.cos(4*t));

      addParticle(new Particle(
        x + hx * scale,
        y + hy * scale,
        hx * .008 * jitter,
        hy * .008 * jitter + .16,
        layerHue + (Math.random() - .5) * 5,
        layer === 0 ? 2.05 : 1.45,
        1.65 + Math.random() * .45,
        "heart"
      ));
    }
  }

  /* White/pink center glow gives the heart a stronger focal point. */
  for (let i = 0; i < 32; i++) {
    const a = Math.random() * TAU;
    const speed = .35 + Math.random() * 1.1;
    addParticle(new Particle(
      x, y + 8,
      Math.cos(a) * speed,
      Math.sin(a) * speed,
      i % 2 ? 345 : 15,
      2.8,
      .5 + Math.random() * .35,
      "glow"
    ));
  }

  flashes.push({ x, y: y + 6, r: 12, life: .28, hue });
}

function launch(x, targetY, hue = pickHue(), delay = 0, burst = "normal") {
  if (rockets.length >= MAX_ROCKETS) return;
  rockets.push(new Rocket(x, targetY, hue, delay, burst));
}

function heartFollowupSequence(x, y) {
  /* Cinematic “pa-bam / pa-bam / pa-ba-bam” accents around the heart. */
  const spreadX = Math.min(W * .18, 250);
  const spreadY = Math.min(H * .10, 90);

  setTimeout(() => {
    explode(x - spreadX * .78, y + spreadY * .20, 42, .72);
    explode(x + spreadX * .78, y + spreadY * .20, 42, .72);
  }, 220);

  setTimeout(() => {
    ringExplosion(x - spreadX * .44, y - spreadY * .52, 205);
    ringExplosion(x + spreadX * .44, y - spreadY * .52, 320);
  }, 500);

  setTimeout(() => {
    explode(x - spreadX, y + spreadY * .64, 285, .84);
    explode(x + spreadX, y + spreadY * .64, 205, .84);
    explode(x, y - spreadY * .92, 48, .92);
  }, 790);

  setTimeout(() => {
    ringExplosion(x, y + spreadY * .28, 345);
  }, 1080);
}

function isMobile() {
  return W <= 700;
}

function randomX() {
  /* Desktop leaves the left copy column quiet; mobile can use the full sky after the intro hides. */
  if (isMobile()) return W * (.14 + Math.random() * .72);
  return W * (.42 + Math.random() * .46);
}

function startShow() {
  rockets.length = 0;
  particles.length = 0;
  glitters.length = 0;
  flashes.length = 0;

  hero.style.opacity = "0";
  hero.style.pointerEvents = "none";
  showUi.classList.add("show");

  /* Opening signature: one hero rocket rises first and blooms into a heart. */
  const heroX = W * (isMobile() ? .50 : .68);
  const heroY = H * (isMobile() ? .25 : .22);
  launch(heroX, heroY, 338, 0, "heart");

  /* Give the heart room to read, then build the show outward. */
  setTimeout(() => {
    launch(W * (isMobile() ? .22 : .48), H * .31, 205);
    launch(W * (isMobile() ? .78 : .84), H * .30, 320, .12);
  }, 1450);

  setTimeout(() => {
    launch(W * (isMobile() ? .34 : .57), H * .20, 40);
    launch(W * (isMobile() ? .66 : .77), H * .18, 275, .16);
  }, 1850);

  setTimeout(() => launch(randomX(), H * (.18 + Math.random()*.14), pickHue()), 2250);
  setTimeout(() => launch(randomX(), H * (.16 + Math.random()*.15), pickHue()), 2550);
  setTimeout(() => launch(randomX(), H * (.19 + Math.random()*.12), pickHue()), 2850);

  setTimeout(() => {
    const x = W * (isMobile() ? .38 : .58);
    explode(x, H * .27, 275, 1.18);
  }, 3250);

  setTimeout(() => {
    ringExplosion(W * (isMobile() ? .64 : .78), H * .24, 42);
  }, 3550);

  /* Finale: a fan of rockets, slightly staggered for a rolling finish. */
  setTimeout(() => {
    for (let i = 0; i < 8; i++) {
      launch(
        W * (isMobile() ? (.14 + i * .10) : (.43 + i * .065)),
        H * (.17 + Math.random() * .18),
        [205, 35, 285, 48, 320, 190, 15, 250][i],
        i * .085
      );
    }
  }, 4100);
}

function showCountdown() {
  countdown.classList.add("show");

  let n = 3;
  countValue.textContent = n;

  const timer = setInterval(() => {
    n--;

    if (n <= 0) {
      clearInterval(timer);
      countdown.classList.remove("show");
      startShow();
      return;
    }

    countValue.textContent = n;
  }, 720);
}

function clearShow() {
  rockets.length = 0;
  particles.length = 0;
  glitters.length = 0;
  flashes.length = 0;
  showUi.classList.remove("show");
  hero.style.opacity = "1";
  hero.style.pointerEvents = "auto";
}

startBtn.addEventListener("click", showCountdown);
replayBtn.addEventListener("click", showCountdown);

let last = performance.now();

function animate(now) {
  const dt = Math.min((now - last) / 1000, .032);
  last = now;

  /* Keep the canvas fully transparent so the background photo always stays visible.
     Particle/rocket trails are drawn explicitly below, so we do not darken the
     whole canvas frame-by-frame. */
  ctx.globalCompositeOperation = "source-over";
  ctx.clearRect(0, 0, W, H);
  ctx.globalCompositeOperation = "lighter";

  for (let i = rockets.length - 1; i >= 0; i--) {
    const r = rockets[i];
    r.update(dt);
    r.draw();
    if (r.dead) rockets.splice(i, 1);
  }

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.update(dt);
    if (!p.dead) p.draw();
    else particles.splice(i, 1);
  }

  for (let i = glitters.length - 1; i >= 0; i--) {
    const g = glitters[i];
    g.update(dt);
    if (!g.dead) g.draw();
    else glitters.splice(i, 1);
  }

  for (let i = flashes.length - 1; i >= 0; i--) {
    const f = flashes[i];
    f.life -= dt;
    f.r += dt * 260;

    if (f.life <= 0) {
      flashes.splice(i, 1);
      continue;
    }

    const a = f.life / .18;
    const grad = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r);
    grad.addColorStop(0, `hsla(${f.hue},100%,100%,${a * .42})`);
    grad.addColorStop(.18, `hsla(${f.hue},100%,85%,${a * .18})`);
    grad.addColorStop(1, `hsla(${f.hue},100%,60%,0)`);
    ctx.fillStyle = grad;
    ctx.globalAlpha = 1;
    ctx.fillRect(f.x - f.r, f.y - f.r, f.r * 2, f.r * 2);
  }

  ctx.globalAlpha = 1;
  raf = requestAnimationFrame(animate);
}

raf = requestAnimationFrame(animate);

window.addEventListener("blur", () => {
  /* Don't accumulate huge time jumps while the tab is hidden. */
  last = performance.now();
});
