const DEV_MODE = (() => {
  if (process.env.NODE_ENV === "dev") {
    return true;
  }
  return false;
})();

export class Logger {
  private module: string;

  constructor(module: string) {
    this.module = `${module}`;
  }

  public debug(message: Error | string | any): void {
    if (DEV_MODE) {
      this.display("debug", message);
    }
  }
  public info(message: Error | string | any): void {
    this.display("info", message);
  }
  public warn(message: Error | string | any): void {
    this.display("warn", message);
  }
  public error(message: Error | string | any): void {
    this.display("error", message);
  }

  private display(level: string, message: any): void {
    if (typeof message === "string") {
      // tslint:disable-next-line:no-console
      console.log(`[${level}] [${this.module}] ${message}`);
    } else if (message instanceof Error) {
      // tslint:disable-next-line:no-console
      console.log(`${level} [${this.module}] ${message}`);
      // tslint:disable-next-line:no-console
      console.log((message as Error).stack);
    } else if (typeof message === "object") {
      // tslint:disable-next-line:no-console
      console.log(`${level} [${this.module}] ${JSON.stringify(message)}`);
    }
  }
}
