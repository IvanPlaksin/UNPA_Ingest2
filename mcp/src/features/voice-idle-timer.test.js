import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VoiceSession, VoiceState } from '@flowdesk/voice-launcher';

// V2: the 15s idle auto-disable. We drive the session's private timer helpers
// (arm-after-speech, clear-on-activity) with fake timers and assert stop().
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function makeSession() {
  const s = new VoiceSession({ sessionId: 's1', config: { apiBaseUrl: '/api/v1' } });
  s.stop = vi.fn(); // spy; avoid real teardown
  return s;
}

describe('15s idle auto-disable', () => {
  it('arms after speech drains while listening → stops after 15s', () => {
    const s = makeSession();
    s.state = VoiceState.LISTENING;
    s.playback = { playing: false };
    s._maybeArmIdleAfterSpeech();
    vi.advanceTimersByTime(14999);
    expect(s.stop).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(s.stop).toHaveBeenCalledTimes(1);
  });

  it('does NOT arm while audio is still playing', () => {
    const s = makeSession();
    s.state = VoiceState.LISTENING;
    s.playback = { playing: true }; // still speaking
    s._maybeArmIdleAfterSpeech();
    vi.advanceTimersByTime(20000);
    expect(s.stop).not.toHaveBeenCalled();
  });

  it('does NOT arm unless listening', () => {
    const s = makeSession();
    s.state = VoiceState.SPEAKING;
    s.playback = { playing: false };
    s._maybeArmIdleAfterSpeech();
    vi.advanceTimersByTime(20000);
    expect(s.stop).not.toHaveBeenCalled();
  });

  it('activity (clearIdle) cancels the pending stop', () => {
    const s = makeSession();
    s.state = VoiceState.LISTENING;
    s.playback = { playing: false };
    s._armIdle();
    vi.advanceTimersByTime(10000);
    s._clearIdle(); // e.g. a transcript / processing state
    vi.advanceTimersByTime(20000);
    expect(s.stop).not.toHaveBeenCalled();
  });
});
