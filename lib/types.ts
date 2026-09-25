export type ResponseType = "yes_no" | "number" | "text" | "photo";

export type ChecklistQuestion = {
  id: string;
  section_id: string;
  code: string;
  question: string;
  response_type: ResponseType;
  required: boolean;
  critical: boolean;
  min_value: number | null;
  max_value: number | null;
  unit: string | null;
  requires_photo: boolean;
  ai_enabled: boolean;
  ai_instruction: string | null;
  sort_order: number;
};

export type ChecklistSection = {
  id: string;
  title: string;
  description: string | null;
  sort_order: number;
  questions: ChecklistQuestion[];
};

export type ChecklistTemplate = {
  id: string;
  name: string;
  code: string;
  version: string;
  description: string | null;
  sections: ChecklistSection[];
};

export type AiFinding = {
  status: "pass" | "fail" | "review";
  confidence: number;
  finding: string;
  recommendation: string;
};

export type RunAnswer = {
  question_id: string;
  value: string | number | boolean | null;
  photo_url?: string | null;
  is_compliant: boolean | null;
  ai?: AiFinding | null;
};

export type ChecklistRunPayload = {
  template_id: string;
  location_name: string;
  inspector_name: string;
  answers: RunAnswer[];
  score: number;
};

export type SavedChecklistRun = ChecklistRunPayload & {
  id: string;
  created_at: string;
  template_name?: string;
};
