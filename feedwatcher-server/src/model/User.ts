import { v4 as uuidv4 } from "uuid";
import {
  DEFAULT_USER_SETTINGS,
  UserSettings,
  UserSettingsFromJson,
  UserSettingsToJson,
} from "../users/UserSettings";

export class User {
  //
  public static fromJson(json: any): User {
    if (!json) {
      return null;
    }
    const user = new User();
    if (json.id) {
      user.id = json.id;
    }
    user.name = json.name;
    user.passwordEncrypted = json.passwordEncrypted;
    user.tokenVersion = Number(json.tokenVersion ?? 0) || 0;
    user.settings = UserSettingsFromJson(json.settings);
    return user;
  }

  public id: string;
  public name: string;
  public passwordEncrypted: string;
  public tokenVersion: number = 0;
  public settings: UserSettings;

  constructor() {
    this.id = uuidv4();
    this.settings = { ...DEFAULT_USER_SETTINGS };
  }

  public toJson(): any {
    return {
      id: this.id,
      name: this.name,
      passwordEncrypted: this.passwordEncrypted,
      tokenVersion: this.tokenVersion,
      settings: UserSettingsToJson(this.settings),
    };
  }
}
