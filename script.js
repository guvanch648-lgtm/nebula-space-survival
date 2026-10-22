(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const canvas = $("game-canvas");
  const ctx = canvas.getContext("2d");

  const ui = {
    score: $("score"),
    level: $("level"),
    lives: $("lives"),
    status: $("status-text"),

    start: $("start-screen"),
    pause: $("pause-screen"),
    over: $("game-over-screen"),

    startButton: $("start-button"),
    resumeButton: $("resume-button"),
    restartButton: $("restart-button"),
    menuButton: $("menu-button"),
    gameOverMenuButton: $("game-over-menu-button"),
    pauseButton: $("pause-button"),

    soundButton: $("sound-button"),
    leftButton: $("left-button"),
    rightButton: $("right-button"),
    laserButton: $("laser-button"),

    energyFill: $("energy-fill"),
    energySeconds: $("energy-seconds"),
    laserStatus: $("laser-status"),
    laserHint: $("laser-hint"),

    finalScore: $("final-score"),
    menuBest: $("menu-best"),
    toast: $("toast")
  };

  const COLORS = {
    cyan: "#4deaff",
    purple: "#b58cff",
    pink: "#ff5c9a",
    orange: "#ffad5a",
    white: "#eafaff"
  };

  let W = 0;
  let H = 0;
  let dpr = 1;

  let state = "ready";
  let lastTime = 0;
  let elapsed = 0;
  let score = 0;
  let level = 1;
  let lives = 3;
  let best = Number(localStorage.getItem("nebula-best") || 0);

  let selectedPlanet = "blue";
  let selectedShip = "fighter";

  let stars = [];
  let obstacles = [];
  let bonuses = [];
  let particles = [];
  let lasers = [];
  let floatingTexts = [];

  let spawnTimer = 0;
  let bonusTimer = 0;
  let shake = 0;
  let flash = 0;
  let toastTimer = 0;

  let soundOn = true;
  let audioContext = null;
  let masterGain = null;
  let musicGain = null;
  let musicTimer = null;
  let musicStep = 0;
  let laserOscillators = [];
  let laserGain = null;
  let laserActive = false;
  let laserPointerDown = false;
  let laserEnergy = 3;
  let rechargeDelay = 0;
  let shieldTime = 0;
  let invincibleTime = 0;

  const keys = {
    left: false,
    right: false
  };

  const player = {
    x: 0,
    y: 0,
    radius: 15,
    speed: 280,
    tilt: 0
  };

  const planetColors = {
    blue: ["#38d8ff", "#1c4de2"],
    purple: ["#e6a3ff", "#6033d5"],
    red: ["#ffdc86", "#e53b50"]
  };

  function random(min, max) {
    return min + Math.random() * (max - min);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function roundedRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();

    W = Math.max(1, rect.width);
    H = Math.max(1, rect.height);
    dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    player.x = clamp(player.x || W / 2, 18, W - 18);
    player.y = H - 58;

    createStars();
    draw();
  }

  function createStars() {
    const count = Math.floor((W * H) / 2500);

    stars = Array.from({ length: count }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      size: random(0.5, 1.8),
      speed: random(10, 45),
      alpha: random(0.2, 0.85),
      twinkle: random(0, Math.PI * 2)
    }));
  }

  function initAudio() {
    if (audioContext) {
      if (audioContext.state === "suspended") {
        audioContext.resume();
      }
      return;
    }

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) {
      showToast("BU BRAUZERDA AUDIO QO‘LLAB-QUVVATLANMAYDI");
      return;
    }

    audioContext = new AudioCtx();

    masterGain = audioContext.createGain();
    masterGain.gain.value = soundOn ? 0.55 : 0;
    masterGain.connect(audioContext.destination);

    musicGain = audioContext.createGain();
    musicGain.gain.value = 0.15;
    musicGain.connect(masterGain);
  }

  function tone(freq, duration, type = "sine", volume = 0.15, slide = 0) {
    if (!audioContext || !masterGain || !soundOn) return;

    const now = audioContext.currentTime;
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(1, freq), now);

    if (slide) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(1, freq + slide),
        now + duration
      );
    }

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(masterGain);

    osc.start(now);
    osc.stop(now + duration + 0.03);
  }

  function startMusic() {
    initAudio();

    if (!audioContext || musicTimer) return;

    const melody = [
      220, 261.63, 329.63, 392,
      329.63, 293.66, 261.63, 196
    ];

    musicStep = 0;

    musicTimer = setInterval(() => {
      if (!audioContext || state !== "playing" || !soundOn) return;

      const now = audioContext.currentTime;
      const note = melody[musicStep % melody.length];

      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();

      osc.type = "triangle";
      osc.frequency.setValueAtTime(note, now);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.055, now + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.48);

      osc.connect(gain);
      gain.connect(musicGain);

      osc.start(now);
      osc.stop(now + 0.5);

      if (musicStep % 4 === 0) {
        tone(70, 0.2, "sine", 0.07);
      }

      musicStep++;
    }, 370);
  }

  function stopMusic() {
    if (musicTimer) {
      clearInterval(musicTimer);
      musicTimer = null;
    }
  }

  function startLaserSound() {
    if (!audioContext || !masterGain || !soundOn || laserGain) return;

    const now = audioContext.currentTime;
    laserGain = audioContext.createGain();
    laserGain.gain.value = 0.0001;
    laserGain.connect(masterGain);

    const low = audioContext.createOscillator();
    const high = audioContext.createOscillator();

    low.type = "sawtooth";
    low.frequency.setValueAtTime(95, now);
    low.frequency.linearRampToValueAtTime(125, now + 0.3);

    high.type = "square";
    high.frequency.setValueAtTime(440, now);

    const lowGain = audioContext.createGain();
    const highGain = audioContext.createGain();

    lowGain.gain.value = 0.045;
    highGain.gain.value = 0.012;

    low.connect(lowGain);
    high.connect(highGain);
    lowGain.connect(laserGain);
    highGain.connect(laserGain);

    low.start();
    high.start();

    laserOscillators = [low, high];

    laserGain.gain.setTargetAtTime(0.65, now, 0.04);

    laserGain._nodes = [lowGain, highGain];
  }

  function stopLaserSound() {
    if (!audioContext || !laserGain) return;

    const oldGain = laserGain;
    const now = audioContext.currentTime;

    oldGain.gain.setTargetAtTime(0.0001, now, 0.025);

    laserOscillators.forEach((osc) => {
      try {
        osc.stop(now + 0.14);
      } catch (_) {}
    });

    laserOscillators = [];
    laserGain = null;
  }

  function toggleSound() {
    soundOn = !soundOn;
    ui.soundButton.textContent = soundOn ? "🔊" : "🔇";

    if (masterGain && audioContext) {
      masterGain.gain.setTargetAtTime(
        soundOn ? 0.55 : 0,
        audioContext.currentTime,
        0.04
      );
    }

    if (!soundOn) {
      stopLaserSound();
    }

    if (soundOn && state === "playing") {
      initAudio();
      startMusic();
    }

    if (!soundOn) stopMusic();
  }

  function showToast(message) {
    ui.toast.textContent = message;
    ui.toast.classList.remove("hidden");
    toastTimer = 1.5;
  }

  function updateToast(dt) {
    if (toastTimer > 0) {
      toastTimer -= dt;
      if (toastTimer <= 0) {
        ui.toast.classList.add("hidden");
      }
    }
  }

  function updateHUD() {
    ui.score.textContent = String(Math.floor(score)).padStart(5, "0");
    ui.level.textContent = String(level).padStart(2, "0");

    ui.lives.textContent =
      "♥ ".repeat(lives).trim() +
      (lives < 3 ? " " + "♡ ".repeat(3 - lives).trim() : "");

    ui.menuBest.textContent = best;
    ui.finalScore.textContent = Math.floor(score);

    const ratio = clamp(laserEnergy / 3, 0, 1);
    ui.energyFill.style.width = `${ratio * 100}%`;
    ui.energySeconds.textContent = `${laserEnergy.toFixed(1)}s`;

    if (laserActive) {
      ui.laserStatus.textContent = "FIRING";
      ui.laserHint.textContent = "LAZER ISHLAMOQDA · QUvVAT SARFLANMOQDA";
    } else if (laserEnergy < 2.99) {
      ui.laserStatus.textContent = "RECHARGING";
      ui.laserHint.textContent = rechargeDelay > 0
        ? "LAZER SOVIMOQDA..."
        : "ENERGIYA QAYTA TO‘LDIRILMOQDA";
    } else {
      ui.laserStatus.textContent = "READY";
      ui.laserHint.textContent = "LAZER TAYYOR · BOSIB TURIB ISHLAT";
    }

    ui.laserButton.disabled = state !== "playing" || laserEnergy <= 0;
  }

  function hideScreens() {
    ui.start.classList.add("hidden");
    ui.pause.classList.add("hidden");
    ui.over.classList.add("hidden");
  }

  function chooseCard(container, attribute, value) {
    container.querySelectorAll(".choice-card").forEach((card) => {
      card.classList.toggle("selected", card.dataset[attribute] === value);
    });
  }

  $("planet-cards").addEventListener("click", (event) => {
    const card = event.target.closest(".choice-card");
    if (!card) return;

    selectedPlanet = card.dataset.planet;
    chooseCard($("planet-cards"), "planet", selectedPlanet);
    tone(520, 0.09, "sine", 0.08);
    draw();
  });

  $("ship-cards").addEventListener("click", (event) => {
    const card = event.target.closest(".choice-card");
    if (!card) return;

    selectedShip = card.dataset.ship;
    chooseCard($("ship-cards"), "ship", selectedShip);
    tone(620, 0.09, "triangle", 0.08);
    draw();
  });

  function startGame() {
    initAudio();

    score = 0;
    level = 1;
    lives = 3;
    elapsed = 0;

    obstacles = [];
    bonuses = [];
    particles = [];
    lasers = [];
    floatingTexts = [];

    spawnTimer = 0.4;
    bonusTimer = 5;
    shake = 0;
    flash = 0;
    shieldTime = 0;
    invincibleTime = 0;

    laserEnergy = 3;
    rechargeDelay = 0;
    laserPointerDown = false;
    laserActive = false;
    stopLaserSound();

    player.x = W / 2;
    player.y = H - 58;
    player.tilt = 0;

    keys.left = false;
    keys.right = false;

    state = "playing";
    hideScreens();

    ui.pauseButton.classList.remove("hidden");
    ui.status.textContent = "· ACTIVE";

    startMusic();
    tone(440, 0.12, "triangle", 0.1);
    setTimeout(() => tone(660, 0.16, "triangle", 0.1), 100);

    updateHUD();
  }

  function pauseGame() {
    if (state !== "playing") return;

    state = "paused";
    keys.left = false;
    keys.right = false;
    laserPointerDown = false;
    laserActive = false;
    stopLaserSound();

    ui.pause.classList.remove("hidden");
    ui.pauseButton.classList.add("hidden");
    ui.status.textContent = "· PAUSED";
  }

  function resumeGame() {
    if (state !== "paused") return;

    initAudio();
    state = "playing";

    ui.pause.classList.add("hidden");
    ui.pauseButton.classList.remove("hidden");
    ui.status.textContent = "· ACTIVE";

    startMusic();
  }

  function showMenu() {
    state = "ready";
    keys.left = false;
    keys.right = false;
    laserPointerDown = false;
    laserActive = false;

    stopLaserSound();
    stopMusic();

    hideScreens();
    ui.start.classList.remove("hidden");
    ui.pauseButton.classList.add("hidden");
    ui.status.textContent = "· STANDBY";

    draw();
  }

  function endGame() {
    if (state === "over") return;

    state = "over";
    laserActive = false;
    laserPointerDown = false;
    keys.left = false;
    keys.right = false;

    stopLaserSound();
    stopMusic();

    if (score > best) {
      best = Math.floor(score);
      localStorage.setItem("nebula-best", String(best));
    }

    ui.finalScore.textContent = Math.floor(score);
    ui.menuBest.textContent = best;
    ui.over.classList.remove("hidden");
    ui.pauseButton.classList.add("hidden");
    ui.status.textContent = "· MISSION ENDED";

    tone(180, 0.45, "sawtooth", 0.12, -100);
    updateHUD();
  }

  function spawnObstacle() {
    const types = ["asteroid", "ice", "mine"];
    const type = types[Math.floor(Math.random() * types.length)];
    const radius = type === "mine" ? random(12, 17) : random(13, 22);

    obstacles.push({
      type,
      x: random(radius + 6, W - radius - 6),
      y: -radius - 5,
      radius,
      speed: random(95, 145) + level * 10,
      spin: random(0, Math.PI * 2),
      spinSpeed: random(-2.4, 2.4),
      color: type === "ice"
        ? "#84e9ff"
        : type === "mine"
          ? "#ff649a"
          : "#b0a8c7",
      sides: Math.floor(random(7, 11))
    });
  }

  function spawnBonus() {
    const type = Math.random() < 0.6 ? "shield" : "points";

    bonuses.push({
      type,
      x: random(22, W - 22),
      y: -25,
      radius: 12,
      speed: random(75, 100),
      phase: random(0, Math.PI * 2)
    });
  }

  function createParticles(x, y, color, count = 14) {
    for (let i = 0; i < count; i++) {
      const angle = random(0, Math.PI * 2);
      const speed = random(35, 180);

      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: random(0.25, 0.8),
        maxLife: 0.8,
        size: random(1.5, 4),
        color
      });
    }
  }

  function addFloatingText(x, y, text, color) {
    floatingTexts.push({
      x,
      y,
      text,
      color,
      life: 1
    });
  }

  function hitPlayer(x, y) {
    if (invincibleTime > 0 || shieldTime > 0) return;

    lives--;
    invincibleTime = 1.25;
    shake = 10;
    flash = 0.2;

    createParticles(x, y, COLORS.pink, 22);
    tone(180, 0.22, "sawtooth", 0.14, -100);
    updateHUD();

    if (lives <= 0) {
      endGame();
    }
  }

  function distance(ax, ay, bx, by) {
    return Math.hypot(ax - bx, ay - by);
  }

  function circleHit(a, b) {
    return distance(a.x, a.y, b.x, b.y) < a.radius + b.radius;
  }

  function activateLaser() {
    if (state !== "playing" || laserEnergy <= 0) return;

    if (!laserActive) {
      laserActive = true;
      startLaserSound();
    }
  }

  function releaseLaser() {
    if (laserActive) {
      laserActive = false;
      stopLaserSound();
    }

    laserPointerDown = false;
    rechargeDelay = 0;
  }

  function update(dt) {
    if (state !== "playing") return;

    elapsed += dt;

    level = 1 + Math.floor(score / 350);

    score += dt * (10 + level * 2);

    if (keys.left) player.x -= player.speed * dt;
    if (keys.right) player.x += player.speed * dt;

    player.x = clamp(player.x, 18, W - 18);

    const targetTilt = keys.left ? -0.22 : keys.right ? 0.22 : 0;
    player.tilt += (targetTilt - player.tilt) * Math.min(1, dt * 7);

    if (invincibleTime > 0) invincibleTime -= dt;
    if (shieldTime > 0) shieldTime -= dt;

    if (laserPointerDown && laserEnergy > 0) {
      laserActive = true;
      laserEnergy = Math.max(0, laserEnergy - dt);

      if (laserEnergy <= 0) {
        releaseLaser();
        rechargeDelay = 0.15;
        showToast("LAZER ENERGIYASI TUGADI");
      }
    } else {
      laserActive = false;

      if (rechargeDelay > 0) {
        rechargeDelay = Math.max(0, rechargeDelay - dt);
      } else {
        // 3 soniyalik energiya 2 soniyada qayta to‘ladi.
        laserEnergy = Math.min(3, laserEnergy + dt * 1.5);
      }
    }

    if (laserActive) {
      if (Math.random() < 0.5) {
        lasers.push({
          x: player.x + random(-5, 5),
          y: player.y - 18,
          speed: 520,
          life: 0.42
        });
      }
    }

    spawnTimer -= dt;

    if (spawnTimer <= 0) {
      spawnObstacle();
      spawnTimer = Math.max(0.25, 0.8 - level * 0.045) * random(0.75, 1.25);
    }

    bonusTimer -= dt;

    if (bonusTimer <= 0) {
      spawnBonus();
      bonusTimer = random(7, 11);
    }

    for (let i = obstacles.length - 1; i >= 0; i--) {
      const o = obstacles[i];

      o.y += o.speed * dt;
      o.spin += o.spinSpeed * dt;

      if (o.y - o.radius > H + 10) {
        obstacles.splice(i, 1);
        score += 5;
        continue;
      }

      // Lazer tegsa, asteroid yoki boshqa to‘siq yo‘q qilinadi.
      let destroyed = false;

      for (let j = lasers.length - 1; j >= 0; j--) {
        const beam = lasers[j];

        if (
          Math.abs(beam.x - o.x) < o.radius + 4 &&
          beam.y < o.y + o.radius &&
          beam.y > o.y - o.radius
        ) {
          obstacles.splice(i, 1);
          lasers.splice(j, 1);
          createParticles(o.x, o.y, COLORS.cyan, 13);
          addFloatingText(o.x, o.y, "+25", COLORS.cyan);
          score += 25;
          tone(720, 0.07, "square", 0.05, -220);
          destroyed = true;
          break;
        }
      }

      if (destroyed) continue;

      if (circleHit(
        { x: player.x, y: player.y, radius: player.radius * 0.78 },
        o
      )) {
        obstacles.splice(i, 1);

        if (shieldTime > 0) {
          createParticles(o.x, o.y, COLORS.cyan, 12);
          score += 10;
        } else {
          hitPlayer(o.x, o.y);
        }

        if (state !== "playing") return;
      }
    }

    for (let i = bonuses.length - 1; i >= 0; i--) {
      const b = bonuses[i];

      b.y += b.speed * dt;
      b.phase += dt * 3;
      b.x += Math.sin(b.phase) * 20 * dt;

      if (b.y > H + 30) {
        bonuses.splice(i, 1);
        continue;
      }

      if (circleHit(
        { x: player.x, y: player.y, radius: player.radius + 3 },
        b
      )) {
        bonuses.splice(i, 1);

        if (b.type === "shield") {
          shieldTime = 5;
          addFloatingText(b.x, b.y, "SHIELD!", COLORS.cyan);
          createParticles(b.x, b.y, COLORS.cyan, 18);
          tone(600, 0.18, "sine", 0.1, 300);
        } else {
          score += 50;
          addFloatingText(b.x, b.y, "+50", COLORS.orange);
          createParticles(b.x, b.y, COLORS.orange, 16);
          tone(850, 0.16, "triangle", 0.1, 300);
        }
      }
    }

    for (let i = lasers.length - 1; i >= 0; i--) {
      lasers[i].y -= lasers[i].speed * dt;
      lasers[i].life -= dt;

      if (lasers[i].y < -20 || lasers[i].life <= 0) {
        lasers.splice(i, 1);
      }
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.max(0, 1 - dt * 1.5);
      p.vy *= Math.max(0, 1 - dt * 1.5);
      p.life -= dt;

      if (p.life <= 0) particles.splice(i, 1);
    }

    for (let i = floatingTexts.length - 1; i >= 0; i--) {
      const t = floatingTexts[i];
      t.y -= 30 * dt;
      t.life -= dt;

      if (t.life <= 0) floatingTexts.splice(i, 1);
    }

    if (shake > 0) shake = Math.max(0, shake - dt * 25);
    if (flash > 0) flash = Math.max(0, flash - dt);

    updateHUD();
  }

  function drawBackground(dt = 0) {
    const gradient = ctx.createLinearGradient(0, 0, W, H);
    gradient.addColorStop(0, "#080e21");
    gradient.addColorStop(0.55, "#0b1024");
    gradient.addColorStop(1, "#160d29");

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, W, H);

    // Sayyora: tanlangan ko‘rinishga qarab rang o‘zgaradi.
    const palette = planetColors[selectedPlanet] || planetColors.blue;
    const planetX = W * 0.77;
    const planetY = H * 0.26;
    const planetR = Math.min(W * 0.19, 72);

    const planetGradient = ctx.createRadialGradient(
      planetX - planetR * 0.35,
      planetY - planetR * 0.35,
      2,
      planetX,
      planetY,
      planetR
    );

    planetGradient.addColorStop(0, palette[0]);
    planetGradient.addColorStop(1, palette[1]);

    ctx.save();
    ctx.globalAlpha = 0.42;
    ctx.fillStyle = planetGradient;
    ctx.beginPath();
    ctx.arc(planetX, planetY, planetR, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = palette[0];
    ctx.globalAlpha = 0.25;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(planetX, planetY, planetR * 1.45, planetR * 0.35, -0.3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Yulduzlar.
    for (const s of stars) {
      s.y += s.speed * dt;

      if (s.y > H) {
        s.y = 0;
        s.x = Math.random() * W;
      }

      s.twinkle += dt * 2;

      ctx.globalAlpha = clamp(
        s.alpha * (0.75 + Math.sin(s.twinkle) * 0.25),
        0.1,
        1
      );

      ctx.fillStyle = "#c8eaff";
      ctx.fillRect(s.x, s.y, s.size, s.size);
    }

    ctx.globalAlpha = 1;

    // Pastel kosmik tuman.
    const nebula = ctx.createRadialGradient(
      W * 0.2, H * 0.55, 1,
      W * 0.2, H * 0.55, W * 0.7
    );

    nebula.addColorStop(0, "rgba(78, 70, 180, 0.10)");
    nebula.addColorStop(1, "rgba(8, 12, 30, 0)");

    ctx.fillStyle = nebula;
    ctx.fillRect(0, 0, W, H);
  }

  function drawShip(x, y, scale = 1, tilt = 0) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt);
    ctx.scale(scale, scale);

    const shipColor =
      selectedShip === "arrow" ? COLORS.purple :
      selectedShip === "heavy" ? COLORS.orange :
      COLORS.cyan;

    // Dvigatel alangasi.
    if (state === "playing") {
      const flameLength = random(10, 19);

      ctx.fillStyle = "rgba(77, 234, 255, 0.7)";
      ctx.beginPath();
      ctx.moveTo(-5, 11);
      ctx.lineTo(0, 11 + flameLength);
      ctx.lineTo(5, 11);
      ctx.closePath();
      ctx.fill();
    }

    ctx.shadowBlur = 18;
    ctx.shadowColor = shipColor;
    ctx.fillStyle = "#182d50";
    ctx.strokeStyle = shipColor;
    ctx.lineWidth = 1.8;

    ctx.beginPath();

    if (selectedShip === "heavy") {
      ctx.moveTo(0, -17);
      ctx.lineTo(15, -6);
      ctx.lineTo(14, 10);
      ctx.lineTo(6, 13);
      ctx.lineTo(0, 7);
      ctx.lineTo(-6, 13);
      ctx.lineTo(-14, 10);
      ctx.lineTo(-15, -6);
    } else if (selectedShip === "arrow") {
      ctx.moveTo(0, -19);
      ctx.lineTo(12, 10);
      ctx.lineTo(0, 5);
      ctx.lineTo(-12, 10);
    } else {
      ctx.moveTo(0, -20);
      ctx.lineTo(12, 12);
      ctx.lineTo(4, 8);
      ctx.lineTo(0, 12);
      ctx.lineTo(-4, 8);
      ctx.lineTo(-12, 12);
    }

    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.shadowBlur = 8;
    ctx.fillStyle = "#f1ffff";
    ctx.beginPath();
    ctx.ellipse(0, -3, 3.4, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    if (shieldTime > 0) {
      ctx.save();
      ctx.strokeStyle = "rgba(77, 234, 255, 0.85)";
      ctx.lineWidth = 2;
      ctx.shadowBlur = 18;
      ctx.shadowColor = COLORS.cyan;
      ctx.beginPath();
      ctx.arc(x, y, 24 + Math.sin(elapsed * 8) * 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawObstacle(o) {
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.rotate(o.spin);

    ctx.shadowBlur = 12;
    ctx.shadowColor = o.color;

    if (o.type === "mine") {
      ctx.strokeStyle = o.color;
      ctx.fillStyle = "#32192f";
      ctx.lineWidth = 2;

      ctx.beginPath();
      ctx.arc(0, 0, o.radius * 0.72, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4;

        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * o.radius * 0.6, Math.sin(a) * o.radius * 0.6);
        ctx.lineTo(Math.cos(a) * o.radius, Math.sin(a) * o.radius);
        ctx.stroke();
      }

      ctx.fillStyle = "#ffb4d0";
      ctx.beginPath();
      ctx.arc(0, 0, 3, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();

      for (let i = 0; i < o.sides; i++) {
        const a = i / o.sides * Math.PI * 2;
        const r = o.radius * random(0.82, 1.08);
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r;

        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }

      ctx.closePath();
      ctx.fillStyle = o.type === "ice" ? "#143b56" : "#28283c";
      ctx.strokeStyle = o.color;
      ctx.lineWidth = 1.6;
      ctx.fill();
      ctx.stroke();

      if (o.type === "ice") {
        ctx.strokeStyle = "rgba(160, 244, 255, 0.65)";
        ctx.beginPath();
        ctx.moveTo(-o.radius * 0.4, -o.radius * 0.4);
        ctx.lineTo(o.radius * 0.3, o.radius * 0.2);
        ctx.lineTo(-o.radius * 0.1, o.radius * 0.6);
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  function drawBonus(b) {
    ctx.save();
    ctx.translate(b.x, b.y);

    const color = b.type === "shield" ? COLORS.cyan : COLORS.orange;

    ctx.shadowBlur = 16;
    ctx.shadowColor = color;
    ctx.strokeStyle = color;
    ctx.fillStyle = b.type === "shield"
      ? "rgba(77, 234, 255, 0.15)"
      : "rgba(255, 173, 90, 0.15)";

    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, b.radius + Math.sin(b.phase) * 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.font = "bold 13px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(b.type === "shield" ? "S" : "+", 0, 0);

    ctx.restore();
  }

  function drawLasers() {
    for (const beam of lasers) {
      ctx.save();

      ctx.globalAlpha = clamp(beam.life / 0.2, 0.3, 1);
      ctx.shadowBlur = 15;
      ctx.shadowColor = COLORS.cyan;
      ctx.strokeStyle = "#e9ffff";
      ctx.lineWidth = 3;

      ctx.beginPath();
      ctx.moveTo(beam.x, beam.y + 18);
      ctx.lineTo(beam.x, beam.y - 12);
      ctx.stroke();

      ctx.strokeStyle = COLORS.cyan;
      ctx.lineWidth = 7;
      ctx.globalAlpha *= 0.35;

      ctx.beginPath();
      ctx.moveTo(beam.x, beam.y + 18);
      ctx.lineTo(beam.x, beam.y - 12);
      ctx.stroke();

      ctx.restore();
    }

    if (laserActive && state === "playing") {
      ctx.save();

      ctx.globalAlpha = 0.18;
      ctx.fillStyle = COLORS.cyan;
      ctx.fillRect(player.x - 7, 0, 14, player.y - 12);

      ctx.globalAlpha = 0.8;
      ctx.shadowBlur = 20;
      ctx.shadowColor = COLORS.cyan;
      ctx.strokeStyle = "#dfffff";
      ctx.lineWidth = 2;

      ctx.beginPath();
      ctx.moveTo(player.x, player.y - 12);
      ctx.lineTo(player.x, 0);
      ctx.stroke();

      ctx.restore();
    }
  }

  function drawEffects() {
    for (const p of particles) {
      ctx.save();
      ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1);
      ctx.fillStyle = p.color;
      ctx.shadowBlur = 8;
      ctx.shadowColor = p.color;
      ctx.fillRect(p.x, p.y, p.size, p.size);
      ctx.restore();
    }

    for (const t of floatingTexts) {
      ctx.save();
      ctx.globalAlpha = clamp(t.life, 0, 1);
      ctx.fillStyle = t.color;
      ctx.font = "bold 13px Orbitron, sans-serif";
      ctx.textAlign = "center";
      ctx.shadowBlur = 10;
      ctx.shadowColor = t.color;
      ctx.fillText(t.text, t.x, t.y);
      ctx.restore();
    }

    if (flash > 0) {
      ctx.save();
      ctx.globalAlpha = flash * 0.8;
      ctx.fillStyle = "#ff4d7f";
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
  }

  function draw() {
    if (!ctx || !W || !H) return;

    ctx.save();

    if (shake > 0 && state === "playing") {
      ctx.translate(random(-shake, shake), random(-shake, shake));
    }

    drawBackground(0);

    for (const b of bonuses) drawBonus(b);
    for (const o of obstacles) drawObstacle(o);

    drawLasers();
    drawEffects();

    if (state !== "over") {
      const blinking = invincibleTime > 0 && Math.floor(elapsed * 15) % 2 === 0;

      if (!blinking) {
        drawShip(player.x, player.y, 1, player.tilt);
      }
    }

    ctx.restore();
  }

  function loop(timestamp) {
    const dt = lastTime
      ? Math.min((timestamp - lastTime) / 1000, 0.04)
      : 0;

    lastTime = timestamp;

    updateToast(dt);

    if (state === "playing") {
      update(dt);
      drawBackground(dt);

      // update() oxirida holat o‘zgargan bo‘lsa, yangi holatni chizamiz.
      draw();
    } else {
      draw();
    }

    requestAnimationFrame(loop);
  }

  function bindHold(button, onDown, onUp) {
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      button.setPointerCapture?.(event.pointerId);
      onDown();
    });

    button.addEventListener("pointerup", (event) => {
      event.preventDefault();
      onUp();
    });

    button.addEventListener("pointercancel", onUp);
    button.addEventListener("lostpointercapture", onUp);
  }

  bindHold(
    ui.leftButton,
    () => { if (state === "playing") keys.left = true; },
    () => { keys.left = false; }
  );

  bindHold(
    ui.rightButton,
    () => { if (state === "playing") keys.right = true; },
    () => { keys.right = false; }
  );

  bindHold(
    ui.laserButton,
    () => {
      if (state !== "playing" || laserEnergy <= 0) return;

      laserPointerDown = true;
      activateLaser();
    },
    releaseLaser
  );

  ui.startButton.addEventListener("click", startGame);
  ui.pauseButton.addEventListener("click", pauseGame);
  ui.resumeButton.addEventListener("click", resumeGame);
  ui.restartButton.addEventListener("click", startGame);
  ui.menuButton.addEventListener("click", showMenu);
  ui.gameOverMenuButton.addEventListener("click", showMenu);
  ui.soundButton.addEventListener("click", toggleSound);

  document.addEventListener("keydown", (event) => {
    if (["ArrowLeft", "ArrowRight", " ", "a", "d", "A", "D"].includes(event.key)) {
      event.preventDefault();
    }

    if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") {
      keys.left = true;
    }

    if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") {
      keys.right = true;
    }

    if (event.code === "Space" && state === "playing") {
      laserPointerDown = true;
      activateLaser();
    }

    if (event.key === "Escape" || event.key.toLowerCase() === "p") {
      if (state === "playing") pauseGame();
      else if (state === "paused") resumeGame();
    }

    if (event.key === "Enter" && state === "ready") {
      startGame();
    }
  });

  document.addEventListener("keyup", (event) => {
    if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") {
      keys.left = false;
    }

    if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") {
      keys.right = false;
    }

    if (event.code === "Space") releaseLaser();
  });

  window.addEventListener("blur", () => {
    keys.left = false;
    keys.right = false;
    releaseLaser();

    if (state === "playing") pauseGame();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state === "playing") pauseGame();
  });

  window.addEventListener("resize", resize);

  if ("ResizeObserver" in window) {
    new ResizeObserver(resize).observe($("game-area"));
  }

  resize();
  updateHUD();
  requestAnimationFrame(loop);
})();