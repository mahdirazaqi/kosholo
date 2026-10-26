import { serveUpload } from "@/lib/media/routes";

export async function GET(request: Request, { params }: RouteContext<"/api/media/[uploadId]">) {
  return serveUpload(request, (await params).uploadId, "main");
}

export const HEAD = GET;
