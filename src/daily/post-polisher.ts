/**
 * 投稿文推敲エンジン
 *
 * ターゲット: 脳科学研究者・AI技術者・アナリスト
 * トーン: 技術研究内容を「知ってほしい」という熱量で共有する専門家の語り口
 *
 * 英語論文情報から、脳情報科学 × AI の文脈で
 * 専門家同士のピアトゥピアな日本語 LinkedIn ドラフトを生成する。
 */

import type { PaperInfo } from "./rss-fetcher.js";
import { applyHedging } from "../domain/neuro-hedging.js";
import { detectClaims, calculateRiskScore, generateSaferRewrite } from "../domain/claim-detector.js";
import { formatForLinkedin } from "../domain/linkedin-formatter.js";

// ────────────────────────────────────────────
// 脳科学・ニューロAI 用語辞書（英 → 日）
// ────────────────────────────────────────────

const NEURO_DICTIONARY: Record<string, string> = {
  // 脳領域
  "prefrontal cortex": "前頭前皮質",
  "hippocampus": "海馬",
  "amygdala": "扁桃体",
  "cerebellum": "小脳",
  "basal ganglia": "大脳基底核",
  "thalamus": "視床",
  "insular cortex": "島皮質",
  "anterior cingulate": "前帯状皮質",
  "parietal cortex": "頭頂皮質",
  "visual cortex": "視覚野",
  "motor cortex": "運動野",
  "default mode network": "デフォルトモードネットワーク(DMN)",
  "salience network": "顕著性ネットワーク",
  "frontoparietal network": "前頭頭頂ネットワーク",

  // 神経科学コア概念
  "neuroplasticity": "神経可塑性",
  "synaptic plasticity": "シナプス可塑性",
  "long-term potentiation": "長期増強(LTP)",
  "spike timing": "スパイクタイミング",
  "neural oscillation": "神経振動",
  "gamma oscillation": "ガンマ波振動",
  "neural coding": "神経符号化",
  "population coding": "集団符号化",
  "predictive coding": "予測符号化",
  "neural manifold": "ニューラルマニフォールド",
  "neural dynamics": "神経ダイナミクス",
  "connectome": "コネクトーム",
  "connectomics": "コネクトミクス",
  "optogenetics": "オプトジェネティクス",
  "calcium imaging": "カルシウムイメージング",
  "neurogenesis": "神経新生",

  // 神経伝達物質
  "dopamine": "ドーパミン",
  "serotonin": "セロトニン",
  "gaba": "GABA",
  "glutamate": "グルタミン酸",
  "neurotransmitter": "神経伝達物質",

  // 認知・計算論
  "working memory": "ワーキングメモリ",
  "executive function": "実行機能",
  "cognitive control": "認知制御",
  "attention": "注意機構",
  "selective attention": "選択的注意",
  "decision making": "意思決定",
  "decision-making": "意思決定",
  "memory consolidation": "記憶固定化",
  "episodic memory": "エピソード記憶",
  "metacognition": "メタ認知",
  "cognitive flexibility": "認知的柔軟性",
  "reward processing": "報酬処理",
  "reinforcement learning": "強化学習",
  "bayesian inference": "ベイズ推論",
  "bayesian brain": "ベイズ脳仮説",
  "free energy principle": "自由エネルギー原理",
  "active inference": "能動推論",
  "computational psychiatry": "計算論的精神医学",

  // BCI・脳情報技術
  "brain-computer interface": "ブレイン・コンピュータ・インターフェース(BCI)",
  "brain-machine interface": "ブレイン・マシン・インターフェース(BMI)",
  "neural interface": "ニューラルインターフェース",
  "neural decoding": "神経デコーディング",
  "neural encoding": "神経エンコーディング",
  "brain decoding": "脳情報デコーディング",
  "neuroprosthetics": "ニューロプロテーゼ",
  "neurofeedback": "ニューロフィードバック",
  "closed-loop": "クローズドループ制御",
  "neuromodulation": "ニューロモデュレーション",
  "neural signal processing": "神経信号処理",
  "spike sorting": "スパイクソーティング",
  "brain stimulation": "脳刺激",

  // ニューロAI・計算論的神経科学
  "neuroai": "ニューロAI",
  "computational neuroscience": "計算論的神経科学",
  "neural network model": "ニューラルネットワークモデル",
  "deep learning": "深層学習",
  "transformer": "Transformer",
  "large language model": "大規模言語モデル(LLM)",
  "artificial neural network": "人工ニューラルネットワーク",
  "spiking neural network": "スパイキングニューラルネットワーク(SNN)",
  "recurrent neural network": "リカレントニューラルネットワーク(RNN)",
  "convolutional neural network": "畳み込みニューラルネットワーク(CNN)",
  "representation learning": "表現学習",
  "latent space": "潜在空間",
  "dimensionality reduction": "次元削減",
  "manifold learning": "多様体学習",
  "reservoir computing": "リザバーコンピューティング",
  "neuromorphic": "ニューロモーフィック",
  "neuromorphic computing": "ニューロモーフィックコンピューティング",
  "brain-inspired": "脳型",
  "biologically plausible": "生物学的妥当性",

  // 計測手法
  "fmri": "fMRI",
  "functional mri": "fMRI",
  "eeg": "EEG",
  "meg": "MEG(脳磁図)",
  "ecog": "ECoG(皮質脳波)",
  "electrocorticography": "皮質脳波(ECoG)",
  "nirs": "fNIRS(近赤外分光法)",
  "two-photon": "二光子イメージング",
  "pet": "PET",
  "tms": "TMS(経頭蓋磁気刺激)",
  "tdcs": "tDCS(経頭蓋直流電気刺激)",
  "neuroimaging": "脳画像研究",

  // 応用領域
  "consciousness": "意識",
  "sleep": "睡眠",
  "emotion": "情動",
  "learning": "学習",
  "memory": "記憶",
  "language": "言語処理",
  "social cognition": "社会的認知",
  "theory of mind": "心の理論",
  "embodied cognition": "身体性認知",
  "neuroethics": "神経倫理",
};

// ────────────────────────────────────────────
// トピック抽出
// ────────────────────────────────────────────

interface TopicInfo {
  japaneseTopic: string;
  keywords: string[];
  themeArea: string;
}

/** 計測手法はトピックとして優先度を下げる */
const METHOD_TERMS = new Set([
  "fmri", "functional mri", "eeg", "meg", "ecog", "electrocorticography",
  "nirs", "two-photon", "pet", "tms", "tdcs", "neuroimaging",
  "calcium imaging", "optogenetics", "spike sorting",
]);

/**
 * 英語タイトルから日本語トピックを抽出する。
 * 計測手法よりも実質的なテーマ（計算論・BCI・認知機能）を優先。
 */
export function extractTopic(paper: PaperInfo): TopicInfo {
  const titleLower = paper.title.toLowerCase();
  const textLower = `${paper.title} ${paper.abstract}`.toLowerCase();

  type Match = { en: string; ja: string; isMethod: boolean; inTitle: boolean };
  const matched: Match[] = [];

  const sortedKeys = Object.keys(NEURO_DICTIONARY).sort((a, b) => b.length - a.length);

  for (const enTerm of sortedKeys) {
    const inTitle = titleLower.includes(enTerm);
    const inAbstract = textLower.includes(enTerm);
    if (inTitle || inAbstract) {
      matched.push({
        en: enTerm,
        ja: NEURO_DICTIONARY[enTerm],
        isMethod: METHOD_TERMS.has(enTerm),
        inTitle,
      });
    }
  }

  const themeArea = inferThemeArea(textLower);

  if (matched.length === 0) {
    return {
      japaneseTopic: "脳情報科学の最新研究",
      keywords: ["脳情報科学"],
      themeArea,
    };
  }

  const scored = matched
    .map((m) => ({
      ...m,
      score: (m.inTitle ? 10 : 1) + (m.isMethod ? 0 : 5) + m.en.length * 0.1,
    }))
    .sort((a, b) => b.score - a.score);

  const substantive = scored.filter((m) => !m.isMethod);
  const topPicks = substantive.length >= 1 ? substantive : scored;

  const primary = topPicks[0].ja;
  const secondary = topPicks.length > 1 && topPicks[1].ja !== primary ? topPicks[1].ja : null;
  const japaneseTopic = secondary ? `${primary}と${secondary}` : primary;

  return {
    japaneseTopic,
    keywords: scored.map((m) => m.ja),
    themeArea,
  };
}

function inferThemeArea(text: string): string {
  const areas: [string, string[]][] = [
    ["BCI・ニューラルインターフェース", ["brain-computer", "brain-machine", "bci", "bmi", "neuroprosth", "neural interface", "closed-loop", "neurofeedback"]],
    ["ニューロAI・計算論", ["neuroai", "deep learning", "transformer", "spiking neural", "neuromorphic", "reservoir computing", "brain-inspired", "biologically plausible", "artificial neural"]],
    ["計算論的神経科学", ["computational neuroscience", "bayesian", "predictive coding", "free energy", "active inference", "reinforcement learning", "neural coding", "population coding"]],
    ["神経デコーディング", ["decoding", "encoding", "neural signal", "classification", "pattern recognition", "representation"]],
    ["認知・意思決定", ["decision", "cognitive control", "executive function", "working memory", "attention", "metacognition", "reward"]],
    ["コネクトミクス・回路解析", ["connectome", "connectomics", "circuit", "network dynamics", "oscillation", "neural manifold", "dimensionality"]],
    ["臨床・精神医学応用", ["psychiatric", "disorder", "clinical", "therapy", "diagnosis", "biomarker", "patient"]],
  ];

  for (const [area, keywords] of areas) {
    if (keywords.some((kw) => text.includes(kw))) {
      return area;
    }
  }
  return "脳情報科学";
}

// ────────────────────────────────────────────
// データポイント抽出
// ────────────────────────────────────────────

/** 論文 abstract から数値データ・主要発見を抽出する */
function extractDataPoints(abstract: string): string[] {
  if (!abstract || abstract.length < 30) return [];

  const sentences = abstract.split(/(?<=[.!?])\s+/).filter((s) => s.length > 15);
  const patterns = [
    /\d+\.?\d*\s*%/,
    /\d+\.?\d*[-–]fold/,
    /p\s*[<>=]\s*0?\.\d+/i,
    /\baccuracy\b.*\d/i,
    /\bperformance\b.*\d/i,
    /\bimproved?\b.*\d/i,
    /\bsignificant(?:ly)?\b/i,
    /\bfirst\s+(?:time|demonstration|evidence|report)\b/i,
    /\bnovel\b/i,
    /\bstate[- ]of[- ]the[- ]art\b/i,
    /\boutperform/i,
    /\bsuperior\b/i,
    /\brobust\b/i,
  ];

  const found: string[] = [];
  for (const sentence of sentences) {
    if (patterns.some((p) => p.test(sentence)) && found.length < 3) {
      const clean =
        sentence.length > 180
          ? sentence.substring(0, 180).replace(/\s\S*$/, "...")
          : sentence;
      found.push(clean);
    }
  }
  return found;
}

// ────────────────────────────────────────────
// 投稿テンプレート
//
// ターゲット: 脳科学研究者・AI技術者・アナリスト
// トーン: 明確な主張と具体的データで読者の行動を引き出す
// スタイル: LinkedIn でView・エンゲージメントを稼ぐ構造
//
// LinkedIn の「もっと見る」は約210文字。
// 冒頭の2-3行で読者の興味を掴むことが最重要。
// ────────────────────────────────────────────

interface PostTemplate {
  name: string;
  build: (topic: TopicInfo, paper: PaperInfo, abstractExcerpt: string) => string;
}

const TEMPLATES: PostTemplate[] = [
  // ── パターン1: 常識覆し型 ──
  {
    name: "paradigm-shift",
    build: (topic, paper, excerpt) => `\
${topic.japaneseTopic}に関する「常識」が、
この研究で大きく揺らいでいます。

${excerpt}

これまでの定説では説明しきれない現象が、
データで裏付けられ始めている。

${topic.themeArea}の研究が示す方向性は明確です。
従来のモデルの限界を認め、
新しいフレームワークを構築すべきフェーズに入っている。

この知見はAIアーキテクチャの設計にも
直接的な示唆を与えると考えています。

📄 ${paper.title}
🔗 ${paper.link}`,
  },

  // ── パターン2: データドリブン型 ──
  {
    name: "data-driven",
    build: (topic, paper, excerpt) => `\
数字が語る、${topic.japaneseTopic}の新事実。

最新の研究がインパクトのあるデータを示しています。

${excerpt}

なぜこの数字が重要か。

${topic.themeArea}において、
定量的な裏付けのある知見は
仮説から「科学的事実」への転換点になり得る。

再現性と実用性の両立——
この研究はその道筋を明確に示しています。

📄 ${paper.title}
🔗 ${paper.link}`,
  },

  // ── パターン3: 3つの示唆型 ──
  {
    name: "three-insights",
    build: (topic, paper, excerpt) => `\
この研究から得られる3つの重要な示唆。

${topic.japaneseTopic}の最新成果を整理しました。

${excerpt}

①【方法論の革新】
この研究が採用したアプローチ自体が、
${topic.themeArea}の今後の標準になり得る。

②【分野横断の波及効果】
神経科学に留まらず、
AI設計やデータサイエンスへの応用可能性が高い。

③【未解決の問い】
この成果が新たに投げかける問いにも注目すべき。
次のブレイクスルーの種はここにある。

📄 ${paper.title}
🔗 ${paper.link}`,
  },

  // ── パターン4: 未来予測型 ──
  {
    name: "future-vision",
    build: (topic, paper, excerpt) => `\
2030年の脳科学は、今とは全く違う風景になる。

その布石の一つが、
${topic.japaneseTopic}の最新研究です。

${excerpt}

この研究が切り開く可能性：

→ より精密なAIアーキテクチャの設計
→ 神経疾患の早期診断・介入戦略
→ ヒトの認知能力の理解と拡張

基礎研究の一報が、
これだけの応用可能性を秘めている。

研究者もエンジニアも、この流れは見逃せません。

📄 ${paper.title}
🔗 ${paper.link}`,
  },

  // ── パターン5: 脳科学×AI融合型 ──
  {
    name: "neuro-ai-bridge",
    build: (topic, paper, excerpt) => `\
脳科学とAI——その境界線が消えつつある。

${topic.japaneseTopic}に関する本研究が、
両分野を橋渡しする決定的な知見を示しています。

${excerpt}

注目すべきは、
脳の情報処理原理と
最新のAIアルゴリズムの間に
驚くほどの類似性が見られること。

${topic.themeArea}の知見が
次世代の計算モデルを設計するヒントになる。
この研究はその仮説を強力に支持しています。

神経科学者とAIエンジニア、
今こそ対話が必要な時です。

📄 ${paper.title}
🔗 ${paper.link}`,
  },

  // ── パターン6: 挑発的問いかけ型 ──
  {
    name: "provocative-question",
    build: (topic, paper, excerpt) => `\
${topic.japaneseTopic}について、
私たちの理解は10年後「完全に間違っていた」
と言われるかもしれない。

${excerpt}

この研究が示唆する方向性は、
現在の主流パラダイムとは異なる道を指している。

もちろん、一つの研究で全てが変わるわけではない。
しかし${topic.themeArea}の文脈で俯瞰すると、
パラダイムシフトの予兆が確実に見えてくる。

この研究が転換点だったと
後から振り返る日が来るかもしれない。

📄 ${paper.title}
🔗 ${paper.link}`,
  },
];

// ────────────────────────────────────────────
// Abstract の要約整形
// ────────────────────────────────────────────

/**
 * 論文 abstract から日本語フレーミング付きの要約を構成する。
 *
 * 戦略:
 * - 数値データがあれば「📊 注目データ」として目立たせる
 * - キーワードを日本語で提示してコンテキストを与える
 * - 英語原文はデータ文のみ引用し、残りは日本語で構造化
 */
function buildAbstractExcerpt(paper: PaperInfo, topic: TopicInfo): string {
  const abstract = paper.abstract;

  if (!abstract || abstract.length < 20) {
    return `${topic.japaneseTopic}に関する画期的な研究成果が報告されました。`;
  }

  const dataPoints = extractDataPoints(abstract);
  const keyTerms = topic.keywords.slice(0, 4);

  const parts: string[] = [];

  // キーワードをコンテキストとして提示
  if (keyTerms.length > 0) {
    parts.push(`🔬 ${keyTerms.join(" × ")}`);
  }

  // データポイントがあれば強調表示
  if (dataPoints.length > 0) {
    parts.push("");
    parts.push("📊 注目すべきデータ：");
    for (const dp of dataPoints) {
      parts.push(`→ ${dp}`);
    }
  } else {
    // データがない場合は abstract の冒頭を要約的に引用
    const sentences = abstract.split(/(?<=[.!?])\s+/).filter((s) => s.length > 10);
    const firstTwo = sentences.slice(0, 2).join(" ");
    const truncated =
      firstTwo.length > 280
        ? firstTwo.substring(0, 280).replace(/\s\S*$/, "...")
        : firstTwo;
    parts.push("");
    parts.push(`> ${truncated}`);
  }

  return parts.join("\n");
}

// ────────────────────────────────────────────
// メイン：投稿ドラフト生成
// ────────────────────────────────────────────

export interface PolishedDraft {
  /** 最終整形済みテキスト（LinkedIn にそのまま貼れる） */
  formatted: string;
  /** 整形前の素ドラフト */
  raw: string;
  /** 使用したテンプレート名 */
  templateName: string;
  /** 日本語トピック */
  topic: string;
  /** リスクスコア (0-100) */
  riskScore: number;
  /** 論文リンク */
  paperLink: string;
  /** 論文タイトル */
  paperTitle: string;
  /** 論文の図表URL（取得できた場合） — 後方互換用に1枚目を保持 */
  figureUrl?: string;

  // ─── 情報密度向上のため追加されたメタデータ群 ───
  /** 30-60字程度の日本語タイトルサマリ */
  summaryJP: string;
  /** 著者ライン (取得できなかった場合は空文字) */
  paperAuthors: string;
  /** 発表日 (取得できた範囲で) */
  publishedDate: string;
  /** arXiv ID または PMID */
  paperId: string;
  /** 論文ソース */
  paperSource: "arxiv" | "pubmed" | "other";
  /** 推定テーマ領域 (例: 「ニューロAI・計算論」) */
  themeArea: string;
  /** マッチした日本語キーワード (最大6) */
  jpKeywords: string[];
  /** 抄録の冒頭抜粋 (240字程度) */
  abstractExcerpt: string;
  /** 図表URL一覧 (最大3枚) */
  figureUrls: string[];
}

// ────────────────────────────────────────────
// メタデータ抽出ヘルパー
// ────────────────────────────────────────────

/** 論文リンクから ID とソースを推定する */
function extractPaperId(link: string): {
  id: string;
  source: "arxiv" | "pubmed" | "other";
} {
  const ax = link.match(/arxiv\.org\/abs\/([^\s/?#]+)/i);
  if (ax) return { id: ax[1].replace(/v\d+$/, ""), source: "arxiv" };
  const pm = link.match(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)/i);
  if (pm) return { id: pm[1], source: "pubmed" };
  return { id: "", source: "other" };
}

/** 抄録から純テキストの冒頭抜粋を取り出す (絵文字や引用記号を含まない) */
function extractCleanExcerpt(abstract: string, maxChars = 240): string {
  if (!abstract) return "";
  const cleaned = abstract.replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxChars) return cleaned;
  return cleaned.substring(0, maxChars).replace(/\s\S*$/, "") + "…";
}

/** テンプレートに応じた日本語タイトルサマリを生成する */
const SUMMARY_FRAMES: Record<string, string> = {
  "paradigm-shift": "通説を揺さぶる新たな知見",
  "data-driven": "数値で示された新事実",
  "three-insights": "注目すべき3つの示唆",
  "future-vision": "次世代へ続く布石",
  "neuro-ai-bridge": "脳科学とAIをつなぐ研究",
  "provocative-question": "常識への問題提起",
};

function buildSummaryJP(topic: TopicInfo, templateName: string): string {
  const frame = SUMMARY_FRAMES[templateName] || "注目すべき研究";
  // テーマ領域がデフォルトなら冗長なので省略
  const themeTag =
    topic.themeArea && topic.themeArea !== "脳情報科学"
      ? `（${topic.themeArea}）`
      : "";
  return `${topic.japaneseTopic} — ${frame}${themeTag}`;
}

/**
 * 論文情報から推敲済み LinkedIn ドラフトを生成する。
 *
 * パイプライン: トピック抽出 → テンプレート適用 → ヘッジング → クレーム検出 → LinkedIn 整形
 */
export function polishDraft(paper: PaperInfo, dayIndex?: number): PolishedDraft {
  // 1. トピック抽出
  const topic = extractTopic(paper);

  // 2. Abstract の要約整形
  const abstractExcerpt = buildAbstractExcerpt(paper, topic);

  // 3. テンプレート選択（日ごとにローテーション）
  const templateIdx = dayIndex !== undefined
    ? dayIndex % TEMPLATES.length
    : Math.floor(Math.random() * TEMPLATES.length);
  const template = TEMPLATES[templateIdx];

  // 4. ドラフト生成
  let draft = template.build(topic, paper, abstractExcerpt);

  // 5. ヘッジング適用
  draft = applyHedging(draft);

  // 6. クレーム検出 → 高リスクなら safer rewrite
  const claims = detectClaims(draft);
  const riskScore = calculateRiskScore(claims);
  if (riskScore > 30) {
    draft = generateSaferRewrite(draft);
  }

  const raw = draft;

  // 7. LinkedIn 向け整形（CTA + ハッシュタグ付き）
  const formatted = formatForLinkedin(draft, topic.japaneseTopic, {
    includeHashtags: true,
    includeCta: true,
  });

  // 8. 情報密度向上のためのメタデータ抽出
  const { id: paperId, source: paperSource } = extractPaperId(paper.link);
  const summaryJP = buildSummaryJP(topic, template.name);

  return {
    formatted,
    raw,
    templateName: template.name,
    topic: topic.japaneseTopic,
    riskScore,
    paperLink: paper.link,
    paperTitle: paper.title,
    summaryJP,
    paperAuthors: paper.authors || "",
    publishedDate: paper.publishedDate || "",
    paperId,
    paperSource,
    themeArea: topic.themeArea,
    jpKeywords: topic.keywords.slice(0, 6),
    abstractExcerpt: extractCleanExcerpt(paper.abstract, 240),
    figureUrls: [],
  };
}
