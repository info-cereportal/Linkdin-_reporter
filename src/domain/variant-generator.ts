/**
 * 文体バリアント生成ロジック
 * 同一テーマから異なる文体・長さのバリアントを生成する
 */

import type { VariantStyle, PostVariant } from "../types/index.js";
import { applyHedging } from "./neuro-hedging.js";

interface VariantTemplate {
  prefix: string;
  structureGuide: string;
  suffix: string;
  maxLength: number;
}

const VARIANT_TEMPLATES: Record<VariantStyle, VariantTemplate> = {
  academic: {
    prefix: "【学術的視点】",
    structureGuide: "先行研究を踏まえ、以下の知見を共有します。",
    suffix: "今後のさらなる実証研究が期待される領域です。",
    maxLength: 1500,
  },
  bizdev: {
    prefix: "【ビジネス応用】",
    structureGuide: "この脳科学の知見がビジネスにもたらすインパクトとは——",
    suffix:
      "この知見を事業戦略にどう活かすか、ぜひディスカッションしましょう。",
    maxLength: 1000,
  },
  short_form: {
    prefix: "",
    structureGuide: "",
    suffix: "",
    maxLength: 500,
  },
  storytelling: {
    prefix: "ある日、ふと気づいたことがあります。",
    structureGuide: "それは脳科学が教えてくれた意外な事実でした。",
    suffix: "この経験が、あなたにも何かヒントになれば嬉しいです。",
    maxLength: 1200,
  },
  data_driven: {
    prefix: "📊 データが示す事実",
    structureGuide: "数字で見る脳科学の最前線——",
    suffix: "データに基づいた意思決定を、私たちは脳科学からも学べます。",
    maxLength: 1000,
  },
};

/**
 * 指定された文体のバリアントを1つ生成する
 */
function generateSingleVariant(
  topic: string,
  baseContent: string,
  style: VariantStyle
): PostVariant {
  const template = VARIANT_TEMPLATES[style];

  let text: string;

  if (style === "short_form") {
    // 短文版：本文を凝縮
    const condensed = baseContent.length > 400
      ? baseContent.substring(0, 400).replace(/[。！？][^。！？]*$/, "。")
      : baseContent;
    text = `${topic}について。\n\n${condensed}`;
  } else {
    // テンプレートに沿って構成
    const parts = [
      template.prefix,
      "",
      `「${topic}」`,
      "",
      template.structureGuide,
      "",
      baseContent,
      "",
      template.suffix,
    ];
    text = parts.join("\n");
  }

  // ヘッジング適用
  text = applyHedging(text);

  // 長さ制限
  if (text.length > template.maxLength) {
    text = text.substring(0, template.maxLength).replace(/[。！？][^。！？]*$/, "。");
  }

  return {
    style,
    text: text.trim(),
    char_count: text.trim().length,
  };
}

/**
 * 複数の文体バリアントを生成する
 */
export function generateVariants(
  topic: string,
  baseContent: string,
  styles: VariantStyle[]
): PostVariant[] {
  return styles.map((style) => generateSingleVariant(topic, baseContent, style));
}
