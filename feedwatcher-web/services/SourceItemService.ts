import axios from "axios";
import { AuthService } from "./AuthService";
import Config from "./Config";
import { handleError, EventBus, EventTypes } from "../services/EventBus";
import { Timeout } from "./Timeout";

const AUTH_TOKEN_KEY = "auth_token";

export class SourceItemService {
  //
  public static async searchItems(): Promise<void> {
    const activeSourceItems = ActiveSourceItems();
    activeSourceItems.sourceItems = [];
    await Timeout.wait(10);
    await axios
      .post(
        `${(await Config.get()).SERVER_URL}/items/search`,
        activeSourceItems.searchOptions,
        await AuthService.getAuthHeader()
      )
      .then((res) => {
        activeSourceItems.sourceItems = res.data.sourceItems;
        activeSourceItems.pageHasMore = res.data.pageHasMore;
      })
      .catch(handleError);
  }
}
