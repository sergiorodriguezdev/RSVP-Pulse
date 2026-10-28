import { relations } from "drizzle-orm";
import {
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const workshopsTable = pgTable(
  "workshops",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    rsvps: integer("rsvps").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("workshops_name_unique").on(table.name)],
);

export const workshopActivityTable = pgTable(
  "workshop_activity",
  {
    id: serial("id").primaryKey(),
    workshopId: integer("workshop_id")
      .notNull()
      .references(() => workshopsTable.id, { onDelete: "cascade" }),
    workshopName: text("workshop_name").notNull(),
    previousRsvps: integer("previous_rsvps"),
    rsvps: integer("rsvps").notNull(),
    change: text("change", {
      enum: ["up", "down", "unchanged", "new"],
    }).notNull(),
    changeAmount: integer("change_amount").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("workshop_activity_received_at_idx").on(table.receivedAt),
    index("workshop_activity_workshop_id_idx").on(table.workshopId),
  ],
);

export const workshopsRelations = relations(workshopsTable, ({ many }) => ({
  activity: many(workshopActivityTable),
}));

export const workshopActivityRelations = relations(
  workshopActivityTable,
  ({ one }) => ({
    workshop: one(workshopsTable, {
      fields: [workshopActivityTable.workshopId],
      references: [workshopsTable.id],
    }),
  }),
);

export const insertWorkshopSchema = createInsertSchema(workshopsTable).omit({
  id: true,
  createdAt: true,
});

export const insertWorkshopActivitySchema = createInsertSchema(
  workshopActivityTable,
).omit({
  id: true,
  receivedAt: true,
});

export type InsertWorkshop = z.infer<typeof insertWorkshopSchema>;
export type Workshop = typeof workshopsTable.$inferSelect;
export type WorkshopActivity = typeof workshopActivityTable.$inferSelect;
