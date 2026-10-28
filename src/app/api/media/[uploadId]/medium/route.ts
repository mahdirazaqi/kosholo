import { serveUpload } from "@/lib/media/routes";

export async function GET(request: Request, { params }: RouteContext<"/api/media/[uploadId]/medium">) {
  return serveUpload(request, (await params).uploadId, "medium");
}

export const HEAD = GET;
