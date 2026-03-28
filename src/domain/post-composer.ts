/**
 * ドラフト構成テンプレートエンジン
 * 学術情報を構造化された LinkedIn 投稿に変換する
 */

import { POST_LENGTH } from "../config/index.js";
import type { Audience, Tone, Objective, PostLength } from "../types/index.js";
import { applyHedging } from "./neuro-hedging.js";

interface ComposeInput {
  topic: string;
  source_summary: string;
  audience: Audience;
  tone: Tone;
  objective: Objective;
  length: PostLength;
}

/** オーディエンス別の語彙調整 */
const AUDIENCE_STYLE: Record<Audience, { intro: string; closing: string }> = {
  researchers: {
    intro: "最新の研究知見をご紹介します。",
    closing: "今後のさらなる検証が期待されます。",
  },
  business_leaders: {
    intro: "ビジネスに活かせる脳科学の知見をお伝えします。",
    closing: "この知見を御社の組織運営に取り入れてみてはいかがでしょうか。",
  },
  general: {
    intro: "日常生活に役立つ脳の仕組みをご紹介します。",
    closing: "ぜひ日々の生活の中で意識してみてください。",
  },
  students: {
    intro: "学びに役立つ脳科学のエッセンスをお届けします。",
    closing: "学習や研究の参考になれば幸いです。",
  },
  hr_professionals: {
    intro: "人材マネジメントに活かせる脳科学の知見です。",
    closing: "人事施策の設計にお役立ていただければ幸いです。",
  },
};

/** トーン別の文体調整 */
const TONE_MODIFIER: Record<Tone, { connector: string; emphasis: string }> = {
  academic: {
    connector: "先行研究によれば、",
    emphasis: "この知見は学術的に重要な示唆を含んでいます。",
  },
  professional: {
    connector: "実務の観点から見ると、",
    emphasis: "これは実践的に大きな意味を持ちます。",
  },
  casual: {
    connector: "実はこれ、面白いことに、",
    emphasis: "ちょっと意外ですよね。",
  },
  inspirational: {
    connector: "ここに希望があります。",
    emphasis: "私たちの可能性は、脳科学が示す以上かもしれません。",
  },
  thought_leadership: {
    connector: "ここで一つ問いかけたいのは、",
    emphasis: "この視点が、業界の常識を変える可能性があります。",
  },
};

/** 目的別の構成ガイド */
const OBJECTIVE_GUIDE: Record<Objective, string> = {
  educate: "知見の正確な伝達を最優先し、読者の理解を深めることを目指します。",
  engage: "読者の共感や反応を引き出す問いかけを意識した構成にします。",
  promote: "専門性と信頼性を示しつつ、読者にとっての価値を明確にします。",
  network: "同分野の専門家との対話を促す内容にします。",
  thought_leadership: "独自の視座を提示し、業界への問題提起を行います。",
};

/**
 * メイン構成関数：学術知見からLinkedInドラフトを生成する
 */
export function composeDraft(input: ComposeInput): string {
  const { topic, source_summary, audience, tone, objective, length } = input;

  const audienceStyle = AUDIENCE_STYLE[audience];
  const toneModifier = TONE_MODIFIER[tone];
  const _objectiveGuide = OBJECTIVE_GUIDE[objective];
  const lengthConfig = POST_LENGTH[length];

  // --- セクション構成 ---

  // 1. 導入
  const introduction = `【${topic}】\n\n${audienceStyle.intro}`;

  // 2. 本文（学術知見の平易な解説）
  const body = `${toneModifier.connector}${source_summary}`;

  // 3. インサイト（ビジネス/日常への応用示唆）
  const insight = toneModifier.emphasis;

  // 4. 結論
  const conclusion = audienceStyle.closing;

  // --- 組み立て ---
  let draft = [introduction, body, insight, conclusion].join("\n\n");

  // ヘッジング適用（脳科学ドメインの安全性確保）
  draft = applyHedging(draft);

  // 長さ調整
  if (draft.length > lengthConfig.max) {
    // 超過時は本文を短縮する方向で調整
    const excess = draft.length - lengthConfig.max;
    const bodyTrimmed = body.substring(0, Math.max(body.length - excess, body.length / 2));
    draft = [introduction, bodyTrimmed + "…", insight, conclusion].join("\n\n");
    draft = applyHedging(draft);
  }

  return draft;
}
