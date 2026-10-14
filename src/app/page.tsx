import { readState } from "@/lib/store";
import Constellation from "@/components/Constellation";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Control — Ashar's Projects",
  description: "Live constellation of every project, application and deadline.",
};

export default async function Page() {
  const state = await readState();
  return <Constellation initial={state} />;
}
