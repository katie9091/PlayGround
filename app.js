(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const canvas = $('#game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height, TILE = 32;
  const relicNames = ['Fernheart', 'Sunstone', 'Rainkeeper'];
  const relicSpots = [{ x: 185, y: 145 }, { x: 505, y: 132 }, { x: 565, y: 420 }];
  const walls = [
    { x: 218, y: 80, w: 42, h: 150 }, { x: 350, y: 0, w: 42, h: 138 },
    { x: 350, y: 208, w: 42, h: 120 }, { x: 350, y: 397, w: 42, h: 147 },
    { x: 490, y: 250, w: 150, h: 42 }, { x: 670, y: 73, w: 42, h: 118 },
    { x: 117, y: 336, w: 100, h: 42 }, { x: 230, y: 446, w: 90, h: 42 }
  ];
  const decor = [];
  let seed = 19371;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < 170; i++) decor.push({ x: 12 + random() * 776, y: 12 + random() * 520, type: random() });
  const state = { mode: 'title', keys: new Set(), touch: new Set(), last: 0, elapsed: 0, collected: [], health: 5, dashCd: 0, attackCd: 0, invuln: 0, attackFlash: 0, particles: [], sound: false, best: Number(localStorage.getItem('mossboundBest') || 0), toastTimer: 0 };
  let player, slimes;
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  function freshRun() {
    state.mode = 'playing'; state.elapsed = 0; state.collected = []; state.health = 5; state.dashCd = 0; state.attackCd = 0; state.invuln = 0; state.attackFlash = 0; state.particles = [];
    player = { x: 68, y: 264, w: 19, h: 22, fx: 1, fy: 0, speed: 142, dashTime: 0 };
    slimes = [makeSlime(286, 125), makeSlime(441, 178), makeSlime(604, 355), makeSlime(275, 407)];
    $('#gameOverlay').classList.add('hidden');
    updateHud();
  }
  function makeSlime(x, y) { return { x, y, w: 23, h: 18, hp: 2, alive: true, hurt: 0, phase: random() * 6.28, speed: 34 + random() * 9 }; }
  function showOverlay(kind) {
    const title = $('#overlayTitle'), eyebrow = $('#overlayEyebrow'), copy = $('#overlayCopy'), action = $('#overlayAction'), hint = $('#overlayHint');
    if (kind === 'title') { eyebrow.textContent = 'A MOSSBOUND MINI ADVENTURE'; title.innerHTML = 'The ruins<br><em>are awake.</em>'; copy.textContent = 'The garden swallowed three ancient relics. Find them, then reach the old gate. The slimes are hungry, but you brought a sword.'; action.innerHTML = 'Enter the ruins <span>→</span>'; hint.textContent = 'WASD / ARROWS to move · SPACE to swing · SHIFT to dash'; }
    else if (kind === 'paused') { eyebrow.textContent = 'CATCH YOUR BREATH'; title.innerHTML = 'The garden<br><em>is waiting.</em>'; copy.textContent = 'Your adventure is paused. The slimes are still out there.'; action.innerHTML = 'Return to the ruins <span>→</span>'; hint.textContent = 'Press P or ESC to resume'; }
    else if (kind === 'won') { eyebrow.textContent = 'THE OLD GATE REMEMBERS'; title.innerHTML = 'A path<br><em>uncovered.</em>'; copy.textContent = `You escaped with all three relics in ${formatTime(state.elapsed)}. The forest will keep your story.`; action.innerHTML = 'Play again <span>↻</span>'; hint.textContent = 'Your best escape is saved on this device'; }
    else { eyebrow.textContent = 'THE RUINS CLAIM ANOTHER'; title.innerHTML = 'Roots grow<br><em>over all.</em>'; copy.textContent = 'The slimes got the better of you this time. The relics are still waiting in the garden.'; action.innerHTML = 'Try again <span>↻</span>'; hint.textContent = 'Keep moving, and use your thorn dash to escape'; }
    state.mode = kind; $('#gameOverlay').classList.remove('hidden');
  }
  function formatTime(s) { const n = Math.floor(s); return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`; }
  function toast(text) { const el = $('#gameToast'); el.textContent = text; el.classList.add('show'); clearTimeout(state.toastTimer); state.toastTimer = setTimeout(() => el.classList.remove('show'), 1700); }
  function updateHud() {
    $('#questCount').textContent = `${state.collected.length} / 3`;
    $('#healthText').textContent = `${state.health} / 5`;
    $('#hearts').innerHTML = Array.from({ length: 5 }, (_, i) => `<span style="opacity:${i < state.health ? 1 : .22}">${i < state.health ? '♥' : '♡'}</span>`).join('');
    $('#hearts').setAttribute('aria-label', `${state.health} of 5 health`);
    $('#dashText').textContent = state.dashCd <= 0 ? 'READY' : `${state.dashCd.toFixed(1)}s`;
    $('#dashFill').style.width = `${Math.max(0, 100 * (1 - state.dashCd / 1.65))}%`;
    $('#relicList').querySelectorAll('.relic-item').forEach((el, i) => {
      const found = state.collected.includes(i); el.classList.toggle('found', found);
      el.querySelector('.relic-gem').textContent = found ? '✦' : '◇';
      el.querySelector('small').textContent = found ? 'Recovered' : 'Somewhere in the ruins';
      el.querySelector('i').textContent = found ? '✓' : '—';
    });
    $('#gateNote').innerHTML = state.collected.length === 3 ? '<span>▣</span> The eastern gate is open. Find your way out!' : '<span>▣</span> Find all 3 relics to open the gate.';
    $('#bestTime').textContent = state.best ? formatTime(state.best) : '—:—';
  }
  function blocked(x, y, w, h) {
    const box = { x, y, w, h };
    if (x < 18 || y < 18 || x + w > W - 18 || y + h > H - 18) return true;
    return walls.some(wall => overlap(box, wall));
  }
  function moveBody(body, dx, dy) {
    if (dx) { const nx = body.x + dx; if (!blocked(nx, body.y, body.w, body.h)) body.x = nx; }
    if (dy) { const ny = body.y + dy; if (!blocked(body.x, ny, body.w, body.h)) body.y = ny; }
  }
  function sound(freq = 440, duration = .08, type = 'sine') {
    if (!state.sound) return;
    try { const ac = sound.ac || (sound.ac = new AudioContext()), o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.value = freq; g.gain.setValueAtTime(.055, ac.currentTime); g.gain.exponentialRampToValueAtTime(.001, ac.currentTime + duration); o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + duration); } catch (_) {}
  }
  function burst(x, y, color, count = 9) { for (let i = 0; i < count; i++) { const a = random() * Math.PI * 2, speed = 25 + random() * 80; state.particles.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: .35 + random() * .35, max: .7, color, size: 2 + random() * 3 }); } }
  function attack() {
    if (state.mode !== 'playing' || state.attackCd > 0) return;
    state.attackCd = .36; state.attackFlash = .18; sound(240, .09, 'sawtooth');
    const cx = player.x + player.w / 2 + player.fx * 25, cy = player.y + player.h / 2 + player.fy * 25;
    slimes.forEach(s => { if (!s.alive) return; const dx = s.x + s.w / 2 - cx, dy = s.y + s.h / 2 - cy; if (Math.hypot(dx, dy) < 33 && dx * player.fx + dy * player.fy > -7) { s.hp--; s.hurt = .2; s.x += player.fx * 9; s.y += player.fy * 9; burst(s.x + 11, s.y + 9, '#c7ff83', 5); if (s.hp <= 0) { s.alive = false; burst(s.x + 11, s.y + 9, '#7de08a', 13); toast('A slime returned to the soil'); } } });
  }
  function dash() {
    if (state.mode !== 'playing' || state.dashCd > 0) return;
    let dx = (state.keys.has('ArrowRight') || state.keys.has('d') || state.touch.has('right') ? 1 : 0) - (state.keys.has('ArrowLeft') || state.keys.has('a') || state.touch.has('left') ? 1 : 0);
    let dy = (state.keys.has('ArrowDown') || state.keys.has('s') || state.touch.has('down') ? 1 : 0) - (state.keys.has('ArrowUp') || state.keys.has('w') || state.touch.has('up') ? 1 : 0);
    if (!dx && !dy) { dx = player.fx; dy = player.fy; } const mag = Math.hypot(dx, dy) || 1; dx /= mag; dy /= mag; player.fx = dx; player.fy = dy; player.dashTime = .14; state.dashCd = 1.65; state.invuln = .3; burst(player.x + 9, player.y + 11, '#b8f58a', 7); sound(600, .1, 'triangle');
  }
  function hurtPlayer() { if (state.invuln > 0 || state.mode !== 'playing') return; state.health--; state.invuln = .9; burst(player.x + 10, player.y + 10, '#ffa06f', 10); sound(120, .18, 'square'); updateHud(); if (state.health <= 0) showOverlay('lost'); }
  function update(dt) {
    if (state.mode !== 'playing') return;
    state.elapsed += dt; state.dashCd = Math.max(0, state.dashCd - dt); state.attackCd = Math.max(0, state.attackCd - dt); state.invuln = Math.max(0, state.invuln - dt); state.attackFlash = Math.max(0, state.attackFlash - dt);
    let dx = (state.keys.has('ArrowRight') || state.keys.has('d') || state.touch.has('right') ? 1 : 0) - (state.keys.has('ArrowLeft') || state.keys.has('a') || state.touch.has('left') ? 1 : 0);
    let dy = (state.keys.has('ArrowDown') || state.keys.has('s') || state.touch.has('down') ? 1 : 0) - (state.keys.has('ArrowUp') || state.keys.has('w') || state.touch.has('up') ? 1 : 0);
    const mag = Math.hypot(dx, dy); if (mag) { dx /= mag; dy /= mag; player.fx = dx; player.fy = dy; }
    moveBody(player, dx * (player.dashTime > 0 ? 505 : player.speed) * dt, dy * (player.dashTime > 0 ? 505 : player.speed) * dt); player.dashTime = Math.max(0, player.dashTime - dt);
    relicSpots.forEach((p, i) => { if (!state.collected.includes(i) && Math.hypot(player.x + 10 - p.x, player.y + 11 - p.y) < 22) { state.collected.push(i); burst(p.x, p.y, ['#a8f48c', '#ffc973', '#83d9ec'][i], 18); sound(760 + i * 120, .22); toast(`${relicNames[i]} recovered`); updateHud(); } });
    if (state.collected.length === 3 && player.x > 749 && player.y > 223 && player.y < 321) { const elapsed = state.elapsed; if (!state.best || elapsed < state.best) { state.best = elapsed; localStorage.setItem('mossboundBest', String(elapsed)); } updateHud(); sound(900, .3); showOverlay('won'); return; }
    slimes.forEach(s => { if (!s.alive) return; s.phase += dt * 5; s.hurt = Math.max(0, s.hurt - dt); const sx = player.x - s.x, sy = player.y - s.y, dist = Math.hypot(sx, sy); if (dist < 270 && dist > 1) { const pace = s.speed * (dist < 30 ? .55 : 1); moveBody(s, sx / dist * pace * dt, sy / dist * pace * dt); } if (overlap({ x: player.x + 2, y: player.y + 3, w: player.w - 4, h: player.h - 3 }, { x: s.x + 2, y: s.y + 2, w: s.w - 4, h: s.h - 3 })) hurtPlayer(); });
    state.particles = state.particles.filter(p => { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= .96; p.vy *= .96; return p.life > 0; });
    updateHud();
  }
  function rounded(x, y, w, h, r, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill(); }
  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#294234'; ctx.fillRect(0, 0, W, H);
    // mossy flagstone floor
    for (let y = 0; y < H; y += TILE) for (let x = 0; x < W; x += TILE) {
      const n = ((x / TILE * 7 + y / TILE * 13) % 4);
      ctx.fillStyle = ['#344b3b', '#374e3d', '#314737', '#3a503f'][n]; ctx.fillRect(x, y, TILE, TILE);
      ctx.strokeStyle = '#263d30'; ctx.lineWidth = 2; ctx.strokeRect(x + .5, y + .5, TILE, TILE);
      ctx.fillStyle = '#718055'; ctx.globalAlpha = .24; ctx.fillRect(x + 5, y + 6, 2, 2); ctx.fillRect(x + 23, y + 23, 3, 2); ctx.globalAlpha = 1;
    }
    decor.forEach(d => { if (walls.some(w => d.x > w.x - 4 && d.x < w.x + w.w + 4 && d.y > w.y - 4 && d.y < w.y + w.h + 4)) return; ctx.globalAlpha = .42 + d.type * .25; ctx.fillStyle = d.type > .57 ? '#92a66a' : '#829b68'; if (d.type > .83) { ctx.fillRect(d.x, d.y, 3, 7); ctx.fillRect(d.x - 2, d.y + 3, 7, 2); } else ctx.fillRect(d.x, d.y, 2, 2); }); ctx.globalAlpha = 1;
    // entrance and exit archways
    ctx.fillStyle = '#1c3025'; ctx.fillRect(0, 224, 18, 96); ctx.fillStyle = '#668052'; ctx.fillRect(12, 218, 8, 108);
    ctx.fillStyle = state.collected.length === 3 ? '#a8ed76' : '#6e865b'; ctx.fillRect(777, 219, 23, 106); ctx.fillRect(767, 215, 13, 9); ctx.fillRect(767, 320, 13, 9); ctx.fillStyle = '#23392a'; ctx.fillRect(783, 232, 17, 80); ctx.fillStyle = state.collected.length === 3 ? '#d3ef9c' : '#a0a879'; ctx.fillRect(789, 265, 5, 18);
    walls.forEach(w => { rounded(w.x, w.y + 5, w.w, w.h, 4, '#243a2d'); rounded(w.x, w.y, w.w, w.h - 5, 4, '#627551'); ctx.fillStyle = '#82916a'; ctx.fillRect(w.x + 5, w.y + 4, Math.max(2, w.w - 10), 4); ctx.fillStyle = '#3a5038'; for (let yy = w.y + 17; yy < w.y + w.h - 8; yy += 22) ctx.fillRect(w.x + 6, yy, w.w - 12, 2); });
    // little flower tufts
    for (const [x, y] of [[85, 100], [158, 250], [300, 286], [450, 365], [640, 165], [715, 430], [90, 410]]) { ctx.fillStyle = '#91b275'; ctx.fillRect(x, y, 3, 8); ctx.fillRect(x - 3, y + 3, 9, 3); ctx.fillStyle = '#d7bd75'; ctx.fillRect(x + 1, y - 2, 3, 3); }
    relicSpots.forEach((p, i) => { if (state.collected.includes(i)) return; const colors = ['#a8ee86', '#ffd277', '#7fe0e7']; const c = colors[i], bob = Math.sin(state.elapsed * 3 + i) * 3; ctx.globalAlpha = .17; ctx.fillStyle = c; ctx.beginPath(); ctx.arc(p.x, p.y + bob, 20, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; ctx.fillStyle = '#202d25'; ctx.beginPath(); ctx.ellipse(p.x, p.y + 9 + bob, 13, 5, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(p.x, p.y - 11 + bob); ctx.lineTo(p.x + 8, p.y + bob); ctx.lineTo(p.x, p.y + 9 + bob); ctx.lineTo(p.x - 8, p.y + bob); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#f2f3c1'; ctx.fillRect(p.x - 2, p.y - 5 + bob, 3, 3); });
    // slimy pursuers
    if (slimes) slimes.forEach(s => { if (!s.alive) return; const bounce = Math.sin(s.phase) * 2; ctx.fillStyle = '#203b31'; ctx.beginPath(); ctx.ellipse(s.x + 11, s.y + 17, 14, 4, 0, 0, Math.PI * 2); ctx.fill(); rounded(s.x, s.y + bounce, s.w, s.h - bounce, 8, s.hurt ? '#efffc4' : '#70ba79'); ctx.fillStyle = s.hurt ? '#fff' : '#b3e889'; ctx.fillRect(s.x + 4, s.y + 2 + bounce, 6, 3); ctx.fillStyle = '#203b31'; ctx.fillRect(s.x + 6, s.y + 7 + bounce, 3, 4); ctx.fillRect(s.x + 15, s.y + 7 + bounce, 3, 4); ctx.fillStyle = '#eaf2cb'; ctx.fillRect(s.x + 6, s.y + 7 + bounce, 1, 1); ctx.fillRect(s.x + 15, s.y + 7 + bounce, 1, 1); });
    if (player) {
      // sword arc
      if (state.attackFlash > 0) { const angle = Math.atan2(player.fy, player.fx); ctx.strokeStyle = '#e7f7ae'; ctx.lineWidth = 5; ctx.globalAlpha = state.attackFlash / .18; ctx.beginPath(); ctx.arc(player.x + 10 + player.fx * 11, player.y + 11 + player.fy * 11, 24, angle - 1.02, angle + 1.02); ctx.stroke(); ctx.globalAlpha = 1; }
      const flicker = state.invuln > 0 && Math.floor(state.elapsed * 18) % 2 === 0; if (!flicker) {
        ctx.fillStyle = '#20372b'; ctx.beginPath(); ctx.ellipse(player.x + 10, player.y + 21, 12, 4, 0, 0, Math.PI * 2); ctx.fill();
        // cloak, boots, head
        rounded(player.x + 3, player.y + 10, 14, 11, 4, '#9cc46f'); ctx.fillStyle = '#405b3d'; ctx.fillRect(player.x + 4, player.y + 17, 5, 5); ctx.fillRect(player.x + 12, player.y + 17, 5, 5); rounded(player.x + 4, player.y + 1, 12, 12, 4, '#e1c99b');
        ctx.fillStyle = '#4d6243'; ctx.fillRect(player.x + 3, player.y + 1, 14, 5); ctx.fillRect(player.x + 5, player.y - 2, 3, 5); ctx.fillRect(player.x + 12, player.y - 2, 3, 5); ctx.fillStyle = '#354439'; ctx.fillRect(player.x + 7 + Math.round(player.fx), player.y + 7 + Math.round(player.fy), 2, 2); ctx.fillRect(player.x + 13 + Math.round(player.fx), player.y + 7 + Math.round(player.fy), 2, 2);
        ctx.fillStyle = '#dce4bf'; const sx = player.x + 10 + player.fx * 12, sy = player.y + 10 + player.fy * 12; ctx.fillRect(sx - 1, sy - 1, 3, 11);
      }
    }
    state.particles.forEach(p => { ctx.globalAlpha = clamp(p.life / p.max, 0, 1); ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, p.size, p.size); }); ctx.globalAlpha = 1;
    // in-world objective/time plate
    rounded(13, 13, 130, 25, 6, '#14231ccc'); ctx.fillStyle = '#c9d7bb'; ctx.font = '10px monospace'; ctx.fillText(`✦  ${state.collected.length}/3 RELICS`, 22, 29);
    rounded(655, 13, 130, 25, 6, '#14231ccc'); ctx.fillStyle = '#c9d7bb'; ctx.fillText(formatTime(state.elapsed), 764, 29);
  }
  function frame(now) { const dt = Math.min(.035, (now - (state.last || now)) / 1000); state.last = now; update(dt); draw(); requestAnimationFrame(frame); }
  $('#overlayAction').addEventListener('click', () => { if (state.mode === 'paused') { state.mode = 'playing'; $('#gameOverlay').classList.add('hidden'); } else freshRun(); });
  $('#pauseButton').addEventListener('click', () => { if (state.mode === 'playing') showOverlay('paused'); else if (state.mode === 'paused') { state.mode = 'playing'; $('#gameOverlay').classList.add('hidden'); } });
  $('#soundButton').addEventListener('click', () => { state.sound = !state.sound; $('#soundButton').classList.toggle('active', state.sound); $('#soundButton').setAttribute('aria-pressed', String(state.sound)); toast(state.sound ? 'Sound effects on' : 'Sound effects off'); if (state.sound) sound(520, .08); });
  window.addEventListener('keydown', e => { const key = e.key.length === 1 ? e.key.toLowerCase() : e.key; if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Shift'].includes(e.key)) e.preventDefault(); if (e.repeat && [' ', 'Shift'].includes(e.key)) return; state.keys.add(key); if (e.key === ' ' || key === 'j') attack(); if (e.key === 'Shift' || key === 'k') dash(); if (key === 'p' || key === 'Escape') { if (state.mode === 'playing') showOverlay('paused'); else if (state.mode === 'paused') { state.mode = 'playing'; $('#gameOverlay').classList.add('hidden'); } } });
  window.addEventListener('keyup', e => state.keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key)); window.addEventListener('blur', () => state.keys.clear());
  document.querySelectorAll('.pad').forEach(button => { const dir = button.dataset.dir; button.addEventListener('pointerdown', e => { e.preventDefault(); button.setPointerCapture(e.pointerId); state.touch.add(dir); }); ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(ev => button.addEventListener(ev, () => state.touch.delete(dir))); });
  $('#touchAttack').addEventListener('pointerdown', e => { e.preventDefault(); attack(); }); $('#touchDash').addEventListener('pointerdown', e => { e.preventDefault(); dash(); });
  $('#gameFrame').addEventListener('contextmenu', e => e.preventDefault());
  updateHud(); showOverlay('title'); requestAnimationFrame(frame);
})();
