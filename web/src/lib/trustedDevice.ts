const TRUSTED_DEVICE_PREFIX = 'trusted_device_';
const TRUSTED_DEVICE_TTL = 24 * 60 * 60 * 1000; // 24 hours

interface TrustedDeviceEntry {
  timestamp: number;
}

/**
 * Marks the current device as trusted for the given user.
 * Called after successful MFA verification.
 */
export function markDeviceAsTrusted(userId: string): void {
  try {
    const entry: TrustedDeviceEntry = { timestamp: Date.now() };
    localStorage.setItem(`${TRUSTED_DEVICE_PREFIX}${userId}`, JSON.stringify(entry));
  } catch {
    // Ignore storage errors (private browsing, quota, etc.)
  }
}

/**
 * Checks if the current device is trusted (MFA verified within 24h).
 */
export function isDeviceTrusted(userId: string): boolean {
  try {
    const raw = localStorage.getItem(`${TRUSTED_DEVICE_PREFIX}${userId}`);
    if (!raw) return false;

    const entry: TrustedDeviceEntry = JSON.parse(raw);
    const elapsed = Date.now() - entry.timestamp;

    if (elapsed < TRUSTED_DEVICE_TTL) {
      return true;
    }

    // Expired — clean up
    localStorage.removeItem(`${TRUSTED_DEVICE_PREFIX}${userId}`);
    return false;
  } catch {
    return false;
  }
}

/**
 * Removes the trusted device marker (e.g., on sign out).
 */
export function clearTrustedDevice(userId: string): void {
  try {
    localStorage.removeItem(`${TRUSTED_DEVICE_PREFIX}${userId}`);
  } catch {
    // Ignore
  }
}
