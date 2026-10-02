/**
 * audio.js - Web Audio API 기반 오디오 엔진
 * 외부 파일 의존성 없이 순수 브라우저 오디오 신디사이징으로 효과음 생성
 */

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.isMuted = false;
    this.windNode = null;
    this.windGain = null;
    this.lastBounceTime = 0;
  }

  // 브라우저 정책상 사용자 인터랙션 후 AudioContext 초기화
  initContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.isMuted && this.windGain) {
      this.windGain.gain.setValueAtTime(0, this.ctx.currentTime);
    }
    return this.isMuted;
  }

  // 바람 송풍기 (Blower) 소리 (화이트 노이즈 + 밴드패스 필터)
  startWind() {
    if (this.isMuted) return;
    this.initContext();
    if (this.windNode) return;

    try {
      const bufferSize = this.ctx.sampleRate * 2;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);

      // 화이트 노이즈 생성
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * 0.15;
      }

      this.windNode = this.ctx.createBufferSource();
      this.windNode.buffer = buffer;
      this.windNode.loop = true;

      // 바람 느낌을 주는 밴드패스 필터
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(320, this.ctx.currentTime);
      filter.Q.setValueAtTime(1.8, this.ctx.currentTime);

      this.windGain = this.ctx.createGain();
      this.windGain.gain.setValueAtTime(0.01, this.ctx.currentTime);
      this.windGain.gain.exponentialRampToValueAtTime(0.09, this.ctx.currentTime + 0.8);

      this.windNode.connect(filter);
      filter.connect(this.windGain);
      this.windGain.connect(this.ctx.destination);

      this.windNode.start();
    } catch (e) {
      console.warn('Audio startWind failed:', e);
    }
  }

  stopWind() {
    if (this.windGain && this.ctx) {
      try {
        this.windGain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.5);
        setTimeout(() => {
          if (this.windNode) {
            this.windNode.stop();
            this.windNode.disconnect();
            this.windNode = null;
            this.windGain = null;
          }
        }, 500);
      } catch (e) {
        this.windNode = null;
      }
    }
  }

  // 공 충돌 사운드 (짧은 마이크로 클릭) - 빈도 제한 적용
  playBounce(intensity = 1) {
    if (this.isMuted) return;
    const now = performance.now();
    if (now - this.lastBounceTime < 35) return; // 너무 잦은 충돌음 스팸 방지
    this.lastBounceTime = now;

    this.initContext();
    if (!this.ctx) return;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      const freq = 450 + Math.random() * 300;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(120, this.ctx.currentTime + 0.04);

      const vol = Math.min(0.04 * intensity, 0.08);
      gain.gain.setValueAtTime(vol, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.04);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.04);
    } catch (e) {}
  }

  // 공이 관을 통해 뽑히는 소리 ('퐁!')
  playPop() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(220, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, this.ctx.currentTime + 0.12);

      gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.15);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.15);
    } catch (e) {}
  }

  // 번호 공 거치대 안착 징/차임 소리
  playChime(noteIndex = 0) {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    try {
      // 펜타토닉 음계 (C5, D5, E5, G5, A5, C6, E6)
      const scale = [523.25, 587.33, 659.25, 783.99, 880.00, 1046.50, 1318.51];
      const freq = scale[noteIndex % scale.length];

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

      gain.gain.setValueAtTime(0.18, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.6);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.6);
    } catch (e) {}
  }

  // 6개 번호 추첨 완료 축하 팡파르
  playFanfare() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    const notes = [
      { note: 523.25, delay: 0.0, dur: 0.12 }, // C5
      { note: 659.25, delay: 0.12, dur: 0.12 }, // E5
      { note: 783.99, delay: 0.24, dur: 0.14 }, // G5
      { note: 1046.50, delay: 0.38, dur: 0.55 } // C6 (길게)
    ];

    notes.forEach(({ note, delay, dur }) => {
      setTimeout(() => {
        try {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();

          osc.type = 'triangle';
          osc.frequency.setValueAtTime(note, this.ctx.currentTime);

          gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);

          osc.connect(gain);
          gain.connect(this.ctx.destination);

          osc.start();
          osc.stop(this.ctx.currentTime + dur);
        } catch (e) {}
      }, delay * 1000);
    });
  }
}

// 글로벌 오디오 인스턴스
window.soundEngine = new SoundEngine();
