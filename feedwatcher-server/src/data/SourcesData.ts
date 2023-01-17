import { Span } from "@opentelemetry/sdk-trace-base";
import * as _ from "lodash";
import { Source } from "../model/Source";
import { User } from "../model/User";
import { StandardTracer } from "../utils-std-ts/StandardTracer";
import { SqlDbutils } from "./SqlDbUtils";

export class SourcesData {
  //
  public static async list(context: Span): Promise<User[]> {
    const span = StandardTracer.startSpan("SourcesData_list", context);
    const usersRaw = await SqlDbutils.querySQL(span, "SELECT * FROM users");
    const users = [];
    for (const userRaw of usersRaw) {
      users.push(SourcesData.fromRaw(userRaw));
    }
    span.end();
    return users;
  }

  public static async add(context: Span, source: Source): Promise<void> {
    const span = StandardTracer.startSpan("SourcesData_add", context);
    // await SqlDbutils.querySQL(
    //   span,
    //   `INSERT INTO users (id,name,info) VALUES ('${source.id}','${user.name}','${user.passwordEncrypted}')`
    // );

    // id VARCHAR(50) NOT NULL,
    // user_id VARCHAR(50) NOT NULL,
    // name VARCHAR(100) NOT NULL,
    // created_date TEXT NOT NULL,
    // status VARCHAR(20) NOT NULL,
    // info TEXT NOT NULL
    span.end();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static fromRaw(userRaw: any): User {
    const user = new User();
    user.id = userRaw.id;
    user.name = userRaw.username;
    user.passwordEncrypted = userRaw.password_hash;
    return user;
  }
}
