import React from 'react';

/**
 * VoiceOrb (Phase 6) — animated circle for live voice mode. Honest state
 * indication builds trust more than the animation alone, so it shows four states:
 *   listening — pulses with the user's voice
 *   thinking  — slow "breathing" (CSS), amplitude ignored
 *   speaking  — pulses with the agent's TTS amplitude
 *   idle      — dim, still
 *
 * Pure/presentational: the parent supplies `amplitude` [0,1] and a localized
 * `label` for the accessible status text.
 */
export default function VoiceOrb({ state = 'idle', amplitude = 0, size = 72, label, className = '' }) {
  const amp = Math.max(0, Math.min(1, Number(amplitude) || 0));
  const pulsing = state === 'speaking' || state === 'listening';
  const scale = pulsing ? 1 + amp * 0.35 : 1; // 1.0 → 1.35 at full volume
  return (
    <div
      className={`fdv2-voice-orb fdv2-voice-orb--${state}${className ? ` ${className}` : ''}`}
      style={{ '--orb-size': `${size}px`, '--orb-scale': scale }}
      role="status"
      aria-label={label || state}
    >
      <span className="fdv2-voice-orb-core" />
    </div>
  );
}
