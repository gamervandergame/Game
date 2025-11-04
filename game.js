const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const scoreEl = document.getElementById("score");
const bestScoreEl = document.getElementById("best-score");
const restartBtn = document.getElementById("restart");

const WIDTH = canvas.width;
const HEIGHT = canvas.height;
const GROUND_HEIGHT = 60;
const GRAVITY = 0.65;
const JUMP_VELOCITY = -12;
const OBSTACLE_GAP = 1600; // milliseconds

const player = {
  x: 120,
  y: HEIGHT - GROUND_HEIGHT - 48,
  width: 42,
  height: 48,
  vy: 0,
  color: "#ff595e",
  isJumping: false,
};

const groundGradient = ctx.createLinearGradient(0, HEIGHT - GROUND_HEIGHT, 0, HEIGHT);
groundGradient.addColorStop(0, "#c1df7d");
groundGradient.addColorStop(1, "#7caa2d");

let obstacles = [];
let lastTime = 0;
let lastSpawn = 0;
let score = 0;
let running = false;
let gameOver = false;
let bestScore = Number(localStorage.getItem("jump-dash-best") || 0);

bestScoreEl.textContent = bestScore;

function resetGame() {
  obstacles = [];
  player.y = HEIGHT - GROUND_HEIGHT - player.height;
  player.vy = 0;
  player.isJumping = false;
  score = 0;
  lastSpawn = 0;
  lastTime = 0;
  running = true;
  gameOver = false;
  restartBtn.classList.add("hidden");
  scoreEl.textContent = score;
  requestAnimationFrame(loop);
}

function jump() {
  if (!running) {
    resetGame();
    return;
  }

  if (!player.isJumping) {
    player.vy = JUMP_VELOCITY;
    player.isJumping = true;
  }
}

function spawnObstacle() {
  const height = 32 + Math.random() * 32;
  const width = 24 + Math.random() * 18;
  obstacles.push({
    x: WIDTH + width,
    y: HEIGHT - GROUND_HEIGHT - height,
    width,
    height,
    color: "#1982c4",
  });
}

function update(delta) {
  player.vy += GRAVITY;
  player.y += player.vy;
  if (player.y >= HEIGHT - GROUND_HEIGHT - player.height) {
    player.y = HEIGHT - GROUND_HEIGHT - player.height;
    player.vy = 0;
    player.isJumping = false;
  }

  obstacles.forEach((obstacle) => {
    obstacle.x -= (240 + score * 0.02) * (delta / 16.67);
  });

  obstacles = obstacles.filter((obstacle) => obstacle.x + obstacle.width > 0);

  for (const obstacle of obstacles) {
    if (
      player.x < obstacle.x + obstacle.width &&
      player.x + player.width > obstacle.x &&
      player.y < obstacle.y + obstacle.height &&
      player.y + player.height > obstacle.y
    ) {
      return endGame();
    }
  }

  score += delta * 0.01;
  scoreEl.textContent = Math.floor(score);
  if (Math.floor(score) > bestScore) {
    bestScore = Math.floor(score);
    localStorage.setItem("jump-dash-best", bestScore);
    bestScoreEl.textContent = bestScore;
  }
}

function drawBackground() {
  ctx.fillStyle = "#87ceeb";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = groundGradient;
  ctx.fillRect(0, HEIGHT - GROUND_HEIGHT, WIDTH, GROUND_HEIGHT);

  ctx.fillStyle = "#ffffff";
  ctx.globalAlpha = 0.2;
  const cloudCount = 5;
  for (let i = 0; i < cloudCount; i++) {
    const width = 120 + Math.sin((lastTime / 2000 + i) * 0.8) * 25;
    const height = 40;
    const x = ((i * 130 + (lastTime * 0.06)) % (WIDTH + width)) - width;
    const y = 60 + Math.sin((lastTime / 1500 + i) * 0.5) * 20;
    ctx.beginPath();
    ctx.ellipse(x, y, width, height, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawPlayer() {
  ctx.fillStyle = player.color;
  ctx.fillRect(player.x, player.y, player.width, player.height);

  ctx.fillStyle = "#fff";
  ctx.fillRect(player.x + player.width - 14, player.y + 12, 8, 12);
  ctx.fillStyle = "#1b1b1b";
  ctx.fillRect(player.x + player.width - 10, player.y + 16, 4, 4);
}

function drawObstacles() {
  obstacles.forEach((obstacle) => {
    ctx.fillStyle = obstacle.color;
    ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);

    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.fillRect(obstacle.x + 4, obstacle.y + 4, obstacle.width - 8, 6);
  });
}

function endGame() {
  running = false;
  gameOver = true;
  restartBtn.classList.remove("hidden");
}

function loop(timestamp) {
  if (!running) {
    return;
  }

  if (!lastTime) lastTime = timestamp;
  const delta = timestamp - lastTime;
  lastTime = timestamp;
  lastSpawn += delta;

  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  drawBackground();
  drawObstacles();
  drawPlayer();

  update(delta);

  if (lastSpawn > OBSTACLE_GAP) {
    spawnObstacle();
    lastSpawn = 0;
  }

  requestAnimationFrame(loop);
}

function handleKeyDown(event) {
  const { code } = event;
  if (["Space", "ArrowUp", "KeyW"].includes(code)) {
    event.preventDefault();
    jump();
  }
}

document.addEventListener("keydown", handleKeyDown);
canvas.addEventListener("pointerdown", jump);
restartBtn.addEventListener("click", resetGame);

resetGame();
