import { toLiveBoardEntry } from "./card-projection.js";

async function json(response, label) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || body.error || `${label} failed (${response.status}).`);
  return body;
}

export async function syncLiveBoardEvent(config, fetchFn = fetch) {
  const studioBase = config.studio125ApiUrl.replace(/\/+$/, "");
  const supabaseBase = config.supabaseUrl.replace(/\/+$/, "");
  const studioHeaders = { Authorization: `Bearer ${config.studio125ApiKey}` };
  const supabaseHeaders = {
    apikey: config.supabaseServiceRoleKey,
    Authorization: `Bearer ${config.supabaseServiceRoleKey}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
  const [projection, formResult] = await Promise.all([
    fetchFn(`${studioBase}/api/v1/internal/liveboard/events/${config.eventInstanceId}/cards`, { headers: studioHeaders })
      .then((response) => json(response, "Card projection")),
    fetchFn(`${studioBase}/api/v1/events/${config.eventInstanceId}/form`)
      .then((response) => json(response, "Event form")),
  ]);
  const sourceFilter = encodeURIComponent("studio125");
  const eventFilter = encodeURIComponent(config.eventInstanceId);
  await Promise.all([
    fetchFn(`${supabaseBase}/rest/v1/board_entries?source_system=eq.${sourceFilter}&source_event_instance_id=neq.${eventFilter}&source_enabled=eq.true&active=eq.true`, {
      method: "PATCH", headers: supabaseHeaders,
      body: JSON.stringify({ active: false, deleted_at: new Date().toISOString() }),
    }).then((response) => json(response, "Previous event deactivation")),
    fetchFn(`${supabaseBase}/rest/v1/board_entries?source_system=eq.${sourceFilter}&source_event_instance_id=eq.${eventFilter}&source_enabled=eq.true`, {
      method: "PATCH", headers: supabaseHeaders, body: JSON.stringify({ active: true, deleted_at: null }),
    }).then((response) => json(response, "Current event activation")),
  ]);
  const outcomes = [];
  for (const card of projection.cards || []) {
    let entryId = card.liveboardEntryId;
    const guard = `or=(source_revision.is.null,source_revision.lte.${card.revision})`;
    if (card.action === "remove") {
      const filter = entryId
        ? `id=eq.${encodeURIComponent(entryId)}&${guard}`
        : `source_system=eq.${sourceFilter}&source_card_id=eq.${encodeURIComponent(card.cardId)}&${guard}`;
      const updated = await fetchFn(`${supabaseBase}/rest/v1/board_entries?${filter}`, {
        method: "PATCH", headers: supabaseHeaders,
        body: JSON.stringify({ active: false, deleted_at: new Date().toISOString(), source_enabled: false, source_revision: card.revision }),
      }).then((response) => json(response, "LiveBoard removal"));
      entryId = entryId || updated[0]?.id || null;
    } else {
      const payload = {
        ...toLiveBoardEntry(card, formResult.form), source_system: "studio125",
        source_event_instance_id: config.eventInstanceId, source_card_id: card.cardId,
        source_revision: card.revision, source_enabled: true,
      };
      const existing = await fetchFn(`${supabaseBase}/rest/v1/board_entries?select=id,source_revision&source_system=eq.${sourceFilter}&source_card_id=eq.${encodeURIComponent(card.cardId)}&limit=1`, {
        headers: supabaseHeaders,
      }).then((response) => json(response, "LiveBoard source lookup"));
      if (existing[0]?.id) {
        if (Number(existing[0].source_revision || 0) > card.revision) throw new Error("A newer card revision already exists.");
        const updated = await fetchFn(`${supabaseBase}/rest/v1/board_entries?id=eq.${encodeURIComponent(existing[0].id)}&${guard}`, {
          method: "PATCH", headers: supabaseHeaders, body: JSON.stringify(payload),
        }).then((response) => json(response, "LiveBoard guarded update"));
        entryId = updated[0]?.id || null;
      } else {
        const inserted = await fetchFn(`${supabaseBase}/rest/v1/board_entries`, {
          method: "POST", headers: supabaseHeaders, body: JSON.stringify(payload),
        }).then((response) => json(response, "LiveBoard insert"));
        entryId = inserted[0]?.id || null;
      }
      if (!entryId) throw new Error("LiveBoard did not return an entry ID.");
    }
    await fetchFn(`${studioBase}/api/v1/internal/liveboard/events/${config.eventInstanceId}/cards`, {
      method: "PATCH", headers: { ...studioHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ cardId: card.cardId, revision: card.revision,
        action: card.action === "remove" ? "removed" : "published", liveboardEntryId: entryId }),
    }).then((response) => json(response, "Studio125 acknowledgment"));
    outcomes.push({ cardId: card.cardId, revision: card.revision, action: card.action, entryId });
  }
  return outcomes;
}
