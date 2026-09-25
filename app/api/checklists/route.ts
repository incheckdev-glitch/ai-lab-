import { NextRequest, NextResponse } from "next/server";
import { demoTemplate } from "@/lib/mock-data";
import { hasSupabaseConfig } from "@/lib/mode";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { ChecklistTemplate } from "@/lib/types";

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");

  if (!hasSupabaseConfig()) {
    if (id && id !== demoTemplate.id) return NextResponse.json({ error: "Checklist not found" }, { status: 404 });
    return NextResponse.json({ template: demoTemplate, mode: "demo" });
  }

  try {
    const supabase = getSupabaseAdmin();
    let query = supabase.from("checklist_templates").select("id,name,code,version,description").eq("is_active", true);
    if (id) query = query.eq("id", id);
    const { data: templates, error: templateError } = await query.order("created_at", { ascending: false }).limit(id ? 1 : 20);
    if (templateError) throw templateError;
    if (!templates?.length) return NextResponse.json({ error: "Checklist not found" }, { status: 404 });

    const template = templates[0];
    const { data: sections, error: sectionError } = await supabase
      .from("checklist_sections")
      .select("id,title,description,sort_order")
      .eq("template_id", template.id)
      .order("sort_order");
    if (sectionError) throw sectionError;

    const sectionIds = (sections ?? []).map(s => s.id);
    const { data: questions, error: questionError } = sectionIds.length
      ? await supabase
          .from("checklist_questions")
          .select("id,section_id,code,question,response_type,required,critical,min_value,max_value,unit,requires_photo,ai_enabled,ai_instruction,sort_order")
          .in("section_id", sectionIds)
          .order("sort_order")
      : { data: [], error: null };
    if (questionError) throw questionError;

    const result: ChecklistTemplate = {
      ...template,
      sections: (sections ?? []).map(section => ({
        ...section,
        questions: (questions ?? []).filter(q => q.section_id === section.id)
      }))
    } as ChecklistTemplate;

    return NextResponse.json({ template: result, mode: "supabase" });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to load checklist from Supabase" }, { status: 500 });
  }
}
