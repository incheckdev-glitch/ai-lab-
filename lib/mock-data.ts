import type { ChecklistTemplate } from "./types";

export const DEMO_TEMPLATE_ID = "11111111-1111-1111-1111-111111111111";

export const demoTemplate: ChecklistTemplate = {
  id: DEMO_TEMPLATE_ID,
  name: "Daily Food Safety Inspection",
  code: "FS-DAILY-001",
  version: "1.0",
  description: "Sample checklist used to validate the InCheck 360 AI checklist workflow.",
  sections: [
    {
      id: "22222222-2222-2222-2222-222222222221",
      title: "Cold Storage",
      description: "Refrigeration, storage condition and food protection.",
      sort_order: 1,
      questions: [
        {
          id: "33333333-3333-3333-3333-333333333331",
          section_id: "22222222-2222-2222-2222-222222222221",
          code: "CS-01",
          question: "Is the refrigerator clean and free from visible contamination?",
          response_type: "yes_no",
          required: true,
          critical: false,
          min_value: null,
          max_value: null,
          unit: null,
          requires_photo: false,
          ai_enabled: true,
          ai_instruction: "Assess whether the answer and any image indicate a visibly clean refrigerator.",
          sort_order: 1
        },
        {
          id: "33333333-3333-3333-3333-333333333332",
          section_id: "22222222-2222-2222-2222-222222222221",
          code: "CS-02",
          question: "What is the refrigerator temperature?",
          response_type: "number",
          required: true,
          critical: true,
          min_value: 0,
          max_value: 5,
          unit: "°C",
          requires_photo: false,
          ai_enabled: false,
          ai_instruction: null,
          sort_order: 2
        },
        {
          id: "33333333-3333-3333-3333-333333333333",
          section_id: "22222222-2222-2222-2222-222222222221",
          code: "CS-03",
          question: "Are all open foods protected, covered or stored in approved containers?",
          response_type: "yes_no",
          required: true,
          critical: true,
          min_value: null,
          max_value: null,
          unit: null,
          requires_photo: true,
          ai_enabled: true,
          ai_instruction: "Look for open, uncovered or poorly protected food containers and identify visible concerns.",
          sort_order: 3
        }
      ]
    },
    {
      id: "22222222-2222-2222-2222-222222222222",
      title: "Kitchen & Hygiene",
      description: "Basic kitchen controls and personal hygiene.",
      sort_order: 2,
      questions: [
        {
          id: "33333333-3333-3333-3333-333333333334",
          section_id: "22222222-2222-2222-2222-222222222222",
          code: "KH-01",
          question: "Are food-contact work surfaces visibly clean?",
          response_type: "yes_no",
          required: true,
          critical: false,
          min_value: null,
          max_value: null,
          unit: null,
          requires_photo: true,
          ai_enabled: true,
          ai_instruction: "Assess visible cleanliness and flag spills, residue, waste or obvious contamination.",
          sort_order: 1
        },
        {
          id: "33333333-3333-3333-3333-333333333335",
          section_id: "22222222-2222-2222-2222-222222222222",
          code: "KH-02",
          question: "Record any hygiene observation that requires follow-up.",
          response_type: "text",
          required: false,
          critical: false,
          min_value: null,
          max_value: null,
          unit: null,
          requires_photo: false,
          ai_enabled: true,
          ai_instruction: "Classify the written observation as pass, fail or review and suggest one concise operational action.",
          sort_order: 2
        }
      ]
    }
  ]
};
