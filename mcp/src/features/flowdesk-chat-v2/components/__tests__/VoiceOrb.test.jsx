import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import VoiceOrb from '../VoiceOrb.jsx';

const scaleOf = (el) => el.style.getPropertyValue('--orb-scale');

describe('VoiceOrb (Phase 6)', () => {
  it('renders with a state class and the accessible label', () => {
    render(<VoiceOrb state="speaking" amplitude={0.5} label="Speaking…" />);
    const orb = screen.getByRole('status', { name: 'Speaking…' });
    expect(orb).toHaveClass('fdv2-voice-orb', 'fdv2-voice-orb--speaking');
  });

  it('pulses with amplitude while speaking (scale = 1 + amp*0.35)', () => {
    const { container } = render(<VoiceOrb state="speaking" amplitude={1} label="x" />);
    expect(scaleOf(container.firstChild)).toBe('1.35');
  });

  it('pulses with amplitude while listening', () => {
    const { container } = render(<VoiceOrb state="listening" amplitude={0.2} label="x" />);
    expect(scaleOf(container.firstChild)).toBe('1.07');
  });

  it('ignores amplitude while thinking (breathing is CSS-driven → scale 1)', () => {
    const { container } = render(<VoiceOrb state="thinking" amplitude={0.9} label="x" />);
    expect(scaleOf(container.firstChild)).toBe('1');
  });

  it('clamps out-of-range amplitude', () => {
    const { container } = render(<VoiceOrb state="speaking" amplitude={5} label="x" />);
    expect(scaleOf(container.firstChild)).toBe('1.35'); // clamped to 1 → 1.35
  });

  it('falls back to the state as the label when none is provided', () => {
    render(<VoiceOrb state="idle" />);
    expect(screen.getByRole('status', { name: 'idle' })).toBeInTheDocument();
  });
});
