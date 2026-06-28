import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// PATCH /api/groups/members — Kick/remove a member (coach only)
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "COACH") {
    return NextResponse.json(
      { error: "Only coaches can manage members" },
      { status: 403 }
    );
  }

  const body = await req.json();
  const { groupId, userId, action } = body; // action: "KICK" | "REACTIVATE"

  if (!groupId || !userId) {
    return NextResponse.json(
      { error: "groupId and userId are required" },
      { status: 400 }
    );
  }

  // Verify the coach owns this group
  const group = await prisma.group.findUnique({
    where: { id: groupId },
  });

  if (!group || group.coachId !== session.user.id) {
    return NextResponse.json(
      { error: "Group not found or not authorized" },
      { status: 403 }
    );
  }

  const member = await prisma.groupMember.findUnique({
    where: {
      groupId_userId: { groupId, userId },
    },
  });

  if (!member) {
    return NextResponse.json(
      { error: "Member not found" },
      { status: 404 }
    );
  }

  const newStatus = action === "REACTIVATE" ? "ACTIVE" : "KICKED";

  const updated = await prisma.groupMember.update({
    where: { id: member.id },
    data: { status: newStatus },
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  return NextResponse.json(updated);
}

// GET /api/groups/members?groupId=xxx — List members of a group
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const groupId = searchParams.get("groupId");

  if (!groupId) {
    return NextResponse.json(
      { error: "groupId is required" },
      { status: 400 }
    );
  }

  // Verify membership or coach ownership
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    include: {
      members: {
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });

  if (!group) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }

  const isCoach = group.coachId === session.user.id;
  const isMember = group.members.some(
    (m: { userId: string; status: string }) => m.userId === session.user!.id && m.status === "ACTIVE"
  );

  if (!isCoach && !isMember) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  return NextResponse.json(group.members);
}
