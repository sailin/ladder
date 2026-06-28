"use client";

import { useEffect, useRef, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import type {
  MatchUpdatedEvent,
  LadderUpdatedEvent,
  TournamentStatusEvent,
} from "@/lib/types";

let globalSocket: Socket | null = null;

function getSocket(): Socket {
  if (!globalSocket || !globalSocket.connected) {
    globalSocket = io({
      path: "/api/socket",
    });
  }
  return globalSocket;
}

/**
 * Hook to join a tournament room and listen for real-time updates.
 */
export function useSocket(
  tournamentId: string | null,
  handlers?: {
    onMatchUpdated?: (event: MatchUpdatedEvent) => void;
    onLadderUpdated?: (event: LadderUpdatedEvent) => void;
    onTournamentStatus?: (event: TournamentStatusEvent) => void;
  }
) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!tournamentId) return;

    const socket = getSocket();

    socket.emit("join-tournament", tournamentId);

    const onMatchUpdated = (event: MatchUpdatedEvent) => {
      handlersRef.current?.onMatchUpdated?.(event);
    };

    const onLadderUpdated = (event: LadderUpdatedEvent) => {
      handlersRef.current?.onLadderUpdated?.(event);
    };

    const onTournamentStatus = (event: TournamentStatusEvent) => {
      handlersRef.current?.onTournamentStatus?.(event);
    };

    socket.on("match-updated", onMatchUpdated);
    socket.on("ladder-updated", onLadderUpdated);
    socket.on("tournament-status", onTournamentStatus);

    return () => {
      socket.off("match-updated", onMatchUpdated);
      socket.off("ladder-updated", onLadderUpdated);
      socket.off("tournament-status", onTournamentStatus);
      socket.emit("leave-tournament", tournamentId);
    };
  }, [tournamentId]);
}
