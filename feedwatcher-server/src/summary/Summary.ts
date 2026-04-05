import { Span } from "@opentelemetry/sdk-trace-base";
import axios from "axios";
import sanitizeHtml from "sanitize-html";
import { Config } from "../Config";
import { OTelLogger, OTelTracer } from "../OTelContext";
import { UsersDataList } from "../users/UsersData";
import { SourceItem } from "../model/SourceItem";
import { SqlDbUtilsQuerySQL } from "../utils-std-ts/SqlDbUtils";

const logger = OTelLogger().createModuleLogger("Summary");

const cachedSummaries = new Map<
  string,
  { itemCount: number; summary: string; generatedAt: Date }
>();

export function SummaryGetCached(userId: string): {
  itemCount: number;
  summary: string;
  generatedAt: Date;
} | null {
  return cachedSummaries.get(userId) || null;
}

export async function SummaryGenerate(config: Config) {
  const span = OTelTracer().startSpan("SummaryGenerate");
  const users = await UsersDataList(span);
  for (const user of users) {
    const result = await SummaryGenerateForUser(span, config, user.id);
    cachedSummaries.set(user.id, {
      itemCount: result.itemCount,
      summary: result.summary,
      generatedAt: new Date(),
    });
  }
  span.end();
}

export async function SummaryGenerateForUser(
  context: Span,
  config: Config,
  userId: string,
): Promise<{ itemCount: number; summary: string; items: SourceItem[] }> {
  const span = OTelTracer().startSpan("SummaryGenerateForUser", context);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const itemsRaw = await SqlDbUtilsQuerySQL(
    span,
    "SELECT sources_items.*, sources.name as sourceName " +
      "FROM sources_items " +
      "JOIN sources ON sources_items.sourceId = sources.id " +
      "WHERE sources.userId = ? " +
      "  AND sources_items.datePublished >= ? " +
      "ORDER BY sources_items.datePublished DESC",
    [userId, since.toISOString()],
  );
  const items: SourceItem[] = itemsRaw.map(SourceItem.fromRaw);

  if (items.length === 0) {
    span.end();
    return { itemCount: 0, summary: "", items: [] };
  }

  const newsLines = items.map((item) => {
    const description = sanitizeHtml(item.content || "", {
      allowedTags: [],
      allowedAttributes: {},
    })
      .replace(/\s+/g, " ")
      .trim()
      .substring(0, 300);
    return `- [${item.sourceName}] ${item.title}: ${description}`;
  });
  const newsText = newsLines.join("\n");

  let summary = "";
  try {
    const response = await axios.post(
      config.LLM_API_URL,
      {
        model: config.LLM_MODEL,
        messages: [
          {
            role: "system",
            content:
              "You summarize news feeds. Follow these rules strictly:\n" +
              "- Group items into categories (e.g., Technology, Politics, Science, Business, etc.).\n" +
              "- Use a markdown heading (##) for each category.\n" +
              "- Under each category, list highlights as bullet points. Keep each bullet to one or two sentences.\n" +
              "- Attribute each bullet to its source name (in parentheses at the end) when the source is identifiable.\n" +
              "- Do NOT include an introduction, conclusion, or any preamble. Start directly with the first category.\n" +
              "- Prioritize the most significant or impactful stories. Omit redundant or trivial items.\n" +
              "- If multiple sources report the same story, merge them into a single bullet and cite all sources.",
          },
          {
            role: "user",
            content: `Summarize these news items:\n\n${newsText}`,
          },
        ],
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.LLM_API_KEY}`,
        },
      },
    );
    summary = response.data?.choices?.[0]?.message?.content || "";
  } catch (error) {
    logger.error(`  Failed to generate summary: ${error.message}`);
  }

  span.end();
  return { itemCount: items.length, summary, items };
}
