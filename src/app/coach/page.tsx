"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

// ─── Types ───────────────────────────────────────────────────────────

interface Group {
  id: string;
  name: string;
  invitationCode: string;
  _count?: { members: number };
}

interface Member {
  id: string;
  userId: string;
  status: string;
  user: { id: string; name: string; email: string };
}

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

interface Ladder {
  id: string;
  label: string;
  weekNumber: number;
  registrations: Registration[];
  matches: Match[];
}

interface Registration {
  id: string;
  userId: string;
  partnerId: string | null;
  ladderId: string | null;
  user: { id: string; name: string };
  partner: { id: string; name: string } | null;
  ladder: { id: string; label: string } | null;
}

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

// ─── Constants ───────────────────────────────────────────────────────

const statusColors: Record<string, string> = {
  PENDING: "bg-gray-100 text-gray-600",
  IN_PROGRESS: "bg-blue-100 text-blue-700",
  COMPLETED: "bg-green-100 text-green-700",
};

// ─── Page Component ──────────────────────────────────────────────────

function userRole(session: { user?: { role?: string } } | null): string | undefined {
  return session?.user?.role;
}

export default function CoachPage() {
  const { data: session, status } = useSession();
  const role = userRole(session);
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
    else if (status === "authenticated" && role !== "COACH") router.push("/dashboard");
  }, [status, role, router]);

  const [activeSection, setActiveSection] = useState<
    "groups" | "tournaments" | "ladders" | "matches"
  >("groups");

  // Group state
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [groupMembers, setGroupMembers] = useState<Member[]>([]);
  const [newGroupName, setNewGroupName] = useState("");
  const [creatingGroup, setCreatingGroup] = useState(false);

  // Tournament state
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selectedTournament, setSelectedTournament] =
    useState<Tournament | null>(null);
  const [showNewTournament, setShowNewTournament] = useState(false);
  const [newTournament, setNewTournament] = useState({
    dateTime: "",
    signupDeadline: "",
    formatType: "ROUND_ROBIN",
    matchType: "SINGLES",
    totalRounds: 1,
  });
  const [editDeadline, setEditDeadline] = useState("");

  // Ladder state
  const [ladders, setLadders] = useState<Ladder[]>([]);
  const [ladderLabels, setLadderLabels] = useState("Ladder A, Ladder B");
  const [carryOverWeek, setCarryOverWeek] = useState(0);
  const [makeNew, setMakeNew] = useState(false);

  // Match state
  const [selectedLadder, setSelectedLadder] = useState<Ladder | null>(null);
  const [editingMatch, setEditingMatch] = useState<Match | null>(null);
  const [editScore, setEditScore] = useState({ p1: "", p2: "" });
  const [showNewMatch, setShowNewMatch] = useState(false);
  const [newMatch, setNewMatch] = useState({
    player1Id: "",
    player2Id: "",
    roundNumber: 1,
    courtNumber: "",
  });

  const [loading, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState("");

  // ─── Fetch ─────────────────────────────────────────────────────────

  const fetchGroups = useCallback(async () => {
    const res = await fetch("/api/groups");
    if (res.ok) setGroups(await res.json());
  }, []);

  const fetchMembers = useCallback(async (groupId: string) => {
    const res = await fetch(`/api/groups/members?groupId=${groupId}`);
    if (res.ok) setGroupMembers(await res.json());
  }, []);

  const fetchTournaments = useCallback(async (groupId?: string) => {
    const url = groupId ? `/api/tournaments?groupId=${groupId}` : "/api/tournaments";
    const res = await fetch(url);
    if (res.ok) setTournaments(await res.json());
  }, []);

  const fetchLadders = useCallback(async (tournamentId: string) => {
    const res = await fetch(
      `/api/ladders?tournamentId=${tournamentId}`
    );
    if (res.ok) setLadders(await res.json());
  }, []);

  useEffect(() => {
    if (session) {
      Promise.all([fetchGroups(), fetchTournaments()]).finally(() =>
        setLoading(false)
      );
    }
  }, [session, fetchGroups, fetchTournaments]);

  // ─── Actions ───────────────────────────────────────────────────────

  const showMsg = (msg: string) => {
    setActionMsg(msg);
    setTimeout(() => setActionMsg(""), 3000);
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;
    setCreatingGroup(true);
    const res = await fetch("/api/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newGroupName.trim() }),
    });
    if (res.ok) {
      setNewGroupName("");
      await fetchGroups();
      showMsg("Group created!");
    }
    setCreatingGroup(false);
  };

  const handleKickMember = async (userId: string, currentStatus: string) => {
    if (!selectedGroup) return;
    const action = currentStatus === "KICKED" ? "REACTIVATE" : "KICK";
    const res = await fetch("/api/groups/members", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groupId: selectedGroup.id, userId, action }),
    });
    if (res.ok) {
      await fetchMembers(selectedGroup.id);
      showMsg(action === "KICK" ? "Member removed" : "Member reinstated");
    }
  };

  const handleCreateTournament = async () => {
    if (!selectedGroup || !newTournament.dateTime || !newTournament.signupDeadline)
      return;
    const res = await fetch("/api/tournaments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        groupId: selectedGroup.id,
        ...newTournament,
        totalRounds: newTournament.totalRounds || 1,
      }),
    });
    if (res.ok) {
      setShowNewTournament(false);
      setNewTournament({
        dateTime: "",
        signupDeadline: "",
        formatType: "ROUND_ROBIN",
        matchType: "SINGLES",
        totalRounds: 1,
      });
      await fetchTournaments(selectedGroup.id);
      showMsg("Tournament created!");
    }
  };

  const handleUpdateDeadline = async () => {
    if (!selectedTournament || !editDeadline) return;
    const res = await fetch("/api/tournaments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tournamentId: selectedTournament.id,
        signupDeadline: editDeadline,
      }),
    });
    if (res.ok) {
      await fetchTournaments();
      showMsg("Deadline updated!");
    }
  };

  const handleChangeStatus = async (tournamentId: string, status: string) => {
    const res = await fetch("/api/tournaments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tournamentId, status }),
    });
    if (res.ok) {
      await fetchTournaments();
      showMsg(`Tournament ${status.replace("_", " ")}!`);
    }
  };

  const handleCreateLadders = async () => {
    if (!selectedTournament) return;
    const labels = ladderLabels.split(",").map((l) => l.trim()).filter(Boolean);
    const res = await fetch("/api/ladders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tournamentId: selectedTournament.id,
        labels,
        carryOverFromWeek: makeNew ? undefined : carryOverWeek || undefined,
        makeNew,
      }),
    });
    if (res.ok) {
      await fetchLadders(selectedTournament.id);
      showMsg("Ladders created!");
    }
  };

  const handlePromoteDemote = async (registrationId: string, toLadderId: string) => {
    const res = await fetch("/api/ladders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ registrationId, toLadderId }),
    });
    if (res.ok && selectedTournament) {
      await fetchLadders(selectedTournament.id);
      showMsg("Player moved!");
    }
  };

  const handleResetLadders = async () => {
    if (!selectedTournament) return;
    if (!confirm("Reset all ladders? This cannot be undone.")) return;
    await fetch(`/api/ladders?tournamentId=${selectedTournament.id}`, {
      method: "DELETE",
    });
    await fetchLadders(selectedTournament.id);
    showMsg("Ladders reset (Make New)");
  };

  const handleGenerateMatches = async (ladderId: string) => {
    const res = await fetch("/api/matches/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ladderId }),
    });
    if (res.ok && selectedTournament) {
      await fetchLadders(selectedTournament.id);
      showMsg("Matches generated!");
    }
  };

  const handleUpdateMatch = async (
    matchId: string,
    data: Record<string, unknown>
  ) => {
    const res = await fetch("/api/matches", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matchId, ...data }),
    });
    if (res.ok && selectedTournament) {
      await fetchLadders(selectedTournament.id);
      setEditingMatch(null);
      showMsg("Match updated!");
    }
  };

  const handleDeleteMatch = async (matchId: string) => {
    if (!confirm("Delete this match?")) return;
    await fetch(`/api/matches?id=${matchId}`, { method: "DELETE" });
    if (selectedTournament) await fetchLadders(selectedTournament.id);
    showMsg("Match deleted");
  };

  const handleAddMatch = async () => {
    if (!selectedLadder || !selectedTournament) return;
    const res = await fetch("/api/matches", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tournamentId: selectedTournament.id,
        ladderId: selectedLadder.id,
        player1Id: newMatch.player1Id,
        player2Id: newMatch.player2Id,
        roundNumber: newMatch.roundNumber,
        courtNumber: newMatch.courtNumber
          ? parseInt(newMatch.courtNumber)
          : undefined,
      }),
    });
    if (res.ok) {
      setShowNewMatch(false);
      setNewMatch({ player1Id: "", player2Id: "", roundNumber: 1, courtNumber: "" });
      await fetchLadders(selectedTournament.id);
      showMsg("Match added!");
    }
  };

  // ─── Loading ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 bg-white border-b border-gray-100 z-20">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-gray-400">
              ←
            </Link>
            <h1 className="text-lg font-bold">Coach Control Room</h1>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="text-sm text-gray-400"
          >
            Sign Out
          </button>
        </div>

        {/* Section Tabs */}
        <div className="flex overflow-x-auto border-b border-gray-100 no-scrollbar">
          {(["groups", "tournaments", "ladders", "matches"] as const).map(
            (s) => (
              <button
                key={s}
                onClick={() => setActiveSection(s)}
                className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors ${
                  activeSection === s
                    ? "text-blue-600 border-b-2 border-blue-600"
                    : "text-gray-400"
                }`}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            )
          )}
        </div>
      </header>

      {/* Toast */}
      {actionMsg && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-30 bg-gray-900 text-white text-sm px-4 py-2 rounded-full shadow-lg">
          {actionMsg}
        </div>
      )}

      <main className="p-4 pb-24">
        {/* ═══════════════ GROUPS ═══════════════ */}
        {activeSection === "groups" && (
          <div className="space-y-4">
            {/* Create Group */}
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <h2 className="text-sm font-semibold mb-3">Create New Group</h2>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="Group name"
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={handleCreateGroup}
                  disabled={creatingGroup || !newGroupName.trim()}
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  Create
                </button>
              </div>
            </div>

            {/* Group List */}
            {groups.map((g) => (
              <div
                key={g.id}
                className={`bg-white rounded-xl border p-4 cursor-pointer transition-colors ${
                  selectedGroup?.id === g.id
                    ? "border-blue-300 bg-blue-50"
                    : "border-gray-100 hover:border-gray-200"
                }`}
                onClick={async () => {
                  setSelectedGroup(g);
                  await fetchMembers(g.id);
                  await fetchTournaments(g.id);
                }}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-sm">{g.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {g._count?.members ?? 0} members
                    </p>
                  </div>
                  <span className="text-xs font-mono bg-gray-100 px-2 py-0.5 rounded text-gray-500">
                    {g.invitationCode}
                  </span>
                </div>

                {/* Expanded: Members */}
                {selectedGroup?.id === g.id && (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <p className="text-xs font-medium text-gray-400 mb-2 uppercase tracking-wide">
                      Members ({groupMembers.length})
                    </p>
                    {groupMembers.map((m) => (
                      <div
                        key={m.id}
                        className="flex items-center justify-between py-2"
                      >
                        <div>
                          <p className="text-sm">{m.user.name}</p>
                          <p className="text-xs text-gray-400">
                            {m.user.email}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {m.status === "KICKED" && (
                            <span className="text-xs text-red-500 bg-red-50 px-2 py-0.5 rounded">
                              KICKED
                            </span>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleKickMember(m.userId, m.status);
                            }}
                            className={`text-xs px-2 py-1 rounded font-medium ${
                              m.status === "KICKED"
                                ? "bg-green-100 text-green-700"
                                : "bg-red-50 text-red-600"
                            }`}
                          >
                            {m.status === "KICKED" ? "Reinstate" : "Kick"}
                          </button>
                        </div>
                      </div>
                    ))}
                    {groupMembers.length === 0 && (
                      <p className="text-xs text-gray-400 py-2">No members yet</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ═══════════════ TOURNAMENTS ═══════════════ */}
        {activeSection === "tournaments" && (
          <div className="space-y-4">
            {/* Create Tournament */}
            <button
              onClick={() => setShowNewTournament(!showNewTournament)}
              className="w-full py-3 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors"
            >
              + New Tournament
            </button>

            {showNewTournament && (
              <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Group
                  </label>
                  <select
                    value={selectedGroup?.id || ""}
                    onChange={(e) =>
                      setSelectedGroup(
                        groups.find((g) => g.id === e.target.value) || null
                      )
                    }
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  >
                    <option value="">Select group</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Date & Time
                    </label>
                    <input
                      type="datetime-local"
                      value={newTournament.dateTime}
                      onChange={(e) =>
                        setNewTournament({
                          ...newTournament,
                          dateTime: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Signup Deadline
                    </label>
                    <input
                      type="datetime-local"
                      value={newTournament.signupDeadline}
                      onChange={(e) =>
                        setNewTournament({
                          ...newTournament,
                          signupDeadline: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Format
                    </label>
                    <select
                      value={newTournament.formatType}
                      onChange={(e) =>
                        setNewTournament({
                          ...newTournament,
                          formatType: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    >
                      <option value="ROUND_ROBIN">Round Robin</option>
                      <option value="TEAM">Team</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Type
                    </label>
                    <select
                      value={newTournament.matchType}
                      onChange={(e) =>
                        setNewTournament({
                          ...newTournament,
                          matchType: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    >
                      <option value="SINGLES">Singles</option>
                      <option value="DOUBLES">Doubles</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Rounds
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={newTournament.totalRounds}
                      onChange={(e) =>
                        setNewTournament({
                          ...newTournament,
                          totalRounds: parseInt(e.target.value) || 1,
                        })
                      }
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    />
                  </div>
                </div>

                <button
                  onClick={handleCreateTournament}
                  disabled={!selectedGroup}
                  className="w-full py-2.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  Create Tournament
                </button>
              </div>
            )}

            {/* Tournament List */}
            {tournaments.map((t) => (
              <div
                key={t.id}
                className={`bg-white rounded-xl border p-4 ${
                  selectedTournament?.id === t.id
                    ? "border-blue-300"
                    : "border-gray-100"
                }`}
                onClick={async () => {
                  setSelectedTournament(t);
                  await fetchLadders(t.id);
                }}
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-semibold text-sm">{t.group.name}</p>
                    <p className="text-xs text-gray-400">
                      {new Date(t.dateTime).toLocaleDateString()}
                    </p>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100">
                    {t.status.replace("_", " ")}
                  </span>
                </div>

                <div className="flex gap-2 text-xs text-gray-400 mb-3">
                  <span>{t.matchType}</span>
                  <span>·</span>
                  <span>{t.formatType.replace("_", " ")}</span>
                  <span>·</span>
                  <span>{t._count.registrations} players</span>
                </div>

                {/* Expanded: Settings */}
                {selectedTournament?.id === t.id && (
                  <div className="mt-3 pt-3 border-t border-gray-100 space-y-3">
                    {/* Edit Deadline */}
                    <div>
                      <p className="text-xs text-gray-400 mb-1">
                        Signup Deadline
                      </p>
                      <div className="flex gap-2">
                        <input
                          type="datetime-local"
                          value={editDeadline}
                          onChange={(e) => setEditDeadline(e.target.value)}
                          className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-xs"
                        />
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleUpdateDeadline();
                          }}
                          className="text-xs px-3 py-1.5 bg-gray-100 rounded-lg font-medium"
                        >
                          Update
                        </button>
                      </div>
                    </div>

                    {/* Status Controls */}
                    <div>
                      <p className="text-xs text-gray-400 mb-1">Status</p>
                      <div className="flex gap-2 flex-wrap">
                        {["SIGNUP_OPEN", "IN_PROGRESS", "COMPLETED"].map(
                          (s) => (
                            <button
                              key={s}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleChangeStatus(t.id, s);
                              }}
                              className={`text-xs px-3 py-1.5 rounded-lg font-medium ${
                                t.status === s
                                  ? "bg-blue-600 text-white"
                                  : "bg-gray-100 text-gray-600"
                              }`}
                            >
                              {s.replace("_", " ")}
                            </button>
                          )
                        )}
                      </div>
                    </div>

                    {/* Quick link to ladders */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveSection("ladders");
                      }}
                      className="w-full text-xs py-2 bg-blue-50 text-blue-600 rounded-lg font-medium"
                    >
                      Manage Ladders →
                    </button>
                  </div>
                )}
              </div>
            ))}

            {tournaments.length === 0 && (
              <div className="text-center py-12">
                <p className="text-gray-400 text-sm">No tournaments yet</p>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════ LADDERS ═══════════════ */}
        {activeSection === "ladders" && (
          <div className="space-y-4">
            {/* Select Tournament */}
            {!selectedTournament && (
              <div className="bg-white rounded-xl border border-gray-100 p-4">
                <p className="text-sm text-gray-500 mb-3">
                  Select a tournament to manage ladders
                </p>
                <div className="space-y-2">
                  {tournaments.map((t) => (
                    <button
                      key={t.id}
                      onClick={async () => {
                        setSelectedTournament(t);
                        await fetchLadders(t.id);
                      }}
                      className="w-full text-left px-4 py-3 bg-gray-50 rounded-lg text-sm hover:bg-gray-100"
                    >
                      {t.group.name} — {t.matchType} {t.formatType.replace("_", " ")}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {selectedTournament && (
              <>
                {/* Create Ladders */}
                <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
                  <h2 className="text-sm font-semibold">
                    Create Ladders — {selectedTournament.group.name}
                  </h2>

                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      Ladder Labels (comma-separated)
                    </label>
                    <input
                      type="text"
                      value={ladderLabels}
                      onChange={(e) => setLadderLabels(e.target.value)}
                      placeholder="Ladder A, Ladder B, Ladder C"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    />
                  </div>

                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={makeNew}
                        onChange={(e) => setMakeNew(e.target.checked)}
                        className="rounded"
                      />
                      <span className="text-sm">Make New (fresh start)</span>
                    </label>
                  </div>

                  {!makeNew && ladders.length > 0 && (
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">
                        Carry over from week
                      </label>
                      <select
                        value={carryOverWeek}
                        onChange={(e) =>
                          setCarryOverWeek(parseInt(e.target.value))
                        }
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                      >
                        <option value={0}>None</option>
                        {[...new Set(ladders.map((l) => l.weekNumber))].map(
                          (w) => (
                            <option key={w} value={w}>
                              Week {w}
                            </option>
                          )
                        )}
                      </select>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button
                      onClick={handleCreateLadders}
                      className="flex-1 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
                    >
                      Create Ladders
                    </button>
                    <button
                      onClick={handleResetLadders}
                      className="px-4 py-2.5 bg-red-50 text-red-600 text-sm font-medium rounded-lg hover:bg-red-100"
                    >
                      Reset All
                    </button>
                  </div>
                </div>

                {/* Ladder List */}
                {ladders.map((ladder) => (
                  <div
                    key={ladder.id}
                    className="bg-white rounded-xl border border-gray-100 overflow-hidden"
                  >
                    <div className="px-4 py-3 bg-gray-50 flex items-center justify-between">
                      <h3 className="text-sm font-semibold">
                        {ladder.label}{" "}
                        <span className="text-xs text-gray-400 font-normal">
                          Week {ladder.weekNumber}
                        </span>
                      </h3>
                      <span className="text-xs text-gray-400">
                        {ladder.registrations.length} players ·{" "}
                        {ladder.matches.length} matches
                      </span>
                    </div>

                    {/* Players in this ladder */}
                    <div className="p-4">
                      <p className="text-xs text-gray-400 mb-2 uppercase tracking-wide">
                        Players
                      </p>
                      {ladder.registrations.map((reg) => (
                        <div
                          key={reg.id}
                          className="flex items-center justify-between py-1.5"
                        >
                          <span className="text-sm">{reg.user.name}</span>
                          <select
                            value={reg.ladderId || ""}
                            onChange={(e) =>
                              handlePromoteDemote(reg.id, e.target.value)
                            }
                            className="text-xs border border-gray-200 rounded px-2 py-0.5"
                          >
                            <option value="">Unassigned</option>
                            {ladders.map((l) => (
                              <option key={l.id} value={l.id}>
                                {l.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      ))}
                      {ladder.registrations.length === 0 && (
                        <p className="text-xs text-gray-400">No players</p>
                      )}
                    </div>

                    {/* Generate Matches */}
                    <div className="px-4 pb-4">
                      <button
                        onClick={() => handleGenerateMatches(ladder.id)}
                        className="w-full py-2 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700"
                      >
                        Generate Round Robin Matches
                      </button>
                    </div>

                    {/* Quick link to matches */}
                    <div className="px-4 pb-4">
                      <button
                        onClick={() => {
                          setSelectedLadder(ladder);
                          setActiveSection("matches");
                        }}
                        className="w-full text-xs py-2 bg-blue-50 text-blue-600 rounded-lg font-medium"
                      >
                        View/Edit Matches →
                      </button>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {/* ═══════════════ MATCHES ═══════════════ */}
        {activeSection === "matches" && (
          <div className="space-y-4">
            {/* Ladder Selector */}
            {!selectedLadder && ladders.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-100 p-4">
                <p className="text-sm text-gray-500 mb-3">Select a ladder</p>
                {ladders.map((l) => (
                  <button
                    key={l.id}
                    onClick={() => setSelectedLadder(l)}
                    className="w-full text-left px-4 py-3 bg-gray-50 rounded-lg text-sm mb-2 hover:bg-gray-100"
                  >
                    {l.label} — {l.matches.length} matches
                  </button>
                ))}
              </div>
            )}

            {!selectedLadder && ladders.length === 0 && (
              <div className="text-center py-12">
                <p className="text-gray-400 text-sm">
                  Create ladders first, then generate matches
                </p>
              </div>
            )}

            {selectedLadder && (
              <>
                {/* Ladder Header */}
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold">
                    {selectedLadder.label} · Week {selectedLadder.weekNumber}
                  </h2>
                  <button
                    onClick={() => setShowNewMatch(!showNewMatch)}
                    className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg font-medium"
                  >
                    + Add Match
                  </button>
                </div>

                {/* Add Match Form */}
                {showNewMatch && (
                  <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">
                        Player 1
                      </label>
                      <select
                        value={newMatch.player1Id}
                        onChange={(e) =>
                          setNewMatch({ ...newMatch, player1Id: e.target.value })
                        }
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                      >
                        <option value="">Select player</option>
                        {selectedLadder.registrations.map((r) => (
                          <option key={r.userId} value={r.userId}>
                            {r.user.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">
                        Player 2
                      </label>
                      <select
                        value={newMatch.player2Id}
                        onChange={(e) =>
                          setNewMatch({ ...newMatch, player2Id: e.target.value })
                        }
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                      >
                        <option value="">Select player</option>
                        {selectedLadder.registrations
                          .filter((r) => r.userId !== newMatch.player1Id)
                          .map((r) => (
                            <option key={r.userId} value={r.userId}>
                              {r.user.name}
                            </option>
                          ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">
                          Round
                        </label>
                        <input
                          type="number"
                          min={1}
                          value={newMatch.roundNumber}
                          onChange={(e) =>
                            setNewMatch({
                              ...newMatch,
                              roundNumber: parseInt(e.target.value) || 1,
                            })
                          }
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">
                          Court
                        </label>
                        <input
                          type="number"
                          min={1}
                          value={newMatch.courtNumber}
                          onChange={(e) =>
                            setNewMatch({ ...newMatch, courtNumber: e.target.value })
                          }
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                        />
                      </div>
                    </div>
                    <button
                      onClick={handleAddMatch}
                      disabled={!newMatch.player1Id || !newMatch.player2Id}
                      className="w-full py-2.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50"
                    >
                      Add Match
                    </button>
                  </div>
                )}

                {/* Match List */}
                {selectedLadder.matches.map((match) => (
                  <div
                    key={match.id}
                    className="bg-white rounded-xl border border-gray-100 p-4"
                  >
                    {/* Round header */}
                    {(match.matchOrder === 0 ||
                      selectedLadder.matches[match.matchOrder - 1]
                        ?.roundNumber !== match.roundNumber) && (
                      <p className="text-xs text-gray-400 font-medium mb-2 uppercase">
                        Round {match.roundNumber}
                      </p>
                    )}

                    <div className="flex items-center gap-3">
                      {/* Players */}
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">
                            {match.player1.name}
                          </span>
                          <span className="text-lg font-bold mx-2">
                            {match.player1Score ?? "-"}
                          </span>
                        </div>
                        <div className="text-xs text-gray-300 text-center my-0.5">
                          vs
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">
                            {match.player2.name}
                          </span>
                          <span className="text-lg font-bold mx-2">
                            {match.player2Score ?? "-"}
                          </span>
                        </div>
                      </div>

                      {/* Status + Actions */}
                      <div className="flex flex-col items-end gap-2">
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

                        <div className="flex gap-1">
                          {/* Edit Score */}
                          <button
                            onClick={() => {
                              setEditingMatch(
                                editingMatch?.id === match.id ? null : match
                              );
                              setEditScore({
                                p1: match.player1Score?.toString() || "",
                                p2: match.player2Score?.toString() || "",
                              });
                            }}
                            className="text-xs px-2 py-1 bg-blue-50 text-blue-600 rounded"
                          >
                            Score
                          </button>

                          {/* Delete */}
                          <button
                            onClick={() => handleDeleteMatch(match.id)}
                            className="text-xs px-2 py-1 bg-red-50 text-red-500 rounded"
                          >
                            Del
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Score Edit Form */}
                    {editingMatch?.id === match.id && (
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            value={editScore.p1}
                            onChange={(e) =>
                              setEditScore({ ...editScore, p1: e.target.value })
                            }
                            placeholder={match.player1.name}
                            className="w-16 px-2 py-1.5 border border-gray-200 rounded text-sm text-center"
                          />
                          <span className="text-gray-300">-</span>
                          <input
                            type="number"
                            value={editScore.p2}
                            onChange={(e) =>
                              setEditScore({ ...editScore, p2: e.target.value })
                            }
                            placeholder={match.player2.name}
                            className="w-16 px-2 py-1.5 border border-gray-200 rounded text-sm text-center"
                          />
                          <button
                            onClick={() =>
                              handleUpdateMatch(match.id, {
                                player1Score: parseInt(editScore.p1) || 0,
                                player2Score: parseInt(editScore.p2) || 0,
                              })
                            }
                            className="text-xs px-3 py-1.5 bg-green-600 text-white rounded font-medium"
                          >
                            Save
                          </button>
                        </div>

                        {/* Swap Players */}
                        <div className="mt-2">
                          <p className="text-xs text-gray-400 mb-1">
                            Swap players
                          </p>
                          <select
                            value=""
                            onChange={(e) => {
                              if (e.target.value) {
                                handleUpdateMatch(match.id, {
                                  player1Id: e.target.value,
                                });
                              }
                            }}
                            className="text-xs border border-gray-200 rounded px-2 py-1"
                          >
                            <option value="">Replace P1</option>
                            {selectedLadder.registrations
                              .filter((r) => r.userId !== match.player2Id)
                              .map((r) => (
                                <option key={r.userId} value={r.userId}>
                                  {r.user.name}
                                </option>
                              ))}
                          </select>
                          <select
                            value=""
                            onChange={(e) => {
                              if (e.target.value) {
                                handleUpdateMatch(match.id, {
                                  player2Id: e.target.value,
                                });
                              }
                            }}
                            className="text-xs border border-gray-200 rounded px-2 py-1 ml-2"
                          >
                            <option value="">Replace P2</option>
                            {selectedLadder.registrations
                              .filter((r) => r.userId !== match.player1Id)
                              .map((r) => (
                                <option key={r.userId} value={r.userId}>
                                  {r.user.name}
                                </option>
                              ))}
                          </select>
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {selectedLadder.matches.length === 0 && (
                  <div className="text-center py-8">
                    <p className="text-gray-400 text-sm">
                      No matches yet. Generate them or add manually.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* No coaches message */}
        {role !== "COACH" && (
          <div className="text-center py-12">
            <p className="text-gray-400">Coach access only</p>
          </div>
        )}
      </main>

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-4 py-2 flex items-center justify-around">
        <Link
          href="/dashboard"
          className="flex flex-col items-center gap-0.5 text-gray-400"
        >
          <span className="text-lg">🏠</span>
          <span className="text-[10px] font-medium">Home</span>
        </Link>
        <span className="flex flex-col items-center gap-0.5 text-blue-600">
          <span className="text-lg">⚙️</span>
          <span className="text-[10px] font-medium">Coach</span>
        </span>
      </nav>
    </div>
  );
}
