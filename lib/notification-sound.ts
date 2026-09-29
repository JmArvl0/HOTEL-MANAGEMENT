// Notification sound — WebAudio tones, no assets, no dependencies.
// Distinct tone per severity; per-user mute persisted in localStorage (default ON).
// Tone union duplicated here (not imported) to avoid a cycle with toast-stack.

export type NotificationTone = "info" | "success" | "warning" | "error";

const MUTE_KEY = "haven-sound-muted";

export function isSoundEnabled(): boolean {
  try {
    if (typeof window === "undefined" || !window.localStorage) return true;
    return window.localStorage.getItem(MUTE_KEY) !== "1";
  } catch {
    return true;
  }
}

export function setSoundEnabled(enabled: boolean): void {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    if (enabled) window.localStorage.removeItem(MUTE_KEY);
    else window.localStorage.setItem(MUTE_KEY, "1");
  } catch {
    // Sound preference is best-effort; never break the caller.
  }
}

// Frequency sequences per tone: [frequencyHz, durationSec] pairs.
const TONE_SEQUENCES: Record<NotificationTone, [number, number][]> = {
  info: [[880, 0.12]],
  success: [[660, 0.1], [990, 0.14]],
  warning: [[520, 0.12], [780, 0.12]],
  error: [[330, 0.14], [440, 0.14], [330, 0.16]],
};

let context: AudioContext | null = null;

function getContext(): AudioContext | null {
  try {
    if (typeof window === "undefined") return null;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    if (!context) context = new Ctor();
    if (context.state === "suspended") void context.resume().catch(() => {});
    if (context.state !== "running") return null;
    return context;
  } catch {
    return null;
  }
}

export function playNotificationTone(tone: NotificationTone = "info"): void {
  try {
    if (!isSoundEnabled()) return;
    const ctx = getContext();
    if (!ctx) return;
    const sequence = TONE_SEQUENCES[tone] ?? TONE_SEQUENCES.info;
    let startAt = ctx.currentTime;
    for (const [frequency, duration] of sequence) {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(0.06, startAt + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(startAt);
      oscillator.stop(startAt + duration + 0.02);
      startAt += duration + 0.03;
    }
  } catch {
    // Sound never breaks notifications.
  }
}
