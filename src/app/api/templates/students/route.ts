import { buildStudentTemplate } from "@/lib/excel-read";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return new Response("Not authorised", { status: 403 });
  }

  const buffer = await buildStudentTemplate();

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="student-import-template.xlsx"',
    },
  });
}
