import axios from "axios";

let config: any;

export default class Config {
  public static async get(): Promise<any> {
    if (!config) {
      config = (await axios.get("/assets/config.json")).data;
    }
    return config;
  }
}
