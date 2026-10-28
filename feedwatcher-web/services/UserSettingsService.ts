import axios from "axios";
import Config from "~~/services/Config.ts";
import { AuthService } from "~~/services/AuthService";

// Settings are stored and saved as one document (PUT replaces all of it), so
// every caller must echo the keys it does not own. This service reads the
// current settings and shallow-merges the patch before saving.
export class UserSettingsService {
  public static async getSettings(): Promise<any> {
    const res = await axios.get(
      `${(await Config.get()).SERVER_URL}/users/settings`,
      await AuthService.getAuthHeader(),
    );
    return (res.data && res.data.settings) || {};
  }

  public static async updateSettings(patch: Record<string, any>): Promise<any> {
    const current = await UserSettingsService.getSettings();
    const settings = { ...current, ...patch };
    await axios.put(
      `${(await Config.get()).SERVER_URL}/users/settings`,
      { settings },
      await AuthService.getAuthHeader(),
    );
    return settings;
  }
}
