// ─── Enum-like types matching Prisma schema ───────────────────────────

export type UserRole = "PLAYER" | "COACH";

export type GroupMemberStatus = "ACTIVE" | "KICKED";

export type TournamentFormat = "ROUND_ROBIN" | "TEAM";

export type TournamentMatchType = "SINGLES" | "DOUBLES";

export type TournamentStatus =
  | "UPCOMING"
  | "SIGNUP_OPEN"
  | "IN_PROGRESS"
  | "COMPLETED";

export type MatchStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED";

// ─── Entity types (mirror Prisma models) ─────────────────────────────

export interface UserEntity {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

export interface GroupEntity {
  id: string;
  name: string;
  coachId: string;
  invitationCode: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface GroupMemberEntity {
  id: string;
  groupId: string;
  userId: string;
  status: GroupMemberStatus;
  joinedAt: Date;
}

export interface TournamentEntity {
  id: string;
  groupId: string;
  dateTime: Date;
  signupDeadline: Date;
  formatType: TournamentFormat;
  matchType: TournamentMatchType;
  totalRounds: number;
  status: TournamentStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface WeeklyLadderEntity {
  id: string;
  tournamentId: string;
  label: string;
  weekNumber: number;
  createdAt: Date;
}

export interface RegistrationEntity {
  id: string;
  tournamentId: string;
  userId: string;
  partnerId: string | null;
  ladderId: string | null;
  createdAt: Date;
}

export interface MatchEntity {
  id: string;
  tournamentId: string;
  ladderId: string;
  roundNumber: number;
  player1Id: string;
  player2Id: string;
  player1Score: number | null;
  player2Score: number | null;
  status: MatchStatus;
  courtNumber: number | null;
  matchOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

// ─── API DTOs ────────────────────────────────────────────────────────

export interface CreateGroupInput {
  name: string;
}

export interface JoinGroupInput {
  invitationCode: string;
}

export interface KickMemberInput {
  userId: string;
}

export interface CreateTournamentInput {
  dateTime: string;
  signupDeadline: string;
  formatType: TournamentFormat;
  matchType: TournamentMatchType;
  totalRounds: number;
}

export interface UpdateTournamentInput {
  signupDeadline?: string;
  totalRounds?: number;
  status?: TournamentStatus;
}

export interface CreateLaddersInput {
  labels: string[];
  carryOverFromWeek?: number; // week number to carry over from
}

export interface MovePlayerInput {
  userId: string;
  fromLadderId: string;
  toLadderId: string;
}

export interface PartnerSignupInput {
  partnerId: string;
}

export interface CreateMatchInput {
  ladderId: string;
  roundNumber: number;
  player1Id: string;
  player2Id: string;
  courtNumber?: number;
  matchOrder?: number;
}

export interface UpdateMatchInput {
  player1Id?: string;
  player2Id?: string;
  player1Score?: number;
  player2Score?: number;
  status?: MatchStatus;
  courtNumber?: number;
}

export interface SubmitScoreInput {
  player1Score: number;
  player2Score: number;
}

// ─── Socket.io event types ───────────────────────────────────────────

export interface MatchUpdatedEvent {
  tournamentId: string;
  matchId: string;
  match: MatchEntity;
}

export interface LadderUpdatedEvent {
  tournamentId: string;
  ladderId: string;
}

export interface TournamentStatusEvent {
  tournamentId: string;
  status: TournamentStatus;
}
