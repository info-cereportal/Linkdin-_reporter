/**
 * 脳科学ヘッジング表現パターン・置換ルール
 * 断定的な科学表現を適切にヘッジされた表現に変換する
 */

interface HedgingRule {
  pattern: RegExp;
  replacement: string;
}

const HEDGING_RULES: HedgingRule[] = [
  // 医療効果の断定
  { pattern: /証明されている/g, replacement: "示唆されている" },
  { pattern: /証明された/g, replacement: "示唆された" },
  { pattern: /証明する/g, replacement: "示唆する" },
  { pattern: /明らかになっている/g, replacement: "示されつつある" },
  { pattern: /明らかになった/g, replacement: "示された可能性がある" },
  { pattern: /確実に(.+?)(?:する|できる|される)/g, replacement: "$1する可能性がある" },
  { pattern: /間違いなく/g, replacement: "高い可能性で" },
  { pattern: /絶対に/g, replacement: "多くの場合" },

  // 効果・治療の断定
  { pattern: /効果がある(?!可能性)/g, replacement: "効果がある可能性が示されている" },
  { pattern: /(?:治す|治せる|治療できる)/g, replacement: "改善に寄与する可能性がある" },
  { pattern: /(?:を|が)改善する(?!可能性)/g, replacement: "の改善に寄与する可能性がある" },
  { pattern: /(?:を|が)向上させる(?!可能性)/g, replacement: "の向上に寄与し得る" },
  { pattern: /(?:を|が)予防する(?!可能性)/g, replacement: "の予防に関連する可能性がある" },
  { pattern: /(?:を|が)防ぐ(?!可能性)/g, replacement: "を軽減する可能性がある" },

  // 因果関係の断定
  { pattern: /(?:が)原因(?:で|である|となる)/g, replacement: "が関連要因の一つと考えられ" },
  { pattern: /(?:が)引き起こす/g, replacement: "と関連する可能性がある" },
  { pattern: /科学的に(?:証明|実証)されて/g, replacement: "研究により示唆されて" },

  // 一般化の断定
  { pattern: /すべての人に/g, replacement: "多くの人に" },
  { pattern: /誰でも/g, replacement: "多くの場合" },
  { pattern: /必ず/g, replacement: "多くの場合" },
  { pattern: /常に/g, replacement: "しばしば" },
];

/**
 * 使用が推奨される安全な表現リスト
 */
export const SAFE_PHRASES = [
  "〜と示唆される",
  "〜の可能性がある",
  "先行研究では",
  "〜という報告がある",
  "〜と考えられている",
  "〜する傾向が見られる",
  "〜に寄与し得る",
  "限定的なエビデンスではあるが",
  "さらなる研究が必要であるが",
  "現時点の知見によれば",
];

/**
 * テキスト中の断定表現をヘッジ表現に自動置換する
 */
export function applyHedging(text: string): string {
  let result = text;
  for (const rule of HEDGING_RULES) {
    result = result.replace(rule.pattern, rule.replacement);
  }
  return result;
}

/**
 * テキストに断定表現が含まれているか検査する（置換は行わない）
 */
export function findAssertiveExpressions(
  text: string
): { matched: string; index: number; suggestion: string }[] {
  const findings: { matched: string; index: number; suggestion: string }[] = [];
  for (const rule of HEDGING_RULES) {
    const regex = new RegExp(rule.pattern.source, "g");
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      findings.push({
        matched: match[0],
        index: match.index,
        suggestion: rule.replacement,
      });
    }
  }
  return findings;
}
