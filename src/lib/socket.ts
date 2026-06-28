import { Server as NetServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import type { NextApiResponse } from "next";

// ─── Global socket.io singleton ──────────────────────────────────────

interface SocketServerWithIO {
  io: SocketIOServer | undefined;
}

const globalForSocket = globalThis as unknown as SocketServerWithIO;

export function getIO(): SocketIOServer | undefined {
  return globalForSocket.io;
}

export function initSocketServer(server: NetServer): SocketIOServer {
  if (globalForSocket.io) {
    return globalForSocket.io;
  }

  const io = new SocketIOServer(server, {
    path: "/api/socket",
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    console.log(`[socket] client connected: ${socket.id}`);

    // Join a tournament room to receive real-time updates
    socket.on("join-tournament", (tournamentId: string) => {
      socket.join(`tournament:${tournamentId}`);
      console.log(`[socket] ${socket.id} joined tournament:${tournamentId}`);
    });

    socket.on("leave-tournament", (tournamentId: string) => {
      socket.leave(`tournament:${tournamentId}`);
    });

    socket.on("disconnect", () => {
      console.log(`[socket] client disconnected: ${socket.id}`);
    });
  });

  globalForSocket.io = io;
  return io;
}

// ─── Helper to emit real-time events ─────────────────────────────────

export function emitMatchUpdated(
  tournamentId: string,
  matchId: string,
  match: unknown
) {
  const io = getIO();
  if (io) {
    io.to(`tournament:${tournamentId}`).emit("match-updated", {
      tournamentId,
      matchId,
      match,
    });
  }
}

export function emitLadderUpdated(tournamentId: string, ladderId: string) {
  const io = getIO();
  if (io) {
    io.to(`tournament:${tournamentId}`).emit("ladder-updated", {
      tournamentId,
      ladderId,
    });
  }
}

export function emitTournamentStatus(
  tournamentId: string,
  status: string
) {
  const io = getIO();
  if (io) {
    io.to(`tournament:${tournamentId}`).emit("tournament-status", {
      tournamentId,
      status,
    });
  }
}
