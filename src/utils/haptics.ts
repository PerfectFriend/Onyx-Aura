/**
 * Android Haptics Engine for Nailix
 * Safely wraps navigator.vibrate with tactile feedback patterns
 */

export type HapticType = 
  | 'selection' 
  | 'light' 
  | 'medium' 
  | 'heavy' 
  | 'success' 
  | 'warning' 
  | 'error' 
  | 'gaudiRhythm'
  | 'rhythmWave';

export function triggerHaptic(type: HapticType = 'selection'): boolean {
  if (typeof window === 'undefined' || !('vibrate' in navigator)) {
    return false;
  }

  try {
    switch (type) {
      case 'selection':
        return navigator.vibrate(10);
      case 'light':
        return navigator.vibrate(15);
      case 'medium':
        return navigator.vibrate(35);
      case 'heavy':
        return navigator.vibrate(60);
      case 'success':
        // Melodic pattern: short, pause, crisp long
        return navigator.vibrate([15, 40, 30, 40, 50]);
      case 'warning':
        return navigator.vibrate([40, 50, 40]);
      case 'error':
        // Staccato alert
        return navigator.vibrate([70, 40, 70, 40, 70]);
      case 'gaudiRhythm':
      case 'rhythmWave':
        // Organic undulating fluid wave rhythm
        return navigator.vibrate([20, 30, 40, 30, 20, 40, 60]);
      default:
        return navigator.vibrate(15);
    }
  } catch {
    // Suppress errors on unsupported platforms
    return false;
  }
}
