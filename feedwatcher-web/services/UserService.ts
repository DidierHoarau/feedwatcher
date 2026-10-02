import axios from "axios";
import Config from "./Config";

export class UserService {
  //
  public static async isInitialized(): Promise<boolean> {
    return (await axios.get(`${(await Config.get()).SERVER_URL}/users/status/initialization`)).data.initialized;
  }
}
