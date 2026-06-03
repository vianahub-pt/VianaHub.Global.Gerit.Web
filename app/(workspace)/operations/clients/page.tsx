import { redirect } from "next/navigation";

export default function OldClientsRedirect() {
  redirect("/clients/");
}
