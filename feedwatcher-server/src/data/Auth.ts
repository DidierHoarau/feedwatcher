import * as jwt from "jsonwebtoken";
import * as path from "path";
import { User } from "../model/User";
import { UserSession } from "../model/UserSession";
import { Config } from "../Config";
import { Logger } from "../utils-std-ts/Logger";

const logger = new Logger(path.basename(__filename));
let config: Config;

export class Auth {
  //
  public static init(configIn: Config) {
    config = configIn;
  }

  public static async generateJWT(user: User): Promise<string> {
    return jwt.sign(
      {
        exp: Math.floor(Date.now() / 1000) + config.JWT_VALIDITY_DURATION,
        userId: user.id,
        userName: user.name,
      },
      config.JWT_KEY
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public static async mustBeAuthenticated(req: any, res: any): Promise<void> {
    let authenticated = false;
    if (req.headers.authorization) {
      try {
        jwt.verify(req.headers.authorization.split(" ")[1], config.JWT_KEY);
        authenticated = true;
      } catch (err) {
        authenticated = false;
      }
    }
    if (!authenticated) {
      res.status(403).send({ error: "Access Denied" });
      throw new Error("Access Denied");
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public static async getUserSession(req: any): Promise<UserSession> {
    const userSession: UserSession = { isAuthenticated: false };
    if (req.headers.authorization) {
      try {
        const info = jwt.verify(req.headers.authorization.split(" ")[1], config.JWT_KEY);
        userSession.userId = info.userId;
        userSession.isAuthenticated = true;
      } catch (err) {
        logger.error(err);
      }
    }
    return userSession;
  }
}
