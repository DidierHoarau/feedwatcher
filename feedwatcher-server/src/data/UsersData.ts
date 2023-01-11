import { Span } from "@opentelemetry/sdk-trace-base";
import * as _ from "lodash";
import { User } from "../common-model/User";
import { FileDBUtils } from "./FileDbUtils";

export class UsersData {
  //
  public users: User[];

  public async load(context: Span): Promise<void> {
    this.users = await FileDBUtils.load(context, "users", []);
  }

  public async get(context: Span, id: string): Promise<User> {
    return User.fromJson(
      _.find(this.users, {
        id,
      })
    );
  }

  public async getByName(context: Span, name: string): Promise<User> {
    return User.fromJson(
      _.find(this.users, {
        name,
      })
    );
  }

  public async list(context: Span): Promise<User[]> {
    return _.cloneDeep(this.users);
  }

  public async add(context: Span, user: User): Promise<void> {
    this.users.push(user);
    await this.save(context);
  }

  public async update(context: Span, id: string, userUpdate: User): Promise<void> {
    const user = _.find(this.users, {
      id,
    }) as User;
    user.name = userUpdate.name;
    user.passwordEncrypted = userUpdate.passwordEncrypted;
    await this.save(context);
  }

  public async save(context: Span): Promise<void> {
    await FileDBUtils.save(context, "users", this.users);
  }

  public async delete(context: Span, id: string): Promise<void> {
    const position = _.findIndex(this.users, {
      id,
    });
    if (position >= 0) {
      this.users.splice(position, 1);
    }
    await this.save(context);
  }
}
