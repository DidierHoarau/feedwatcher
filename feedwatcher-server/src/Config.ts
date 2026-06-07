import { ConfigBase } from "@devopsplaybook.io/common-utils";

export class Config extends ConfigBase {
  public SOURCE_FETCH_FREQUENCY = 30 * 60 * 1000;
  public PROCESSORS_SYSTEM = "processors-system";
  public PROCESSORS_USER = "processors-user";
  public LLM_API_KEY = "";
  public LLM_API_URL = "https://api.deepseek.com/chat/completions";
  public LLM_MODEL = "deepseek-chat";
  public SUMMARY_SCHEDULE_CRON = "0 0 * * *";
  public PROCESSOR_CONCURRENCY = 2;

  constructor() {
    super("feedwatcher-server");
    this.addConfigField({ field: "SOURCE_FETCH_FREQUENCY" });
    this.addConfigField({ field: "PROCESSORS_SYSTEM" });
    this.addConfigField({ field: "PROCESSORS_USER" });
    this.addConfigField({ field: "LLM_API_KEY", sensitive: true });
    this.addConfigField({ field: "LLM_API_URL" });
    this.addConfigField({ field: "LLM_MODEL" });
    this.addConfigField({ field: "SUMMARY_SCHEDULE_CRON" });
    this.addConfigField({ field: "PROCESSOR_CONCURRENCY" });
  }
}
