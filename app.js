/**
 * app.js - 라이브 로또 추첨 스튜디오 메인 오케스트레이터
 * 물리 엔진, 오디오 엔진, 방송 시퀀서, OMR 영수증 렌더러 연동
 */

document.addEventListener('DOMContentLoaded', () => {
  // 1. 캔버스 및 물리 엔진 초기화
  const canvas = document.getElementById('chamberCanvas');
  const chamber = new LottoChamber(canvas);

  // 2. DOM 참조
  const btnLiveDraw = document.getElementById('btn-live-draw');
  const btnQuickDraw = document.getElementById('btn-quick-draw');
  const btnResetChamber = document.getElementById('btn-reset-chamber');
  const btnSoundToggle = document.getElementById('btn-sound-toggle');
  const soundIcon = document.getElementById('sound-icon');
  const soundLabel = document.getElementById('sound-label');
  const speedSelect = document.getElementById('speed-select');

  const machineStatus = document.getElementById('machine-status');
  const statusText = document.getElementById('status-text');
  const liveTicker = document.getElementById('live-ticker');

  const statSum = document.getElementById('stat-sum');
  const statOddEven = document.getElementById('stat-odd-even');
  const statHighLow = document.getElementById('stat-high-low');

  const slipGamesList = document.getElementById('slip-games-list');
  const slipDate = document.getElementById('slip-date');
  const btnCopySlip = document.getElementById('btn-copy-slip');
  const toast = document.getElementById('toast');

  // 상태 변수
  let isDrawing = false;
  let drawnNumbers = []; // 6개 본번호
  let bonusNumber = null;
  let slipGames = []; // 5개 게임 데이터

  // 유틸: 1~45 고유 번호 추출
  function pickUniqueNumbers(count) {
    const pool = Array.from({ length: 45 }, (_, i) => i + 1);
    for (let i = pool.length - 1; i > 0; i--) {
      let j;
      if (window.crypto && window.crypto.getRandomValues) {
        const buf = new Uint32Array(1);
        window.crypto.getRandomValues(buf);
        j = buf[0] % (i + 1);
      } else {
        j = Math.floor(Math.random() * (i + 1));
      }
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, count);
  }

  // 공 색상 클래스
  function getColorClass(num) {
    if (num <= 10) return 'color-yellow';
    if (num <= 20) return 'color-blue';
    if (num <= 30) return 'color-red';
    if (num <= 40) return 'color-gray';
    return 'color-green';
  }

  // 사운드 토글
  btnSoundToggle.addEventListener('click', () => {
    if (window.soundEngine) {
      const isMuted = window.soundEngine.toggleMute();
      soundIcon.textContent = isMuted ? '🔇' : '🔊';
      soundLabel.textContent = isMuted ? 'OFF' : 'ON';
      showToast(isMuted ? '음소거되었습니다.' : '사운드가 켜졌습니다.');
    }
  });

  // 상태 표시 업데이트
  function setStatus(text, icon = '🟡') {
    statusText.textContent = text;
    const iconSpan = machineStatus.querySelector('.status-icon');
    if (iconSpan) iconSpan.textContent = icon;
  }

  // 전광판 슬롯 초기화
  function resetPedestal() {
    for (let i = 0; i < 6; i++) {
      const slot = document.getElementById(`slot-${i}`);
      slot.className = 'slot-socket';
      slot.innerHTML = `<span class="socket-num">${i + 1}</span>`;
    }
    const bonusSlot = document.getElementById('slot-bonus');
    bonusSlot.className = 'slot-socket';
    bonusSlot.innerHTML = '';

    statSum.textContent = '-';
    statOddEven.textContent = '-';
    statHighLow.textContent = '-';
  }

  // 슬롯에 당첨 공 렌더링
  function placeBallInSlot(slotElement, number) {
    slotElement.innerHTML = `
      <div class="drawn-ball ${getColorClass(number)}">
        <div class="ball-white-patch">${number}</div>
      </div>
    `;
    slotElement.className = 'slot-socket filled';
  }

  // 통계 계산 및 업데이트
  function updateStats(numbers) {
    if (numbers.length === 0) return;
    const sum = numbers.reduce((acc, cur) => acc + cur, 0);
    statSum.textContent = sum;

    let odd = 0;
    let high = 0;
    numbers.forEach(n => {
      if (n % 2 !== 0) odd++;
      if (n >= 23) high++;
    });
    statOddEven.textContent = `${odd} : ${numbers.length - odd}`;
    statHighLow.textContent = `${high} : ${numbers.length - high}`;
  }

  // 대기 헬퍼 (Promise sleep)
  const delay = (ms) => new Promise(res => setTimeout(res, ms));

  // 실시간 라이브 추첨 시퀀스
  async function startLiveDraw() {
    if (isDrawing) return;
    isDrawing = true;
    btnLiveDraw.disabled = true;
    btnQuickDraw.disabled = true;
    btnResetChamber.disabled = true;

    // 사운드 컨텍스트 초기화 (사용자 클릭 제스처)
    if (window.soundEngine) {
      window.soundEngine.initContext();
    }

    // 1. 추첨 데이터 준비 (본번호 6개 + 보너스 번호 1개)
    const picked = pickUniqueNumbers(7);
    drawnNumbers = picked.slice(0, 6);
    bonusNumber = picked[6];

    resetPedestal();
    chamber.resetAllBalls();

    const speed = parseFloat(speedSelect.value) || 1;
    const stepDelay = Math.round(1800 / speed);

    // 2. 송풍기 가동 및 공 혼합
    setStatus('송풍기 최대 가동 중! 공들이 섞입니다...', '🌪️');
    liveTicker.innerHTML = '🎙️ <strong>"송풍기가 가동됩니다! 45개의 행운의 공이 힘차게 회전합니다."</strong>';
    chamber.setBlower(true);

    await delay(1600 / speed);

    // 3. 6개 본번호 순차 추첨
    for (let i = 0; i < 6; i++) {
      const num = drawnNumbers[i];
      const slot = document.getElementById(`slot-${i}`);
      slot.classList.add('active');

      setStatus(`제 ${i + 1}번째 행운의 번호 추첨 중...`, '🎯');
      liveTicker.innerHTML = `🎙️ "${i + 1}번째 공이 추출관으로 빨려 올라옵니다!"`;

      // 챔버에서 해당 공 추출 물리 애니메이션 실행
      await new Promise(resolve => {
        chamber.extractSpecificBall(num, () => {
          resolve();
        });
      });

      // 거치대에 공 안착
      slot.classList.remove('active');
      placeBallInSlot(slot, num);

      // 사운드 및 통계 업데이트
      if (window.soundEngine) {
        window.soundEngine.playChime(i);
      }
      updateStats(drawnNumbers.slice(0, i + 1));

      liveTicker.innerHTML = `🎙️ "${i + 1}번째 행운의 번호는 <strong>【 ${num}번 】</strong>입니다!"`;
      await delay(stepDelay);
    }

    // 4. 보너스 번호 추첨
    const bonusSlot = document.getElementById('slot-bonus');
    bonusSlot.classList.add('active');

    setStatus('보너스 번호 추첨 중...', '✨');
    liveTicker.innerHTML = '🎙️ "2등 당첨을 결정지을 보너스 번호를 추첨합니다!"';

    await new Promise(resolve => {
      chamber.extractSpecificBall(bonusNumber, () => {
        resolve();
      });
    });

    bonusSlot.classList.remove('active');
    placeBallInSlot(bonusSlot, bonusNumber);

    if (window.soundEngine) {
      window.soundEngine.playChime(6);
    }

    liveTicker.innerHTML = `🎙️ "보너스 번호는 <strong>【 ${bonusNumber}번 】</strong>입니다!"`;
    await delay(1000 / speed);

    // 5. 추첨 완료 및 축하
    chamber.setBlower(false);
    if (window.soundEngine) {
      window.soundEngine.playFanfare();
    }

    setStatus('추첨 완료! 당첨을 축하드립니다!', '🎉');
    liveTicker.innerHTML = '🏆 <strong>"제 1150회 로또 6/45 추첨이 성황리에 종료되었습니다! 대박을 기원합니다!"</strong>';

    // 6. 영수증 5게임 자동 발행
    generateSlipData(drawnNumbers);

    isDrawing = false;
    btnLiveDraw.disabled = false;
    btnQuickDraw.disabled = false;
    btnResetChamber.disabled = false;
  }

  // 쾌속 추첨 모드
  function startQuickDraw() {
    if (isDrawing) return;
    if (window.soundEngine) window.soundEngine.initContext();

    const picked = pickUniqueNumbers(7);
    drawnNumbers = picked.slice(0, 6);
    bonusNumber = picked[6];

    resetPedestal();

    // 6개 본번호 및 보너스 즉시 배치
    drawnNumbers.forEach((num, i) => {
      const slot = document.getElementById(`slot-${i}`);
      placeBallInSlot(slot, num);
    });
    placeBallInSlot(document.getElementById('slot-bonus'), bonusNumber);

    updateStats(drawnNumbers);

    if (window.soundEngine) {
      window.soundEngine.playFanfare();
    }

    setStatus('5게임 즉시 추첨 완료!', '⚡');
    liveTicker.innerHTML = '⚡ <strong>"5게임 일괄 추첨이 완료되었습니다. 하단 영수증을 확인하세요!"</strong>';

    generateSlipData(drawnNumbers);
  }

  // 영수증 데이터 생성 및 렌더링
  function generateSlipData(mainWinning) {
    slipGames = [];
    const labels = ['A', 'B', 'C', 'D', 'E'];

    // Game A는 정렬된 당첨 번호
    slipGames.push({
      label: 'A',
      type: '자 동',
      numbers: [...mainWinning].sort((a, b) => a - b)
    });

    // Game B~E는 새로운 4개 무작위 게임
    for (let i = 1; i < 5; i++) {
      slipGames.push({
        label: labels[i],
        type: '자 동',
        numbers: pickUniqueNumbers(6).sort((a, b) => a - b)
      });
    }

    renderSlip(slipGames);
  }

  function renderSlip(games) {
    slipGamesList.innerHTML = '';
    
    // 현재 날짜/시간
    const now = new Date();
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    const dateStr = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')} (${days[now.getDay()]}) ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    slipDate.textContent = `발행일: ${dateStr}`;

    games.forEach(g => {
      const row = document.createElement('div');
      row.className = 'slip-game-row';

      const left = document.createElement('div');
      left.style.display = 'flex';
      left.style.alignItems = 'center';
      left.innerHTML = `<span style="font-weight:900; margin-right:8px; width:16px;">${g.label}</span> <span class="slip-type">${g.type}</span>`;

      const right = document.createElement('div');
      right.className = 'slip-numbers';

      g.numbers.forEach(num => {
        const mini = document.createElement('span');
        mini.className = `slip-ball-mini ${getColorClass(num)}`;
        mini.textContent = String(num).padStart(2, '0');
        right.appendChild(mini);
      });

      row.appendChild(left);
      row.appendChild(right);
      slipGamesList.appendChild(row);
    });
  }

  // 추첨기 리셋 핸들러
  function handleChamberReset() {
    if (isDrawing) return;
    chamber.setBlower(false);
    chamber.resetAllBalls();
    resetPedestal();
    setStatus('추첨기 대기 중 (준비 완료)', '🟢');
    liveTicker.innerHTML = '🎙️ "추첨기가 초기화되었습니다. 실시간 추첨을 시작해 보세요."';
    showToast('추첨기가 초기화되었습니다.');
  }

  // 클립보드 복사
  async function handleCopySlip() {
    if (slipGames.length === 0) {
      showToast('먼저 추첨을 진행해주세요.');
      return;
    }

    let text = '🍀 [동행복권 로또 6/45 5게임 영수증]\n';
    slipGames.forEach(g => {
      const nums = g.numbers.map(n => String(n).padStart(2, '0')).join(', ');
      text += `[${g.label}] ${g.type} : ${nums}\n`;
    });
    if (bonusNumber) {
      text += `(보너스 번호: ${bonusNumber})\n`;
    }

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text.trim());
      } else {
        const ta = document.createElement('textarea');
        ta.value = text.trim();
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      showToast('✨ 5게임 번호가 복사되었습니다!');
    } catch (err) {
      showToast('복사에 실패했습니다.');
    }
  }

  // 탭 전환
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));

      btn.classList.add('active');
      const targetId = btn.getAttribute('data-tab');
      const targetContent = document.getElementById(targetId);
      if (targetContent) targetContent.classList.add('active');
    });
  });

  // 토스트 메시지
  let toastTimeout = null;
  function showToast(msg) {
    if (toastTimeout) clearTimeout(toastTimeout);
    toast.textContent = msg;
    toast.classList.add('show');
    toastTimeout = setTimeout(() => {
      toast.classList.remove('show');
    }, 2200);
  }

  // 초기 5게임 샘플 영수증 렌더링
  generateSlipData(pickUniqueNumbers(6));

  // 버튼 이벤트 연결
  btnLiveDraw.addEventListener('click', startLiveDraw);
  btnQuickDraw.addEventListener('click', startQuickDraw);
  btnResetChamber.addEventListener('click', handleChamberReset);
  btnCopySlip.addEventListener('click', handleCopySlip);
});
