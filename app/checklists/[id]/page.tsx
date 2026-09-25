import ChecklistRunner from "./runner";

export default async function ChecklistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ChecklistRunner checklistId={id} />;
}
