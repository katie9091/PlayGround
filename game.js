'use strict'

const $ = selector => document.querySelector(selector)
const mapEl = $('#gameMap')
const W = 15
const H = 11
const depthNames = ['THE MOSSY GALLERIES', 'THE GLASSFIRE VEINS', 'THE HOLLOW CROWN']
const inventoryLabels = { copper: ['Copper', '🟠'], wood: ['Wood', '🪵'], stone: ['Stone', '🪨'] }
let game
let toastTimer
let audioContext

function freshRun() {
  game = {
    depth: 0, x: 2, y: 5, health: 6, maxHealth: 6, turns: 0, score: 0,
    inventory: { copper: 0, wood: 0, stone: 0 }, pickLevel: 1, cores: 0,
    tiles: [], enemies: [], seen: new Set(), ended: false, sound: $('#soundButton').getAttribute('aria-pressed') === 'true'
  }
  makeLevel()
  render()
  message('Your lantern is lit. Find the Ember Core and a way deeper.')
}

function makeLevel() {
  game.x = 2
  game.y = 5
  game.enemies = []
  game.tiles = Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => {
    if (x === 0 || y === 0 || x === W - 1 || y === H - 1) return { type: 'wall', hp: 99, permanent: true }
    return { type: 'floor' }
  }))
  // Build a guaranteed traversable east-west trail, then scatter mineable deposits around it.
  for (let x = 1; x < W - 1; x++) game.tiles[5][x] = { type: 'floor' }
  for (let y = 3; y <= 7; y++) {
    game.tiles[y][2] = { type: 'floor' }
    game.tiles[y][12] = { type: 'floor' }
  }
  const seed = 8917 + game.depth * 713
  let randomState = seed
  const random = () => { randomState = (randomState * 16807) % 2147483647; return (randomState - 1) / 2147483646 }
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    if (game.tiles[y][x].type !== 'floor' || (y >= 4 && y <= 6)) continue
    const n = random()
    if (n < .24) game.tiles[y][x] = { type: 'wall', hp: 1 + (game.depth > 0 ? 1 : 0), permanent: false }
    else if (n < .31) game.tiles[y][x] = { type: 'ore', hp: 2 + (game.depth === 2 ? 1 : 0) }
    else if (n < .35) game.tiles[y][x] = { type: 'wood', hp: 1 }
  }
  // Keep the immediate entrance and the route to objectives open.
  for (let x = 1; x <= 13; x++) game.tiles[5][x] = { type: 'floor' }
  for (let y = 3; y <= 7; y++) game.tiles[y][12] = { type: 'floor' }
  const coreX = 8 + (game.depth % 2)
  game.tiles[3][coreX] = { type: 'core' }
  game.tiles[5][12] = { type: 'exit' }
  game.tiles[5][2] = { type: 'floor' }
  const enemySpots = game.depth === 0 ? [[6, 4], [10, 7]] : game.depth === 1 ? [[5, 6], [9, 3], [11, 7]] : [[4, 4], [8, 7], [11, 3]]
  enemySpots.forEach(([x, y], i) => game.enemies.push({ x, y, hp: game.depth === 2 ? 3 : 2, kind: (i + game.depth) % 2 ? 'cave moth' : 'ember beetle', glyph: (i + game.depth) % 2 ? '✹' : '●' }))
  game.seen.clear()
  reveal()
}

function tileAt(x, y) { return game.tiles[y]?.[x] }
function reveal() {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (Math.abs(x - game.x) + Math.abs(y - game.y) <= 5) game.seen.add(`${x},${y}`)
  }
}
function render() {
  if (!game) return
  $('#depthLabel').textContent = `DEPTH 0${game.depth + 1}`
  $('#zoneName').textContent = depthNames[game.depth]
  $('#turnCount').textContent = String(game.turns).padStart(3, '0')
  $('#scoreValue').textContent = String(game.score).padStart(4, '0')
  $('#healthText').textContent = `${game.health} / ${game.maxHealth}`
  $('#healthTrack').innerHTML = Array.from({ length: game.maxHealth }, (_, i) => `<span class="heart ${i < game.health ? 'full' : ''}"></span>`).join('')
  $('#coreCount').textContent = `${game.cores} / 3 CORES`
  $('#coreProgress').querySelectorAll('.core-slot').forEach((el, i) => el.classList.toggle('found', i < game.cores))
  $('#objectiveText').textContent = game.cores > game.depth ? 'Core secured. Find the green descent gate.' : `Search depth 0${game.depth + 1} for its Ember Core.`
  $('#toolName').textContent = game.pickLevel === 1 ? 'Crude pickaxe' : 'Tempered pick'
  $('#toolLevel').textContent = game.pickLevel === 1 ? 'I' : 'II'
  const total = Object.values(game.inventory).reduce((a, b) => a + b, 0)
  $('#inventoryCount').textContent = `${total} ITEM${total === 1 ? '' : 'S'}`
  const items = Object.entries(game.inventory).filter(([, count]) => count > 0)
  $('#inventoryGrid').innerHTML = items.length ? items.map(([name, count]) => `<div class="inv-item"><span>${inventoryLabels[name][1]}</span><div><b>${count}</b><small>${inventoryLabels[name][0]}</small></div></div>`).join('') : '<div class="inv-empty">Your satchel is waiting for its first find.</div>'
  document.querySelector('[data-recipe="pickaxe"]').disabled = game.pickLevel > 1 || game.inventory.copper < 4 || game.inventory.wood < 2 || game.ended
  document.querySelector('[data-recipe="medkit"]').disabled = game.inventory.copper < 2 || game.health >= game.maxHealth || game.ended
  mapEl.innerHTML = ''
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const tile = tileAt(x, y)
    const enemy = game.enemies.find(e => e.x === x && e.y === y)
    const isPlayer = game.x === x && game.y === y
    const known = game.seen.has(`${x},${y}`)
    const lit = Math.abs(x - game.x) + Math.abs(y - game.y) <= 5
    const button = document.createElement('button')
    button.className = 'tile'
    button.type = 'button'
    button.setAttribute('role', 'gridcell')
    button.dataset.x = x
    button.dataset.y = y
    button.setAttribute('aria-label', known ? tileDescription(tile, enemy, isPlayer) : 'Unexplored cave')
    if (!known) button.classList.add('hidden-tile')
    else {
      button.classList.add(tile.type === 'floor' ? 'floor' : tile.type)
      if (!lit) button.classList.add('dim')
      if (isPlayer) button.classList.add('player')
      else if (enemy) button.classList.add('enemy')
      button.innerHTML = isPlayer ? '◆' : enemy ? enemy.glyph : tileGlyph(tile)
      if (tile.hp > 1 && (tile.type === 'ore' || tile.type === 'wall')) button.innerHTML += `<small class="durability">${tile.hp}</small>`
    }
    button.addEventListener('click', () => clickTile(x, y))
    mapEl.append(button)
  }
}
function tileGlyph(tile) { return ({ floor: '', wall: '▰', ore: '✦', wood: '♣', core: '✧', exit: '⌄' })[tile.type] || '' }
function tileDescription(tile, enemy, player) {
  if (player) return 'You are here'
  if (enemy) return `${enemy.kind}, ${enemy.hp} health`
  return ({ floor: 'Cave floor', wall: 'Mineable rock', ore: 'Copper vein', wood: 'Timber growth', core: 'Ember Core', exit: game.cores > game.depth ? 'Open descent gate' : 'Sealed descent gate' })[tile.type]
}
function message(text) { $('#messageText').textContent = text }
function showToast(text) {
  const el = $('#toast')
  el.textContent = text
  el.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => el.classList.remove('show'), 1650)
}
function mapToast(text) {
  const el = $('#mapToast')
  el.textContent = text
  el.classList.add('show')
  setTimeout(() => el.classList.remove('show'), 950)
}
function playTone(freq = 220, duration = .07) {
  if (!game.sound) return
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)()
    const oscillator = audioContext.createOscillator()
    const gain = audioContext.createGain()
    oscillator.type = 'triangle'
    oscillator.frequency.value = freq
    gain.gain.setValueAtTime(.055, audioContext.currentTime)
    gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + duration)
    oscillator.connect(gain); gain.connect(audioContext.destination)
    oscillator.start(); oscillator.stop(audioContext.currentTime + duration)
  } catch { /* Audio is an optional flourish. */ }
}
function act(dx, dy) {
  if (!game || game.ended) return
  const nx = game.x + dx, ny = game.y + dy
  if (nx < 1 || ny < 1 || nx >= W - 1 || ny >= H - 1) return
  const enemy = game.enemies.find(e => e.x === nx && e.y === ny)
  if (enemy) {
    enemy.hp -= game.pickLevel === 2 ? 2 : 1
    game.score += 12
    if (enemy.hp <= 0) {
      game.enemies = game.enemies.filter(e => e !== enemy)
      game.score += 28
      message(`You took down the ${enemy.kind}. The tunnel is clear.`)
      playTone(330, .12)
    } else { message(`A solid hit on the ${enemy.kind} — ${enemy.hp} health left.`); playTone(190) }
    spendTurn()
    return
  }
  const tile = tileAt(nx, ny)
  if (tile.type === 'wall' || tile.type === 'ore' || tile.type === 'wood') {
    if (tile.permanent) { message('Solid cave wall. Find another route.'); return }
    tile.hp -= game.pickLevel === 2 ? 2 : 1
    const name = tile.type === 'ore' ? 'copper vein' : tile.type === 'wood' ? 'timber' : 'rock'
    if (tile.hp <= 0) {
      if (tile.type === 'ore') { game.inventory.copper += 2; game.score += 30; message('Copper vein cracked open. +2 copper.') }
      else if (tile.type === 'wood') { game.inventory.wood += 2; game.score += 14; message('Gathered useful timber. +2 wood.') }
      else { game.inventory.stone += 1; game.score += 8; message('The rock gives way. +1 stone.') }
      game.tiles[ny][nx] = { type: 'floor' }
      playTone(440)
    } else { message(`Mining the ${name}… one more strike should do it.`); playTone(260) }
    spendTurn()
    return
  }
  if (tile.type === 'exit') {
    if (game.cores <= game.depth) { message('The descent gate is sealed. Find this depth’s Ember Core first.'); mapToast('CORE REQUIRED'); return }
    if (game.depth < 2) {
      game.depth++
      makeLevel()
      game.turns++
      message(`Depth ${game.depth + 1}: the air grows hot. Find the next Ember Core.`)
      mapToast(`DESCENDING · DEPTH 0${game.depth + 1}`)
      playTone(520, .15)
      render()
      return
    }
    finish(true)
    return
  }
  game.x = nx; game.y = ny
  if (tile.type === 'core') {
    game.tiles[ny][nx] = { type: 'floor' }
    game.cores++
    game.score += 150
    message(`Ember Core ${game.cores} of 3 secured. The descent gate is awake.`)
    mapToast('EMBER CORE FOUND')
    playTone(660, .18)
  } else message('You move carefully through the cavern.')
  spendTurn()
}
function spendTurn() {
  game.turns++
  reveal()
  enemiesAct()
  if (game.health <= 0) { game.health = 0; finish(false); return }
  render()
}
function enemiesAct() {
  for (const enemy of [...game.enemies]) {
    if (Math.abs(enemy.x - game.x) + Math.abs(enemy.y - game.y) === 1) {
      game.health--
      message(`The ${enemy.kind} clips you for 1 health!`)
      playTone(120, .12)
      continue
    }
    const choices = [[Math.sign(game.x - enemy.x), 0], [0, Math.sign(game.y - enemy.y)], [0,0]]
      .filter(([dx, dy], index, arr) => (dx || dy) && arr.findIndex(p => p[0] === dx && p[1] === dy) === index)
      .sort((a, b) => (Math.abs(enemy.x + a[0] - game.x) + Math.abs(enemy.y + a[1] - game.y)) - (Math.abs(enemy.x + b[0] - game.x) + Math.abs(enemy.y + b[1] - game.y)))
    for (const [dx, dy] of choices) {
      const x = enemy.x + dx, y = enemy.y + dy
      const tile = tileAt(x, y)
      if (tile?.type === 'floor' && !(game.x === x && game.y === y) && !game.enemies.some(other => other !== enemy && other.x === x && other.y === y)) {
        enemy.x = x; enemy.y = y; break
      }
    }
  }
}
function clickTile(x, y) {
  if (game.ended) return
  const dx = x - game.x, dy = y - game.y
  if (Math.max(Math.abs(dx), Math.abs(dy)) > 1 || (!dx && !dy)) { mapToast('CHOOSE A NEARBY TILE'); return }
  // A diagonal tap is translated to a cardinal step toward the selected tile.
  if (dx && dy) act(Math.abs(dx) >= Math.abs(dy) ? dx : 0, Math.abs(dy) > Math.abs(dx) ? dy : 0)
  else act(dx, dy)
}
function craft(type) {
  if (game.ended) return
  if (type === 'pickaxe') {
    if (game.pickLevel > 1 || game.inventory.copper < 4 || game.inventory.wood < 2) return
    game.inventory.copper -= 4; game.inventory.wood -= 2; game.pickLevel = 2
    message('Tempered pick crafted. It breaks rock and enemies twice as fast!')
    showToast('TEMPERED PICK CRAFTED')
  } else {
    if (game.inventory.copper < 2 || game.health >= game.maxHealth) return
    game.inventory.copper -= 2
    const healed = Math.min(3, game.maxHealth - game.health)
    game.health += healed
    message(`Patch kit used. Restored ${healed} health.`)
    showToast(`+${healed} HEALTH`)
  }
  render()
}
function finish(won) {
  game.ended = true
  $('#endEyebrow').textContent = won ? 'EXPEDITION COMPLETE' : 'EXPEDITION ENDED'
  $('#endEmblem').textContent = won ? '✦' : '☠'
  $('#endTitle').innerHTML = won ? 'The surface <em>remembers.</em>' : 'The deep <em>claims another.</em>'
  $('#endCopy').textContent = won ? 'All three Ember Cores are home. The old fires burn again.' : `You recovered ${game.cores} of 3 Ember Cores before your lantern went dark.`
  $('#runSummary').innerHTML = `<span>CORES<b>${game.cores} / 3</b></span><span>TURNS<b>${game.turns}</b></span><span>SCORE<b>${String(game.score).padStart(4, '0')}</b></span>`
  $('#endModal').classList.remove('hidden')
}
function toggleHelp(show) { $('#helpModal').classList.toggle('hidden', !show) }

$('#newRunButton').addEventListener('click', () => { $('#endModal').classList.add('hidden'); freshRun(); showToast('A fresh expedition begins') })
$('#playAgain').addEventListener('click', () => { $('#endModal').classList.add('hidden'); freshRun() })
$('#helpButton').addEventListener('click', () => toggleHelp(true))
$('#closeHelp').addEventListener('click', () => toggleHelp(false))
$('#startPlaying').addEventListener('click', () => toggleHelp(false))
$('#helpModal').addEventListener('click', event => { if (event.target === $('#helpModal')) toggleHelp(false) })
$('#soundButton').addEventListener('click', event => {
  const button = event.currentTarget
  const on = button.getAttribute('aria-pressed') !== 'true'
  button.setAttribute('aria-pressed', String(on))
  button.innerHTML = `♫ <span>Sound ${on ? 'on' : 'off'}</span>`
  game.sound = on
  if (on) playTone(480)
})
document.querySelectorAll('.recipe').forEach(button => button.addEventListener('click', () => craft(button.dataset.recipe)))
document.querySelectorAll('[data-move]').forEach(button => button.addEventListener('click', () => {
  const moves = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }
  act(...moves[button.dataset.move])
}))
$('#mineButton').addEventListener('click', () => {
  const target = game.tiles[game.y][game.x + 1]
  if (target && ['wall', 'ore', 'wood'].includes(target.type)) act(1, 0)
  else { message('Move next to rock, ore, or a hostile to act.'); mapToast('NO TARGET IN FRONT') }
})
window.addEventListener('keydown', event => {
  if (event.key === 'Escape') { toggleHelp(false); $('#endModal').classList.add('hidden'); return }
  const target = event.target
  if (target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)) return
  const moves = { ArrowUp: [0, -1], w: [0, -1], W: [0, -1], ArrowDown: [0, 1], s: [0, 1], S: [0, 1], ArrowLeft: [-1, 0], a: [-1, 0], A: [-1, 0], ArrowRight: [1, 0], d: [1, 0], D: [1, 0] }
  if (moves[event.key]) { event.preventDefault(); act(...moves[event.key]) }
})

freshRun()
