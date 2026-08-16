import { Repository } from "./src/db/repository";
async function clear() {
  await Repository.clearSystemExportJobs(1);
  console.log("Cleared system export jobs");
}
clear().catch(console.error);
