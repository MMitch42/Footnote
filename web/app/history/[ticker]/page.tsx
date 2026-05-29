import { redirect } from "next/navigation";

// Historical timeline is coming soon — redirect to home for now
export default async function HistoryPage() {
  redirect("/");
}
