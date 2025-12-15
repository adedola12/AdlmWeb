// admin.helpbot.js
router.get("/helpbot/logs", adminOnly, async (_req, res) => {
  const logs = await HelpBotLog.find()
    .sort({ createdAt: -1 })
    .limit(500)
    .lean();

  res.json({ items: logs });
});
