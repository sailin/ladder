"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSocket } from "@/hooks/useSocket";

interface Tournament {
  id: string;
  groupId: string;
  dateTime: string;
  signupDeadline: string;
  formatType: string;
  matchType: string;
  totalRounds: number;
  status: string;
  group: { id: string; name: string };
  _count: { registrations: number; matches: number };
}

interface Group {
  id: string;
  name: string;
  invitationCode: string;
  coach?: { name: string };
  _count?: { members: number };
}

function userRole(session: { user?: { role?: string } } | null): string | undefined {
  return session?.user?.role;
}

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const role = userRole(session);
  const router = useRouter();

  // Redirect to login if not authenticated
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"tournaments" | "groups">(
    "tournaments"
  );
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState("");
  const [joining, setJoining] = useState(false);
  const [signingUp, setSigningUp] = useState<string | null>(null);
  const [partnerSearch, setPartnerSearch] = useState("");
  const [partnerResults, setPartnerResults] = useState<
    { id: string; name: string }[]
  >([]);
  const [selectedPartner, setSelectedPartner] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [signupTournament, setSignupTournament] =
    useState<Tournament | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [tRes, gRes] = await Promise.all([
        fetch("/api/tournaments"),
        fetch("/api/groups"),
      ]);
      if (tRes.ok) setTournaments(await tRes.json());
      if (gRes.ok) setGroups(await gRes.json());
    } catch (err) {
      console.error("Failed to fetch data", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (session) fetchData();
  }, [session, fetchData]);

  // Real-time socket for all active tournaments
  useSocket(null);

  const handleJoinGroup = async () => {
    if (!joinCode.trim()) return;
    setJoinError("");
    setJoining(true);
    try {
      const res = await fetch("/api/groups/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invitationCode: joinCode.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setJoinError(data.error || "Failed to join");
      } else {
        setJoinCode("");
        fetchData();
      }
    } catch {
      setJoinError("Network error");
    } finally {
      setJoining(false);
    }
  };

  const handleSignup = async (tournament: Tournament) => {
    if (tournament.matchType === "DOUBLES") {
      setSignupTournament(tournament);
      return;
    }
    await doSignup(tournament.id);
  };

  const doSignup = async (tournamentId: string, partnerId?: string) => {
    setSigningUp(tournamentId);
    try {
      const res = await fetch("/api/registrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tournamentId, partnerId }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Signup failed");
      } else {
        fetchData();
      }
    } catch {
      alert("Network error");
    } finally {
      setSigningUp(null);
      setSignupTournament(null);
      setSelectedPartner(null);
      setPartnerSearch("");
    }
  };

  const searchPartners = async (query: string) => {
    setPartnerSearch(query);
    if (query.length < 2) {
      setPartnerResults([]);
      return;
    }
    try {
      const res = await fetch("/api/registrations/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groupId: signupTournament?.groupId,
          query,
        }),
      });
      if (res.ok) {
        setPartnerResults(await res.json());
      }
    } catch {
      // ignore
    }
  };

  const statusColors: Record<string, string> = {
    SIGNUP_OPEN: "bg-green-100 text-green-700",
    UPCOMING: "bg-blue-100 text-blue-700",
    IN_PROGRESS: "bg-yellow-100 text-yellow-700",
    COMPLETED: "bg-gray-100 text-gray-500",
  };

  const formatLabels: Record<string, string> = {
    ROUND_ROBIN: "Round Robin",
    TEAM: "Team",
    SINGLES: "Singles",
    DOUBLES: "Doubles",
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  // Partner signup modal
  if (signupTournament) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => {
              setSignupTournament(null);
              setSelectedPartner(null);
              setPartnerSearch("");
            }}
            className="text-blue-600 text-sm font-medium"
          >
            Cancel
          </button>
          <h1 className="text-lg font-semibold">Doubles Signup</h1>
        </div>

        <div className="p-4 space-y-4">
          <div className="bg-white rounded-xl p-4 border border-gray-100">
            <p className="text-sm text-gray-500 mb-1">Tournament</p>
            <p className="font-medium">{signupTournament.group.name}</p>
            <p className="text-xs text-gray-400">
              {formatLabels[signupTournament.matchType]} ·{" "}
              {formatLabels[signupTournament.formatType]}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Search for your partner
            </label>
            <input
              type="text"
              value={partnerSearch}
              onChange={(e) => searchPartners(e.target.value)}
              placeholder="Type partner's name..."
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {selectedPartner && (
            <div className="bg-blue-50 rounded-xl p-4 flex items-center justify-between">
              <div>
                <p className="text-sm text-blue-700 font-medium">
                  {selectedPartner.name}
                </p>
                <p className="text-xs text-blue-500">Selected partner</p>
              </div>
              <button
                onClick={() => setSelectedPartner(null)}
                className="text-blue-600 text-sm"
              >
                Change
              </button>
            </div>
          )}

          {!selectedPartner && partnerResults.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-50">
              {partnerResults.map((user) => (
                <button
                  key={user.id}
                  onClick={() => {
                    setSelectedPartner(user);
                    setPartnerSearch(user.name);
                    setPartnerResults([]);
                  }}
                  className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                >
                  <p className="text-sm font-medium">{user.name}</p>
                </button>
              ))}
            </div>
          )}

          <button
            onClick={() => doSignup(signupTournament.id, selectedPartner?.id)}
            disabled={!selectedPartner || !!signingUp}
            className="w-full py-3 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {signingUp
              ? "Signing up..."
              : selectedPartner
              ? `Sign Up with ${selectedPartner.name}`
              : "Select a partner first"}
          </button>

          <button
            onClick={() => doSignup(signupTournament.id)}
            disabled={!!signingUp}
            className="w-full py-3 text-gray-500 text-sm font-medium"
          >
            Sign up without a partner
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 bg-white border-b border-gray-100 z-10">
        <div className="px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl font-bold flex items-center gap-2">
            🏸 Ladder
          </h1>
          <div className="flex items-center gap-2">
            {role === "COACH" && (
              <Link
                href="/coach"
                className="text-sm text-blue-600 font-medium px-3 py-1.5 bg-blue-50 rounded-lg"
              >
                Coach
              </Link>
            )}
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="text-sm text-gray-400"
            >
              Sign Out
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100">
          <button
            onClick={() => setActiveTab("tournaments")}
            className={`flex-1 py-2.5 text-sm font-medium text-center transition-colors ${
              activeTab === "tournaments"
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-gray-400"
            }`}
          >
            Tournaments
          </button>
          <button
            onClick={() => setActiveTab("groups")}
            className={`flex-1 py-2.5 text-sm font-medium text-center transition-colors ${
              activeTab === "groups"
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-gray-400"
            }`}
          >
            Groups
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="p-4 pb-24">
        {activeTab === "tournaments" && (
          <div className="space-y-3">
            {tournaments.length === 0 && (
              <div className="text-center py-12">
                <p className="text-4xl mb-3">🏸</p>
                <p className="text-gray-400 text-sm">No tournaments yet</p>
                <p className="text-gray-300 text-xs mt-1">
                  Join a group to see upcoming tournaments
                </p>
              </div>
            )}

            {tournaments.map((t) => {
              const isRegistered = false; // We'd need to fetch this
              const deadline = new Date(t.signupDeadline);
              const isOpen =
                t.status === "SIGNUP_OPEN" && new Date() < deadline;

              return (
                <div
                  key={t.id}
                  className="bg-white rounded-xl border border-gray-100 p-4"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-semibold text-sm">{t.group.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {new Date(t.dateTime).toLocaleDateString("en-US", {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        statusColors[t.status] || "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {t.status.replace("_", " ")}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-gray-400 mb-3">
                    <span>{formatLabels[t.matchType]}</span>
                    <span>·</span>
                    <span>{formatLabels[t.formatType]}</span>
                    <span>·</span>
                    <span>{t._count.registrations} signed up</span>
                  </div>

                  {isOpen && (
                    <button
                      onClick={() => handleSignup(t)}
                      disabled={!!signingUp}
                      className="w-full py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                    >
                      {signingUp === t.id ? "Signing up..." : "Sign Up"}
                    </button>
                  )}

                  {t.status === "IN_PROGRESS" && (
                    <button
                      onClick={() => router.push(`/dashboard/${t.id}`)}
                      className="w-full py-2 bg-yellow-500 text-white text-sm font-medium rounded-lg hover:bg-yellow-600 transition-colors"
                    >
                      View Matches
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {activeTab === "groups" && (
          <div className="space-y-4">
            {/* Join Group */}
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <h2 className="text-sm font-semibold mb-3">Join a Group</h2>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="Enter invite code"
                  maxLength={8}
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase"
                />
                <button
                  onClick={handleJoinGroup}
                  disabled={joining || !joinCode.trim()}
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {joining ? "..." : "Join"}
                </button>
              </div>
              {joinError && (
                <p className="text-xs text-red-500 mt-2">{joinError}</p>
              )}
            </div>

            {/* My Groups */}
            {groups.map((g) => (
              <div
                key={g.id}
                className="bg-white rounded-xl border border-gray-100 p-4"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-sm">{g.name}</p>
                    {g.coach && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        Coach: {g.coach.name}
                      </p>
                    )}
                    {g._count && (
                      <p className="text-xs text-gray-400">
                        {g._count.members} members
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-gray-300 font-mono bg-gray-50 px-2 py-0.5 rounded">
                    {g.invitationCode}
                  </span>
                </div>
              </div>
            ))}

            {groups.length === 0 && (
              <div className="text-center py-12">
                <p className="text-gray-400 text-sm">No groups yet</p>
                <p className="text-gray-300 text-xs mt-1">
                  Ask your coach for an invitation code
                </p>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-4 py-2 flex items-center justify-around safe-area-bottom">
        <Link
          href="/dashboard"
          className="flex flex-col items-center gap-0.5 text-blue-600"
        >
          <span className="text-lg">🏠</span>
          <span className="text-[10px] font-medium">Home</span>
        </Link>
        {role === "COACH" && (
          <Link
            href="/coach"
            className="flex flex-col items-center gap-0.5 text-gray-400"
          >
            <span className="text-lg">⚙️</span>
            <span className="text-[10px] font-medium">Coach</span>
          </Link>
        )}
      </nav>
    </div>
  );
}
