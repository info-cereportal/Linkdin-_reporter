/**
 * Webhook 通知（Slack / Discord 対応）
 */

import type { PolishedDraft } from "./post-polisher.js";

type WebhookType = "slack" | "discord";

interface WebhookConfig {
  url: string;
  type: WebhookType;
  mentionUserId?: string;
}

/**
 * ドラフトを Slack または Discord に送信する
 */
export async function notifyWebhook(
  draft: PolishedDraft,
  config: WebhookConfig
): Promise<void> {
  if (!config.url) {
    console.log("[Webhook] WEBHOOK_URL が未設定のため、通知をスキップします");
    return;
  }

  const body = config.type === "discord"
    ? buildDiscordPayload(draft, config.mentionUserId)
    : buildSlackPayload(draft);

  const response = await fetch(config.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`Webhook failed: HTTP ${response.status} ${await response.text()}`);
  }

  console.log(`[Webhook] ${config.type} に通知しました`);
}

// ── Slack Block Kit ──

function buildSlackPayload(draft: PolishedDraft): object {
  return {
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `📝 本日の LinkedIn ドラフト: ${draft.topic}`,
          emoji: true,
        },
      },
      { type: "divider" },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: draft.formatted,
        },
      },
      { type: "divider" },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: [
              `📄 *論文:* <${draft.paperLink}|${truncate(draft.paperTitle, 80)}>`,
              `📊 *リスクスコア:* ${draft.riskScore}/100`,
              `🎨 *テンプレート:* ${draft.templateName}`,
            ].join("  |  "),
          },
        ],
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "📋 コピーして LinkedIn へ", emoji: true },
            url: "https://www.linkedin.com/feed/",
            action_id: "open_linkedin",
          },
          {
            type: "button",
            text: { type: "plain_text", text: "📄 論文を読む", emoji: true },
            url: draft.paperLink,
            action_id: "open_paper",
          },
        ],
      },
    ],
  };
}

// ── Discord Embed ──

function buildDiscordPayload(draft: PolishedDraft, mentionUserId?: string): object {
  const mention = mentionUserId ? `<@${mentionUserId}> ` : "";

  // 投稿文はプレーンテキスト（content）で送信 → そのままコピペ可能
  // メタ情報だけ Embed に分離
  return {
    content: `${mention}📝 **本日の LinkedIn ドラフト**\n\n${draft.formatted}`,
    embeds: [
      {
        description: `📄 [${truncate(draft.paperTitle, 80)}](${draft.paperLink})`,
        color: 0x0077b5,
      },
    ],
  };
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.substring(0, max - 1) + "…" : text;
}
