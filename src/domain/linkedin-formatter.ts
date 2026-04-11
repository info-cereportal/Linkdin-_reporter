/**
 * LinkedIn 向け整形ロジック（フック、改行、CTA、ハッシュタグ）
 */

import { LINKEDIN_FORMAT } from "../config/index.js";
import type { FormatOptions } from "../types/index.js";

const HOOK_TEMPLATES = [
  "この発見の意味に、まだ多くの人が気づいていない。",
  "脳科学の「常識」が、また一つ書き換えられました。",
  "この研究データ、知らないままでいいですか？",
  "研究者もエンジニアも、この論文は必読です。",
  "脳の秘密が、また一つ解き明かされました。",
  "これを読んで、脳に対する見方が変わりました。",
  "10年後「あの論文が転換点だった」と言われるかもしれない。",
  "脳科学の最前線から、衝撃の一報です。",
];

const CTA_TEMPLATES = [
  "あなたの分野から見て、この知見はどう映りますか？",
  "この研究の次の展開、あなたはどう予測しますか？",
  "異論・反論も大歓迎。あなたの見解を聞かせてください。",
  "この研究に衝撃を受けたのは私だけでしょうか？コメントで教えてください。",
  "保存して後で読み返す価値がある研究です。いいね＆シェアで広めてください。",
  "同じ分野の方、この解釈に異なる視点があればぜひコメントで。",
  "この研究をきっかけに、何か新しいアイデアが浮かんだ方はいますか？",
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
