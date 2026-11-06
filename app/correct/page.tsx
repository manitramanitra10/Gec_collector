import { listBatches, listErrorTypes } from "@/lib/examples"
import { CorrectionWorkbench } from "./workbench"

export default async function CorrectPage() {
  const [errorTypes, batches] = await Promise.all([listErrorTypes(), listBatches()])
  return <CorrectionWorkbench errorTypes={errorTypes} initialBatches={batches} />
}
