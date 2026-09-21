import { NextResponse } from "next/server";
import { getLatencies, getDocCount, computeP50P95, ensureLoaded } from "@/lib/moss-server";

export async function GET() {
  await ensureLoaded();
  const lat = getLatencies();
  const { p50, p95 } = computeP50P95(lat);
  const docCount = getDocCount();
  return NextResponse.json({ p50, p95, docCount, sampleSize: lat.length });
}
