import { listErrorTypes } from "@/lib/examples"
import { SubmitForm } from "./submit-form"

export default async function SubmitPage() {
  const errorTypes = await listErrorTypes()
  return <SubmitForm errorTypes={errorTypes} />
}
