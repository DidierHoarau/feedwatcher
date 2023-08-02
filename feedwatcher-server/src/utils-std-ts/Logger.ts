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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public debug(message: Error | string | any): void {
    if (DEV_MODE) {
      this.display("debug", message);
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public info(message: Error | string | any): void {
    this.display("info", message);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public warn(message: Error | string | any): void {
    this.display("warn", message);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public error(message: Error | string | any): void {
    this.display("error", message);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
