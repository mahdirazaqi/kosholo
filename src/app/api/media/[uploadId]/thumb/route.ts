import { serveUpload } from "@/lib/media/routes";

export async function GET(request: Request, { params }: RouteContext<"/api/media/[uploadId]/thumb">) {
  return serveUpload(request, (await params).uploadId, "thumb");
}

export const HEAD = GET;
