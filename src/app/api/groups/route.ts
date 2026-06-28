import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { v4 as uuid } from "uuid";

// GET /api/groups — List groups for the authenticated user
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  if (session.user.role === "COACH") {
    // Coaches see groups they created
    const groups = await prisma.group.findMany({
      where: { coachId: userId },
      include: {
        _count: { select: { members: { where: { status: "ACTIVE" } } } },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(groups);
  }

  // Players see groups they're members of
  const memberships = await prisma.groupMember.findMany({
    where: { userId, status: "ACTIVE" },
    include: {
      group: {
        include: {
          coach: { select: { id: true, name: true, email: true } },
          _count: { select: { members: { where: { status: "ACTIVE" } } } },
        },
      },
    },
  });

  return NextResponse.json(
    memberships.map((m: { group: Record<string, unknown>; status: string }) => ({
      ...m.group,
      memberStatus: m.status,
    }))
  );
}

// POST /api/groups — Create a new group (coach only)
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "COACH") {
    return NextResponse.json(
      { error: "Only coaches can create groups" },
      { status: 403 }
    );
  }

  const body = await req.json();
  const { name } = body;

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json(
      { error: "Group name is required" },
      { status: 400 }
    );
  }

  const group = await prisma.group.create({
    data: {
      name: name.trim(),
      coachId: session.user.id,
      invitationCode: uuid().slice(0, 8).toUpperCase(),
    },
  });

  return NextResponse.json(group, { status: 201 });
}
