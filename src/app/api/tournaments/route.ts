import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/tournaments?groupId=xxx — List tournaments for a group
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const groupId = searchParams.get("groupId");
  const status = searchParams.get("status"); // optional filter

  const where: Record<string, unknown> = {};

  if (groupId) {
    where.groupId = groupId;
  }

  if (status) {
    where.status = status;
  }

  if (!groupId) {
    // If no groupId, show tournaments from groups the user is in
    const memberships = await prisma.groupMember.findMany({
      where: { userId: session.user.id, status: "ACTIVE" },
      select: { groupId: true },
    });
    const userGroupIds = memberships.map((m: { groupId: string }) => m.groupId);

    // Also include coached groups
    const coachedGroups = await prisma.group.findMany({
      where: { coachId: session.user.id },
      select: { id: true },
    });
    const coachGroupIds = coachedGroups.map((g: { id: string }) => g.id);

    const allGroupIds = [...new Set([...userGroupIds, ...coachGroupIds])];
    where.groupId = { in: allGroupIds };
  }

  const tournaments = await prisma.tournament.findMany({
    where,
    include: {
      group: { select: { id: true, name: true } },
      _count: { select: { registrations: true, matches: true } },
    },
    orderBy: { dateTime: "desc" },
  });

  return NextResponse.json(tournaments);
}

// POST /api/tournaments — Create a new tournament (coach only)
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "COACH") {
    return NextResponse.json(
      { error: "Only coaches can create tournaments" },
      { status: 403 }
    );
  }

  const body = await req.json();
  const { groupId, dateTime, signupDeadline, formatType, matchType, totalRounds } = body;

  if (!groupId || !dateTime || !signupDeadline || !formatType || !matchType) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 }
    );
  }

  // Verify coach owns this group
  const group = await prisma.group.findUnique({ where: { id: groupId } });
  if (!group || group.coachId !== session.user.id) {
    return NextResponse.json(
      { error: "Group not found or not authorized" },
      { status: 403 }
    );
  }

  const tournament = await prisma.tournament.create({
    data: {
      groupId,
      dateTime: new Date(dateTime),
      signupDeadline: new Date(signupDeadline),
      formatType,
      matchType,
      totalRounds: totalRounds || 1,
      status: "SIGNUP_OPEN",
    },
  });

  return NextResponse.json(tournament, { status: 201 });
}

// PATCH /api/tournaments — Update tournament settings (coach only)
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "COACH") {
    return NextResponse.json(
      { error: "Only coaches can update tournaments" },
      { status: 403 }
    );
  }

  const body = await req.json();
  const { tournamentId, signupDeadline, totalRounds, status } = body;

  if (!tournamentId) {
    return NextResponse.json(
      { error: "tournamentId is required" },
      { status: 400 }
    );
  }

  // Verify ownership via group
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: { group: true },
  });

  if (!tournament || tournament.group.coachId !== session.user.id) {
    return NextResponse.json(
      { error: "Tournament not found or not authorized" },
      { status: 403 }
    );
  }

  const updateData: Record<string, unknown> = {};
  if (signupDeadline) updateData.signupDeadline = new Date(signupDeadline);
  if (totalRounds !== undefined) updateData.totalRounds = totalRounds;
  if (status) updateData.status = status;

  const updated = await prisma.tournament.update({
    where: { id: tournamentId },
    data: updateData,
  });

  return NextResponse.json(updated);
}
