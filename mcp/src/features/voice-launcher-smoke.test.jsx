import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VoiceLauncher, VoiceOrb } from '@flowdesk/voice-launcher';

describe('@flowdesk/voice-launcher (smoke, from built package)', () => {
  it('renders the pulsing launcher FAB in idle state (no page overlay, no activity halo)', () => {
    const { container } = render(<VoiceLauncher apiBaseUrl="/api/v1" userId="u1" lang="en" />);
    const fab = screen.getByRole('button', { name: 'Talk to the assistant' });
    expect(fab).toBeInTheDocument();
    expect(fab.className).toContain('fdvl-fab');
    expect(fab.className).not.toContain('is-active'); // idle
    // In-place design: no page-dimming overlay, and the activity halo appears
    // only while a session is active.
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(container.querySelector('.fdvl-overlay')).toBeNull();
    expect(container.querySelector('.fdvl-halo')).toBeNull();
  });

  it('honors localized labels', () => {
    render(<VoiceLauncher apiBaseUrl="/api/v1" labels={{ start: 'Поговорить с ассистентом' }} />);
    expect(screen.getByRole('button', { name: 'Поговорить с ассистентом' })).toBeInTheDocument();
  });

  it('shows a text-chat toggle only when onToggleTextChat is provided, and calls it', () => {
    const { rerender } = render(<VoiceLauncher apiBaseUrl="/api/v1" />);
    expect(screen.queryByRole('button', { name: 'Open text chat' })).toBeNull(); // no toggle by default
    const onToggle = vi.fn();
    rerender(<VoiceLauncher apiBaseUrl="/api/v1" onToggleTextChat={onToggle} />);
    const btn = screen.getByRole('button', { name: 'Open text chat' });
    fireEvent.click(btn);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('VoiceOrb reflects state class and amplitude scale', () => {
    const { container } = render(<VoiceOrb state="speaking" amplitude={1} label="Speaking" />);
    const orb = container.firstChild;
    expect(orb.className).toContain('fdvl-orb--speaking');
    expect(orb.style.getPropertyValue('--orb-scale')).toBe('1.35');
  });
});
