import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST /api/ladders — Create ladders for a tournament (coach only)
// Supports carry-over from previous week
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "COACH") {
    return NextResponse.json(
      { error: "Only coaches can manage ladders" },
      { status: 403 }
    );
  }

  const body = await req.json();
  const { tournamentId, labels, carryOverFromWeek, makeNew } = body;
  // labels: ["Ladder A", "Ladder B", "Ladder C"]
  // carryOverFromWeek: number (week number to carry over from)
  // makeNew: boolean (if true, ignore carry-over)

  if (!tournamentId || !labels || !Array.isArray(labels)) {
    return NextResponse.json(
      { error: "tournamentId and labels array are required" },
      { status: 400 }
    );
  }

  // Verify ownership
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

  // Determine the current week number
  const lastWeek = await prisma.weeklyLadder.findFirst({
    where: { tournamentId },
    orderBy: { weekNumber: "desc" },
  });
  const currentWeek = (lastWeek?.weekNumber ?? 0) + 1;

  // Create ladders
  const ladders = [];
  for (const label of labels) {
    const ladder = await prisma.weeklyLadder.create({
      data: {
        tournamentId,
        label,
        weekNumber: currentWeek,
      },
    });
    ladders.push(ladder);
  }

  // Handle carry-over logic
  if (!makeNew && carryOverFromWeek) {
    // Get previous week's ladders
    const prevLadders = await prisma.weeklyLadder.findMany({
      where: { tournamentId, weekNumber: carryOverFromWeek },
      include: { registrations: true },
    });

    // Map old labels to new ladders
    const newLadderMap = new Map(ladders.map((l) => [l.label, l.id]));

    for (const prevLadder of prevLadders) {
      const newLadderId = newLadderMap.get(prevLadder.label);
      if (!newLadderId) continue;

      // Carry over registrations
      for (const reg of prevLadder.registrations) {
        await prisma.registration.update({
          where: { id: reg.id },
          data: { ladderId: newLadderId },
        });
      }
    }
  }

  return NextResponse.json({ ladders, weekNumber: currentWeek }, { status: 201 });
}

// GET /api/ladders?tournamentId=xxx&weekNumber=xxx — Get ladders
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const tournamentId = searchParams.get("tournamentId");
  const weekNumber = searchParams.get("weekNumber");

  if (!tournamentId) {
    return NextResponse.json(
      { error: "tournamentId is required" },
      { status: 400 }
    );
  }

  const where: Record<string, unknown> = { tournamentId };
  if (weekNumber) {
    where.weekNumber = parseInt(weekNumber, 10);
  }

  const ladders = await prisma.weeklyLadder.findMany({
    where,
    include: {
      registrations: {
        include: {
          user: { select: { id: true, name: true, email: true } },
          partner: { select: { id: true, name: true } },
        },
      },
      matches: {
        include: {
          player1: { select: { id: true, name: true } },
          player2: { select: { id: true, name: true } },
        },
        orderBy: [{ roundNumber: "asc" }, { matchOrder: "asc" }],
      },
    },
    orderBy: { label: "asc" },
  });

  return NextResponse.json(ladders);
}

// PATCH /api/ladders — Move player between ladders (promote/demote)
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "COACH") {
    return NextResponse.json(
      { error: "Only coaches can move players" },
      { status: 403 }
    );
  }

  const body = await req.json();
  const { registrationId, toLadderId } = body;

  if (!registrationId || !toLadderId) {
    return NextResponse.json(
      { error: "registrationId and toLadderId are required" },
      { status: 400 }
    );
  }

  const registration = await prisma.registration.findUnique({
    where: { id: registrationId },
    include: {
      tournament: { include: { group: true } },
    },
  });

  if (
    !registration ||
    registration.tournament.group.coachId !== session.user.id
  ) {
    return NextResponse.json(
      { error: "Registration not found or not authorized" },
      { status: 403 }
    );
  }

  // Verify target ladder exists in same tournament
  const targetLadder = await prisma.weeklyLadder.findUnique({
    where: { id: toLadderId },
  });

  if (!targetLadder || targetLadder.tournamentId !== registration.tournamentId) {
    return NextResponse.json(
      { error: "Target ladder not found or belongs to different tournament" },
      { status: 400 }
    );
  }

  const updated = await prisma.registration.update({
    where: { id: registrationId },
    data: { ladderId: toLadderId },
  });

  return NextResponse.json(updated);
}

// DELETE /api/ladders — Remove all ladders and start fresh ("Make New")
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "COACH") {
    return NextResponse.json(
      { error: "Only coaches can reset ladders" },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(req.url);
  const tournamentId = searchParams.get("tournamentId");

  if (!tournamentId) {
    return NextResponse.json(
      { error: "tournamentId is required" },
      { status: 400 }
    );
  }

  // Verify ownership
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

  // Remove ladder assignments from all registrations
  await prisma.registration.updateMany({
    where: { tournamentId },
    data: { ladderId: null },
  });

  // Delete all ladders and their matches (cascade)
  await prisma.weeklyLadder.deleteMany({
    where: { tournamentId },
  });

  return NextResponse.json({ message: "Ladders reset successfully" });
}
