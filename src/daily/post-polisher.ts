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
// 投稿テンプレート
//
// ターゲット: 脳科学研究者・AI技術者・アナリスト
// トーン: 技術内容を「知ってほしい」という熱量で共有
// スタイル: 専門家同士のピアトゥピア、技術用語は自信を持って使用
// ────────────────────────────────────────────

interface PostTemplate {
  name: string;
  build: (topic: TopicInfo, paper: PaperInfo, abstractExcerpt: string) => string;
}

const TEMPLATES: PostTemplate[] = [
  // ── パターン1: 研究紹介型 ──
  // 「この研究、知ってほしい」というストレートな共有
  {
    name: "research-share",
    build: (topic, paper, excerpt) => `\
${topic.japaneseTopic}に関する研究で、注目すべき成果が出ています。

${excerpt}

${topic.themeArea}の領域において、
この知見が持つインパクトは小さくないと考えています。

特に、脳情報処理の理解が進むことで、
AI アーキテクチャや信号処理手法への示唆も得られる——
そういう段階に来ていると感じます。

まだ検証が必要な部分はありますが、
この方向性は押さえておく価値があります。

📄 ${paper.title}
${paper.link}

この領域に取り組んでいる方、ぜひ意見を聞かせてください。`,
  },

  // ── パターン2: 技術的示唆型 ──
  // 研究結果から技術的な展望を引き出す
  {
    name: "tech-implication",
    build: (topic, paper, excerpt) => `\
${topic.japaneseTopic}——
この分野の最新研究が、技術的に面白い方向を示しています。

${excerpt}

ここから読み取れる技術的な示唆は大きい。

脳の情報処理メカニズムの解明は、
ニューラルネットワーク設計や
デコーディング手法の改善に直結する可能性があります。

神経科学と AI の接点は年々太くなっている。
この研究もその流れの中にある重要な一報です。

📄 ${paper.title}
${paper.link}

AI 側・神経科学側、どちらの視点からも
コメントいただけると嬉しいです。`,
  },

  // ── パターン3: 問題提起型 ──
  // 研究の意義を問いとして投げかける
  {
    name: "problem-framing",
    build: (topic, paper, excerpt) => `\
一つ、問いを投げかけたい。

${topic.japaneseTopic}について、
私たちはどこまで理解できているのか？

${excerpt}

この研究は、その問いに対する
一つの重要なアプローチを示しています。

もちろん、単一の研究で全体像が見えるわけではない。
しかし、${topic.themeArea}の文脈で見ると、
従来の理解を更新するデータが蓄積されてきている。

分野横断的に議論すべきテーマだと思います。

📄 ${paper.title}
${paper.link}

この研究テーマについて、
どのような展開が考えられるでしょうか？`,
  },

  // ── パターン4: 分野横断型 ──
  // 脳科学 × AI/工学の接点を強調
  {
    name: "cross-domain",
    build: (topic, paper, excerpt) => `\
脳科学と AI の境界が、また一つ薄くなった。

${topic.japaneseTopic}に関する最新の研究成果です。

${excerpt}

この成果の注目点は、
神経科学的な知見が計算論的モデルや
工学的応用へ接続可能な形で提示されていること。

脳の情報表現を理解することは、
次世代の AI アーキテクチャを考えるうえでも
避けて通れないテーマになりつつあります。

📄 ${paper.title}
${paper.link}

ニューロサイエンスとAI、
両方の視点を持つ方にぜひ読んでほしい一報です。`,
  },

  // ── パターン5: 3つの着眼点型 ──
  // 構造化された技術的ポイント
  {
    name: "three-points",
    build: (topic, paper, excerpt) => `\
${topic.japaneseTopic}の最新研究を読んで、
3つの着眼点を整理しました。

${excerpt}

① この研究が従来手法と異なるアプローチを取っている点。
新しい知見を引き出す方法論自体に学ぶところがある。

② ${topic.themeArea}における位置づけ。
この分野の研究蓄積の中で、どういう貢献をしているか。

③ 今後の発展可能性。
AI技術や臨床応用との接続点が見えてくる。

研究の詳細はこちら:
📄 ${paper.title}
${paper.link}

同領域の研究者・エンジニアの方、
補足や異なる解釈があればぜひ共有してください。`,
  },

  // ── パターン6: 動向整理型 ──
  // 一報の論文を分野全体の文脈に位置づける
  {
    name: "trend-context",
    build: (topic, paper, excerpt) => `\
${topic.japaneseTopic}の研究動向を追っている方に共有です。

${excerpt}

この領域は近年、急速に知見が蓄積されています。

特に${topic.themeArea}の観点から見ると、
データ駆動型のアプローチと
仮説検証型の実験デザインが
うまく噛み合い始めている印象を受けます。

一つ一つの研究から全体像を読み取る——
そのための情報として、押さえておきたい一報です。

📄 ${paper.title}
${paper.link}

この分野の最近の動向について、
皆さんはどう見ていますか？`,
  },
];

// ────────────────────────────────────────────
// Abstract の要約整形
// ────────────────────────────────────────────

/**
 * 英語 abstract から投稿用の引用テキストを構成する。
 * 専門家向けのため、原文を尊重しつつ文脈を補足。
 */
function buildAbstractExcerpt(paper: PaperInfo, topic: TopicInfo): string {
  const abstract = paper.abstract;

  if (!abstract || abstract.length < 20) {
    return `${topic.japaneseTopic}に関する最新の研究成果が報告されました。\n` +
      `詳細は以下の論文をご確認ください。`;
  }

  // abstract から最初の2-3文を抽出
  const sentences = abstract.split(/(?<=[.!?])\s+/).filter((s) => s.length > 10);
  const excerpt = sentences.slice(0, 3).join(" ");
  const truncated = excerpt.length > 350 ? excerpt.substring(0, 350).replace(/\s\S*$/, "...") : excerpt;

  // 技術的な文脈補足
  const keyTerms = topic.keywords.slice(0, 3);
  const termNote = keyTerms.length > 0
    ? `【関連キーワード: ${keyTerms.join(" / ")}】`
    : "";

  return `${termNote}\n\n` +
    `> ${truncated}`;
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

  return {
    formatted,
    raw,
    templateName: template.name,
    topic: topic.japaneseTopic,
    riskScore,
    paperLink: paper.link,
    paperTitle: paper.title,
  };
}
