// Post-workout phone notification via the service worker (works for an installed PWA on Android Chrome).
import { notificationText } from "./calc.js";

export function permissionState() {
  if (!("Notification" in self)) return "unsupported";
  return Notification.permission; // "default" | "granted" | "denied"
}

/** Must be called from a user gesture (tap) the first time. */
export async function ensurePermission() {
  const state = permissionState();
  if (state !== "default") return state;
  try { return await Notification.requestPermission(); } catch { return permissionState(); }
}

async function swRegistration(timeoutMs = 4000) {
  if (!("serviceWorker" in navigator)) return null;
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise((r) => setTimeout(() => r(null), timeoutMs)),
  ]);
}

/** Returns "notified" or "card" (fallback: permission denied/unsupported/no service worker/error). */
export async function sendPostWorkout(pw) {
  const permission = await ensurePermission();
  if (permission !== "granted") return { mode: "card", permission };
  const reg = await swRegistration();
  if (!reg || typeof reg.showNotification !== "function") return { mode: "card", permission, reason: "no-sw" };
  const { title, body } = notificationText(pw);
  try {
    await reg.showNotification(title, {
      body,
      icon: "./icons/icon-192.png",
      badge: "./icons/badge-96.png",
      tag: "post-workout",
      renotify: true,
      vibrate: [120, 60, 120],
      data: { url: "./#/summary" },
    });
    return { mode: "notified", permission, title, body };
  } catch (e) {
    return { mode: "card", permission, reason: String(e) };
  }
}
