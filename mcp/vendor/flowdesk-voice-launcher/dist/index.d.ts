import * as React from 'react';

export interface VoiceLauncherLabels {
  start?: string;
  stop?: string;
  end?: string;
  connecting?: string;
  listening?: string;
  thinking?: string;
  speaking?: string;
  idle?: string;
  openText?: string;
  closeText?: string;
}

export interface VoiceLauncherProps {
  /** REQUIRED — API root, e.g. "/api/proxy/unpa/api/v1". */
  apiBaseUrl: string;
  userId?: string;
  /** Sync or async headers (e.g. MSAL bearer + API-Key). */
  getAuthHeaders?: () => Record<string, string> | Promise<Record<string, string>>;
  fetchImpl?: typeof fetch;
  lang?: string;
  /** User-selected AI assistant voice (Azure Neural name); overrides the per-language default. */
  voice?: string;
  /** Share ONE backend session with the host's text chat (else one is generated per voice session). */
  sessionId?: string;
  position?: 'bottom-right' | 'bottom-left';
  size?: number;
  labels?: VoiceLauncherLabels;
  onTranscript?: (role: string, text: string, extra?: { language?: string; meta?: unknown }) => void;
  onError?: (error: Error) => void;
  /** Show a text-chat toggle below the voice button; called on click (host owns the window). */
  onToggleTextChat?: () => void;
  /** Visual state of the text-chat toggle. */
  isTextChatOpen?: boolean;
  /** CS-4: fires with the live session active flag (for the response side panel). */
  onActiveChange?: (active: boolean) => void;
  /** CS-4: fires with the raw voice state ('idle'|'connecting'|'listening'|'processing'|'speaking'|'error'). */
  onState?: (state: string) => void;
}

export interface VoiceResponsePanelProps {
  response: { text: string; controls?: unknown[] } | null;
  onControlClick?: (action: { slotId?: string; action: string; value: unknown }, label?: string) => void;
  onClose?: () => void;
  labels?: { close?: string };
}
export declare const VoiceResponsePanel: React.FC<VoiceResponsePanelProps>;

/** Round pulsing button that launches a live voice conversation. */
export declare const VoiceLauncher: React.FC<VoiceLauncherProps>;
export default VoiceLauncher;

export type VoiceStateValue = 'idle' | 'connecting' | 'listening' | 'processing' | 'speaking' | 'error';
export declare const VoiceState: Record<string, VoiceStateValue>;

export declare const VoiceOrb: React.FC<{ state?: string; amplitude?: number; size?: number; label?: string; className?: string }>;

export declare function useVoice(opts: {
  apiBaseUrl: string;
  userId?: string;
  getAuthHeaders?: () => Record<string, string> | Promise<Record<string, string>>;
  fetchImpl?: typeof fetch;
  lang?: string;
  sessionId?: string;
  onTranscript?: (role: string, text: string, extra?: unknown) => void;
  onError?: (error: Error) => void;
}): {
  state: VoiceStateValue;
  level: number;
  error: Error | null;
  isActive: boolean;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  toggle: () => void;
};
