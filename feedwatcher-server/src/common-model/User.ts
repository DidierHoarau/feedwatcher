import { v4 as uuidv4 } from "uuid";

export class User {
  //
  public static fromJson(json: any): User {
    if (!json) {
      return null;
    }
    const user = new User();
    if (json.id) {
      user.id = json.id;
    }
    user.id = json.id;
    user.name = json.name;
    user.passwordEncrypted = json.passwordEncrypted;
    return user;
  }

  public id: string;
  public name: string;
  public passwordEncrypted: string;

  constructor() {
    this.id = uuidv4();
  }

  public toJson(): any {
    return {
      id: this.id,
      name: this.name,
      passwordEncrypted: this.passwordEncrypted,
    };
  }
}
