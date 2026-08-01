import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const placeId = request.nextUrl.searchParams.get("place_id")?.slice(0, 100) ?? "";
  if (!/^(country|geonames):[a-z0-9]+$/i.test(placeId)) return NextResponse.json({ error: "Use a canonical place_id such as country:tr or geonames:745044." }, { status: 400 });
  const file = `/data/results/${placeId.replace(":", "--")}.json`;
  const response = await fetch(new URL(file, request.nextUrl.origin));
  if (response.status === 404) return NextResponse.json({ placeId, resultCount: 0, results: [] });
  if (!response.ok) return NextResponse.json({ error: "The place index is unavailable." }, { status: 503 });
  const results = await response.json();
  return NextResponse.json({ placeId, resultCount: results.length, results }, { headers: { "Cache-Control": "public, max-age=3600" } });
}
