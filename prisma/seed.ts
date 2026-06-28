// Seed script — creates demo data for testing
// Run with: npx tsx prisma/seed.ts

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

function extractPgUrl(): string {
  const raw = process.env.DATABASE_URL || "";
  const match = raw.match(/api_key=([^&]+)/);
  if (!match) return raw;
  try {
    const decoded = Buffer.from(match[1], "base64").toString("utf-8");
    const config = JSON.parse(decoded);
    return (config.databaseUrl as string).replace("/template1", "/postgres");
  } catch {
    return raw.replace("prisma+postgres://", "postgres://");
  }
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: extractPgUrl() }),
});

async function main() {
  console.log("🌱 Seeding database...");

  // ─── Create Users ──────────────────────────────────────────────────

  const passwordHash = await bcrypt.hash("password123", 12);

  const coach = await prisma.user.upsert({
    where: { email: "coach@ladder.app" },
    update: {},
    create: {
      name: "Coach Alex",
      email: "coach@ladder.app",
      passwordHash,
      role: "COACH",
    },
  });

  const playerData = [
    { name: "Alice Chen", email: "alice@ladder.app" },
    { name: "Bob Wang", email: "bob@ladder.app" },
    { name: "Carol Li", email: "carol@ladder.app" },
    { name: "David Zhang", email: "david@ladder.app" },
    { name: "Eve Liu", email: "eve@ladder.app" },
    { name: "Frank Wu", email: "frank@ladder.app" },
    { name: "Grace Yang", email: "grace@ladder.app" },
    { name: "Henry Zhao", email: "henry@ladder.app" },
  ];

  const players: { id: string }[] = [];
  for (const p of playerData) {
    const player = await prisma.user.upsert({
      where: { email: p.email },
      update: {},
      create: {
        name: p.name,
        email: p.email,
        passwordHash,
        role: "PLAYER",
      },
    });
    players.push(player);
  }

  console.log(`  ✓ Created ${players.length + 1} users`);

  // ─── Create Group ──────────────────────────────────────────────────

  const group = await prisma.group.upsert({
    where: { invitationCode: "LADDER01" },
    update: {},
    create: {
      name: "Weekend Warriors",
      coachId: coach.id,
      invitationCode: "LADDER01",
    },
  });

  console.log(`  ✓ Created group: ${group.name} (code: ${group.invitationCode})`);

  // ─── Add Members ───────────────────────────────────────────────────

  for (const player of players) {
    await prisma.groupMember.upsert({
      where: {
        groupId_userId: {
          groupId: group.id,
          userId: player.id,
        },
      },
      update: {},
      create: {
        groupId: group.id,
        userId: player.id,
        status: "ACTIVE",
      },
    });
  }

  // Also add coach as a member
  await prisma.groupMember.upsert({
    where: {
      groupId_userId: {
        groupId: group.id,
        userId: coach.id,
      },
    },
    update: {},
    create: {
      groupId: group.id,
      userId: coach.id,
      status: "ACTIVE",
    },
  });

  console.log(`  ✓ Added ${players.length + 1} members`);

  // ─── Create Tournament ─────────────────────────────────────────────

  const nextSaturday = new Date();
  nextSaturday.setDate(nextSaturday.getDate() + ((6 - nextSaturday.getDay()) % 7) + 1);
  nextSaturday.setHours(9, 0, 0, 0);

  const deadline = new Date(nextSaturday);
  deadline.setDate(deadline.getDate() - 2);
  deadline.setHours(18, 0, 0, 0);

  const tournament = await prisma.tournament.create({
    data: {
      groupId: group.id,
      dateTime: nextSaturday,
      signupDeadline: deadline,
      formatType: "ROUND_ROBIN",
      matchType: "SINGLES",
      totalRounds: 1,
      status: "SIGNUP_OPEN",
    },
  });

  console.log(
    `  ✓ Created tournament: ${nextSaturday.toLocaleDateString()} (${tournament.matchType} ${tournament.formatType})`
  );

  // ─── Create Registrations ──────────────────────────────────────────

  // Register first 6 players (some with partners for doubles demo)
  for (let i = 0; i < 6; i++) {
    await prisma.registration.create({
      data: {
        tournamentId: tournament.id,
        userId: players[i].id,
        partnerId: i % 2 === 0 && i + 1 < 6 ? players[i + 1].id : null,
      },
    });
  }

  console.log(`  ✓ Created 6 registrations`);

  // ─── Create Ladders ────────────────────────────────────────────────

  const ladderA = await prisma.weeklyLadder.create({
    data: {
      tournamentId: tournament.id,
      label: "Ladder A",
      weekNumber: 1,
    },
  });

  const ladderB = await prisma.weeklyLadder.create({
    data: {
      tournamentId: tournament.id,
      label: "Ladder B",
      weekNumber: 1,
    },
  });

  console.log(`  ✓ Created 2 ladders`);

  // ─── Assign Players to Ladders ─────────────────────────────────────

  const registrations = await prisma.registration.findMany({
    where: { tournamentId: tournament.id },
  });

  // Top 3 to Ladder A, rest to Ladder B
  for (let i = 0; i < registrations.length; i++) {
    await prisma.registration.update({
      where: { id: registrations[i].id },
      data: { ladderId: i < 3 ? ladderA.id : ladderB.id },
    });
  }

  // ─── Generate Matches for Ladder A ─────────────────────────────────

  const ladderAPlayers: string[] = registrations
    .filter((r: { ladderId: string | null }) => r.ladderId === ladderA.id)
    .map((r: { userId: string }) => r.userId);

  // Simple Round Robin: everyone plays everyone once
  for (let i = 0; i < ladderAPlayers.length; i++) {
    for (let j = i + 1; j < ladderAPlayers.length; j++) {
      await prisma.match.create({
        data: {
          tournamentId: tournament.id,
          ladderId: ladderA.id,
          roundNumber: 1,
          player1Id: ladderAPlayers[i],
          player2Id: ladderAPlayers[j],
          status: "PENDING",
          courtNumber: i + 1,
        },
      });
    }
  }

  // Ladder B: one match
  const ladderBPlayers: string[] = registrations
    .filter((r: { ladderId: string | null }) => r.ladderId === ladderB.id)
    .map((r: { userId: string }) => r.userId);

  if (ladderBPlayers.length >= 2) {
    await prisma.match.create({
      data: {
        tournamentId: tournament.id,
        ladderId: ladderB.id,
        roundNumber: 1,
        player1Id: ladderBPlayers[0],
        player2Id: ladderBPlayers[1],
        status: "PENDING",
        courtNumber: 3,
      },
    });

    if (ladderBPlayers.length >= 3) {
      await prisma.match.create({
        data: {
          tournamentId: tournament.id,
          ladderId: ladderB.id,
          roundNumber: 1,
          player1Id: ladderBPlayers[0],
          player2Id: ladderBPlayers[2],
          status: "PENDING",
          courtNumber: 4,
        },
      });
    }
  }

  const matchCount = await prisma.match.count({
    where: { tournamentId: tournament.id },
  });
  console.log(`  ✓ Generated ${matchCount} matches`);

  console.log("\n✅ Seed complete!");
  console.log("\n📋 Demo Credentials:");
  console.log("   Coach:  coach@ladder.app / password123");
  console.log("   Player: alice@ladder.app / password123");
  console.log(`   Invite Code: ${group.invitationCode}`);
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
