import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: { fileId: string } }) {
  const apiKey = process.env.GOOGLE_DRIVE_API_KEY || "";
  if (!apiKey) {
    return NextResponse.json({ ok: false, message: "Google Drive API key missing." }, { status: 500 });
  }

  const fileId = decodeURIComponent(params.fileId);
  const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?key=${apiKey}&alt=media`;
  const response = await fetch(url);

  if (!response.ok || !response.body) {
    return NextResponse.json({ ok: false, message: "Image Drive inaccessible." }, { status: response.status || 500 });
  }

  return new Response(response.body, {
    headers: {
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      "Content-Type": response.headers.get("Content-Type") || "image/jpeg"
    }
  });
}
