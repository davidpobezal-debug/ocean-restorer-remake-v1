// One-thumb control: touch anywhere, drag to swim, lift the thumb to fire the sonar pulse.
export class Input {
  constructor(surface, joyEl, knobEl) {
    this.x = 0; this.z = 0; this.active = false; this.id = null; this.ax = 0; this.ay = 0; this.onRelease = null; this.onPress = null; this.keys = new Set(); this.enabled = false;
    this.joy = joyEl; this.knob = knobEl; const R = 62;
    const down = e => {
      if (!this.enabled || this.id !== null || e.target.closest('button, .sheet, .panel')) return;
      this.id = e.pointerId; this.ax = e.clientX; this.ay = e.clientY; this.active = true; this.x = this.z = 0; this.dragged = 0;
      this.joy.style.transform = `translate(${this.ax}px, ${this.ay}px)`; this.joy.classList.add('on'); this.knob.style.transform = 'translate(-50%,-50%)';
      surface.setPointerCapture?.(e.pointerId); this.onPress?.();
    };
    const move = e => {
      if (e.pointerId !== this.id) return; let dx = e.clientX - this.ax, dy = e.clientY - this.ay; const l = Math.hypot(dx, dy);
      // Floating anchor: dragging past the rim pulls the base along, so the thumb never runs out of room.
      if (l > R) { this.ax += dx / l * (l - R); this.ay += dy / l * (l - R); dx = e.clientX - this.ax; dy = e.clientY - this.ay; this.joy.style.transform = `translate(${this.ax}px, ${this.ay}px)`; }
      const m = Math.min(1, Math.hypot(dx, dy) / R); this.dragged = Math.max(this.dragged, m);
      const k = m < .12 ? 0 : (m - .12) / .88, a = Math.atan2(dy, dx); this.x = Math.cos(a) * k; this.z = Math.sin(a) * k;
      this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    };
    const up = e => { if (e.pointerId !== this.id) return; this.id = null; this.active = false; this.x = this.z = 0; this.joy.classList.remove('on'); this.onRelease?.(); };
    surface.addEventListener('pointerdown', down); window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
    window.addEventListener('keydown', e => { this.keys.add(e.code); if (e.code === 'Space' && this.enabled) { this.onRelease?.(); e.preventDefault(); } });
    window.addEventListener('keyup', e => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.id = null; this.active = false; this.x = this.z = 0; this.joy.classList.remove('on'); });
  }
  vector() {
    let x = this.x, z = this.z; const k = this.keys;
    const kx = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0), kz = (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0);
    if (kx || kz) { const l = Math.hypot(kx, kz); x = kx / l; z = kz / l; }
    return { x, z };
  }
  reset() { this.id = null; this.active = false; this.x = this.z = 0; this.joy.classList.remove('on'); }
}
