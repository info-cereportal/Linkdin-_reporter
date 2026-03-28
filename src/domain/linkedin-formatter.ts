/**
 * LinkedIn 向け整形ロジック（フック、改行、CTA、ハッシュタグ）
 */

import { LINKEDIN_FORMAT } from "../config/index.js";
import type { FormatOptions } from "../types/index.js";

const HOOK_TEMPLATES = [
  "注目すべき研究成果が出ています。",
  "この研究、ぜひ知ってほしい。",
  "脳情報科学の最前線から、一報共有します。",
  "技術的に興味深い論文を見つけました。",
  "この知見は押さえておく価値がある。",
];

const CTA_TEMPLATES = [
  "この領域に関心のある方、ぜひご意見をお聞かせください。",
  "関連する知見をお持ちの方、コメントで共有いただけると嬉しいです。",
  "異なる視点からの解釈も歓迎です。",
  "同領域の研究者・エンジニアの方、議論しませんか。",
  "参考になれば幸いです。ご意見・ご質問はコメントへどうぞ。",
];

const NEUROSCIENCE_HASHTAGS = [
  "#Neuroscience",
  "#BCI",
  "#NeuroAI",
  "#脳科学",
  "#神経科学",
  "#計算論的神経科学",
  "#BrainComputerInterface",
  "#DeepLearning",
  "#NeuralDecoding",
  "#脳情報",
  "#ComputationalNeuroscience",
  "#認知科学",
  "#ニューロテック",
];

/**
 * 冒頭にフックを追加する
 * 既にフック風の文がある場合はスキップする
 */
export function addOpeningHook(text: string): string {
  const firstLine = text.split("\n")[0];
  // 既に疑問形やフック的な冒頭がある場合はスキップ
  if (firstLine.endsWith("？") || firstLine.endsWith("?") || firstLine.endsWith("。") === false) {
    return text;
  }
  const hook = HOOK_TEMPLATES[Math.floor(Math.random() * HOOK_TEMPLATES.length)];
  return `${hook}\n\n${text}`;
}

/**
 * LinkedIn 表示に適した改行を挿入する
 * 「もっと見る」の位置を意識し、冒頭を短く印象的にする
 */
export function optimizeLineBreaks(text: string): string {
  const lines = text.split("\n");
  const result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === "") {
      // 連続する空行を1つにまとめる
      if (result.length > 0 && result[result.length - 1] !== "") {
        result.push("");
      }
      continue;
    }

    // 長い段落は文単位で改行を入れる
    if (line.length > 100) {
      const sentences = line.split(/(?<=[。！？])/);
      let currentBlock = "";
      for (const sentence of sentences) {
        if (currentBlock.length + sentence.length > 80 && currentBlock.length > 0) {
          result.push(currentBlock.trim());
          result.push("");
          currentBlock = sentence;
        } else {
          currentBlock += sentence;
        }
      }
      if (currentBlock.trim()) {
        result.push(currentBlock.trim());
      }
    } else {
      result.push(line);
    }
  }

  return result.join("\n");
}

/**
 * 末尾にCTAを追加する
 */
export function addClosingCTA(text: string): string {
  const trimmed = text.trimEnd();
  const cta = CTA_TEMPLATES[Math.floor(Math.random() * CTA_TEMPLATES.length)];
  return `${trimmed}\n\n---\n\n${cta}`;
}

/**
 * テーマに関連するハッシュタグを選択・付加する
 */
export function addHashtags(text: string, topic: string): string {
  const topicLower = topic.toLowerCase();
  const relevant: string[] = [];

  // トピックに関連するハッシュタグを優先選択
  for (const tag of NEUROSCIENCE_HASHTAGS) {
    const tagContent = tag.replace("#", "").toLowerCase();
    if (topicLower.includes(tagContent) || tagContent.includes("脳科学") || tagContent.includes("neuroscience")) {
      relevant.push(tag);
    }
  }

  // 足りなければランダムに追加
  const remaining = NEUROSCIENCE_HASHTAGS.filter((t) => !relevant.includes(t));
  while (relevant.length < LINKEDIN_FORMAT.maxHashtags && remaining.length > 0) {
    const idx = Math.floor(Math.random() * remaining.length);
    relevant.push(remaining.splice(idx, 1)[0]);
  }

  const hashtags = relevant.slice(0, LINKEDIN_FORMAT.maxHashtags).join(" ");
  return `${text.trimEnd()}\n\n${hashtags}`;
}

/**
 * 上記を統合した一括整形関数
 */
export function formatForLinkedin(
  text: string,
  topic: string,
  options: FormatOptions
): string {
  let result = text;

  result = addOpeningHook(result);
  result = optimizeLineBreaks(result);

  if (options.includeCta) {
    result = addClosingCTA(result);
  }

  if (options.includeHashtags) {
    result = addHashtags(result, topic);
  }

  return result;
}
