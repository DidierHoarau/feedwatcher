import { Span } from "@opentelemetry/sdk-trace-base";
import * as _ from "lodash";
import { User } from "../model/User";
import { StandardTracer } from "../utils-std-ts/StandardTracer";
import { SqlDbutils } from "./SqlDbUtils";

export class UsersData {
  //
  // public static async get(context: Span, id: string): Promise<User> {
  //   return User.fromJson(
  //     _.find(this.users, {
  //       id,
  //     })
  //   );
  // }
  // public static async getByName(context: Span, name: string): Promise<User> {
  //   return User.fromJson(
  //     _.find(this.users, {
  //       name,
  //     })
  //   );
  // }

  public static async list(context: Span): Promise<User[]> {
    const span = StandardTracer.startSpan("UsersData_list", context);
    const users = await SqlDbutils.querySQL(span, "SELECT * FROM users");
    span.end();
    return _.cloneDeep(users);
  }

  // public async add(context: Span, user: User): Promise<void> {
  //   this.users.push(user);
  //   await this.save(context);
  // }
  // public async update(context: Span, id: string, userUpdate: User): Promise<void> {
  //   const user = _.find(this.users, {
  //     id,
  //   }) as User;
  //   user.name = userUpdate.name;
  //   user.passwordEncrypted = userUpdate.passwordEncrypted;
  //   await this.save(context);
  // }
  // public async save(context: Span): Promise<void> {
  //   await FileDBUtils.save(context, "users", this.users);
  // }
  // public async delete(context: Span, id: string): Promise<void> {
  //   const position = _.findIndex(this.users, {
  //     id,
  //   });
  //   if (position >= 0) {
  //     this.users.splice(position, 1);
  //   }
  //   await this.save(context);
  // }
}
