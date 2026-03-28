export type Audience =
  | "researchers"
  | "business_leaders"
  | "general"
  | "students"
  | "hr_professionals";

export type Tone =
  | "academic"
  | "professional"
  | "casual"
  | "inspirational"
  | "thought_leadership";

export type Objective =
  | "educate"
  | "engage"
  | "promote"
  | "network"
  | "thought_leadership";

export type PostLength = "short" | "medium" | "long";

export type VariantStyle =
  | "academic"
  | "bizdev"
  | "short_form"
  | "storytelling"
  | "data_driven";

export type ClaimCategory =
  | "medical_assertion"
  | "exaggeration"
  | "unreproducible"
  | "missing_citation";

export interface ClaimRule {
  pattern: RegExp;
  category: ClaimCategory;
  severity: number;
  message: string;
  suggestion: string;
}

export interface ClaimWarning {
  category: ClaimCategory;
  severity: number;
  message: string;
  suggestion: string;
  matchedText: string;
  position: { start: number; end: number };
}

export interface PostVariant {
  style: VariantStyle;
  text: string;
  char_count: number;
}

export interface FormatOptions {
  includeHashtags: boolean;
  includeCta: boolean;
}
