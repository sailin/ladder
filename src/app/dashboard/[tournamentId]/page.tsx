"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import { useSocket } from "@/hooks/useSocket";

interface Match {
  id: string;
  roundNumber: number;
  player1Id: string;
  player2Id: string;
  player1Score: number | null;
  player2Score: number | null;
  status: string;
  courtNumber: number | null;
  matchOrder: number;
  player1: { id: string; name: string };
  player2: { id: string; name: string };
  ladder: { id: string; label: string };
}

interface Ladder {
  id: string;
  label: string;
  weekNumber: number;
  matches: Match[];
}

export default function ScoreSubmissionPage() {
  const { data: session } = useSession();
  const params = useParams();
  const router = useRouter();
  const tournamentId = params.tournamentId as string;

  const [ladders, setLadders] = useState<Ladder[]>([]);
  const [activeLadder, setActiveLadder] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [editingMatch, setEditingMatch] = useState<Match | null>(null);
  const [scores, setScores] = useState({ p1: "", p2: "" });

  const fetchLadders = useCallback(async () => {
    const res = await fetch(`/api/ladders?tournamentId=${tournamentId}`);
    if (res.ok) {
      const data = await res.json();
      setLadders(data);
      if (data.length > 0 && !activeLadder) {
        setActiveLadder(data[0].label);
      }
    }
    setLoading(false);
  }, [tournamentId, activeLadder]);

  useEffect(() => {
    if (session) fetchLadders();
  }, [session, fetchLadders]);

  // Real-time updates
  useSocket(tournamentId, {
    onMatchUpdated: () => {
      fetchLadders();
    },
    onLadderUpdated: () => {
      fetchLadders();
    },
  });

  const handleSubmitScore = async (matchId: string) => {
    const p1Score = parseInt(scores.p1);
    const p2Score = parseInt(scores.p2);

    if (isNaN(p1Score) || isNaN(p2Score)) {
      alert("Please enter valid scores for both players");
      return;
    }

    setSubmitting(matchId);
    try {
      const res = await fetch("/api/matches", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchId,
          player1Score: p1Score,
          player2Score: p2Score,
        }),
      });

      if (res.ok) {
        setEditingMatch(null);
        setScores({ p1: "", p2: "" });
        await fetchLadders();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to submit score");
      }
    } catch {
      alert("Network error");
    } finally {
      setSubmitting(null);
    }
  };

  const statusColors: Record<string, string> = {
    PENDING: "bg-gray-100 text-gray-600",
    IN_PROGRESS: "bg-blue-100 text-blue-700",
    COMPLETED: "bg-green-100 text-green-700",
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  const currentLadder = ladders.find((l) => l.label === activeLadder);
  const allMatches = currentLadder?.matches || [];

  // Group matches by round
  const rounds = new Map<number, Match[]>();
  for (const match of allMatches) {
    if (!rounds.has(match.roundNumber)) {
      rounds.set(match.roundNumber, []);
    }
    rounds.get(match.roundNumber)!.push(match);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 bg-white border-b border-gray-100 z-10">
        <div className="px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => router.push("/dashboard")}
            className="text-gray-400"
          >
            ←
          </button>
          <h1 className="text-lg font-semibold">Submit Scores</h1>
        </div>

        {/* Ladder Tabs */}
        <div className="flex overflow-x-auto border-b border-gray-100 no-scrollbar">
          {ladders.map((ladder) => (
            <button
              key={ladder.id}
              onClick={() => setActiveLadder(ladder.label)}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors ${
                activeLadder === ladder.label
                  ? "text-blue-600 border-b-2 border-blue-600"
                  : "text-gray-400"
              }`}
            >
              {ladder.label}
            </button>
          ))}
        </div>
      </header>

      <main className="p-4 pb-8">
        {!currentLadder && (
          <div className="text-center py-12">
            <p className="text-gray-400">No ladders available</p>
          </div>
        )}

        {currentLadder && allMatches.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-400 text-sm">No matches scheduled yet</p>
            <p className="text-gray-300 text-xs mt-1">
              Wait for the coach to generate matchups
            </p>
          </div>
        )}

        {/* Rounds */}
        {Array.from(rounds.entries()).map(([roundNum, matches]) => (
          <div key={roundNum} className="mb-6">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3 px-1">
              Round {roundNum}
            </h2>

            <div className="space-y-3">
              {matches.map((match) => {
                const isMyMatch =
                  match.player1Id === session?.user?.id ||
                  match.player2Id === session?.user?.id;
                const isComplete = match.status === "COMPLETED";

                return (
                  <div
                    key={match.id}
                    className={`bg-white rounded-xl border p-4 ${
                      isMyMatch && !isComplete
                        ? "border-blue-200 bg-blue-50"
                        : "border-gray-100"
                    }`}
                  >
                    {/* Players & Score */}
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span
                            className={`text-sm ${
                              match.player1Id === session?.user?.id
                                ? "font-bold text-blue-700"
                                : "font-medium"
                            }`}
                          >
                            {match.player1.name}
                            {match.player1Id === session?.user?.id && " (You)"}
                          </span>
                          <span className="text-lg font-bold mx-2 min-w-[1.5rem] text-center">
                            {match.player1Score ?? "-"}
                          </span>
                        </div>
                        <div className="text-xs text-gray-300 text-center my-0.5">
                          vs
                        </div>
                        <div className="flex items-center justify-between">
                          <span
                            className={`text-sm ${
                              match.player2Id === session?.user?.id
                                ? "font-bold text-blue-700"
                                : "font-medium"
                            }`}
                          >
                            {match.player2.name}
                            {match.player2Id === session?.user?.id && " (You)"}
                          </span>
                          <span className="text-lg font-bold mx-2 min-w-[1.5rem] text-center">
                            {match.player2Score ?? "-"}
                          </span>
                        </div>
                      </div>

                      {/* Status */}
                      <div className="flex flex-col items-end gap-1.5">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ${
                            statusColors[match.status]
                          }`}
                        >
                          {match.status}
                        </span>

                        {match.courtNumber && (
                          <span className="text-xs text-gray-400">
                            Court {match.courtNumber}
                          </span>
                        )}

                        {/* Submit button for my pending matches */}
                        {isMyMatch && !isComplete && (
                          <button
                            onClick={() => {
                              setEditingMatch(
                                editingMatch?.id === match.id ? null : match
                              );
                              setScores({ p1: "", p2: "" });
                            }}
                            className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg font-medium"
                          >
                            Report Score
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Score Input Form */}
                    {editingMatch?.id === match.id && (
                      <div className="mt-4 pt-4 border-t border-gray-200">
                        <p className="text-xs text-gray-500 mb-2">
                          Enter the final scores
                        </p>
                        <div className="flex items-center gap-3">
                          <div className="flex-1">
                            <label className="text-xs text-gray-400">
                              {match.player1.name}
                            </label>
                            <input
                              type="number"
                              min={0}
                              value={scores.p1}
                              onChange={(e) =>
                                setScores({ ...scores, p1: e.target.value })
                              }
                              className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm text-center"
                              placeholder="0"
                              autoFocus
                            />
                          </div>
                          <span className="text-gray-300 mt-4">-</span>
                          <div className="flex-1">
                            <label className="text-xs text-gray-400">
                              {match.player2.name}
                            </label>
                            <input
                              type="number"
                              min={0}
                              value={scores.p2}
                              onChange={(e) =>
                                setScores({ ...scores, p2: e.target.value })
                              }
                              className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm text-center"
                              placeholder="0"
                            />
                          </div>
                        </div>
                        <div className="flex gap-2 mt-3">
                          <button
                            onClick={() => setEditingMatch(null)}
                            className="flex-1 py-2 text-sm text-gray-500 bg-gray-100 rounded-lg font-medium"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleSubmitScore(match.id)}
                            disabled={!!submitting}
                            className="flex-1 py-2 text-sm text-white bg-green-600 rounded-lg font-medium hover:bg-green-700 disabled:opacity-50"
                          >
                            {submitting === match.id
                              ? "Submitting..."
                              : "Submit Score"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </main>
    </div>
  );
}
