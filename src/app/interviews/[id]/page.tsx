import { notFound } from "next/navigation";
import { requirePageUser } from "@/features/auth/page-guard";
import { getInterviewStore } from "@/features/interviews/store";
import InterviewWorkspace from "@/components/interviews/InterviewWorkspace";
export const dynamic = "force-dynamic";
export default async function InterviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params, user = await requirePageUser(`/interviews/${id}`);
  const session = await getInterviewStore().get(user.id, id);
  if (!session) notFound();
  return <InterviewWorkspace initialSession={session} />;
}
