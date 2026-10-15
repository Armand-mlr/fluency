import { notFound } from "next/navigation";
import { LESSONS, lessonById } from "@/content/catalog/lessons";
import { LessonView } from "@/components/LessonView";

export function generateStaticParams() { return LESSONS.map(l => ({ id: l.id })); }
export default async function LessonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lesson = lessonById(id);
  if (!lesson) notFound();
  return <LessonView lesson={lesson}/>;
}
