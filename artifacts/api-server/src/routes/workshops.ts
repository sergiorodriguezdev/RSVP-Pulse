import { createHmac, timingSafeEqual } from "node:crypto";
import { count, desc, eq, gte, max, sum, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  db,
  workshopActivityTable,
  workshopsTable,
} from "@workspace/db";
import {
  GetWorkshopSummaryResponse,
  ListWorkshopActivityResponse,
  ListWorkshopsResponse,
  ReceiveWorkshopGatherWebhookBody,
  ReceiveWorkshopGatherWebhookResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();
const webhookSecret = process.env.WORKSHOP_WEBHOOK_SECRET;

function matchesSecret(received: string, expected: string): boolean {
  const receivedDigest = createHmac("sha256", expected).update(received).digest();
  const expectedDigest = createHmac("sha256", expected)
    .update(expected)
    .digest();
  return timingSafeEqual(receivedDigest, expectedDigest);
}

router.get("/workshops", async (_req, res): Promise<void> => {
  const workshops = await db
    .select()
    .from(workshopsTable)
    .orderBy(desc(workshopsTable.updatedAt));
  const activity = await db
    .select()
    .from(workshopActivityTable)
    .orderBy(desc(workshopActivityTable.receivedAt));

  const latestActivity = new Map<number, (typeof activity)[number]>();
  for (const event of activity) {
    if (!latestActivity.has(event.workshopId)) {
      latestActivity.set(event.workshopId, event);
    }
  }

  const response = workshops.map((workshop) => {
    const event = latestActivity.get(workshop.id);
    return {
      id: workshop.id,
      name: workshop.name,
      rsvps: workshop.rsvps,
      updatedAt: workshop.updatedAt,
      previousRsvps: event?.previousRsvps ?? null,
      change: event?.change ?? "new",
      changeAmount: event?.changeAmount ?? 0,
    };
  });

  res.json(ListWorkshopsResponse.parse(response));
});

router.get("/workshops/summary", async (_req, res): Promise<void> => {
  const [totals] = await db
    .select({
      workshopCount: count(workshopsTable.id),
      totalRsvps: sum(workshopsTable.rsvps),
      lastUpdatedAt: max(workshopsTable.updatedAt),
    })
    .from(workshopsTable);
  const midnightUtc = new Date();
  midnightUtc.setUTCHours(0, 0, 0, 0);
  const [daily] = await db
    .select({ updatesToday: count(workshopActivityTable.id) })
    .from(workshopActivityTable)
    .where(gte(workshopActivityTable.receivedAt, midnightUtc));

  res.json(
    GetWorkshopSummaryResponse.parse({
      workshopCount: totals?.workshopCount ?? 0,
      totalRsvps: Number(totals?.totalRsvps ?? 0),
      updatesToday: daily?.updatesToday ?? 0,
      lastUpdatedAt: totals?.lastUpdatedAt ?? null,
    }),
  );
});

router.get("/workshops/activity", async (_req, res): Promise<void> => {
  const events = await db
    .select({
      id: workshopActivityTable.id,
      workshopName: workshopActivityTable.workshopName,
      previousRsvps: workshopActivityTable.previousRsvps,
      rsvps: workshopActivityTable.rsvps,
      change: workshopActivityTable.change,
      changeAmount: workshopActivityTable.changeAmount,
      updatedAt: workshopActivityTable.updatedAt,
    })
    .from(workshopActivityTable)
    .orderBy(desc(workshopActivityTable.receivedAt))
    .limit(30);

  res.json(ListWorkshopActivityResponse.parse(events));
});

router.post("/webhooks/workshop-gather", async (req, res): Promise<void> => {
  if (!webhookSecret) {
    res.status(503).json({ error: "Webhook secret is not configured" });
    return;
  }

  const suppliedSecret = req.get("X-Webhook-Secret");
  if (!suppliedSecret || !matchesSecret(suppliedSecret, webhookSecret)) {
    res.status(401).json({ error: "Invalid webhook secret" });
    return;
  }

  const parsed = ReceiveWorkshopGatherWebhookBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const workshopName = parsed.data.workshopName.trim();
  if (!workshopName) {
    res.status(400).json({ error: "workshopName cannot be blank" });
    return;
  }

  const result = await db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${workshopName}))`,
    );
    const [current] = await tx
      .select()
      .from(workshopsTable)
      .where(eq(workshopsTable.name, workshopName))
      .limit(1);

    if (current && parsed.data.updatedAt <= current.updatedAt) {
      return {
        accepted: true,
        workshopName: current.name,
        previousRsvps: current.rsvps,
        rsvps: current.rsvps,
        change: "unchanged" as const,
        changeAmount: 0,
        updatedAt: current.updatedAt,
      };
    }

    const previousRsvps = current?.rsvps ?? null;
    const change = current
      ? parsed.data.rsvps > current.rsvps
        ? "up"
        : parsed.data.rsvps < current.rsvps
          ? "down"
          : "unchanged"
      : "new";
    const changeAmount =
      previousRsvps === null
        ? 0
        : Math.abs(parsed.data.rsvps - previousRsvps);

    const [workshop] = current
      ? await tx
          .update(workshopsTable)
          .set({ rsvps: parsed.data.rsvps, updatedAt: parsed.data.updatedAt })
          .where(eq(workshopsTable.id, current.id))
          .returning()
      : await tx
          .insert(workshopsTable)
          .values({
            name: workshopName,
            rsvps: parsed.data.rsvps,
            updatedAt: parsed.data.updatedAt,
          })
          .returning();

    await tx.insert(workshopActivityTable).values({
      workshopId: workshop.id,
      workshopName,
      previousRsvps,
      rsvps: parsed.data.rsvps,
      change,
      changeAmount,
      updatedAt: parsed.data.updatedAt,
    });

    return {
      accepted: true,
      workshopName,
      previousRsvps,
      rsvps: parsed.data.rsvps,
      change,
      changeAmount,
      updatedAt: parsed.data.updatedAt,
    };
  });

  res.json(ReceiveWorkshopGatherWebhookResponse.parse(result));
});

export default router;
