import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { hasSupabaseConfig } from "@/lib/mode";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function POST(request: NextRequest) {
  if (!hasSupabaseConfig()) return NextResponse.json({ error: "Supabase is not configured" }, { status: 400 });
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "File is required" }, { status: 400 });
    if (!file.type.startsWith("image/")) return NextResponse.json({ error: "Only images are accepted" }, { status: 400 });
    if (file.size > 8 * 1024 * 1024) return NextResponse.json({ error: "Image must be under 8 MB" }, { status: 400 });

    const supabase = getSupabaseAdmin();
    const ext = file.name.split(".").pop() || "jpg";
    const path = `manual/${randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("checklist-evidence").upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type });
    if (error) throw error;
    return NextResponse.json({ path });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
