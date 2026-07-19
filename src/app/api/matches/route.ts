import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateRoundRobin } from "@/lib/match-engine";
import { emitMatchUpdated, emitLadderUpdated } from "@/lib/socket";

// POST /api/matches/generate — Auto-generate Round Robin matches for a ladder (coach only)
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "COACH") {
    return NextResponse.json(
      { error: "Only coaches can generate matches" },
      { status: 403 }
    );
  }

  const body = await req.json();
  const { ladderId } = body;

  if (!ladderId) {
    return NextResponse.json(
      { error: "ladderId is required" },
      { status: 400 }
    );
  }

  const ladder = await prisma.weeklyLadder.findUnique({
    where: { id: ladderId },
    include: {
      tournament: { include: { group: true } },
      registrations: true,
    },
  });

  if (!ladder || ladder.tournament.group.coachId !== session.user.id) {
    return NextResponse.json(
      { error: "Ladder not found or not authorized" },
      { status: 403 }
    );
  }

  const playerIds = ladder.registrations.map((reg: { userId: string }) => reg.userId);

  if (playerIds.length < 2) {
    return NextResponse.json(
      { error: "Need at least 2 players to generate matches" },
      { status: 400 }
    );
  }

  // Delete existing matches for this ladder
  await prisma.match.deleteMany({ where: { ladderId } });

  // Generate Round Robin schedule — each player plays every other player once
  const schedule = generateRoundRobin(playerIds);

  const matches = [];
  for (let i = 0; i < schedule.length; i++) {
    const m = schedule[i];
    const match = await prisma.match.create({
      data: {
        tournamentId: ladder.tournamentId,
        ladderId,
        roundNumber: m.round,
        player1Id: m.player1Id,
        player2Id: m.player2Id,
        matchOrder: i,
        status: "PENDING",
      },
      include: {
        player1: { select: { id: true, name: true } },
        player2: { select: { id: true, name: true } },
      },
    });
    matches.push(match);
  }

  // Emit real-time update
  emitLadderUpdated(ladder.tournamentId, ladderId);

  return NextResponse.json(matches, { status: 201 });
}

// GET /api/matches?ladderId=xxx — Get matches for a ladder
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const ladderId = searchParams.get("ladderId");
  const tournamentId = searchParams.get("tournamentId");

  if (!ladderId && !tournamentId) {
    return NextResponse.json(
      { error: "ladderId or tournamentId is required" },
      { status: 400 }
    );
  }

  const where: Record<string, unknown> = {};
  if (ladderId) where.ladderId = ladderId;
  if (tournamentId) where.tournamentId = tournamentId;

  const matches = await prisma.match.findMany({
    where,
    include: {
      player1: { select: { id: true, name: true } },
      player2: { select: { id: true, name: true } },
      ladder: { select: { id: true, label: true } },
    },
    orderBy: [{ roundNumber: "asc" }, { matchOrder: "asc" }],
  });

  return NextResponse.json(matches);
}

// PATCH /api/matches — Update a match (coach: revise players/score; player: submit score)
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { matchId, player1Id, player2Id, player1Score, player2Score, status } = body;

  if (!matchId) {
    return NextResponse.json(
      { error: "matchId is required" },
      { status: 400 }
    );
  }

  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: { tournament: { include: { group: true } } },
  });

  if (!match) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }

  const isCoach = match.tournament.group.coachId === session.user.id;
  const isPlayer = match.player1Id === session.user.id || match.player2Id === session.user.id;

  // Score submission by player
  if (player1Score !== undefined || player2Score !== undefined) {
    if (!isPlayer && !isCoach) {
      return NextResponse.json(
        { error: "Only players in the match or coaches can submit scores" },
        { status: 403 }
      );
    }

    if (match.status === "COMPLETED" && !isCoach) {
      return NextResponse.json(
        { error: "Match is already completed" },
        { status: 400 }
      );
    }

    const updated = await prisma.match.update({
      where: { id: matchId },
      data: {
        player1Score: player1Score ?? match.player1Score,
        player2Score: player2Score ?? match.player2Score,
        status: "COMPLETED",
      },
      include: {
        player1: { select: { id: true, name: true } },
        player2: { select: { id: true, name: true } },
        ladder: { select: { id: true, label: true } },
      },
    });

    emitMatchUpdated(match.tournamentId, matchId, updated);
    return NextResponse.json(updated);
  }

  // Coach-only operations: swap players, change status
  if (!isCoach) {
    return NextResponse.json(
      { error: "Only coaches can modify match details" },
      { status: 403 }
    );
  }

  const updateData: Record<string, unknown> = {};
  if (player1Id !== undefined) updateData.player1Id = player1Id;
  if (player2Id !== undefined) updateData.player2Id = player2Id;
  if (status !== undefined) updateData.status = status;

  const updated = await prisma.match.update({
    where: { id: matchId },
    data: updateData,
    include: {
      player1: { select: { id: true, name: true } },
      player2: { select: { id: true, name: true } },
      ladder: { select: { id: true, label: true } },
    },
  });

  emitMatchUpdated(match.tournamentId, matchId, updated);
  return NextResponse.json(updated);
}

// DELETE /api/matches — Delete a match (coach only, mid-ladder revision)
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "COACH") {
    return NextResponse.json(
      { error: "Only coaches can delete matches" },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(req.url);
  const matchId = searchParams.get("id");

  if (!matchId) {
    return NextResponse.json(
      { error: "Match ID is required" },
      { status: 400 }
    );
  }

  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: { tournament: { include: { group: true } } },
  });

  if (!match || match.tournament.group.coachId !== session.user.id) {
    return NextResponse.json(
      { error: "Match not found or not authorized" },
      { status: 403 }
    );
  }

  await prisma.match.delete({ where: { id: matchId } });

  emitLadderUpdated(match.tournamentId, match.ladderId);

  return NextResponse.json({ message: "Match deleted" });
}

// PUT /api/matches — Create a new match manually (coach: add/insert match mid-tournament)
export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "COACH") {
    return NextResponse.json(
      { error: "Only coaches can create matches" },
      { status: 403 }
    );
  }

  const body = await req.json();
  const { tournamentId, ladderId, roundNumber, player1Id, player2Id, courtNumber } = body;

  if (!tournamentId || !ladderId || !player1Id || !player2Id) {
    return NextResponse.json(
      { error: "tournamentId, ladderId, player1Id, player2Id are required" },
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

  const match = await prisma.match.create({
    data: {
      tournamentId,
      ladderId,
      roundNumber: roundNumber || 1,
      player1Id,
      player2Id,
      courtNumber: courtNumber || null,
      status: "PENDING",
    },
    include: {
      player1: { select: { id: true, name: true } },
      player2: { select: { id: true, name: true } },
    },
  });

  emitLadderUpdated(tournamentId, ladderId);

  return NextResponse.json(match, { status: 201 });
}
