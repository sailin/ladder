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

// ─── Helpers ─────────────────────────────────────────────────────────

const statusColors: Record<string, string> = {
  PENDING: "bg-gray-100 text-gray-600",
  IN_PROGRESS: "bg-blue-100 text-blue-700",
  COMPLETED: "bg-green-100 text-green-700",
};

const tournamentStatusColors: Record<string, string> = {
  UPCOMING: "bg-blue-100 text-blue-700",
  SIGNUP_OPEN: "bg-green-100 text-green-700",
  IN_PROGRESS: "bg-yellow-100 text-yellow-700",
  COMPLETED: "bg-gray-100 text-gray-500",
};

const fmtLabel = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");

function userRole(session: { user?: { role?: string } } | null): string | undefined {
  return session?.user?.role;
}

// ─── Page ────────────────────────────────────────────────────────────

export default function CoachPage() {
  const { data: session, status } = useSession();
  const role = userRole(session);
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
    else if (status === "authenticated" && role !== "COACH") router.push("/dashboard");
  }, [status, role, router]);

  // ─── Drill-down state ────────────────────────────────────────────
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [groupMembers, setGroupMembers] = useState<Member[]>([]);

  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(null);

  const [ladders, setLadders] = useState<Ladder[]>([]);
  const [selectedLadder, setSelectedLadder] = useState<Ladder | null>(null);

  // ─── Form state ──────────────────────────────────────────────────
  const [newGroupName, setNewGroupName] = useState("");
  const [creatingGroup, setCreatingGroup] = useState(false);

  const [showNewTournament, setShowNewTournament] = useState(false);
  const [newTournament, setNewTournament] = useState({
    dateTime: "",
    signupDeadline: "",
    formatType: "ROUND_ROBIN",
    matchType: "SINGLES",
    totalRounds: 1,
  });
  const [editDeadline, setEditDeadline] = useState("");

  const [ladderLabels, setLadderLabels] = useState("Ladder A, Ladder B");
  const [carryOverWeek, setCarryOverWeek] = useState(0);
  const [makeNew, setMakeNew] = useState(false);

  const [editingMatch, setEditingMatch] = useState<Match | null>(null);
  const [editScore, setEditScore] = useState({ p1: "", p2: "" });
  const [showNewMatch, setShowNewMatch] = useState(false);
  const [newMatch, setNewMatch] = useState({ player1Id: "", player2Id: "", roundNumber: 1, courtNumber: "" });

  const [loading, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState("");

  // ─── Fetch helpers ───────────────────────────────────────────────
  const showMsg = (msg: string) => { setActionMsg(msg); setTimeout(() => setActionMsg(""), 2500); };

  const fetchGroups = useCallback(async () => {
    const res = await fetch("/api/groups");
    if (res.ok) setGroups(await res.json());
  }, []);

  const fetchMembers = useCallback(async (groupId: string) => {
    const res = await fetch(`/api/groups/members?groupId=${groupId}`);
    if (res.ok) setGroupMembers(await res.json());
  }, []);

  const fetchTournaments = useCallback(async (groupId: string) => {
    const res = await fetch(`/api/tournaments?groupId=${groupId}`);
    if (res.ok) setTournaments(await res.json());
  }, []);

  const fetchLadders = useCallback(async (tournamentId: string) => {
    const res = await fetch(`/api/ladders?tournamentId=${tournamentId}`);
    if (res.ok) setLadders(await res.json());
  }, []);

  useEffect(() => {
    if (session) { fetchGroups().finally(() => setLoading(false)); }
  }, [session, fetchGroups]);

  // ─── Drill-down handlers ─────────────────────────────────────────
  const selectGroup = async (g: Group) => {
    setSelectedGroup(g);
    setSelectedTournament(null);
    setSelectedLadder(null);
    await Promise.all([fetchMembers(g.id), fetchTournaments(g.id)]);
  };

  const selectTournament = async (t: Tournament) => {
    setSelectedTournament(t);
    setSelectedLadder(null);
    setEditDeadline(t.signupDeadline ? new Date(t.signupDeadline).toISOString().slice(0, 16) : "");
    try { await fetchLadders(t.id); } catch { /* ok */ }
  };

  const selectLadder = (l: Ladder) => {
    setSelectedLadder(l);
  };

  const goBack = () => {
    if (selectedLadder) { setSelectedLadder(null); }
    else if (selectedTournament) { setSelectedTournament(null); setLadders([]); }
    else if (selectedGroup) { setSelectedGroup(null); setTournaments([]); }
  };

  // ─── Actions ─────────────────────────────────────────────────────
  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;
    setCreatingGroup(true);
    const res = await fetch("/api/groups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newGroupName.trim() }) });
    if (res.ok) { setNewGroupName(""); await fetchGroups(); showMsg("Group created!"); }
    setCreatingGroup(false);
  };

  const handleKickMember = async (userId: string, currentStatus: string) => {
    if (!selectedGroup) return;
    const action = currentStatus === "KICKED" ? "REACTIVATE" : "KICK";
    await fetch("/api/groups/members", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ groupId: selectedGroup.id, userId, action }) });
    await fetchMembers(selectedGroup.id);
    showMsg(action === "KICK" ? "Member removed" : "Member reinstated");
  };

  const handleCreateTournament = async () => {
    if (!selectedGroup || !newTournament.dateTime || !newTournament.signupDeadline) return;
    const res = await fetch("/api/tournaments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ groupId: selectedGroup.id, ...newTournament, totalRounds: newTournament.totalRounds || 1 }) });
    if (res.ok) {
      setShowNewTournament(false);
      setNewTournament({ dateTime: "", signupDeadline: "", formatType: "ROUND_ROBIN", matchType: "SINGLES", totalRounds: 1 });
      await fetchTournaments(selectedGroup.id);
      showMsg("Tournament created!");
    }
  };

  const handleUpdateDeadline = async () => {
    if (!selectedTournament || !editDeadline) return;
    const res = await fetch("/api/tournaments", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tournamentId: selectedTournament.id, signupDeadline: editDeadline }) });
    if (res.ok) { await fetchTournaments(selectedGroup!.id); showMsg("Deadline updated!"); }
  };

  const handleChangeStatus = async (tournamentId: string, status: string) => {
    await fetch("/api/tournaments", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tournamentId, status }) });
    await fetchTournaments(selectedGroup!.id);
    showMsg("Status: " + status.replace("_", " "));
  };

  const handleCreateLadders = async () => {
    if (!selectedTournament) return;
    const labels = ladderLabels.split(",").map(l => l.trim()).filter(Boolean);
    const res = await fetch("/api/ladders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tournamentId: selectedTournament.id, labels, carryOverFromWeek: makeNew ? undefined : carryOverWeek || undefined, makeNew }) });
    if (res.ok) { await fetchLadders(selectedTournament.id); showMsg("Ladders created!"); }
  };

  const handlePromoteDemote = async (registrationId: string, toLadderId: string) => {
    await fetch("/api/ladders", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ registrationId, toLadderId }) });
    if (selectedTournament) { await fetchLadders(selectedTournament.id); showMsg("Player moved!"); }
  };

  const handleResetLadders = async () => {
    if (!selectedTournament || !confirm("Reset all ladders? This cannot be undone.")) return;
    await fetch(`/api/ladders?tournamentId=${selectedTournament.id}`, { method: "DELETE" });
    await fetchLadders(selectedTournament.id);
    showMsg("Ladders reset");
  };

  const handleGenerateMatches = async (ladderId: string) => {
    const res = await fetch("/api/matches/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ladderId }) });
    if (res.ok && selectedTournament) { await fetchLadders(selectedTournament.id); showMsg("Matches generated!"); }
  };

  const handleUpdateMatch = async (matchId: string, data: Record<string, unknown>) => {
    await fetch("/api/matches", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ matchId, ...data }) });
    if (selectedTournament) { await fetchLadders(selectedTournament.id); setEditingMatch(null); showMsg("Match updated!"); }
  };

  const handleDeleteMatch = async (matchId: string) => {
    if (!confirm("Delete this match?")) return;
    await fetch(`/api/matches?id=${matchId}`, { method: "DELETE" });
    if (selectedTournament) { await fetchLadders(selectedTournament.id); showMsg("Match deleted"); }
  };

  const handleAddMatch = async () => {
    if (!selectedTournament || !selectedLadder || !newMatch.player1Id || !newMatch.player2Id) return;
    await fetch("/api/matches", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tournamentId: selectedTournament.id, ladderId: selectedLadder.id, player1Id: newMatch.player1Id, player2Id: newMatch.player2Id, roundNumber: newMatch.roundNumber, courtNumber: newMatch.courtNumber ? parseInt(newMatch.courtNumber) : null }) });
    await fetchLadders(selectedTournament.id);
    setShowNewMatch(false);
    setNewMatch({ player1Id: "", player2Id: "", roundNumber: 1, courtNumber: "" });
    showMsg("Match added!");
  };

  // ─── Loading ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (role !== "COACH") {
    return <div className="min-h-screen flex items-center justify-center text-gray-400">Coach access only</div>;
  }

  // ─── Render ────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Header ── */}
      <header className="sticky top-0 bg-white border-b border-gray-100 z-20">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-gray-400 text-lg">←</Link>
            <h1 className="text-lg font-bold">Coach Control Room</h1>
          </div>
          <button onClick={() => signOut({ callbackUrl: "/login" })} className="text-sm text-gray-400">Sign Out</button>
        </div>

        {/* ── Breadcrumb ── */}
        <div className="px-4 py-2 flex items-center gap-1 text-sm overflow-x-auto no-scrollbar">
          <button
            onClick={() => { setSelectedGroup(null); setSelectedTournament(null); setSelectedLadder(null); }}
            className={`font-medium whitespace-nowrap ${!selectedGroup ? "text-blue-600" : "text-gray-400"}`}
          >
            Groups
          </button>
          {selectedGroup && (
            <>
              <span className="text-gray-300 mx-1">›</span>
              <button
                onClick={() => { setSelectedTournament(null); setSelectedLadder(null); }}
                className={`font-medium whitespace-nowrap ${selectedGroup && !selectedTournament ? "text-blue-600" : "text-gray-600"}`}
              >
                {selectedGroup.name}
              </button>
            </>
          )}
          {selectedTournament && (
            <>
              <span className="text-gray-300 mx-1">›</span>
              <button
                onClick={() => { setSelectedLadder(null); }}
                className={`font-medium whitespace-nowrap ${!selectedLadder ? "text-blue-600" : "text-gray-600"}`}
              >
                {fmtLabel(selectedTournament.matchType)} {fmtLabel(selectedTournament.formatType)}
              </button>
            </>
          )}
          {selectedLadder && (
            <>
              <span className="text-gray-300 mx-1">›</span>
              <span className="font-medium text-blue-600 whitespace-nowrap">{selectedLadder.label}</span>
            </>
          )}
        </div>
      </header>

      {/* ── Toast ── */}
      {actionMsg && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-30 bg-gray-900 text-white text-sm px-4 py-2 rounded-full shadow-lg transition-opacity">
          {actionMsg}
        </div>
      )}

      <main className="p-4 pb-24">

        {/* ═══════════════ LEVEL 0: GROUPS ═══════════════ */}
        {!selectedGroup && (
          <div className="space-y-4">
            <div className="text-center py-4">
              <p className="text-gray-500 text-sm">Select a group to manage, or create a new one.</p>
            </div>

            {/* Create Group */}
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <h2 className="text-sm font-semibold mb-3">Create New Group</h2>
              <div className="flex gap-2">
                <input type="text" value={newGroupName} onChange={e => setNewGroupName(e.target.value)} placeholder="Group name" className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <button onClick={handleCreateGroup} disabled={creatingGroup || !newGroupName.trim()} className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">Create</button>
              </div>
            </div>

            {/* Group List */}
            {groups.map(g => (
              <div key={g.id} onClick={() => selectGroup(g)} className="bg-white rounded-xl border border-gray-100 p-4 cursor-pointer transition-colors hover:border-gray-300 hover:shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-sm">{g.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{g._count?.members ?? 0} members</p>
                  </div>
                  <span className="text-xs font-mono bg-gray-100 px-2 py-0.5 rounded text-gray-500">{g.invitationCode}</span>
                </div>
              </div>
            ))}

            {groups.length === 0 && <p className="text-center text-gray-400 text-sm py-8">No groups yet. Create one above.</p>}
          </div>
        )}

        {/* ═══════════════ LEVEL 1: GROUP DETAIL ═══════════════ */}
        {selectedGroup && !selectedTournament && (
          <div className="space-y-4">
            {/* ── Members ── */}
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 flex items-center justify-between">
                <h2 className="text-sm font-semibold">Members ({groupMembers.length})</h2>
                <span className="text-xs text-gray-400">Invite code: <code className="font-mono bg-gray-200 px-1.5 py-0.5 rounded">{selectedGroup.invitationCode}</code></span>
              </div>
              <div className="divide-y divide-gray-50">
                {groupMembers.map(m => (
                  <div key={m.id} className="px-4 py-2.5 flex items-center justify-between">
                    <div>
                      <p className="text-sm">{m.user.name}</p>
                      <p className="text-xs text-gray-400">{m.user.email}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {m.status === "KICKED" && <span className="text-xs text-red-500 bg-red-50 px-2 py-0.5 rounded">KICKED</span>}
                      <button onClick={() => handleKickMember(m.userId, m.status)} className={`text-xs px-2 py-1 rounded font-medium ${m.status === "KICKED" ? "bg-green-100 text-green-700" : "bg-red-50 text-red-600"}`}>
                        {m.status === "KICKED" ? "Reinstate" : "Kick"}
                      </button>
                    </div>
                  </div>
                ))}
                {groupMembers.length === 0 && <p className="px-4 py-4 text-xs text-gray-400">No members yet. Share the invite code.</p>}
              </div>
            </div>

            {/* ── Tournaments ── */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">Tournaments</h2>
                <button onClick={() => setShowNewTournament(!showNewTournament)} className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg font-medium">+ New</button>
              </div>

              {showNewTournament && (
                <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Date &amp; Time</label>
                      <input type="datetime-local" value={newTournament.dateTime} onChange={e => setNewTournament({ ...newTournament, dateTime: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Signup Deadline</label>
                      <input type="datetime-local" value={newTournament.signupDeadline} onChange={e => setNewTournament({ ...newTournament, signupDeadline: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Match Type</label>
                      <select value={newTournament.matchType} onChange={e => setNewTournament({ ...newTournament, matchType: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                        <option value="SINGLES">Singles</option>
                        <option value="DOUBLES">Doubles</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Format</label>
                      <select value={newTournament.formatType} onChange={e => setNewTournament({ ...newTournament, formatType: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                        <option value="ROUND_ROBIN">Round Robin</option>
                        <option value="TEAM">Team</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Cycles</label>
                      <input type="number" min={1} max={10} value={newTournament.totalRounds} onChange={e => setNewTournament({ ...newTournament, totalRounds: parseInt(e.target.value) || 1 })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                      <p className="text-[10px] text-gray-400 mt-0.5">1 = everyone plays everyone once. 2 = double round-robin.</p>
                    </div>
                  </div>
                  <button onClick={handleCreateTournament} className="w-full py-2.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700">
                    Create Tournament
                  </button>
                  <p className="text-xs text-gray-400 text-center">Players will be able to sign up once created.</p>
                </div>
              )}

              {tournaments.map(t => (
                <div key={t.id} onClick={() => selectTournament(t)} className="bg-white rounded-xl border border-gray-100 p-4 cursor-pointer transition-colors hover:border-gray-300 hover:shadow-sm">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-semibold text-sm">{new Date(t.dateTime).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
                      <p className="text-xs text-gray-400">{fmtLabel(t.matchType)} · {fmtLabel(t.formatType)} · {t.totalRounds} round{t.totalRounds > 1 ? "s" : ""}</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${tournamentStatusColors[t.status] || "bg-gray-100"}`}>{fmtLabel(t.status)}</span>
                  </div>
                  <div className="text-xs text-gray-400 mb-2">{t._count.registrations} players registered</div>
                  <p className="text-xs text-blue-500 font-medium">Click to manage →</p>
                </div>
              ))}

              {tournaments.length === 0 && !showNewTournament && (
                <div className="text-center py-8 bg-white rounded-xl border border-dashed border-gray-200">
                  <p className="text-gray-400 text-sm">No tournaments yet</p>
                  <p className="text-gray-300 text-xs mt-1">Click "+ New" above to create one</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══════════════ LEVEL 2: TOURNAMENT DETAIL ═══════════════ */}
        {selectedTournament && !selectedLadder && (
          <div className="space-y-4">
            {/* ── Tournament Settings ── */}
            <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
              <h2 className="text-sm font-semibold">Tournament Settings</h2>
              <div className="text-xs text-gray-400 space-y-1">
                <p><strong className="text-gray-600">Date:</strong> {new Date(selectedTournament.dateTime).toLocaleString("en-US", { dateStyle: "full", timeStyle: "short" })}</p>
                <p><strong className="text-gray-600">Format:</strong> {fmtLabel(selectedTournament.matchType)} · {fmtLabel(selectedTournament.formatType)} · {selectedTournament.totalRounds} rounds</p>
                <p><strong className="text-gray-600">Status:</strong> {fmtLabel(selectedTournament.status)}</p>
              </div>

              <div>
                <p className="text-xs text-gray-400 mb-1">Signup Deadline</p>
                <div className="flex gap-2">
                  <input type="datetime-local" value={editDeadline} onChange={e => setEditDeadline(e.target.value)} className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-xs" />
                  <button onClick={handleUpdateDeadline} className="text-xs px-3 py-1.5 bg-gray-100 rounded-lg font-medium hover:bg-gray-200">Update</button>
                </div>
              </div>

              <div>
                <p className="text-xs text-gray-400 mb-1">Change Status</p>
                <div className="flex gap-2 flex-wrap">
                  {["SIGNUP_OPEN", "IN_PROGRESS", "COMPLETED"].map(s => (
                    <button key={s} onClick={() => handleChangeStatus(selectedTournament.id, s)} className={`text-xs px-3 py-1.5 rounded-lg font-medium ${selectedTournament.status === s ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                      {fmtLabel(s)}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Ladders ── */}
            <div className="space-y-3">
              <h2 className="text-sm font-semibold">Ladders (Weekly Subgroups)</h2>
              <p className="text-xs text-gray-400 -mt-2">Divide players into skill-based ladders each week. Then generate matches per ladder.</p>

              {/* Create Ladders */}
              <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Ladder names (comma-separated)</label>
                  <input type="text" value={ladderLabels} onChange={e => setLadderLabels(e.target.value)} placeholder="Ladder A, Ladder B, Ladder C" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={makeNew} onChange={e => setMakeNew(e.target.checked)} className="rounded" /> Fresh start (ignore last week)</label>
                </div>
                {!makeNew && ladders.length > 0 && (
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Carry over from week</label>
                    <select value={carryOverWeek} onChange={e => setCarryOverWeek(parseInt(e.target.value))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                      <option value={0}>None</option>
                      {[...new Set(ladders.map(l => l.weekNumber))].map(w => <option key={w} value={w}>Week {w}</option>)}
                    </select>
                  </div>
                )}
                <div className="flex gap-2">
                  <button onClick={handleCreateLadders} className="flex-1 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">Create Ladders</button>
                  <button onClick={handleResetLadders} className="px-4 py-2.5 bg-red-50 text-red-600 text-sm font-medium rounded-lg hover:bg-red-100">Reset All</button>
                </div>
                <p className="text-xs text-gray-400 text-center">After creating ladders, click a ladder below to assign players and generate matches.</p>
              </div>

              {/* Ladder List */}
              {ladders.map(ladder => (
                <div key={ladder.id} onClick={() => selectLadder(ladder)} className="bg-white rounded-xl border border-gray-100 p-4 cursor-pointer transition-colors hover:border-gray-300 hover:shadow-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-sm">{ladder.label} <span className="text-xs text-gray-400 font-normal">Week {ladder.weekNumber}</span></p>
                      <p className="text-xs text-gray-400 mt-0.5">{ladder.registrations.length} players · {ladder.matches.length} matches</p>
                    </div>
                    <span className="text-blue-500 text-xs font-medium">Manage →</span>
                  </div>
                </div>
              ))}

              {ladders.length === 0 && (
                <div className="text-center py-8 bg-white rounded-xl border border-dashed border-gray-200">
                  <p className="text-gray-400 text-sm">No ladders yet</p>
                  <p className="text-gray-300 text-xs mt-1">Create ladders above to get started</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══════════════ LEVEL 3: LADDER DETAIL ═══════════════ */}
        {selectedLadder && (
          <div className="space-y-4">
            {/* ── Players in Ladder ── */}
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div className="px-4 py-3 bg-gray-50">
                <h2 className="text-sm font-semibold">Players in {selectedLadder.label}</h2>
              </div>
              <div className="divide-y divide-gray-50">
                {selectedLadder.registrations.map(reg => (
                  <div key={reg.id} className="px-4 py-2.5 flex items-center justify-between">
                    <p className="text-sm">{reg.user.name}</p>
                    <select
                      value={reg.ladderId || ""}
                      onChange={e => { if (e.target.value) handlePromoteDemote(reg.id, e.target.value); }}
                      className="text-xs border border-gray-200 rounded px-2 py-1 bg-white"
                    >
                      <option value="">Move to...</option>
                      {ladders.filter(l => l.id !== selectedLadder.id).map(l => (
                        <option key={l.id} value={l.id}>{l.label}</option>
                      ))}
                    </select>
                  </div>
                ))}
                {selectedLadder.registrations.length === 0 && <p className="px-4 py-4 text-xs text-gray-400">No players assigned to this ladder yet.</p>}
              </div>
            </div>

            {/* ── Matches ── */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">Matches</h2>
                <div className="flex gap-2">
                  <button onClick={() => handleGenerateMatches(selectedLadder.id)} className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700">Auto-Generate</button>
                  <button onClick={() => setShowNewMatch(!showNewMatch)} className="text-xs px-3 py-1.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700">+ Add</button>
                </div>
              </div>
              <p className="text-xs text-gray-400 -mt-2">Auto-generate creates a round-robin schedule from players in this ladder.</p>

              {/* Add Match Form */}
              {showNewMatch && (
                <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Player 1</label>
                    <select value={newMatch.player1Id} onChange={e => setNewMatch({ ...newMatch, player1Id: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                      <option value="">Select player</option>
                      {selectedLadder.registrations.map(r => <option key={r.userId} value={r.userId}>{r.user.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Player 2</label>
                    <select value={newMatch.player2Id} onChange={e => setNewMatch({ ...newMatch, player2Id: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                      <option value="">Select player</option>
                      {selectedLadder.registrations.filter(r => r.userId !== newMatch.player1Id).map(r => <option key={r.userId} value={r.userId}>{r.user.name}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Round</label>
                      <input type="number" min={1} value={newMatch.roundNumber} onChange={e => setNewMatch({ ...newMatch, roundNumber: parseInt(e.target.value) || 1 })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Court</label>
                      <input type="number" min={1} value={newMatch.courtNumber} onChange={e => setNewMatch({ ...newMatch, courtNumber: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                    </div>
                  </div>
                  <button onClick={handleAddMatch} disabled={!newMatch.player1Id || !newMatch.player2Id} className="w-full py-2.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50">Add Match</button>
                </div>
              )}

              {/* Match List */}
              {selectedLadder.matches.length === 0 && !showNewMatch && (
                <div className="text-center py-8 bg-white rounded-xl border border-dashed border-gray-200">
                  <p className="text-gray-400 text-sm">No matches yet</p>
                  <p className="text-gray-300 text-xs mt-1">Click "Auto-Generate" or "+ Add" above</p>
                </div>
              )}

              {(() => {
                const rounds = new Map<number, Match[]>();
                for (const m of selectedLadder.matches) {
                  if (!rounds.has(m.roundNumber)) rounds.set(m.roundNumber, []);
                  rounds.get(m.roundNumber)!.push(m);
                }
                return Array.from(rounds.entries()).map(([roundNum, roundMatches]) => (
                  <div key={roundNum}>
                    <p className="text-xs text-gray-400 font-medium mb-2 uppercase">Round {roundNum}</p>
                    <div className="space-y-2">
                      {roundMatches.map(match => (
                        <div key={match.id} className="bg-white rounded-xl border border-gray-100 p-4">
                          <div className="flex items-center gap-3">
                            <div className="flex-1">
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-medium">{match.player1.name}</span>
                                <span className="text-lg font-bold mx-2">{match.player1Score ?? "-"}</span>
                              </div>
                              <div className="text-xs text-gray-300 text-center my-0.5">vs</div>
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-medium">{match.player2.name}</span>
                                <span className="text-lg font-bold mx-2">{match.player2Score ?? "-"}</span>
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[match.status]}`}>{match.status}</span>
                              {match.courtNumber && <span className="text-xs text-gray-400">Court {match.courtNumber}</span>}
                              <button onClick={() => { setEditingMatch(editingMatch?.id === match.id ? null : match); setEditScore({ p1: "", p2: "" }); }} className="text-xs text-blue-600 font-medium">Edit</button>
                              <button onClick={() => handleDeleteMatch(match.id)} className="text-xs text-red-400 font-medium">Delete</button>
                            </div>
                          </div>

                          {/* Edit Form */}
                          {editingMatch?.id === match.id && (
                            <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
                              <p className="text-xs text-gray-400">Edit Scores</p>
                              <div className="flex items-center gap-2">
                                <input type="number" value={editScore.p1} onChange={e => setEditScore({ ...editScore, p1: e.target.value })} placeholder={match.player1.name} className="w-16 px-2 py-1.5 border border-gray-200 rounded text-sm text-center" />
                                <span className="text-gray-300">-</span>
                                <input type="number" value={editScore.p2} onChange={e => setEditScore({ ...editScore, p2: e.target.value })} placeholder={match.player2.name} className="w-16 px-2 py-1.5 border border-gray-200 rounded text-sm text-center" />
                                <button onClick={() => handleUpdateMatch(match.id, { player1Score: parseInt(editScore.p1) || 0, player2Score: parseInt(editScore.p2) || 0 })} className="text-xs px-3 py-1.5 bg-green-600 text-white rounded font-medium">Save</button>
                              </div>
                              <p className="text-xs text-gray-400">Swap Players</p>
                              <div className="flex gap-2">
                                <select defaultValue="" onChange={e => { if (e.target.value) handleUpdateMatch(match.id, { player1Id: e.target.value }); }} className="text-xs border border-gray-200 rounded px-2 py-1 bg-white flex-1">
                                  <option value="">Replace P1</option>
                                  {selectedLadder.registrations.filter(r => r.userId !== match.player2Id).map(r => <option key={r.userId} value={r.userId}>{r.user.name}</option>)}
                                </select>
                                <select defaultValue="" onChange={e => { if (e.target.value) handleUpdateMatch(match.id, { player2Id: e.target.value }); }} className="text-xs border border-gray-200 rounded px-2 py-1 bg-white flex-1">
                                  <option value="">Replace P2</option>
                                  {selectedLadder.registrations.filter(r => r.userId !== match.player1Id).map(r => <option key={r.userId} value={r.userId}>{r.user.name}</option>)}
                                </select>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ));
              })()}
            </div>
          </div>
        )}

      </main>

      {/* ── Bottom Nav ── */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-4 py-2 flex items-center justify-around safe-area-bottom">
        <Link href="/dashboard" className="flex flex-col items-center gap-0.5 text-gray-400"><span className="text-lg">🏠</span><span className="text-[10px] font-medium">Home</span></Link>
        <Link href="/coach" className="flex flex-col items-center gap-0.5 text-blue-600"><span className="text-lg">⚙️</span><span className="text-[10px] font-medium">Coach</span></Link>
      </nav>
    </div>
  );
}
