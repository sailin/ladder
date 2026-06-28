import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateRoundRobin } from "@/lib/match-engine";
import { emitMatchUpdated, emitLadderUpdated } from "@/lib/socket";

// POST /api/registrations/search — Search for partner by name within a group
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { groupId, query } = body;

  if (!groupId || !query) {
    return NextResponse.json(
      { error: "groupId and query are required" },
      { status: 400 }
    );
  }

  const members = await prisma.groupMember.findMany({
    where: {
      groupId,
      status: "ACTIVE",
      userId: { not: session.user.id }, // Don't show self
      user: {
        name: { contains: query, mode: "insensitive" },
      },
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
    take: 10,
  });

  return NextResponse.json(
    members.map((m: { user: { id: string; name: string; email: string } }) => m.user)
  );
}
