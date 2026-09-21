import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  numeric,
  jsonb,
  uniqueIndex,
  index,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

/* ------------------------------------------------------------------ enums */

export const roleEnum = pgEnum("role", ["admin", "student"]);
export const questionTypeEnum = pgEnum("question_type", [
  "mcq_single",
  "mcq_multiple",
  "fill_blank",
]);
export const testStatusEnum = pgEnum("test_status", [
  "draft",
  "published",
  "closed",
]);
export const attemptStatusEnum = pgEnum("attempt_status", [
  "in_progress",
  "submitted",
  "auto_submitted",
  "terminated",
]);
export const resetStatusEnum = pgEnum("reset_status", [
  "pending",
  "approved",
  "rejected",
]);

/* ------------------------------------------------------------------ users */

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    rollNumber: text("roll_number").notNull(),
    name: text("name").notNull(),
    email: text("email"),
    passwordHash: text("password_hash").notNull(),
    role: roleEnum("role").notNull().default("student"),
    /** Forces the change-password screen on first sign-in. */
    mustChangePassword: boolean("must_change_password").notNull().default(true),
    /** Set by the student during first login, enables offline self-service reset. */
    securityQuestion: text("security_question"),
    securityAnswerHash: text("security_answer_hash"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    rollIdx: uniqueIndex("users_roll_number_idx").on(t.rollNumber),
  }),
);

/* ----------------------------------------------------------------- groups */

export const groups = pgTable(
  "groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    nameIdx: uniqueIndex("groups_name_idx").on(t.name),
  }),
);

/** A student may belong to several groups (year batch, section, elective). */
export const groupMembers = pgTable(
  "group_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pairIdx: uniqueIndex("group_members_pair_idx").on(t.groupId, t.userId),
    userIdx: index("group_members_user_idx").on(t.userId),
  }),
);

/* ------------------------------------------------------------------ tests */

export const tests = pgTable("tests", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  instructions: text("instructions"),
  durationMinutes: integer("duration_minutes").notNull(),
  status: testStatusEnum("status").notNull().default("draft"),
  /** Violations allowed before the attempt is submitted automatically. */
  maxWarnings: integer("max_warnings").notNull().default(3),
  shuffleQuestions: boolean("shuffle_questions").notNull().default(true),
  shuffleOptions: boolean("shuffle_options").notNull().default(true),
  showScoreToStudent: boolean("show_score_to_student").notNull().default(true),
  /**
   * Whether a student may see, question by question, what they answered and
   * what was correct. Worth turning off for a test sat by more than one batch,
   * since it hands the answer key to whoever sits it first.
   */
  showAnswersToStudent: boolean("show_answers_to_student")
    .notNull()
    .default(true),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
});

/**
 * Which groups a test is available to. Rows can be added or removed at any
 * time, including after the test is published, which is how a test gets
 * opened up to an additional group later on.
 */
export const testGroups = pgTable(
  "test_groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    testId: uuid("test_id")
      .notNull()
      .references(() => tests.id, { onDelete: "cascade" }),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    assignedAt: timestamp("assigned_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    pairIdx: uniqueIndex("test_groups_pair_idx").on(t.testId, t.groupId),
  }),
);

/* --------------------------------------------------------------- sections */

export const sections = pgTable(
  "sections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    testId: uuid("test_id")
      .notNull()
      .references(() => tests.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Topic label used for the section-wise analysis. */
    topic: text("topic"),
    ordinal: integer("ordinal").notNull().default(0),
    /** Applied to every question in the section unless overridden. */
    defaultMarks: numeric("default_marks", { precision: 6, scale: 2 })
      .notNull()
      .default("1"),
    negativeMarks: numeric("negative_marks", { precision: 6, scale: 2 })
      .notNull()
      .default("0"),
  },
  (t) => ({
    testIdx: index("sections_test_idx").on(t.testId),
  }),
);

/* -------------------------------------------------------------- questions */

export const questions = pgTable(
  "questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => sections.id, { onDelete: "cascade" }),
    type: questionTypeEnum("type").notNull(),
    body: text("body").notNull(),
    ordinal: integer("ordinal").notNull().default(0),
    /** null means inherit the section default. */
    marksOverride: numeric("marks_override", { precision: 6, scale: 2 }),
    negativeOverride: numeric("negative_override", { precision: 6, scale: 2 }),
    /** Accepted answers for fill_blank, compared case-insensitively. */
    acceptedAnswers: jsonb("accepted_answers").$type<string[]>(),
    explanation: text("explanation"),
  },
  (t) => ({
    sectionIdx: index("questions_section_idx").on(t.sectionId),
  }),
);

export const options = pgTable(
  "options",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    isCorrect: boolean("is_correct").notNull().default(false),
    ordinal: integer("ordinal").notNull().default(0),
  },
  (t) => ({
    questionIdx: index("options_question_idx").on(t.questionId),
  }),
);

/* --------------------------------------------------------------- attempts */

export const attempts = pgTable(
  "attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    testId: uuid("test_id")
      .notNull()
      .references(() => tests.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Per-student shuffle seed, so a paper can be reproduced for an audit. */
    seed: integer("seed").notNull(),
    status: attemptStatusEnum("status").notNull().default("in_progress"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** Fixed once at start. The server, not the browser, owns the clock. */
    deadlineAt: timestamp("deadline_at", { withTimezone: true }).notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    warningCount: integer("warning_count").notNull().default(0),
    totalScore: numeric("total_score", { precision: 8, scale: 2 }),
    maxScore: numeric("max_score", { precision: 8, scale: 2 }),
  },
  (t) => ({
    pairIdx: uniqueIndex("attempts_test_user_idx").on(t.testId, t.userId),
    testIdx: index("attempts_test_idx").on(t.testId),
  }),
);

export const answers = pgTable(
  "answers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    attemptId: uuid("attempt_id")
      .notNull()
      .references(() => attempts.id, { onDelete: "cascade" }),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    /** Chosen option ids for the two MCQ types. */
    selectedOptionIds: jsonb("selected_option_ids").$type<string[]>(),
    /** Typed response for fill_blank. */
    textAnswer: text("text_answer"),
    isCorrect: boolean("is_correct"),
    awardedMarks: numeric("awarded_marks", { precision: 6, scale: 2 }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    pairIdx: uniqueIndex("answers_attempt_question_idx").on(
      t.attemptId,
      t.questionId,
    ),
  }),
);

export const violations = pgTable(
  "violations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    attemptId: uuid("attempt_id")
      .notNull()
      .references(() => attempts.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    detail: text("detail"),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    attemptIdx: index("violations_attempt_idx").on(t.attemptId),
  }),
);

/* ------------------------------------------------------------- proctoring */

/**
 * What the webcam saw during an attempt. One "latest" row per attempt is
 * overwritten every few seconds and feeds the live monitor; "flagged" rows are
 * kept, one per camera violation, so staff can review the moment afterwards.
 * Frames are small (about 320x240 JPEG), which is why they live in the
 * database rather than a separate file store.
 */
export const proctorSnapshots = pgTable(
  "proctor_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    attemptId: uuid("attempt_id")
      .notNull()
      .references(() => attempts.id, { onDelete: "cascade" }),
    /** "latest" or "flagged". */
    kind: text("kind").notNull(),
    /** The violation type for flagged rows, e.g. no_face. */
    flagType: text("flag_type"),
    faceCount: integer("face_count"),
    /** Base64-encoded JPEG. */
    image: text("image").notNull(),
    takenAt: timestamp("taken_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    attemptIdx: index("proctor_snapshots_attempt_idx").on(t.attemptId),
    // At most one live thumbnail per attempt.
    latestIdx: uniqueIndex("proctor_snapshots_latest_idx")
      .on(t.attemptId)
      .where(sql`kind = 'latest'`),
  }),
);

/* -------------------------------------------------------- password resets */

/** Fallback when a student cannot answer their own security question. */
export const passwordResetRequests = pgTable("password_reset_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  status: resetStatusEnum("status").notNull().default("pending"),
  requestedAt: timestamp("requested_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolvedBy: uuid("resolved_by").references(() => users.id),
});

/* ------------------------------------------------------------- relations */

export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(groupMembers),
  attempts: many(attempts),
}));

export const groupsRelations = relations(groups, ({ many }) => ({
  members: many(groupMembers),
  testGroups: many(testGroups),
}));

export const groupMembersRelations = relations(groupMembers, ({ one }) => ({
  group: one(groups, { fields: [groupMembers.groupId], references: [groups.id] }),
  user: one(users, { fields: [groupMembers.userId], references: [users.id] }),
}));

export const testsRelations = relations(tests, ({ many }) => ({
  sections: many(sections),
  testGroups: many(testGroups),
  attempts: many(attempts),
}));

export const testGroupsRelations = relations(testGroups, ({ one }) => ({
  test: one(tests, { fields: [testGroups.testId], references: [tests.id] }),
  group: one(groups, { fields: [testGroups.groupId], references: [groups.id] }),
}));

export const sectionsRelations = relations(sections, ({ one, many }) => ({
  test: one(tests, { fields: [sections.testId], references: [tests.id] }),
  questions: many(questions),
}));

export const questionsRelations = relations(questions, ({ one, many }) => ({
  section: one(sections, {
    fields: [questions.sectionId],
    references: [sections.id],
  }),
  options: many(options),
}));

export const optionsRelations = relations(options, ({ one }) => ({
  question: one(questions, {
    fields: [options.questionId],
    references: [questions.id],
  }),
}));

export const attemptsRelations = relations(attempts, ({ one, many }) => ({
  test: one(tests, { fields: [attempts.testId], references: [tests.id] }),
  user: one(users, { fields: [attempts.userId], references: [users.id] }),
  answers: many(answers),
  violations: many(violations),
  proctorSnapshots: many(proctorSnapshots),
}));

export const proctorSnapshotsRelations = relations(
  proctorSnapshots,
  ({ one }) => ({
    attempt: one(attempts, {
      fields: [proctorSnapshots.attemptId],
      references: [attempts.id],
    }),
  }),
);

export const answersRelations = relations(answers, ({ one }) => ({
  attempt: one(attempts, {
    fields: [answers.attemptId],
    references: [attempts.id],
  }),
  question: one(questions, {
    fields: [answers.questionId],
    references: [questions.id],
  }),
}));

/* ----------------------------------------------------------------- types */

export type User = typeof users.$inferSelect;
export type Group = typeof groups.$inferSelect;
export type Test = typeof tests.$inferSelect;
export type Section = typeof sections.$inferSelect;
export type Question = typeof questions.$inferSelect;
export type Option = typeof options.$inferSelect;
export type Attempt = typeof attempts.$inferSelect;
export type Answer = typeof answers.$inferSelect;
export type ProctorSnapshot = typeof proctorSnapshots.$inferSelect;
export type QuestionType = (typeof questionTypeEnum.enumValues)[number];
