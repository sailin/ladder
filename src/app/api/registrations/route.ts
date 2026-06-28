import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST /api/registrations — Sign up for a tournament
// Supports partner selection for doubles
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { tournamentId, partnerId } = body;

  if (!tournamentId) {
    return NextResponse.json(
      { error: "tournamentId is required" },
      { status: 400 }
    );
  }

  // Verify the tournament exists and signups are open
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: { group: { include: { members: true } } },
  });

  if (!tournament) {
    return NextResponse.json(
      { error: "Tournament not found" },
      { status: 404 }
    );
  }

  if (tournament.status !== "SIGNUP_OPEN") {
    return NextResponse.json(
      { error: "Signups are not open for this tournament" },
      { status: 400 }
    );
  }

  // Check signup deadline
  if (new Date() > new Date(tournament.signupDeadline)) {
    return NextResponse.json(
      { error: "Signup deadline has passed" },
      { status: 400 }
    );
  }

  // Verify user is an active member of the group
  const isMember = tournament.group.members.some(
    (m: { userId: string; status: string }) => m.userId === session.user!.id && m.status === "ACTIVE"
  );
  if (!isMember && tournament.group.coachId !== session.user.id) {
    return NextResponse.json(
      { error: "You are not a member of this group" },
      { status: 403 }
    );
  }

  // Check if already registered
  const existing = await prisma.registration.findUnique({
    where: {
      tournamentId_userId: {
        tournamentId,
        userId: session.user.id,
      },
    },
  });

  if (existing) {
    return NextResponse.json(
      { error: "Already registered for this tournament" },
      { status: 409 }
    );
  }

  // For doubles: validate partner
  if (partnerId) {
    if (tournament.matchType !== "DOUBLES") {
      return NextResponse.json(
        { error: "Partner selection is only available for doubles tournaments" },
        { status: 400 }
      );
    }

    // Verify partner exists and is in the same group
    const partnerMember = tournament.group.members.find(
      (m: { userId: string; status: string }) => m.userId === partnerId && m.status === "ACTIVE"
    );
    if (!partnerMember) {
      return NextResponse.json(
        { error: "Partner is not an active member of this group" },
        { status: 400 }
      );
    }

    // Check partner isn't already registered
    const partnerReg = await prisma.registration.findUnique({
      where: {
        tournamentId_userId: {
          tournamentId,
          userId: partnerId,
        },
      },
    });
    if (partnerReg) {
      return NextResponse.json(
        { error: "Your partner is already registered" },
        { status: 409 }
      );
    }

    // Create both registrations (signing player + partner)
    await prisma.registration.create({
      data: {
        tournamentId,
        userId: session.user.id,
        partnerId,
      },
    });

    await prisma.registration.create({
      data: {
        tournamentId,
        userId: partnerId,
        partnerId: session.user.id,
      },
    });

    return NextResponse.json(
      { message: "Both you and your partner have been signed up" },
      { status: 201 }
    );
  }

  // Singles or doubles without partner
  const registration = await prisma.registration.create({
    data: {
      tournamentId,
      userId: session.user.id,
    },
  });

  return NextResponse.json(registration, { status: 201 });
}

// GET /api/registrations?tournamentId=xxx — List registrations
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const tournamentId = searchParams.get("tournamentId");

  if (!tournamentId) {
    return NextResponse.json(
      { error: "tournamentId is required" },
      { status: 400 }
    );
  }

  const registrations = await prisma.registration.findMany({
    where: { tournamentId },
    include: {
      user: { select: { id: true, name: true, email: true } },
      partner: { select: { id: true, name: true } },
      ladder: { select: { id: true, label: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(registrations);
}

// DELETE /api/registrations — Cancel registration
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const registrationId = searchParams.get("id");

  if (!registrationId) {
    return NextResponse.json(
      { error: "Registration ID is required" },
      { status: 400 }
    );
  }

  const registration = await prisma.registration.findUnique({
    where: { id: registrationId },
    include: { tournament: true },
  });

  if (!registration) {
    return NextResponse.json(
      { error: "Registration not found" },
      { status: 404 }
    );
  }

  // Only the player themselves or the group coach can cancel
  const tournament = await prisma.tournament.findUnique({
    where: { id: registration.tournamentId },
    include: { group: true },
  });

  const isCoach = tournament?.group.coachId === session.user.id;
  const isSelf = registration.userId === session.user.id;

  if (!isCoach && !isSelf) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  // If doubles, also cancel partner's registration
  if (registration.partnerId) {
    await prisma.registration.deleteMany({
      where: {
        tournamentId: registration.tournamentId,
        userId: registration.partnerId,
      },
    });
  }

  await prisma.registration.delete({
    where: { id: registrationId },
  });

  return NextResponse.json({ message: "Registration cancelled" });
}
