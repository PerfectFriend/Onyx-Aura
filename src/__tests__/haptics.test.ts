import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { triggerHaptic } from '../utils/haptics';

describe('Android and Mobile Haptics Engine', () => {
  const originalWindow = globalThis.window;
  const originalNavigator = globalThis.navigator;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.window = originalWindow;
    globalThis.navigator = originalNavigator;
  });

  it('safely returns false when window or navigator.vibrate is unavailable', () => {
    // @ts-expect-error simulating environment without window
    delete globalThis.window;
    // @ts-expect-error simulating environment without navigator
    delete globalThis.navigator;

    const result = triggerHaptic('selection');
    expect(result).toBe(false);
  });

  it('triggers light vibration pattern on selection when navigator.vibrate is available', () => {
    const vibrateMock = vi.fn().mockReturnValue(true);

    // Mock both window and navigator for Node test runner
    // @ts-expect-error mock window
    globalThis.window = globalThis;
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        vibrate: vibrateMock,
      },
      configurable: true,
      writable: true,
    });

    const result = triggerHaptic('selection');
    expect(result).toBe(true);
    expect(vibrateMock).toHaveBeenCalledWith(10);
  });

  it('triggers melodic sequence for success and gaudi wave pattern', () => {
    const vibrateMock = vi.fn().mockReturnValue(true);

    // @ts-expect-error mock window
    globalThis.window = globalThis;
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        vibrate: vibrateMock,
      },
      configurable: true,
      writable: true,
    });

    triggerHaptic('success');
    expect(vibrateMock).toHaveBeenCalledWith([15, 40, 30, 40, 50]);

    triggerHaptic('gaudiRhythm');
    expect(vibrateMock).toHaveBeenCalledWith([20, 30, 40, 30, 20, 40, 60]);
  });
});
