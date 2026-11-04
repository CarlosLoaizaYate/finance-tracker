import { NextResponse } from "next/server";
import { ZodError } from "zod";

/** Logs the failure with enough context to find it, and returns a JSON error response instead
 * of letting Next.js fall back to its default (non-JSON) 500 page. */
export function apiError(route: string, step: string, error: unknown) {
  console.error(`[${route}] ${step}:`, error);
  if (error instanceof ZodError) {
    return NextResponse.json({ error: "Invalid request", details: error.issues }, { status: 400 });
  }
  return NextResponse.json({ error: `Failed to ${step.toLowerCase()}` }, { status: 500 });
}
