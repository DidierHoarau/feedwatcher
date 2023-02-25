import { Span } from "@opentelemetry/sdk-trace-base";
import * as _ from "lodash";
import { User } from "../model/User";
import { StandardTracer } from "../utils-std-ts/StandardTracer";
import { SqlDbutils } from "./SqlDbUtils";

export class UsersData {
  //
  public static async get(context: Span, id: string): Promise<User> {
    const span = StandardTracer.startSpan("UsersData_get", context);
    const usersRaw = await SqlDbutils.querySQL(span, "SELECT * FROM users WHERE id=?", [id]);
    let user: User = null;
    if (usersRaw.length > 0) {
      user = UsersData.fromRaw(usersRaw[0]);
    }
    span.end();
    return user;
  }

  public static async getByName(context: Span, name: string): Promise<User> {
    const span = StandardTracer.startSpan("UsersData_getByName", context);
    const usersRaw = await SqlDbutils.querySQL(span, "SELECT * FROM users WHERE name=?", [name]);
    let user: User = null;
    if (usersRaw.length > 0) {
      user = UsersData.fromRaw(usersRaw[0]);
    }
    span.end();
    return user;
  }

  public static async list(context: Span): Promise<User[]> {
    const span = StandardTracer.startSpan("UsersData_list", context);
    const usersRaw = await SqlDbutils.querySQL(span, "SELECT * FROM users");
    const users = [];
    for (const userRaw of usersRaw) {
      users.push(UsersData.fromRaw(userRaw));
    }
    span.end();
    return users;
  }

  public static async add(context: Span, user: User): Promise<void> {
    const span = StandardTracer.startSpan("UsersData_add", context);
    await SqlDbutils.execSQL(span, "INSERT INTO users (id,name,passwordEncrypted) VALUES (?, ?, ?)", [
      user.id,
      user.name,
      user.passwordEncrypted,
    ]);
    span.end();
  }

  public static async update(context: Span, user: User): Promise<void> {
    const span = StandardTracer.startSpan("UsersData_update", context);
    await SqlDbutils.execSQL(span, "UPDATE users SET passwordEncrypted = ? WHERE id = ? ", [
      user.passwordEncrypted,
      user.id,
    ]);
    span.end();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static fromRaw(userRaw: any): User {
    const user = new User();
    user.id = userRaw.id;
    user.name = userRaw.name;
    user.passwordEncrypted = userRaw.passwordEncrypted;
    return user;
  }
}
