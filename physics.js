/**
 * physics.js - 2D Canvas 물리 시뮬레이션 기반 로또 추첨기 챔버
 * 45개의 실시간 물리 연산 볼, 바람 송풍기, 3D 광택 렌더링 지원
 */

class LottoChamber {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    
    // 크기 및 중심점
    this.width = canvas.width;
    this.height = canvas.height;
    this.cx = this.width / 2;
    this.cy = this.height / 2 + 10;
    this.radius = Math.min(this.width, this.height) * 0.42;

    // 물리 상태
    this.balls = [];
    this.particles = []; // 공기 흐름 파티클
    this.blowerPower = 0; // 0 ~ 1
    this.targetBlower = 0;
    this.isExtracting = false;
    this.extractingBall = null;
    this.extractionProgress = 0;
    this.onExtractionComplete = null;

    // 애니메이션 프레임
    this.animId = null;
    this.lastTime = performance.now();

    this.initBalls();
    this.initParticles();
    this.startLoop();
  }

  // 1~45번 공 색상 매핑
  static getBallColors(num) {
    if (num <= 10) return { main: '#f39c12', light: '#f1c40f', dark: '#d68910', text: '#fff' };
    if (num <= 20) return { main: '#2980b9', light: '#5dade2', dark: '#1f618d', text: '#fff' };
    if (num <= 30) return { main: '#c0392b', light: '#e74c3c', dark: '#922b21', text: '#fff' };
    if (num <= 40) return { main: '#7f8c8d', light: '#bdc3c7', dark: '#515a5a', text: '#fff' };
    return { main: '#27ae60', light: '#58d68d', dark: '#1e8449', text: '#fff' };
  }

  initBalls() {
    this.balls = [];
    const ballRadius = Math.max(12, this.radius * 0.092);

    for (let i = 1; i <= 45; i++) {
      // 챔버 하단부에 자연스럽게 배치
      const angle = (Math.PI * 0.2) + Math.random() * (Math.PI * 0.6);
      const dist = Math.random() * (this.radius - ballRadius - 15);
      const x = this.cx + Math.cos(angle) * dist;
      const y = this.cy + Math.sin(angle) * dist * 0.7;

      this.balls.push({
        num: i,
        x: x,
        y: y,
        vx: (Math.random() - 0.5) * 2,
        vy: (Math.random() - 0.5) * 2,
        radius: ballRadius,
        colors: LottoChamber.getBallColors(i),
        angle: Math.random() * Math.PI * 2,
        vAngle: (Math.random() - 0.5) * 0.1,
        inChamber: true
      });
    }
  }

  initParticles() {
    this.particles = [];
    for (let i = 0; i < 40; i++) {
      this.particles.push({
        x: this.cx + (Math.random() - 0.5) * this.radius * 1.4,
        y: this.cy + (Math.random() - 0.5) * this.radius * 1.4,
        radius: Math.random() * 2 + 1,
        alpha: Math.random() * 0.5 + 0.1,
        vx: (Math.random() - 0.5) * 2,
        vy: -Math.random() * 4 - 2
      });
    }
  }

  setBlower(active) {
    this.targetBlower = active ? 1 : 0;
    if (window.soundEngine) {
      if (active) window.soundEngine.startWind();
      else window.soundEngine.stopWind();
    }
  }

  // 지정한 번호의 공(또는 남은 공 중 하나)을 상단 관으로 추출
  extractSpecificBall(targetNum, callback) {
    let ball = this.balls.find(b => b.num === targetNum && b.inChamber);
    if (!ball) {
      const remaining = this.balls.filter(b => b.inChamber);
      if (remaining.length === 0) return;
      ball = remaining[Math.floor(Math.random() * remaining.length)];
    }

    this.isExtracting = true;
    this.extractingBall = ball;
    this.extractionProgress = 0;
    this.onExtractionComplete = callback;

    if (window.soundEngine) {
      window.soundEngine.playPop();
    }
  }

  // 챔버 내 공 초기화 (모든 공 다시 복귀)
  resetAllBalls() {
    this.isExtracting = false;
    this.extractingBall = null;
    this.initBalls();
  }

  updatePhysics(dt) {
    // 송풍기 파워 부드러운 가감속
    this.blowerPower += (this.targetBlower - this.blowerPower) * 0.05;

    const gravity = 0.22;
    const drag = 0.985;
    const timeSec = performance.now() * 0.003;

    // 공 물리 업데이트
    for (let i = 0; i < this.balls.length; i++) {
      const b = this.balls[i];
      if (!b.inChamber) continue;

      // 추출 중인 특정 볼 애니메이션
      if (this.isExtracting && b === this.extractingBall) {
        this.extractionProgress += dt * 0.025;
        // 상단 흡입구 위치로 빠르게 이동
        const targetX = this.cx;
        const targetY = this.cy - this.radius - 20;

        b.x += (targetX - b.x) * 0.12;
        b.y += (targetY - b.y) * 0.12;
        b.angle += 0.2;

        if (this.extractionProgress >= 1 || Math.hypot(targetX - b.x, targetY - b.y) < 10) {
          b.inChamber = false;
          this.isExtracting = false;
          const completedBall = this.extractingBall;
          this.extractingBall = null;
          if (this.onExtractionComplete) {
            this.onExtractionComplete(completedBall.num);
          }
        }
        continue;
      }

      // 1. 중력
      b.vy += gravity;

      // 2. 송풍기 바람 효과 (하단 분사 + 소용돌이)
      if (this.blowerPower > 0.01) {
        const dxFromCenter = b.x - this.cx;
        const distFromBottom = (this.cy + this.radius) - b.y;

        // 중앙 상승 제트 기류
        const upwardForce = Math.max(0, 1 - Math.abs(dxFromCenter) / (this.radius * 0.8));
        b.vy -= upwardForce * (1.1 + Math.random() * 0.8) * this.blowerPower;

        // 와류(Vortex) 회전 기류
        const vortexDir = Math.sin(timeSec + b.y * 0.01);
        b.vx += (vortexDir * 0.7 + (Math.random() - 0.5) * 0.8) * this.blowerPower;

        // 벽면 튕김 유도 난류
        if (distFromBottom < this.radius * 0.5) {
          b.vy -= Math.random() * 0.9 * this.blowerPower;
        }
      }

      // 3. 저항 적용
      b.vx *= drag;
      b.vy *= drag;

      // 속도 제한
      const maxSpd = 16;
      const curSpd = Math.hypot(b.vx, b.vy);
      if (curSpd > maxSpd) {
        b.vx = (b.vx / curSpd) * maxSpd;
        b.vy = (b.vy / curSpd) * maxSpd;
      }

      // 위치 이동
      b.x += b.vx;
      b.y += b.vy;
      b.angle += b.vAngle;
      b.vAngle = b.vx * 0.03;

      // 4. 구형 챔버 벽면 충돌
      const dist = Math.hypot(b.x - this.cx, b.y - this.cy);
      const maxDist = this.radius - b.radius - 2;

      if (dist > maxDist) {
        const nx = (b.x - this.cx) / dist;
        const ny = (b.y - this.cy) / dist;

        // 위치 보정
        b.x = this.cx + nx * maxDist;
        b.y = this.cy + ny * maxDist;

        // 반사 벡터 연산
        const dot = b.vx * nx + b.vy * ny;
        if (dot > 0) {
          b.vx -= (1 + 0.78) * dot * nx;
          b.vy -= (1 + 0.78) * dot * ny;

          // 충돌 효과음
          if (curSpd > 3.5 && window.soundEngine) {
            window.soundEngine.playBounce(curSpd / maxSpd);
          }
        }
      }

      // 5. 공과 공 사이 탄성 충돌
      for (let j = i + 1; j < this.balls.length; j++) {
        const b2 = this.balls[j];
        if (!b2.inChamber) continue;

        const cdx = b2.x - b.x;
        const cdy = b2.y - b.y;
        const cdist = Math.hypot(cdx, cdy);
        const minDist = b.radius + b2.radius;

        if (cdist < minDist && cdist > 0.001) {
          const cnx = cdx / cdist;
          const cny = cdy / cdist;

          // 겹침 해결
          const overlap = 0.5 * (minDist - cdist);
          b.x -= overlap * cnx;
          b.y -= overlap * cny;
          b2.x += overlap * cnx;
          b2.y += overlap * cny;

          // 탄성 충돌 속도 교환
          const kx = b.vx - b2.vx;
          const ky = b.vy - b2.vy;
          const p = 2 * (cnx * kx + cny * ky) / 2; // 동일 질량

          b.vx -= p * 0.82 * cnx;
          b.vy -= p * 0.82 * cny;
          b2.vx += p * 0.82 * cnx;
          b2.vy += p * 0.82 * cny;
        }
      }
    }

    // 공기 파티클 업데이트
    for (let p of this.particles) {
      if (this.blowerPower > 0.05) {
        p.y += p.vy * this.blowerPower * 2;
        p.x += p.vx * this.blowerPower;
        const pDist = Math.hypot(p.x - this.cx, p.y - this.cy);
        if (pDist > this.radius * 0.95 || p.y < this.cy - this.radius) {
          // 하단 분사구에서 재스폰
          p.x = this.cx + (Math.random() - 0.5) * (this.radius * 0.6);
          p.y = this.cy + this.radius * 0.85;
        }
      }
    }
  }

  // 렌더링 메인 루프
  render() {
    this.ctx.clearRect(0, 0, this.width, this.height);

    // 1. 후면 배경 그림자 & 스탠드 받침대
    this.drawStand();

    // 2. 챔버 내부 어두운 심도
    this.drawChamberBackdrop();

    // 3. 바람 파티클
    if (this.blowerPower > 0.05) {
      this.drawWindParticles();
    }

    // 4. 로또 공 렌더링
    for (let b of this.balls) {
      if (b.inChamber || (this.isExtracting && b === this.extractingBall)) {
        this.drawBall(b);
      }
    }

    // 5. 챔버 투명 아크릴 구체 반사광 및 유리 재질 렌더링
    this.drawChamberGlass();

    // 6. 상단 흡입관 및 하단 노즐
    this.drawChamberHardware();
  }

  drawStand() {
    const ctx = this.ctx;
    const baseWidth = this.radius * 1.35;
    const baseY = this.cy + this.radius + 15;

    // 하단 메탈 베이스
    const baseGrad = ctx.createLinearGradient(this.cx - baseWidth / 2, 0, this.cx + baseWidth / 2, 0);
    baseGrad.addColorStop(0, '#1e293b');
    baseGrad.addColorStop(0.2, '#475569');
    baseGrad.addColorStop(0.5, '#94a3b8');
    baseGrad.addColorStop(0.8, '#475569');
    baseGrad.addColorStop(1, '#0f172a');

    ctx.save();
    ctx.fillStyle = baseGrad;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = 20;
    ctx.beginPath();
    ctx.roundRect(this.cx - baseWidth / 2, baseY, baseWidth, 24, 8);
    ctx.fill();
    ctx.restore();

    // 지지 기둥 2개
    ctx.fillStyle = '#334155';
    ctx.fillRect(this.cx - this.radius * 0.8, this.cy + this.radius * 0.4, 18, this.radius * 0.7);
    ctx.fillRect(this.cx + this.radius * 0.8 - 18, this.cy + this.radius * 0.4, 18, this.radius * 0.7);
  }

  drawChamberBackdrop() {
    const ctx = this.ctx;
    ctx.save();

    // 내부 깊이감 방사형 그라데이션
    const bgGrad = ctx.createRadialGradient(
      this.cx, this.cy - this.radius * 0.2, this.radius * 0.1,
      this.cx, this.cy, this.radius
    );
    bgGrad.addColorStop(0, 'rgba(30, 41, 59, 0.75)');
    bgGrad.addColorStop(0.8, 'rgba(15, 23, 42, 0.9)');
    bgGrad.addColorStop(1, 'rgba(2, 6, 23, 0.95)');

    ctx.beginPath();
    ctx.arc(this.cx, this.cy, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = bgGrad;
    ctx.fill();

    ctx.restore();
  }

  drawWindParticles() {
    const ctx = this.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, this.radius, 0, Math.PI * 2);
    ctx.clip(); // 챔버 내부로만 파티클 제한

    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    for (let p of this.particles) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawBall(b) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.angle);

    // 1. 3D 입체 구체 그라데이션
    const grad = ctx.createRadialGradient(
      -b.radius * 0.35, -b.radius * 0.35, b.radius * 0.1,
      0, 0, b.radius
    );
    grad.addColorStop(0, b.colors.light);
    grad.addColorStop(0.7, b.colors.main);
    grad.addColorStop(1, b.colors.dark);

    // 볼 그림자
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 3;

    ctx.beginPath();
    ctx.arc(0, 0, b.radius, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    // 그림자 리셋
    ctx.shadowColor = 'transparent';

    // 2. 중앙 화이트 원형 숫자 패치
    const patchRadius = b.radius * 0.58;
    ctx.beginPath();
    ctx.arc(0, 0, patchRadius, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    // 3. 번호 텍스트
    ctx.fillStyle = '#1e293b';
    ctx.font = `800 ${Math.round(b.radius * 0.72)}px 'Pretendard', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(b.num, 0, 1);

    // 4. 구체 광택 하이라이트 (빛 반사 점)
    ctx.beginPath();
    ctx.arc(-b.radius * 0.38, -b.radius * 0.38, b.radius * 0.22, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
    ctx.fill();

    ctx.restore();
  }

  drawChamberGlass() {
    const ctx = this.ctx;
    ctx.save();

    // 챔버 외곽 링 테두리 (크롬 광택)
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, this.radius, 0, Math.PI * 2);
    ctx.lineWidth = 6;
    const rimGrad = ctx.createLinearGradient(this.cx - this.radius, this.cy - this.radius, this.cx + this.radius, this.cy + this.radius);
    rimGrad.addColorStop(0, '#94a3b8');
    rimGrad.addColorStop(0.3, '#ffffff');
    rimGrad.addColorStop(0.7, '#64748b');
    rimGrad.addColorStop(1, '#334155');
    ctx.strokeStyle = rimGrad;
    ctx.stroke();

    // 상단 큰 원호 광택 반사 (유리 표면 하이라이트)
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, this.radius - 8, Math.PI * 1.15, Math.PI * 1.85);
    ctx.lineWidth = 14;
    const glassReflect = ctx.createLinearGradient(0, this.cy - this.radius, 0, this.cy);
    glassReflect.addColorStop(0, 'rgba(255, 255, 255, 0.45)');
    glassReflect.addColorStop(1, 'rgba(255, 255, 255, 0.0)');
    ctx.strokeStyle = glassReflect;
    ctx.stroke();

    // 하단 서브 반사광
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, this.radius - 12, Math.PI * 0.2, Math.PI * 0.8);
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.stroke();

    ctx.restore();
  }

  drawChamberHardware() {
    const ctx = this.ctx;
    ctx.save();

    // 1. 상단 배출 파이프 (투명 아크릴 실린더)
    const pipeW = this.radius * 0.28;
    const pipeH = 34;
    const pipeX = this.cx - pipeW / 2;
    const pipeY = this.cy - this.radius - pipeH + 8;

    const pipeGrad = ctx.createLinearGradient(pipeX, 0, pipeX + pipeW, 0);
    pipeGrad.addColorStop(0, 'rgba(148, 163, 184, 0.7)');
    pipeGrad.addColorStop(0.3, 'rgba(255, 255, 255, 0.85)');
    pipeGrad.addColorStop(0.7, 'rgba(100, 116, 139, 0.6)');
    pipeGrad.addColorStop(1, 'rgba(51, 65, 85, 0.8)');

    ctx.fillStyle = pipeGrad;
    ctx.fillRect(pipeX, pipeY, pipeW, pipeH);

    // 파이프 림
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(pipeX - 4, pipeY, pipeW + 8, 6);

    // 2. 하단 송풍 노즐
    const nozzleW = this.radius * 0.35;
    const nozzleY = this.cy + this.radius - 12;
    ctx.beginPath();
    ctx.moveTo(this.cx - nozzleW / 2, nozzleY + 20);
    ctx.lineTo(this.cx + nozzleW / 2, nozzleY + 20);
    ctx.lineTo(this.cx + nozzleW * 0.25, nozzleY);
    ctx.lineTo(this.cx - nozzleW * 0.25, nozzleY);
    ctx.closePath();
    ctx.fillStyle = '#475569';
    ctx.fill();

    // 노즐 구멍 그릴
    ctx.fillStyle = this.blowerPower > 0.1 ? '#38bdf8' : '#0f172a';
    ctx.fillRect(this.cx - nozzleW * 0.22, nozzleY + 2, nozzleW * 0.44, 4);

    ctx.restore();
  }

  startLoop() {
    const loop = (currentTime) => {
      const dt = Math.min((currentTime - this.lastTime) / 16.66, 2.0); // 델타 타임 보정
      this.lastTime = currentTime;

      this.updatePhysics(dt);
      this.render();

      this.animId = requestAnimationFrame(loop);
    };
    this.animId = requestAnimationFrame(loop);
  }

  destroy() {
    if (this.animId) {
      cancelAnimationFrame(this.animId);
    }
  }
}

window.LottoChamber = LottoChamber;
