import { Span } from "@opentelemetry/sdk-trace";
import { User } from "../model/User";
import {
  UserSettings,
  UserSettingsFromJson,
  UserSettingsToJson,
} from "./UserSettings";
import { OTelTracer } from "../OTelContext";
import {
  DbUtilsExecSQL,
  DbUtilsQuerySQL,
} from "@devopsplaybook.io/common-utils";

export async function UsersDataGet(context: Span, id: string): Promise<User> {
  const span = OTelTracer().startSpan("UsersDataGet", context);
  const usersRaw = await DbUtilsQuerySQL(
    span,
    "SELECT * FROM users WHERE id=?",
    [id]
  );
  let user: User = null;
  if (usersRaw.length > 0) {
    user = fromRaw(usersRaw[0]);
  }
  span.end();
  return user;
}

export async function UsersDataGetByName(
  context: Span,
  name: string
): Promise<User> {
  const span = OTelTracer().startSpan("UsersDataGetByName", context);
  const usersRaw = await DbUtilsQuerySQL(
    span,
    "SELECT * FROM users WHERE name=?",
    [name]
  );
  let user: User = null;
  if (usersRaw.length > 0) {
    user = fromRaw(usersRaw[0]);
  }
  span.end();
  return user;
}

export async function UsersDataList(context: Span): Promise<User[]> {
  const span = OTelTracer().startSpan("UsersDataList", context);
  const usersRaw = await DbUtilsQuerySQL(span, "SELECT * FROM users");
  const users = [];
  for (const userRaw of usersRaw) {
    users.push(fromRaw(userRaw));
  }
  span.end();
  return users;
}

export async function UsersDataAdd(context: Span, user: User): Promise<void> {
  const span = OTelTracer().startSpan("UsersDataAdd", context);
  await DbUtilsExecSQL(
    span,
    "INSERT INTO users (id,name,passwordEncrypted,settings,tokenVersion) VALUES (?, ?, ?, ?, ?)",
    [
      user.id,
      user.name,
      user.passwordEncrypted,
      UserSettingsToJson(user.settings),
      Number(user.tokenVersion) || 0,
    ]
  );
  span.end();
}

export async function UsersDataUpdate(
  context: Span,
  user: User
): Promise<void> {
  const span = OTelTracer().startSpan("UsersDataUpdate", context);
  await DbUtilsExecSQL(
    span,
    "UPDATE users SET passwordEncrypted = ?, tokenVersion = ? WHERE id = ? ",
    [user.passwordEncrypted, Number(user.tokenVersion) || 0, user.id]
  );
  span.end();
}

export async function UsersDataUpdateSettings(
  context: Span,
  userId: string,
  settings: UserSettings
): Promise<void> {
  const span = OTelTracer().startSpan("UsersDataUpdateSettings", context);
  await DbUtilsExecSQL(
    span,
    "UPDATE users SET settings = ? WHERE id = ? ",
    [UserSettingsToJson(settings), userId]
  );
  span.end();
}

// Private Functions

function fromRaw(userRaw: any): User {
  const user = new User();
  user.id = userRaw.id;
  user.name = userRaw.name;
  user.passwordEncrypted = userRaw.passwordEncrypted;
  user.tokenVersion = Number(userRaw.tokenVersion ?? userRaw.tokenversion ?? 0) || 0;
  let settingsJson: any = null;
  try {
    settingsJson = userRaw.settings ? JSON.parse(userRaw.settings) : null;
  } catch {
    settingsJson = null;
  }
  user.settings = UserSettingsFromJson(settingsJson);
  return user;
}
