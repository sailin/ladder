import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST /api/groups/join — Join a group via invitation code
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { invitationCode } = body;

  if (!invitationCode) {
    return NextResponse.json(
      { error: "Invitation code is required" },
      { status: 400 }
    );
  }

  const group = await prisma.group.findUnique({
    where: { invitationCode: invitationCode.toUpperCase() },
  });

  if (!group) {
    return NextResponse.json(
      { error: "Invalid invitation code" },
      { status: 404 }
    );
  }

  // Check if already a member
  const existing = await prisma.groupMember.findUnique({
    where: {
      groupId_userId: {
        groupId: group.id,
        userId: session.user.id,
      },
    },
  });

  if (existing) {
    if (existing.status === "KICKED") {
      return NextResponse.json(
        { error: "You have been removed from this group" },
        { status: 403 }
      );
    }
    return NextResponse.json({ message: "Already a member", group });
  }

  await prisma.groupMember.create({
    data: {
      groupId: group.id,
      userId: session.user.id,
      status: "ACTIVE",
    },
  });

  return NextResponse.json({ message: "Joined successfully", group });
}
