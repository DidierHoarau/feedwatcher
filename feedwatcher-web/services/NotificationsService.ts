import axios from "axios";
import Config from "./Config";
import { AuthService } from "./AuthService";

export class NotificationsService {
  //
  public static isSupported(): boolean {
    return (
      typeof navigator !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window
    );
  }

  public static async getServerStatus(): Promise<any> {
    return (await axios.get(`${(await Config.get()).SERVER_URL}/status`)).data;
  }

  public static async getSubscription(): Promise<PushSubscription | null> {
    if (!NotificationsService.isSupported()) {
      return null;
    }
    const registration = await navigator.serviceWorker.ready;
    return await registration.pushManager.getSubscription();
  }

  public static async subscribe(vapidPublicKey: string): Promise<void> {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      throw new Error("Notification permission denied");
    }
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: NotificationsService.urlBase64ToUint8Array(
        vapidPublicKey
      ),
    });
    await axios.post(
      `${(await Config.get()).SERVER_URL}/push/subscribe`,
      subscription.toJSON(),
      await AuthService.getAuthHeader()
    );
  }

  public static async unsubscribe(): Promise<void> {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      return;
    }
    await axios.post(
      `${(await Config.get()).SERVER_URL}/push/unsubscribe`,
      { endpoint: subscription.endpoint },
      await AuthService.getAuthHeader()
    );
    await subscription.unsubscribe();
  }

  // Standard conversion of the VAPID public key into the application server
  // key expected by pushManager.subscribe (base64url with padding restored).
  private static urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }
}
