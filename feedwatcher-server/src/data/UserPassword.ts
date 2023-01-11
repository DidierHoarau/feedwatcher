import { Span } from "@opentelemetry/sdk-trace-base";
import * as bcrypt from "bcrypt";
import { User } from "../common-model/User";

export class UserPassword {
  //
  public static async setPassword(context: Span, user: User, password: string): Promise<void> {
    const salt = await bcrypt.genSalt(10);
    user.passwordEncrypted = await bcrypt.hash(password, salt);
  }

  public static async checkPassword(context: Span, user: User, password: string): Promise<boolean> {
    return await bcrypt.compare(password, user.passwordEncrypted);
  }
}
