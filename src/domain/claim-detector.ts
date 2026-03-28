/**
 * 医療断定・誇張表現の検出エンジン + リスクスコア算出
 */

import type { ClaimCategory, ClaimRule, ClaimWarning } from "../types/index.js";
import { applyHedging } from "./neuro-hedging.js";

const MEDICAL_ASSERTION_RULES: ClaimRule[] = [
  {
    pattern: /(?:脳|神経|ニューロン).*?(?:治[すせし]|治療(?:する|できる|される))/,
    category: "medical_assertion",
    severity: 9,
    message: "脳に関する治療効果の断定が検出されました",
    suggestion: "「〜の改善に寄与する可能性が研究されています」に置き換えを検討",
  },
  {
    pattern: /(?:確実に|間違いなく|絶対に).*?(?:効果|改善|向上)/,
    category: "medical_assertion",
    severity: 8,
    message: "効果の断定表現が検出されました",
    suggestion: "「〜の効果が示唆されています」に置き換えを検討",
  },
  {
    pattern: /(?:を|が)(?:治す|治せる|治療できる)/,
    category: "medical_assertion",
    severity: 9,
    message: "治療の断定が検出されました",
    suggestion: "「改善に寄与する可能性がある」に置き換えを検討",
  },
  {
    pattern: /科学的に(?:証明|実証)された/,
    category: "medical_assertion",
    severity: 7,
    message: "科学的証明の断定が検出されました",
    suggestion: "「研究により示唆された」に置き換えを検討",
  },
  {
    pattern: /(?:効果|効能)(?:が|は)(?:ある|認められる)(?!可能性)/,
    category: "medical_assertion",
    severity: 7,
    message: "効果の断定が検出されました",
    suggestion: "「効果がある可能性が示されている」に置き換えを検討",
  },
  {
    pattern: /(?:予防|防止)(?:する|できる|される)(?!可能性)/,
    category: "medical_assertion",
    severity: 8,
    message: "予防効果の断定が検出されました",
    suggestion: "「予防に関連する可能性がある」に置き換えを検討",
  },
];

const EXAGGERATION_RULES: ClaimRule[] = [
  {
    pattern: /(?:革命的|画期的|世界初|前例のない|歴史的(?:な|発見))/,
    category: "exaggeration",
    severity: 6,
    message: "誇張表現が検出されました",
    suggestion: "「注目すべき」「重要な進展」などに置き換えを検討",
  },
  {
    pattern: /(?:驚くべき|衝撃的|信じられない)(?:結果|発見|効果)/,
    category: "exaggeration",
    severity: 5,
    message: "誇張的な修飾語が検出されました",
    suggestion: "「興味深い」「注目に値する」などに置き換えを検討",
  },
  {
    pattern: /(?:劇的に|飛躍的に|圧倒的に)(?:改善|向上|変化)/,
    category: "exaggeration",
    severity: 5,
    message: "程度の誇張表現が検出されました",
    suggestion: "「有意に」「一定程度」などに置き換えを検討",
  },
  {
    pattern: /(?:すべての|あらゆる|万人の)/,
    category: "exaggeration",
    severity: 4,
    message: "過度な一般化が検出されました",
    suggestion: "「多くの」「一部の」などに限定を検討",
  },
];

const UNREPRODUCIBLE_RULES: ClaimRule[] = [
  {
    pattern: /(?:一つの|ある|単一の)(?:研究|実験|論文)(?:で|が|によ(?:り|って)).*?(?:証明|実証|明らか)/,
    category: "unreproducible",
    severity: 7,
    message: "単一研究への過度な依拠が検出されました",
    suggestion: "「複数の研究で検討されており」「さらなる検証が期待される」を追加",
  },
  {
    pattern: /(?:マウス|ラット|動物)(?:実験|モデル)(?:で|が|によ(?:り|って)).*?(?:人|ヒト|臨床)/,
    category: "unreproducible",
    severity: 6,
    message: "動物実験結果のヒトへの安易な外挿が検出されました",
    suggestion: "「動物モデルでの結果であり、ヒトでの検証は今後の課題」を追記",
  },
  {
    pattern: /(?:N|n|被験者)(?:=|＝)\s*\d{1,2}(?!\d)/,
    category: "unreproducible",
    severity: 5,
    message: "少数サンプルの研究結果が含まれている可能性があります",
    suggestion: "サンプルサイズの限界を明記することを推奨",
  },
];

const MISSING_CITATION_RULES: ClaimRule[] = [
  {
    pattern: /(?:研究(?:では|によ(?:り|れば|ると))|論文(?:では|によると))(?!.*?(?:\(|（|〔|\[|出典|参考|doi|DOI|et al))/,
    category: "missing_citation",
    severity: 4,
    message: "研究・論文への言及がありますが、具体的な出典が見当たりません",
    suggestion: "著者名・年・誌名、またはDOIの追記を推奨",
  },
  {
    pattern: /\d+(?:\.\d+)?%(?:の|が|は).*?(?:改善|向上|増加|減少|低下)/,
    category: "missing_citation",
    severity: 5,
    message: "具体的な数値データに出典が見当たりません",
    suggestion: "統計データの出典元を明記することを推奨",
  },
  {
    pattern: /(?:最新|最近|近年)の(?:研究|調査|報告)(?:では|によると)/,
    category: "missing_citation",
    severity: 3,
    message: "「最新の研究」への言及に具体的な出典がありません",
    suggestion: "具体的な研究名・年を明記することを推奨",
  },
];

const ALL_RULES: ClaimRule[] = [
  ...MEDICAL_ASSERTION_RULES,
  ...EXAGGERATION_RULES,
  ...UNREPRODUCIBLE_RULES,
  ...MISSING_CITATION_RULES,
];

const CATEGORY_WEIGHTS: Record<ClaimCategory, number> = {
  medical_assertion: 3.0,
  exaggeration: 2.0,
  unreproducible: 2.5,
  missing_citation: 1.5,
};

/**
 * テキスト中の問題のある科学的主張をすべて検出する
 */
export function detectClaims(text: string): ClaimWarning[] {
  const warnings: ClaimWarning[] = [];

  for (const rule of ALL_RULES) {
    const regex = new RegExp(rule.pattern.source, "g");
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      warnings.push({
        category: rule.category,
        severity: rule.severity,
        message: rule.message,
        suggestion: rule.suggestion,
        matchedText: match[0],
        position: { start: match.index, end: match.index + match[0].length },
      });
    }
  }

  return warnings;
}

/**
 * 検出結果から 0-100 のリスクスコアを算出する
 */
export function calculateRiskScore(warnings: ClaimWarning[]): number {
  if (warnings.length === 0) return 0;

  const rawScore = warnings.reduce((sum, w) => {
    return sum + w.severity * CATEGORY_WEIGHTS[w.category];
  }, 0);

  return Math.min(100, Math.round(rawScore * 2));
}

/**
 * 検出された問題箇所をヘッジング表現で書き換えた安全なテキストを生成する
 */
export function generateSaferRewrite(text: string): string {
  return applyHedging(text);
}
